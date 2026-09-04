import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalFacts, classifyChanges, factsHash } from "./changes";
import { extract } from "./extract";

// db.ts reads DATA_DIR at import; point it at a temp dir before the dynamic imports below
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-recheck-"));
const { db, applySchema } = await import("./db");
const { runRechecks } = await import("./recheck");

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}.html`, import.meta.url), "utf8");
const FOTOCASA_URL = "https://www.fotocasa.es/es/comprar/vivienda/barcelona-capital/some-slug/190311653/d";
const html = fixture("fotocasa");
const listing = extract({ url: FOTOCASA_URL, html })!;
const prev = canonicalFacts(listing);

describe("canonicalFacts / factsHash", () => {
  it("drops photos, sorts keys, hashes exactly as save.ts does", () => {
    expect("photos" in prev).toBe(false);
    expect(Object.keys(prev)).toEqual([...Object.keys(prev)].sort());
    // the expression save.ts (#11) uses, verbatim
    const { photos: _photos, ...facts } = listing;
    void _photos;
    const saved = JSON.stringify(Object.fromEntries(Object.entries(facts).sort()));
    expect(JSON.stringify(prev)).toBe(saved);
    expect(factsHash(prev)).toBe(createHash("sha256").update(saved).digest("hex"));
  });
});

describe("classifyChanges", () => {
  it("identical → []", () => {
    expect(classifyChanges(prev, listing, { status: 200 })).toEqual([]);
  });

  it("price only → exactly one price_change with from/to", () => {
    const next = { ...listing, price_eur: 1600000 };
    expect(classifyChanges(prev, next, { status: 200 })).toEqual([
      { kind: "price_change", payload: { from: 1644999, to: 1600000 } },
    ]);
  });

  it("facts change → one facts_change naming the fields, no price_change", () => {
    const next = { ...listing, rooms: 4, description: "Texto nuevo" };
    expect(classifyChanges(prev, next, { status: 200 })).toEqual([
      { kind: "facts_change", payload: { fields: ["description", "rooms"] } },
    ]);
  });

  it("price and a fact → one of each", () => {
    const next = { ...listing, price_eur: 1, rooms: 4 };
    expect(classifyChanges(prev, next).map((c) => c.kind)).toEqual(["price_change", "facts_change"]);
  });

  it("removed (next null, 404 / 410 / gone marker) → availability_change", () => {
    const removed = [{ kind: "availability_change", payload: { to: "removed" } }];
    expect(classifyChanges(prev, null, { status: 404 })).toEqual(removed);
    expect(classifyChanges(prev, null, { status: 410 })).toEqual(removed);
    expect(classifyChanges(prev, null, { status: 200, finalUrl: "https://www.fotocasa.es/es/comprar/viviendas/x/l?propertyNotFound" })).toEqual(removed);
    expect(classifyChanges(prev, null, { status: 200, finalUrl: "https://www.habitaclia.com/viviendas-barcelona.htm?state=1" })).toEqual(removed);
  });

  it("blocked or unreadable (next null, 403 / 200 without a marker) → [] — never gone", () => {
    expect(classifyChanges(prev, null, { status: 403 })).toEqual([]);
    expect(classifyChanges(prev, null, { status: 200, finalUrl: FOTOCASA_URL })).toEqual([]);
    expect(classifyChanges(prev, null, {})).toEqual([]);
  });

  it("null and a missing key are the same fact; nothing to compare against → []", () => {
    const { agency: _agency, ...withoutAgency } = { ...listing, agency: null };
    void _agency;
    expect(classifyChanges({ ...prev, agency: null }, { ...withoutAgency, photos: [] })).toEqual([]);
    expect(classifyChanges(null, listing)).toEqual([]);
  });
});

const H = 3_600_000;
const rows = async (sql: string, ...args: (string | number)[]) => (await db.execute({ sql, args })).rows;
const seed = async (url: string, portal: string, via: string, ref: string | null) => {
  const propertyId = randomUUID();
  const t0 = new Date(Date.now() - 72 * H).toISOString();
  await db.batch(
    [
      {
        sql: "INSERT INTO properties (id, title, price_eur, rooms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [propertyId, listing.title, listing.price_eur ?? null, listing.rooms ?? null, t0, t0],
      },
      {
        sql: `INSERT INTO sources (id, property_id, portal, portal_ref, url_normalized, url_original, via, facts_json, facts_hash,
              first_seen_at, last_checked_at, last_ok_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), propertyId, portal, ref, url.replace("www.", ""), url, via, JSON.stringify(prev), factsHash(prev), t0, t0, t0],
      },
    ],
    "write",
  );
  return propertyId;
};

