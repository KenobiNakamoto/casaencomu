import { randomUUID } from "node:crypto";
import type { InStatement } from "@libsql/client";
import { nextSourceState, type Outcome, type SourceState } from "./availability";
import { classifyChanges, col, FACT_COLUMNS, factsHash, type Facts } from "./changes";
import { db } from "./db";
import { extractResult, rawOf } from "./extract";
import { capped, merge, originOf } from "./observation";
import { fetchGuarded } from "./fetching";
import type { Origin } from "./enrich";
import { isAllowedHost } from "./url";

export type FetchedPage = { status: number; finalUrl?: string; html?: string };
export type FetchPage = (url: string) => Promise<FetchedPage>;

const CHECK_EVERY_MS = 48 * 3_600_000;
const WARN_AT = 3;

/** Same redirect, size and timeout boundaries as imports. Never parse a truncated response. */
export async function fetchPage(url: string): Promise<FetchedPage> {
  const res = await fetchGuarded(url, { allow: isAllowedHost, maxBytes: 1024 * 1024, timeoutMs: 20_000, accept: "text/html,application/xhtml+xml" });
  if ("refused" in res || res.truncated) return { status: 502 };
  return { status: res.status, finalUrl: res.finalUrl, html: res.body.toString("utf8") };
}

type Row = {
  id: string;
  property_id: string;
  portal: string;
  portal_ref: string | null;
  url_original: string;
  via: string;
  facts_json: string;
  field_origin_json: string;
  consecutive_failures: number;
  consecutive_gone: number;
  availability: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const event = (propertyId: string, kind: string, payload: unknown, at: string): InStatement => ({
  sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
  args: [randomUUID(), propertyId, kind, JSON.stringify(payload), at],
});

// ponytail: idealista blocks server fetches; its sources show "Comprobar" instead
const fetchable = (s: Row) => s.via === "paste" || (isAllowedHost(s.url_original) && s.portal !== "idealista");

/**
 * One pass: up to `limit` fetchable sources not checked in 48 h, oldest first, `spacingMs`
 * apart. Success → facts, `properties` and one `events` row per change. Removal evidence →
 * `unknown` first and `removed` only on a second consecutive scheduled check. Anything we could
 * not read → `unknown`, one warning at three failures in a row, and never a removal.
 *
 * It does not write `properties.stage`. That is the whole point of PIP-02: availability is the
 * source's business and the stage is the family's.
 */
export async function runRechecks({
  now = new Date(),
  limit = 10,
  spacingMs = 60_000,
  fetchPage: fetchImpl = fetchPage,
}: { now?: Date; limit?: number; spacingMs?: number; fetchPage?: FetchPage } = {}) {
  const at = now.toISOString();
  const cutoff = new Date(now.getTime() - CHECK_EVERY_MS).toISOString();
  const { rows } = await db.execute({
    sql: `SELECT id, property_id, portal, portal_ref, url_original, via, facts_json, field_origin_json,
            consecutive_failures, consecutive_gone, availability
          FROM sources WHERE availability != 'removed' AND (last_checked_at IS NULL OR last_checked_at < ?)
          ORDER BY last_checked_at ASC`,
    args: [cutoff],
  });
  const picked = (rows as unknown as Row[]).filter(fetchable).slice(0, limit);
  const summary = { checked: 0, changed: 0, removed: 0, unknown: 0 };

  for (const [i, pickedSource] of picked.entries()) {
    let s = pickedSource;
    if (i > 0 && spacingMs > 0) await sleep(spacingMs);
    const label = `[recheck] ${s.portal} ${s.portal_ref ?? s.url_original}`;
    summary.checked++;

    let page: FetchedPage | null = null;
    try {
      page = await fetchImpl(s.url_original);
    } catch {
      /* timeout or network error */
    }

    // One typed outcome, from the same extractor the import uses. A 4xx/5xx body is never parsed
    // as a listing: an error page with a <title> is not a fact change.
    const result = page && page.status < 400 ? extractResult({ url: s.url_original, ...page }) : null;
    const outcome: Outcome = !page
      ? "timeout"
      : result?.kind === "listing"
        ? "listing"
        : page.status === 404 || page.status === 410
          ? "removed"
          : (result?.kind ?? "unreadable");
    const listing = result?.kind === "listing" ? result.listing : null;

    // Re-read after the network wait. A recapture or enrichment may have committed meanwhile.
    const tx = await db.transaction("write");
    try {
      const fresh = await tx.execute({ sql: "SELECT * FROM sources WHERE id = ?", args: [s.id] });
      if (!fresh.rows.length) continue;
      s = fresh.rows[0] as unknown as Row;
      const prev: SourceState = {
        availability: (s.availability === "removed" || s.availability === "unknown" ? s.availability : "active"),
        consecutive_gone: s.consecutive_gone,
        consecutive_failures: s.consecutive_failures,
      };
      // The hourly loop is the only caller, so every observation here is a scheduled one.
      const next = nextSourceState(prev, outcome, true);

      let facts: Facts | null = null;
      let prevFacts: Facts | null = null;
      try {
        prevFacts = JSON.parse(s.facts_json) as Facts;
      } catch {
        /* unreadable snapshot → nothing to compare against */
      }
      if (result?.kind === "listing") facts = merge(prevFacts, result.listing, result.presence);
      const changes = listing && facts ? classifyChanges(prevFacts, { ...listing, ...facts }) : [];
      let origin: Origin = {};
      try { origin = JSON.parse(s.field_origin_json) ?? {}; } catch {}
      const observed = result?.kind === "listing" ? result : null;

      const stmts: InStatement[] = [
        {
          sql: `UPDATE sources SET availability = ?, consecutive_gone = ?, consecutive_failures = ?,
                last_check_outcome = ?, last_checked_at = ?${facts ? `, last_ok_at = ?, facts_json = ?, facts_hash = ?,
                field_presence_json = ?, field_origin_json = ?, raw_json = COALESCE(?, raw_json),
                enriched_at = NULL, observation_version = observation_version + 1,
                enrichment_attempts = 0, enrichment_retry_at = NULL, enrichment_token = NULL, enrichment_lease_until = NULL` : ""}
                WHERE id = ?`,
          args: [
            next.availability,
            next.consecutive_gone,
            next.consecutive_failures,
            outcome,
            at,
            ...(facts && observed ? [at, JSON.stringify(facts), factsHash(facts), JSON.stringify(observed.presence),
              JSON.stringify(originOf(origin, observed.presence)), capped(rawOf({ url: s.url_original, ...page }))] : []),
            s.id,
          ],
        },
      ];

      if (facts) {
        const fields = changes.flatMap((c) =>
          c.kind === "price_change" ? ["price_eur"] : c.kind === "facts_change" ? c.payload.fields : [],
        );
        const cols = fields.filter((f) => FACT_COLUMNS.has(f));
        if (cols.length) {
          stmts.push({
            sql: `UPDATE properties SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
            args: [...cols.map((c) => col((facts as Record<string, unknown>)[c])), at, s.property_id],
          });
        }
        for (const c of changes) stmts.push(event(s.property_id, c.kind, c.payload, at));
      }

      // The family's stage is never touched here (D07). A portal delisting a home is a fact about
      // the portal; `preseleccionada` is a fact about the family, and only they may change it.
      //
      // What earns a line in the feed, and nothing else does. A source dropping to `unknown` is
      // ordinary — portals rate-limit, networks fail — so it is not news until it has failed three
      // times running. Coming back is only news if we had said it was gone.
      if (next.availability === "removed" && prev.availability !== "removed") {
        stmts.push(event(s.property_id, "availability_change", { from: prev.availability, to: "removed" }, at));
      } else if (next.availability === "active" && prev.availability === "removed") {
        stmts.push(event(s.property_id, "availability_change", { from: "removed", to: "active" }, at));
      } else if (next.availability === "unknown" && next.consecutive_failures === WARN_AT) {
        // one warning per streak, at exactly the third unreadable check in a row
        stmts.push(event(s.property_id, "availability_change", { to: "unknown", failures: WARN_AT }, at));
      }

      await tx.batch(stmts);
      await tx.commit();

      if (next.availability === "removed") summary.removed++;
      else if (next.availability === "unknown") summary.unknown++;
      if (changes.length) summary.changed++;
      console.log(
        `${label} → ${outcome} / ${next.availability}` +
          (changes.length ? ` (${changes.map((c) => c.kind).join(", ")})` : "") +
          (next.consecutive_gone ? ` [gone ${next.consecutive_gone}/2]` : ""),
      );
    } finally { tx.close(); }
  }

  console.log(`[recheck] checked=${summary.checked} changed=${summary.changed} removed=${summary.removed} unknown=${summary.unknown}`);
  return summary;
}
