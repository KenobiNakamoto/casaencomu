import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { InStatement } from "@libsql/client";
import { z } from "zod";
import { aiReady, ask, type Image } from "./ai";
import { canonicalFacts, col, FACT_COLUMNS, factsHash } from "./changes";
import { currentProjectId, db } from "./db";
import type { Presence, Raw } from "./extract";
import { Listing } from "./listing";
import { photoPath } from "./photos";

/**
 * Which layer produced a field. `portal` is the deterministic extractor: the only one that read a
 * fact off the page rather than found it in prose or deduced it from a photograph. The distinction
 * is the point — a deduced `condition` and a stated one must never look alike to the family.
 */
export type Origin = Record<string, "portal" | "ai_read" | "ai_inferred">;

/**
 * Layer 2 may fill any of these, and only from words that appear in the page. `lat`, `lng` and
 * `address_precision` are absent on purpose: a coordinate is drawn on a map, and a model that
 * places a pin from a street name has invented a location, not read one.
 */
const GLOSS: Record<string, string> = {
  title: "el titular del anuncio, tal cual",
  price_eur: "precio de venta en euros, entero, sin separadores",
  fees_eur: "gastos de comunidad al mes, en euros",
  area_m2: "superficie construida en m²",
  rooms: "número de habitaciones o dormitorios",
  bathrooms: "número de baños y aseos",
  floor: "la planta como la escribe el anuncio: «3ª», «Bajo», «Ático»",
  outdoor: "espacios exteriores citados: terraza, balcón, jardín, patio; separados por comas",
  condition: "estado de conservación: «obra nueva», «buen estado», «a reformar»",
  energy_rating: "letra del certificado energético, de la A a la G",
  description: "el texto del anunciante, literal, sin resumir",
  address_text: "la calle o la dirección",
  neighborhood: "el barrio",
  agency: "la inmobiliaria o quien anuncia",
  lift: "true si hay ascensor, false si el anuncio dice que no lo hay",
  parking: "true si incluye plaza de garaje",
};
const READABLE = Object.keys(GLOSS);

/**
 * Layer 3 may deduce these and nothing else. A price, an address or a description are written by
 * the seller: a deduced one is a fabrication, however plausible. These eight are visible in a
 * photograph or stated plainly in prose, and each one is easy for the family to check.
 */
const INFERABLE = ["rooms", "bathrooms", "area_m2", "floor", "outdoor", "condition", "lift", "parking"];

/** A value outside its range is not a near miss, it is a misread label. Rejected, not clamped. */
const RANGE: Record<string, [number, number]> = {
  price_eur: [10_000, 20_000_000],
  fees_eur: [0, 100_000],
  area_m2: [10, 2_000],
  rooms: [0, 20],
  bathrooms: [0, 10],
};
const MAX_TEXT = 220;
const MAX_DESCRIPTION = 4_000;

/** The model's answer for one field, or null. Null covers "did not answer" and "answered nonsense". */
function clean(field: string, value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    const r = RANGE[field];
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return r && (value < r[0] || value > r[1]) ? null : value;
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || /^(null|n\/a|desconocido|no consta)$/i.test(s)) return null;
  return s.slice(0, field === "description" ? MAX_DESCRIPTION : MAX_TEXT);
}

/** Accents off, case off, spaces collapsed. The same words, however the page happens to write them. */
const flat = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * `outdoor` is asked for as a comma list, so layer 2 has to compose it out of separate words.
 * Every other readable field is one thing the page either says or does not.
 */
const COMPOSED = new Set(["outdoor"]);

/**
 * **Layer 2 may only copy, and this is what checks it.** The prompt says every value has to appear
 * in the page; asking is not enforcing. A value the model composed from two places, or brought
 * from what it already knows, would be stored as «del portal» — and a guess that looks like a
 * stated fact is the one failure this app must not have.
 *
 * Measured: 1 of 5 listings, where the model joined an agent's name to the network named in the
 * page's own privacy notice. Only strings are checked. A number is written a dozen ways
 * («338.000», «338000 €»), so containment would reject good answers, and `RANGE` already guards it.
 */
const copiedFromPage = (field: string, value: string | number | boolean | null, page: string) =>
  typeof value !== "string" || COMPOSED.has(field) || flat(page).includes(flat(value));

