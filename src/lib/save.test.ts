import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { extractResult } from "./extract";
import type { Listing } from "./listing";

// db.ts reads DATA_DIR at import; point it at a temp dir before the dynamic imports below
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-save-"));
const { db, applySchema } = await import("./db");
const { save } = await import("./save");

const URL_A = "https://www.fotocasa.es/es/comprar/vivienda/barcelona-capital/some-slug/190311653/d";
const html = readFileSync(new URL("./__fixtures__/fotocasa.html", import.meta.url), "utf8");
const observed = extractResult({ url: URL_A, html });
if (observed.kind !== "listing") throw new Error("fixture no longer extracts");
// no photos: `save` would otherwise reach the network for them, which a unit test must not do
const base: Listing = { ...observed.listing, photos: [] };
const presence = observed.presence;
const src = { url_original: URL_A, url_normalized: URL_A, portal: "fotocasa", portal_ref: "190311653" };

const user = { id: randomUUID() };
const events = async (id: string) =>
  (await db.execute({ sql: "SELECT kind FROM events WHERE property_id = ? ORDER BY created_at", args: [id] })).rows.map(
    (r) => String(r.kind),
  );
const property = async (id: string) =>
  (await db.execute({ sql: "SELECT * FROM properties WHERE id = ?", args: [id] })).rows[0];
const source = async (id: string) =>
  (await db.execute({ sql: "SELECT * FROM sources WHERE property_id = ?", args: [id] })).rows[0];

beforeAll(async () => {
  await applySchema();
  await db.execute({
    sql: "INSERT INTO users (id, email, name, capture_token, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [user.id, "t@example.com", "t", randomUUID(), new Date().toISOString()],
  });
});

describe("save — the migration", () => {
  it("has applied version 2, so the observation columns exist", async () => {
    expect(Number((await db.execute("PRAGMA user_version")).rows[0][0])).toBeGreaterThanOrEqual(2);
    const cols = (await db.execute("PRAGMA table_info(sources)")).rows.map((r) => String(r.name));
    expect(cols).toEqual(expect.arrayContaining(["last_check_outcome", "field_presence_json", "photo_urls_json"]));
    expect((await db.execute("PRAGMA table_info(photos)")).rows.map((r) => String(r.name))).toContain("source_url");
  });
});

describe("save — a source seen again is refreshed, not rejected (F02)", () => {
  let id = "";

  it("the first observation creates the property and one import event", async () => {
    const r = await save(base, src, { user, via: "paste", presence });
    id = r.propertyId;
    expect(r.outcome).toBe("created");
    expect(await events(id)).toEqual(["import"]);
    expect(String((await source(id)).last_check_outcome)).toBe("listing");
  });

  it("the same advertisement again moves freshness and writes no event", async () => {
    const before = String((await source(id)).last_ok_at);
    await new Promise((r) => setTimeout(r, 5));
    const r = await save(base, src, { user, via: "paste", presence });
    expect(r).toMatchObject({ propertyId: id, outcome: "unchanged" });
    expect(await events(id)).toEqual(["import"]); // still exactly one
    expect(String((await source(id)).last_ok_at)).not.toBe(before);
  });

  it("a changed price updates the property and writes exactly one price_change", async () => {
    const cheaper = { ...base, price_eur: base.price_eur! - 25_000 };
    const r = await save(cheaper, src, { user, via: "paste", presence });
    expect(r.outcome).toBe("updated");
    expect(await events(id)).toEqual(["import", "price_change"]);
    expect(Number((await property(id)).price_eur)).toBe(cheaper.price_eur);
  });

  it("a field the observation did not carry keeps its stored value, and is not a change", async () => {
    const priceNow = Number((await property(id)).price_eur);
    // the extractor found no price this time: absent is not evidence that the price was removed
    const blind = { ...base, price_eur: null };
    const r = await save(blind, src, { user, via: "paste", presence: { ...presence, price_eur: "absent" } });
    expect(r.outcome).toBe("unchanged");
    expect(Number((await property(id)).price_eur)).toBe(priceNow);
  });

  it("an explicitly observed null does clear the value", async () => {
    const gone = { ...base, price_eur: null };
    const r = await save(gone, src, { user, via: "paste", presence: { ...presence, price_eur: "explicit_null" } });
    expect(r.outcome).toBe("updated");
    expect((await property(id)).price_eur).toBeNull();
  });
});
