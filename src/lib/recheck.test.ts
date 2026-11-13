import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-rechecks-"));
const { db, applySchema } = await import("./db");
const { save } = await import("./save");
const { Listing } = await import("./listing");
const { extractResult } = await import("./extract");
const { runRechecks, fetchPage } = await import("./recheck");
const url = "https://www.fotocasa.es/es/comprar/vivienda/barcelona/synthetic/190311653/d";
const src = { url_original: url, url_normalized: url, portal: "fotocasa", portal_ref: "190311653" };
const base = Listing.parse({ title: "Synthetic home 190311653", price_eur: 350000, rooms: 3, area_m2: 90 });
const opts = { user: { id: "u" }, via: "paste" as const, presence: { title: "present" as const, price_eur: "present" as const, rooms: "present" as const, area_m2: "present" as const } };
const html = '<html><head><meta property="og:title" content="Synthetic home 190311653"></head><body>Reference 190311653</body></html>';
const due = () => db.execute("UPDATE sources SET last_checked_at='2000-01-01'");
const facts = async () => (await db.execute("SELECT price_eur, rooms, area_m2 FROM properties")).rows[0];
beforeAll(async () => {
  await applySchema();
  await db.execute("INSERT INTO users (id,email,name,capture_token,created_at) VALUES ('u','reader@example.com','Reader','synthetic-token','2026-01-01')");
});
beforeEach(async () => {
  await db.executeMultiple("DELETE FROM events; DELETE FROM sources; DELETE FROM properties;");
  await save(base, src, opts); await due();
});
afterEach(() => vi.unstubAllGlobals());
it("preserves absent facts and their provenance without emitting false changes", async () => {
  expect(extractResult({ url, html }).kind).toBe("listing");
  await db.execute(`UPDATE sources SET field_origin_json = '{"rooms":"ai_read","price_eur":"portal","area_m2":"portal"}'`);
  const result = await runRechecks({ spacingMs: 0, fetchPage: async () => ({ status: 200, html, finalUrl: url }) });
  expect(result.changed).toBe(0);
  expect(await facts()).toMatchObject({ price_eur: 350000, rooms: 3, area_m2: 90 });
  const s = (await db.execute("SELECT * FROM sources")).rows[0];
  expect(JSON.parse(String(s.field_origin_json)).rooms).toBe("ai_read");
  expect((await db.execute("SELECT kind FROM events")).rows.map((r) => r.kind)).toEqual(["import"]);
});
it("records an actual price change exactly once", async () => {
  const priced = html.replace('</body>', '<script id="__initial_props__">{"realEstate":{"price":325000}}</script></body>');
  // This synthetic portal response must actually carry a price before it can test a change.
  const extraction = extractResult({ url, html: priced });
  expect(extraction.kind === "listing" && extraction.listing.price_eur).toBe(325000);
  await runRechecks({ spacingMs: 0, fetchPage: async () => ({ status: 200, html: priced, finalUrl: url }) });
  await due();
  await runRechecks({ spacingMs: 0, fetchPage: async () => ({ status: 200, html: priced, finalUrl: url }) });
  expect((await facts()).price_eur).toBe(325000);
  expect((await db.execute("SELECT COUNT(*) AS n FROM events WHERE kind='price_change'")).rows[0].n).toBe(1);
});
it("merges with facts captured while the scheduled request was waiting", async () => {
  await runRechecks({ spacingMs: 0, fetchPage: async () => {
    await save({ ...base, rooms: 4 }, src, opts);
    return { status: 200, html, finalUrl: url };
  } });
  expect((await facts()).rooms).toBe(4);
});
it("never follows a portal redirect to an unauthorized host", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
  vi.stubGlobal("fetch", fetch);
  expect(await fetchPage(url)).toEqual({ status: 502 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not parse an oversized page", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { headers: { "content-length": "2000000" } })));
  expect(await fetchPage(url)).toEqual({ status: 502 });
});
