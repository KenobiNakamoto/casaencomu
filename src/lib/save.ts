import { createHash, randomUUID } from "node:crypto";
import type { InValue } from "@libsql/client";
import { db } from "./db";
import type { Listing } from "./listing";
import { savePhotos } from "./photos";

export type Source = {
  url_original: string;
  url_normalized: string;
  portal: string;
  portal_ref: string | null;
};
export type Via = "bookmarklet" | "paste";

// libsql rejects `undefined`; zod's `.nullish()` fields may carry it.
const v = (x: unknown): InValue => (x === undefined ? null : (x as InValue));
const flag = (x: boolean | null | undefined): InValue => (x == null ? null : x ? 1 : 0);

/**
 * Exact duplicate (same `url_normalized`, or same `(portal, portal_ref)`) → one `duplicate`
 * event and the existing id. Otherwise property + source + photos + one `import` event.
 */
// ponytail: synchronous import inside the request; add a queue when it exceeds 20 s
export async function save(
  listing: Listing,
  src: Source,
  user: { id: string },
  via: Via,
): Promise<{ propertyId: string; duplicate: boolean }> {
  const now = new Date().toISOString();

  // `portal_ref = NULL` never matches in SQL, so a null ref falls back to the URL check alone.
  const existing = await db.execute({
    sql: "SELECT property_id FROM sources WHERE url_normalized = ? OR (portal = ? AND portal_ref = ?) LIMIT 1",
    args: [src.url_normalized, src.portal, src.portal_ref],
  });
  if (existing.rows.length) {
    const propertyId = String(existing.rows[0].property_id);
    await db.execute({
      sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, 'duplicate', ?, ?, ?)",
      args: [randomUUID(), propertyId, JSON.stringify({ via, portal: src.portal }), user.id, now],
    });
    return { propertyId, duplicate: true };
  }

  const { photos, ...facts } = listing;
  const factsJson = JSON.stringify(Object.fromEntries(Object.entries(facts).sort()));
  const factsHash = createHash("sha256").update(factsJson).digest("hex");
  const propertyId = randomUUID();

  await db.batch(
    [
      {
        sql: `INSERT INTO properties (id, title, stage, price_eur, fees_eur, area_m2, rooms, bathrooms,
          floor, lift, outdoor, parking, condition, energy_rating, description, address_text,
          address_precision, lat, lng, neighborhood, agency, created_by, created_at, updated_at)
          VALUES (?, ?, 'nueva', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          propertyId,
          facts.title,
          v(facts.price_eur),
          v(facts.fees_eur),
          v(facts.area_m2),
          v(facts.rooms),
          v(facts.bathrooms),
          v(facts.floor),
          flag(facts.lift),
          v(facts.outdoor),
          flag(facts.parking),
          v(facts.condition),
          v(facts.energy_rating),
          v(facts.description),
          v(facts.address_text),
          facts.address_precision,
          v(facts.lat),
          v(facts.lng),
          v(facts.neighborhood),
          v(facts.agency),
          user.id,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO sources (id, property_id, portal, portal_ref, url_normalized, url_original, via,
          facts_json, facts_hash, first_seen_at, last_ok_at, availability)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        args: [
          randomUUID(),
          propertyId,
          src.portal,
          src.portal_ref,
          src.url_normalized,
          src.url_original,
          via,
          factsJson,
          factsHash,
          now,
          now,
        ],
      },
    ],
    "write",
  );

  const n = await savePhotos(propertyId, photos);

  await db.execute({
    sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, 'import', ?, ?, ?)",
    args: [randomUUID(), propertyId, JSON.stringify({ via, portal: src.portal, photos: n }), user.id, now],
  });
  return { propertyId, duplicate: false };
}
