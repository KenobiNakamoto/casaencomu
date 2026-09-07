import { randomUUID } from "node:crypto";
import type { InStatement } from "@libsql/client";
import { canonicalFacts, classifyChanges, col, FACT_COLUMNS, factsHash, type Facts } from "./changes";
import { db } from "./db";
import type { Presence } from "./extract";
import type { Listing } from "./listing";
import { savePhotos } from "./photos";

export type Source = {
  url_original: string;
  url_normalized: string;
  portal: string;
  portal_ref: string | null;
};
export type Via = "bookmarklet" | "paste";

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

/**
 * A field the new observation did not carry keeps the value already stored. Only an observed
 * field can change one — an extractor that failed to find the price must not erase last week's
 * price (`docs/product-improvement/05-implementation.md` § 5).
 */
function merge(prev: Facts | null, listing: Listing, presence: Presence): Facts {
  const next = canonicalFacts(listing);
  if (!prev) return next;
  const out = { ...next } as Record<string, unknown>;
  for (const [k, seen] of Object.entries(presence)) {
    if (seen === "absent" && k in prev) out[k] = (prev as Record<string, unknown>)[k];
  }
  return out as Facts;
}

/** The photo URLs already stored for this property, so a refresh downloads only the new ones. */
async function knownPhotoUrls(propertyId: string): Promise<Set<string>> {
  const { rows } = await db.execute({
    sql: "SELECT source_url FROM photos WHERE property_id = ? AND source_url IS NOT NULL",
    args: [propertyId],
  });
  return new Set(rows.map((r) => String(r.source_url)));
}

type SourceRow = { id: string; property_id: string; facts_json: string };

/** `portal_ref = NULL` never matches in SQL, so a null ref falls back to the URL check alone. */
async function findSource(src: Source): Promise<SourceRow | null> {
  const { rows } = await db.execute({
    sql: `SELECT id, property_id, facts_json FROM sources
          WHERE url_normalized = ? OR (portal = ? AND portal_ref = ?) LIMIT 1`,
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
  presence: Presence,
  user: { id: string },
  at: string,
  deadline?: AbortSignal,
): Promise<SaveResult> {
  let prev: Facts | null = null;
  try {
    prev = JSON.parse(row.facts_json) as Facts;
  } catch {
    /* unreadable snapshot → nothing to compare against; the observation stands on its own */
  }
  const facts = merge(prev, listing, presence);
  const changes = classifyChanges(prev, { ...facts, photos: [] } as Listing);

  const stmts: InStatement[] = [
    {
      sql: `UPDATE sources SET facts_json = ?, facts_hash = ?, field_presence_json = ?, photo_urls_json = ?,
            last_check_outcome = 'listing', last_ok_at = ?, last_checked_at = ?,
            consecutive_failures = 0, availability = 'active' WHERE id = ?`,
      args: [
        JSON.stringify(facts),
        factsHash(facts),
        JSON.stringify(presence),
        JSON.stringify(listing.photos),
        at,
        at,
        row.id,
      ],
    },
  ];

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
  for (const c of changes) stmts.push(event(row.property_id, c.kind, c.payload, user.id, at));
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
  presence: Presence,
  via: Via,
  user: { id: string },
  at: string,
  deadline?: AbortSignal,
): Promise<SaveResult> {
  const facts = canonicalFacts(listing);
  const propertyId = randomUUID();
  const factCols = [...FACT_COLUMNS];

  await db.batch(
    [
      {
        sql: `INSERT INTO properties (id, stage, ${factCols.join(", ")}, created_by, created_at, updated_at)
              VALUES (?, 'nueva', ${factCols.map(() => "?").join(", ")}, ?, ?, ?)`,
        args: [propertyId, ...factCols.map((c) => col((facts as Record<string, unknown>)[c])), user.id, at, at],
      },
      {
        sql: `INSERT INTO sources (id, property_id, portal, portal_ref, url_normalized, url_original, via,
              facts_json, facts_hash, field_presence_json, photo_urls_json, last_check_outcome,
              first_seen_at, last_checked_at, last_ok_at, availability)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'listing', ?, ?, ?, 'active')`,
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
          at,
          at,
          at,
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
  opts: { user: { id: string }; via: Via; presence: Presence; deadline?: AbortSignal },
): Promise<SaveResult> {
  const { user, via, presence, deadline } = opts;
  const at = new Date().toISOString();
  const existing = await findSource(src);
  if (existing) return refresh(existing, listing, presence, user, at, deadline);

  try {
    return await create(listing, src, presence, via, user, at, deadline);
  } catch (e) {
    // Two captures of one new advertisement can both miss the SELECT. `url_normalized` is UNIQUE
    // and `sources_ref` is a unique index, so the loser arrives here: read the row the winner
    // wrote and refresh it, which is what a second observation means anyway.
    if (!/UNIQUE constraint failed/i.test(String(e))) throw e;
    const row = await findSource(src);
    if (!row) throw e;
    return refresh(row, listing, presence, user, at, deadline);
  }
}
