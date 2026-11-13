import { randomUUID } from "node:crypto";
import type { InStatement, InValue } from "@libsql/client";
import { nextSourceState, type SourceState } from "./availability";
import { canonicalFacts, classifyChanges, col, FACT_COLUMNS, factsHash, type Facts } from "./changes";
import { db } from "./db";
import type { Origin } from "./enrich";
import { capped, merge, originOf } from "./observation";
import type { Presence, Raw } from "./extract";
import type { Listing } from "./listing";
import { savePhotos } from "./photos";

export type Source = {
  url_original: string;
  url_normalized: string;
  portal: string;
  portal_ref: string | null;
};
export type Via = "bookmarklet" | "paste";

/**
 * What a caller knows about one observation beyond the listing itself. `raw` is the page as the
 * fill layers will read it later. `pending` is the reason nothing was read — one of `intake.ts`'s
 * `PendingReason` values, stored verbatim in `last_check_outcome`, so the record says *why* it is
 * empty rather than only that it is. Absent or null means the advertisement was read.
 */
export type Observed = { presence: Presence; raw?: Raw | null; pending?: string | null };

export type SaveResult = {
  propertyId: string;
  /** `created` first time · `updated` the advertisement changed · `unchanged` nothing moved. */
  outcome: "created" | "updated" | "unchanged";
  /** Photos written by this call, and how many it wanted but did not get. */
  photos: number;
  photosMissing: number;
};

const event = (propertyId: string, kind: string, payload: unknown, actorId: string, at: string): InStatement => ({
  sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  args: [randomUUID(), propertyId, kind, JSON.stringify(payload), actorId, at],
});

/** The photo URLs already stored for this property, so a refresh downloads only the new ones. */
async function knownPhotoUrls(propertyId: string): Promise<Set<string>> {
  const { rows } = await db.execute({
    sql: "SELECT source_url FROM photos WHERE property_id = ? AND source_url IS NOT NULL",
    args: [propertyId],
  });
  return new Set(rows.map((r) => String(r.source_url)));
}

type SourceRow = SourceState & { id: string; property_id: string; facts_json: string; field_origin_json: string; filled: number };

/** Pasting a link is a manual observation, never confirmation that a blocked listing is active. */
function importedState(previous: SourceState, pending?: string | null) {
  const outcome = !pending ? "listing" : pending === "removed" ? "removed" : pending === "blocked" ? "blocked" : "unreadable";
  return nextSourceState(previous, outcome, false);
}

const parseOrigin = (s: string | null): Origin => {
  try {
    return s ? ((JSON.parse(s) as Origin) ?? {}) : {};
  } catch {
    return {};
  }
};

/** `portal_ref = NULL` never matches in SQL, so a null ref falls back to the URL check alone. */
async function findSource(src: Source): Promise<SourceRow | null> {
  const { rows } = await db.execute({
    sql: `SELECT s.id, s.property_id, s.facts_json, s.field_origin_json,
          s.availability, s.consecutive_gone, s.consecutive_failures, p.filled FROM sources s
          JOIN properties p ON p.id = s.property_id
          WHERE s.url_normalized = ? OR (s.portal = ? AND s.portal_ref = ?) LIMIT 1`,
    args: [src.url_normalized, src.portal, src.portal_ref],
  });
  return rows.length ? (rows[0] as unknown as SourceRow) : null;
}

/**
 * A second look at a source we already hold. Not a duplicate: it is its newest observation.
 * Unchanged → the freshness stamps move, nothing else, no event. Changed → the source snapshot,
 * the property's own columns and one event per change, in a single write. Ratings, comments and
 * the family's stage are never touched by a refresh.
 */