describe("runRechecks against a temp DB", () => {
  it("price edit → one price_change event, property updated; two 404s → removed + no_disponible", async () => {
    await applySchema();
    const propertyId = await seed(FOTOCASA_URL, "fotocasa", "paste", "190311653");
    await seed("https://www.idealista.com/inmueble/112446118/", "idealista", "bookmarklet", "112446118");

    // 1. the same page with the price edited
    const edited = html.replaceAll("1644999", "1600000");
    const one = await runRechecks({ spacingMs: 0, fetchPage: async () => ({ status: 200, finalUrl: FOTOCASA_URL, html: edited }) });
    expect(one).toEqual({ checked: 1, changed: 1, removed: 0, unknown: 0 }); // the idealista source is skipped

    const events = await rows("SELECT kind, payload_json, actor_id FROM events WHERE property_id = ?", propertyId);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("price_change");
    expect(JSON.parse(String(events[0].payload_json))).toEqual({ from: 1644999, to: 1600000 });
    expect(events[0].actor_id).toBeNull();
    const [p] = await rows("SELECT price_eur, rooms, stage FROM properties WHERE id = ?", propertyId);
    expect(p).toMatchObject({ price_eur: 1600000, rooms: 3, stage: "nueva" });
    const [s] = await rows("SELECT availability, consecutive_failures, last_ok_at, last_checked_at, facts_hash, facts_json FROM sources WHERE property_id = ?", propertyId);
    expect(s.availability).toBe("active");
    expect(s.consecutive_failures).toBe(0);
    expect(s.last_ok_at).toBe(s.last_checked_at);
    expect(s.facts_hash).not.toBe(factsHash(prev));
    expect(JSON.parse(String(s.facts_json)).price_eur).toBe(1600000);

    // 2. not stale yet → nothing to do
    expect((await runRechecks({ spacingMs: 0, fetchPage: async () => ({ status: 200, html }) })).checked).toBe(0);

    // 3. first 404 → unknown, no event
    const gone = async () => ({ status: 404, finalUrl: FOTOCASA_URL, html: "" });
    const two = await runRechecks({ now: new Date(Date.now() + 49 * H), spacingMs: 0, fetchPage: gone });
    expect(two).toEqual({ checked: 1, changed: 0, removed: 0, unknown: 1 });
    let [src] = await rows("SELECT availability, consecutive_failures FROM sources WHERE property_id = ?", propertyId);
    expect(src).toMatchObject({ availability: "unknown", consecutive_failures: 1 });
    expect(await rows("SELECT id FROM events WHERE property_id = ? AND kind = 'availability_change'", propertyId)).toHaveLength(0);

    // 4. second 404 → removed, stage no_disponible, one availability_change
    const three = await runRechecks({ now: new Date(Date.now() + 98 * H), spacingMs: 0, fetchPage: gone });
    expect(three).toEqual({ checked: 1, changed: 0, removed: 1, unknown: 0 });
    [src] = await rows("SELECT availability, consecutive_failures FROM sources WHERE property_id = ?", propertyId);
    expect(src).toMatchObject({ availability: "removed", consecutive_failures: 2 });
    expect((await rows("SELECT stage FROM properties WHERE id = ?", propertyId))[0].stage).toBe("no_disponible");
    const av = await rows("SELECT payload_json FROM events WHERE property_id = ? AND kind = 'availability_change'", propertyId);
    expect(av).toHaveLength(1);
    expect(JSON.parse(String(av[0].payload_json))).toEqual({ to: "removed" });

    // 5. removed sources are never rechecked again
    expect((await runRechecks({ now: new Date(Date.now() + 200 * H), spacingMs: 0, fetchPage: gone })).checked).toBe(0);
  });

  it("403 / timeout → unknown, never removed; one warning at the third failure", async () => {
    const url = "https://www.habitaclia.com/comprar-atico-some-slug-barcelona-i8166003810008.htm";
    const propertyId = await seed(url, "habitaclia", "bookmarklet", "8166003810008");
    const blocked = async () => ({ status: 403, finalUrl: url, html: "" });
    const timeout = async (): Promise<never> => {
      throw new Error("The operation was aborted due to timeout");
    };
    for (const [i, fetchPage] of [blocked, timeout, blocked, timeout].entries()) {
      const r = await runRechecks({ now: new Date(Date.now() + i * 49 * H), spacingMs: 0, fetchPage });
      expect(r).toEqual({ checked: 1, changed: 0, removed: 0, unknown: 1 });
    }
    const [src] = await rows("SELECT availability, consecutive_failures FROM sources WHERE property_id = ?", propertyId);
    expect(src).toMatchObject({ availability: "unknown", consecutive_failures: 4 });
    expect((await rows("SELECT stage FROM properties WHERE id = ?", propertyId))[0].stage).toBe("nueva");
    const warnings = await rows("SELECT payload_json FROM events WHERE property_id = ?", propertyId);
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(String(warnings[0].payload_json))).toEqual({ to: "unknown", failures: 3 });
  });
});