/** `Listing`'s own shape for the requested fields, so the tool schema can never drift from it. */
const schemaFor = (fields: string[]) =>
  z.object(
    Object.fromEntries(
      fields.map((f) => [f, f === "title" ? z.string().nullish() : Listing.shape[f as keyof typeof Listing.shape]]),
    ),
  );

const asked = (fields: string[]) => fields.map((f) => `- ${f}: ${GLOSS[f]}`).join("\n");

export type Filled = { listing: Listing; presence: Presence; origin: Origin; read: string[]; inferred: string[] };

/**
 * Layers 2 and 3, over whatever layer 1 left empty. Layer 2 reads the stored page and may only
 * copy; layer 3 deduces from the description and the photographs and must answer null when it is
 * not sure. A field no layer can fill stays empty — that is a result, not a failure.
 *
 * Pure apart from the two model calls: no database, so a test can drive it with a fake `ask`.
 */
export async function fill(opts: {
  listing: Listing;
  presence: Presence;
  origin?: Origin;
  raw: Raw;
  photos?: Image[];
  signal?: AbortSignal;
}): Promise<Filled> {
  const out = { ...opts.listing } as Record<string, unknown>;
  const presence: Presence = { ...opts.presence };
  const origin: Origin = { ...opts.origin };
  for (const [k, seen] of Object.entries(presence)) if (seen === "present" && !origin[k]) origin[k] = "portal";
  const read: string[] = [];
  const inferred: string[] = [];

  const gaps = (fields: string[]) => fields.filter((f) => out[f] == null);
  const take = (
    fields: string[],
    got: Record<string, unknown> | null,
    layer: "ai_read" | "ai_inferred",
    into: string[],
    page?: string,
  ) => {
    if (!got) return;
    for (const f of fields) {
      const v = clean(f, got[f]);
      if (v === null) continue;
      if (page !== undefined && !copiedFromPage(f, v, page)) continue;
      out[f] = v;
      presence[f] = "present";
      origin[f] = layer;
      into.push(f);
    }
  };

  const text = opts.raw.text?.trim();
  const gap2 = gaps(READABLE);
  if (aiReady() && text && gap2.length) {
    take(
      gap2,
      await ask({
        name: "campos_del_anuncio",
        schema: schemaFor(gap2),
        system:
          "Lees el texto de un anuncio inmobiliario español y extraes campos. Regla única: cada valor " +
          "que devuelvas tiene que aparecer literalmente en el texto. No calcules, no deduzcas y no " +
          "completes. Si un dato no está escrito, devuelve null. Ignora otros anuncios, menús, " +
          "cookies y pies de página: solo cuenta la vivienda de este anuncio.",
        prompt: `Campos que faltan:\n${asked(gap2)}\n\nTexto del anuncio:\n"""\n${text}\n"""`,
        signal: opts.signal,
      }),
      "ai_read",
      read,
      text,
    );
  }

  const evidence = [out.description, opts.raw.ogDescription].filter((x): x is string => typeof x === "string" && !!x);
  const gap3 = gaps(INFERABLE);
  if (aiReady() && gap3.length && (evidence.length || opts.photos?.length)) {
    take(
      gap3,
      await ask({
        name: "campos_deducidos",
        schema: schemaFor(gap3),
        system:
          "Deduces datos de una vivienda a partir de su descripción y de sus fotos. Devuelve un valor " +
          "solo cuando la prueba está escrita en el texto o se ve con claridad en una foto. Ante la " +
          "duda, null. Un dato vacío es correcto; un dato inventado no lo es.",
        prompt:
          `Campos que faltan:\n${asked(gap3)}\n\n` +
          (evidence.length ? `Descripción:\n"""\n${evidence.join("\n\n").slice(0, MAX_DESCRIPTION)}\n"""\n\n` : "") +
          `${opts.photos?.length ?? 0} foto(s) del anuncio se adjuntan antes de este texto.`,
        images: opts.photos,
        signal: opts.signal,
      }),
      "ai_inferred",
      inferred,
    );
  }

  return { listing: Listing.parse(out), presence, origin, read, inferred };
}

const MAX_PHOTOS_SENT = 4;

