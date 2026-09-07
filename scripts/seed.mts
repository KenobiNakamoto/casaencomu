/**
 * Dev seed: fill the database from a JSON file so the UI can be looked at with real content.
 *
 *   pnpm tsx scripts/seed.mts [file.json] [--reset]
 *
 * The default file is `scripts/seed.example.json` (fictional). Real family data lives in a
 * gitignored file and is passed as the argument — never committed.
 *
 * ponytail: raw INSERTs rather than reusing `save()`, because `save()` downloads photos and
 * hashes facts for the recheck loop; a seed wants neither. Update this if `schema.sql` changes.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db, applySchema } from "../src/lib/db";
import { STAGES, type Stage } from "../src/lib/listing";
import { normalizeUrl } from "../src/lib/url";

type Seed = {
  members: { email: string; name: string }[];
  properties: {
    url: string;
    title: string;
    stage: Stage;
    price_eur?: number;
    area_m2?: number;
    rooms?: number;
    bathrooms?: number;
    floor?: string;
    lift?: boolean;
    outdoor?: string | null;
    parking?: boolean;
    condition?: string;
    energy_rating?: string;
    description?: string;
    address_text?: string;
    address_precision?: "exact" | "approx" | "none";
    lat?: number;
    lng?: number;
    neighborhood?: string;
    agency?: string;
    created_by: string;
    comments?: { by: string; text: string }[];
    ratings?: { by: string; dimension: string; score: number }[];
  }[];
};

const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "scripts/seed.example.json";
const reset = process.argv.includes("--reset");
const seed: Seed = JSON.parse(readFileSync(file, "utf8"));
const flag = (b: boolean | undefined) => (b == null ? null : b ? 1 : 0);

await applySchema();

if (reset) {
  // foreign_keys=ON, so sources/photos/events/ratings/comments cascade
  await db.execute("DELETE FROM properties");
  console.log("reset: properties cleared");
}

// members
const ids = new Map<string, string>();
for (const m of seed.members) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO users (id, email, name, capture_token, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [randomUUID(), m.email, m.name, randomUUID(), new Date().toISOString()],
  });
  const { rows } = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [m.email] });
  ids.set(m.name, String(rows[0].id));
}
const who = (name: string) => ids.get(name) ?? ids.get(seed.members[0].name)!;

let added = 0;
let skipped = 0;
for (const p of seed.properties) {
  if (!STAGES.includes(p.stage)) throw new Error(`${p.url}: unknown stage ${p.stage}`);
  const { portal, portalRef, normalized } = normalizeUrl(p.url);
  const dup = await db.execute({
    sql: "SELECT 1 FROM sources WHERE url_normalized = ? LIMIT 1",
    args: [normalized],
  });
  if (dup.rows.length) {
    skipped++;
    continue;
  }

  // spread the timeline over the last two weeks so Actividad and the sort order look real
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString();
  const created = at(14 - added);
  const id = randomUUID();
  const author = who(p.created_by);

  await db.batch(
    [
      {
        sql: `INSERT INTO properties (id, title, stage, price_eur, fees_eur, area_m2, rooms, bathrooms,
          floor, lift, outdoor, parking, condition, energy_rating, description, address_text,
          address_precision, lat, lng, neighborhood, agency, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, p.title, p.stage, p.price_eur ?? null, p.area_m2 ?? null, p.rooms ?? null,
          p.bathrooms ?? null, p.floor ?? null, flag(p.lift), p.outdoor ?? null, flag(p.parking),
          p.condition ?? null, p.energy_rating ?? null, p.description ?? null, p.address_text ?? null,
          p.address_precision ?? "none", p.lat ?? null, p.lng ?? null, p.neighborhood ?? null,
          p.agency ?? null, author, created, created,
        ],
      },
      {
        sql: `INSERT INTO sources (id, property_id, portal, portal_ref, url_normalized, url_original, via,
          facts_json, facts_hash, first_seen_at, last_ok_at, availability)
          VALUES (?, ?, ?, ?, ?, ?, 'paste', '{}', 'seed', ?, ?, ?)`,
        args: [
          randomUUID(), id, portal, portalRef, normalized, p.url, created, created,
          p.stage === "no_disponible" ? "gone" : "active",
        ],
      },
      {
        sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, 'import', ?, ?, ?)",
        args: [randomUUID(), id, JSON.stringify({ via: "paste", portal, photos: 0 }), author, created],
      },
    ],
    "write",
  );

  let n = 0;
  for (const c of p.comments ?? []) {
    const when = new Date(Date.parse(created) + ++n * 36e5).toISOString();
    await db.batch(
      [
        {
          sql: "INSERT INTO comments (id, property_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
          args: [randomUUID(), id, who(c.by), c.text, when],
        },
        {
          sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, 'comment', NULL, ?, ?)",
          args: [randomUUID(), id, who(c.by), when],
        },
      ],
      "write",
    );
  }
  for (const r of p.ratings ?? []) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO ratings (property_id, user_id, dimension, score, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, who(r.by), r.dimension, r.score, created],
    });
  }
  added++;
}

const { rows } = await db.execute("SELECT count(*) AS n FROM properties");
console.log(`seeded ${added} properties (${skipped} already there) from ${file}; ${rows[0].n} total`);