async function refresh(
  row: SourceRow,
  listing: Listing,
  obs: Observed,
  user: { id: string },
  at: string,
  deadline?: AbortSignal,
): Promise<SaveResult> {
  const { presence, pending } = obs;
  const state = importedState(row, pending);
  let prev: Facts | null = null;
  try {
    prev = JSON.parse(row.facts_json) as Facts;
  } catch {
    /* unreadable snapshot → nothing to compare against; the observation stands on its own */
  }
  const raw = capped(obs.raw);
  const facts = merge(prev, listing, presence);
  const changes = classifyChanges(prev, { ...facts, photos: [] } as Listing);
  // Reading an advertisement for the first time is not the advertisement changing. The columns
  // are still written — that is the whole point of the read — but the feed says nothing, because
  // "Datos actualizados" and a price cut from nothing are both false. F03 in a different coat.
  const firstRead = !row.filled;

  // `enriched_at = NULL` is the whole enrichment queue: a new observation puts the source back in
  // it. `last_ok_at` moves only when the page was really read — a pending observation is a record
  // that the link is safe, not evidence that anything was fetched.
  const set: [string, InValue][] = [
    ["facts_json", JSON.stringify(facts)],
    ["facts_hash", factsHash(facts)],
    ["field_presence_json", JSON.stringify(presence)],
    // A refused fetch contains no evidence about the photos already recorded for the home.
    ...(pending ? [] : ([["photo_urls_json", JSON.stringify(listing.photos)]] as [string, InValue][])),
    ["field_origin_json", JSON.stringify(originOf(parseOrigin(row.field_origin_json), presence))],
    ["last_check_outcome", pending || "listing"],
    ["last_checked_at", at],
    ["availability", state.availability],
    ["consecutive_gone", state.consecutive_gone],
    ["consecutive_failures", state.consecutive_failures],
    ...(pending ? [] : ([["last_ok_at", at]] as [string, InValue][])),
    ...(raw ? ([["raw_json", raw]] as [string, InValue][]) : []),
  ];
  const stmts: InStatement[] = [
    {
      sql: `UPDATE sources SET ${set.map(([c]) => `${c} = ?`).join(", ")},
            enriched_at = NULL,
            observation_version = observation_version + 1, enrichment_attempts = 0,
            enrichment_retry_at = NULL, enrichment_token = NULL, enrichment_lease_until = NULL WHERE id = ?`,
      args: [...set.map(([, v]) => v), row.id],
    },
  ];
  // Once an advertisement has been read, it stays read: a later blocked check must not put the
  // record back into "nothing here yet".
  if (!pending) stmts.push({ sql: "UPDATE properties SET filled = 1 WHERE id = ?", args: [row.property_id] });

  const fields = changes.flatMap((c) =>
    c.kind === "price_change" ? ["price_eur"] : c.kind === "facts_change" ? c.payload.fields : [],
  );
  const cols = fields.filter((f) => FACT_COLUMNS.has(f));
  if (cols.length) {
    stmts.push({
      sql: `UPDATE properties SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
      args: [...cols.map((c) => col((facts as Record<string, unknown>)[c])), at, row.property_id],
    });
  }
  if (!firstRead) for (const c of changes) stmts.push(event(row.property_id, c.kind, c.payload, user.id, at));
  // The first real reading of a link that was accepted empty. Not a change — there was nothing to
  // change from — but it is the thing the person who pasted it is waiting for, so it is recorded
  // once, here, and `lib/notifications.ts` turns it into their notification.
  else if (!pending) stmts.push(event(row.property_id, "completed", { title: facts.title }, user.id, at));
  await db.batch(stmts, "write");

  // ponytail: a refresh writes no event of its own. The changes are the record; a "checked,
  // nothing moved" row would fill the feed. Freshness is read from `last_ok_at`.
  const known = await knownPhotoUrls(row.property_id);
  const wanted = listing.photos.filter((u) => !known.has(u));
  const saved = wanted.length ? await savePhotos(row.property_id, wanted, deadline) : 0;
  return {
    propertyId: row.property_id,
    outcome: changes.length ? "updated" : "unchanged",
    photos: saved,
    photosMissing: wanted.length - saved,
  };
}

async function create(
  listing: Listing,
  src: Source,
  obs: Observed,
  via: Via,
  user: { id: string },
  at: string,
  deadline?: AbortSignal,
): Promise<SaveResult> {
  const { presence, pending } = obs;
  const state = importedState({ availability: "unknown", consecutive_gone: 0, consecutive_failures: 0 }, pending);
  const facts = canonicalFacts(listing);
  const propertyId = randomUUID();
  const factCols = [...FACT_COLUMNS];

  await db.batch(
    [
      {
        sql: `INSERT INTO properties (id, stage, filled, ${factCols.join(", ")}, created_by, created_at, updated_at)
              VALUES (?, 'nueva', ?, ${factCols.map(() => "?").join(", ")}, ?, ?, ?)`,
        args: [
          propertyId,
          pending ? 0 : 1,
          ...factCols.map((c) => col((facts as Record<string, unknown>)[c])),
          user.id,
          at,
          at,
        ],
      },
      {
        sql: `INSERT INTO sources (id, property_id, portal, portal_ref, url_normalized, url_original, via,
              facts_json, facts_hash, field_presence_json, photo_urls_json, field_origin_json, raw_json,
              last_check_outcome, first_seen_at, last_checked_at, last_ok_at, availability,
              consecutive_gone, consecutive_failures)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          propertyId,
          src.portal,
          src.portal_ref,
          src.url_normalized,
          src.url_original,
          via,
          JSON.stringify(facts),
          factsHash(facts),
          JSON.stringify(presence),
          JSON.stringify(listing.photos),
          JSON.stringify(originOf({}, presence)),
          capped(obs.raw),
          pending || "listing",
          at,
          at,
          pending ? null : at,
          state.availability,
          state.consecutive_gone,
          state.consecutive_failures,
        ],
      },
    ],
    "write",
  );

  const saved = await savePhotos(propertyId, listing.photos, deadline);
  await db.execute(event(propertyId, "import", { via, portal: src.portal, photos: saved }, user.id, at));
  return { propertyId, outcome: "created", photos: saved, photosMissing: listing.photos.length - saved };
}

/**
 * The one way an observation reaches the database: the bookmarklet, a pasted link, the ingest
 * script. An unseen source becomes a property; a source we already hold is refreshed in place.
 * Finding F02: the old code answered a second capture with a `duplicate` event and changed
 * nothing, so the `Comprobar` instruction refreshed nothing.
 */
// ponytail: the import runs inside the request, bounded by the caller's deadline; add a queue
// only when a measured import cannot finish inside it
export async function save(
  listing: Listing,
  src: Source,
  opts: { user: { id: string }; via: Via; deadline?: AbortSignal } & Observed,
): Promise<SaveResult> {
  const { user, via, deadline, ...obs } = opts;
  const at = new Date().toISOString();
  const existing = await findSource(src);
  if (existing) return refresh(existing, listing, obs, user, at, deadline);

  try {
    return await create(listing, src, obs, via, user, at, deadline);
  } catch (e) {
    // Two captures of one new advertisement can both miss the SELECT. `url_normalized` is UNIQUE
    // and `sources_ref` is a unique index, so the loser arrives here: read the row the winner
    // wrote and refresh it, which is what a second observation means anyway.
    if (!/UNIQUE constraint failed/i.test(String(e))) throw e;
    const row = await findSource(src);
    if (!row) throw e;
    return refresh(row, listing, obs, user, at, deadline);
  }
}