/** Up to four stored photographs as base64. A photo that will not read is skipped, never fatal. */
async function photosOf(propertyId: string): Promise<Image[]> {
  const { rows } = await db.execute({
    sql: "SELECT sha256 FROM photos WHERE property_id = ? ORDER BY position LIMIT ?",
    args: [propertyId, MAX_PHOTOS_SENT],
  });
  const project = await currentProjectId();
  const out: Image[] = [];
  for (const r of rows) {
    try {
      const buf = await readFile(photoPath(project, propertyId, String(r.sha256)));
      out.push({ media_type: "image/jpeg", data: buf.toString("base64") });
    } catch {
      /* ponytail: a photo we cannot read is one fewer piece of evidence, not an error */
    }
  }
  return out;
}

type Row = {
  id: string;
  property_id: string;
  facts_json: string;
  field_presence_json: string;
  field_origin_json: string;
  raw_json: string | null;
};

const parse = <T,>(s: string | null, fallback: T): T => {
  try {
    return s ? ((JSON.parse(s) as T) ?? fallback) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * One pass over the sources whose current observation the fill layers have not seen. `enriched_at`
 * is the whole queue: a new observation sets it back to NULL and the source comes round again.
 *
 * Without a key nothing is marked done, so the day one is configured every waiting source is
 * filled rather than silently skipped.
 */
export async function runEnrichment({ limit = 5, signal }: { limit?: number; signal?: AbortSignal } = {}) {
  if (!aiReady()) return { filled: 0, skipped: 0 };
  const { rows } = await db.execute({
    sql: `SELECT id, property_id, facts_json, field_presence_json, field_origin_json, raw_json
          FROM sources WHERE enriched_at IS NULL ORDER BY first_seen_at ASC LIMIT ?`,
    args: [limit],
  });

  let filled = 0;
  let skipped = 0;
  for (const row of rows as unknown as Row[]) {
    const at = new Date().toISOString();
    const raw = parse<Raw>(row.raw_json, {});
    const stored = parse<Record<string, unknown>>(row.facts_json, {});
    const listing = Listing.safeParse({ ...stored, photos: [] });
    if (!listing.success) {
      // An unreadable snapshot has nothing to fill. Mark it seen so the queue does not spin on it.
      await db.execute({ sql: "UPDATE sources SET enriched_at = ? WHERE id = ?", args: [at, row.id] });
      skipped++;
      continue;
    }

    const before = canonicalFacts(listing.data);
    const r = await fill({
      listing: listing.data,
      presence: parse<Presence>(row.field_presence_json, {}),
      origin: parse<Origin>(row.field_origin_json, {}),
      raw,
      photos: await photosOf(row.property_id),
      signal,
    });
    const facts = canonicalFacts(r.listing);
    const touched = [...r.read, ...r.inferred];

    const stmts: InStatement[] = [
      {
        sql: `UPDATE sources SET facts_json = ?, facts_hash = ?, field_presence_json = ?,
              field_origin_json = ?, enriched_at = ? WHERE id = ?`,
        args: [
          JSON.stringify(facts),
          factsHash(facts),
          JSON.stringify(r.presence),
          JSON.stringify(r.origin),
          at,
          row.id,
        ],
      },
    ];
    const cols = touched.filter((f) => FACT_COLUMNS.has(f) && before[f as keyof typeof before] == null);
    if (cols.length) {
      stmts.push({
        sql: `UPDATE properties SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
        args: [...cols.map((c) => col((facts as Record<string, unknown>)[c])), at, row.property_id],
      });
      // Its own kind, never `facts_change`: the advertisement did not change, our reading of it
      // did. Saying "Datos actualizados" for a deduction would put a guess in the same sentence
      // as a price cut.
      stmts.push({
        sql: `INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at)
              VALUES (?, ?, 'enriched', ?, NULL, ?)`,
        args: [randomUUID(), row.property_id, JSON.stringify({ read: r.read, inferred: r.inferred }), at],
      });
    }
    await db.batch(stmts, "write");
    if (cols.length) filled++;
    else skipped++;
    console.log(`[enrich] ${row.property_id} read=${r.read.join(",") || "-"} inferred=${r.inferred.join(",") || "-"}`);
  }
  if (rows.length) console.log(`[enrich] filled=${filled} skipped=${skipped}`);
  return { filled, skipped };
}
