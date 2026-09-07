import { randomUUID } from "node:crypto";
import type { InStatement } from "@libsql/client";
import { canonicalFacts, classifyChanges, col, FACT_COLUMNS, factsHash, type Facts } from "./changes";
import { db } from "./db";
import { extract } from "./extract";
import { isAllowedHost } from "./url";

export type FetchedPage = { status: number; finalUrl?: string; html?: string };
export type FetchPage = (url: string) => Promise<FetchedPage>;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const STALE_MS = 48 * 3_600_000;
const WARN_AT = 3;

/** One plain GET, redirects followed, 20 s budget. Never retried, never a block bypassed. */
export async function fetchPage(url: string): Promise<FetchedPage> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "es-ES,es;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, finalUrl: res.url, html: await res.text() };
}

type Row = {
  id: string;
  property_id: string;
  portal: string;
  portal_ref: string | null;
  url_original: string;
  via: string;
  facts_json: string;
  consecutive_failures: number;
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
 * apart. Success → facts, `properties` and one `events` row per change. 404/410 or a gone
 * marker → `unknown` first, `removed` + stage `no_disponible` on the second in a row. 403,
 * timeout or a challenge → `unknown`, one warning event at three failures in a row.
 */
export async function runRechecks({
  now = new Date(),
  limit = 10,
  spacingMs = 60_000,
  fetchPage: fetchImpl = fetchPage,
}: { now?: Date; limit?: number; spacingMs?: number; fetchPage?: FetchPage } = {}) {
  const at = now.toISOString();
  const cutoff = new Date(now.getTime() - STALE_MS).toISOString();
  const { rows } = await db.execute({
    sql: `SELECT id, property_id, portal, portal_ref, url_original, via, facts_json, consecutive_failures, availability
          FROM sources WHERE availability != 'removed' AND (last_checked_at IS NULL OR last_checked_at < ?)
          ORDER BY last_checked_at ASC`,
    args: [cutoff],
  });
  const picked = (rows as unknown as Row[]).filter(fetchable).slice(0, limit);
  const summary = { checked: 0, changed: 0, removed: 0, unknown: 0 };

  for (const [i, s] of picked.entries()) {
    if (i > 0 && spacingMs > 0) await sleep(spacingMs);
    const label = `[recheck] ${s.portal} ${s.portal_ref ?? s.url_original}`;
    summary.checked++;

    let page: FetchedPage | null = null;
    try {
      page = await fetchImpl(s.url_original);
    } catch {
      /* timeout or network error → unknown below */
    }
    // 4xx/5xx bodies are never parsed as a listing (an error page with a <title> is not a fact change)
    const listing = page && page.status < 400 ? extract({ url: s.url_original, ...page }) : null;
    let prev: Facts | null = null;
    try {
      prev = JSON.parse(s.facts_json) as Facts;
    } catch {
      /* unreadable facts → nothing to compare against */
    }
    const changes = classifyChanges(prev, listing, { status: page?.status, finalUrl: page?.finalUrl });
    const failures = s.consecutive_failures + 1;

    if (listing) {
      const facts = canonicalFacts(listing);
      const stmts: InStatement[] = [
        {
          sql: `UPDATE sources SET consecutive_failures = 0, availability = 'active', last_ok_at = ?, last_checked_at = ?,
                facts_json = ?, facts_hash = ? WHERE id = ?`,
          args: [at, at, JSON.stringify(facts), factsHash(facts), s.id],
        },
      ];
      const fields = changes.flatMap((c) => (c.kind === "price_change" ? ["price_eur"] : c.kind === "facts_change" ? c.payload.fields : []));
      const cols = fields.filter((f) => FACT_COLUMNS.has(f));
      if (cols.length) {
        stmts.push({
          sql: `UPDATE properties SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
          args: [...cols.map((c) => col((facts as Record<string, unknown>)[c])), at, s.property_id],
        });
      }
      for (const c of changes) stmts.push(event(s.property_id, c.kind, c.payload, at));
      await db.batch(stmts, "write");
      if (changes.length) summary.changed++;
      console.log(`${label} → active${changes.length ? ` (${changes.map((c) => c.kind).join(", ")})` : ""}`);
    } else if (changes.some((c) => c.kind === "availability_change")) {
      // ponytail: the counter does not record the kind of the last failure; any prior failure is the first strike
      if (s.consecutive_failures >= 1) {
        await db.batch(
          [
            {
              sql: "UPDATE sources SET availability = 'removed', consecutive_failures = ?, last_checked_at = ? WHERE id = ?",
              args: [failures, at, s.id],
            },
            {
              sql: "UPDATE properties SET stage = 'no_disponible', updated_at = ? WHERE id = ? AND stage != 'descartada'",
              args: [at, s.property_id],
            },
            event(s.property_id, "availability_change", { to: "removed" }, at),
          ],
          "write",
        );
        summary.removed++;
        console.log(`${label} → removed`);
      } else {
        await db.execute({
          sql: "UPDATE sources SET availability = 'unknown', consecutive_failures = ?, last_checked_at = ? WHERE id = ?",
          args: [failures, at, s.id],
        });
        summary.unknown++;
        console.log(`${label} → gone once (${page?.status}), unknown until confirmed`);
      }
    } else {
      const stmts: InStatement[] = [
        {
          sql: "UPDATE sources SET availability = 'unknown', consecutive_failures = ?, last_checked_at = ? WHERE id = ?",
          args: [failures, at, s.id],
        },
      ];
      // one warning per streak, at exactly the third failure
      if (failures === WARN_AT) stmts.push(event(s.property_id, "availability_change", { to: "unknown", failures }, at));
      await db.batch(stmts, "write");
      summary.unknown++;
      console.log(`${label} → unknown (${page ? `status ${page.status}` : "timeout or network error"}, failure ${failures})`);
    }
  }

  console.log(`[recheck] checked=${summary.checked} changed=${summary.changed} removed=${summary.removed} unknown=${summary.unknown}`);
  return summary;
}
