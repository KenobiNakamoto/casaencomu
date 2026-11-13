import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-enrichment-queue-"));
const service = vi.hoisted(() => ({ ask: vi.fn<() => Promise<Record<string, unknown> | null>>() }));
vi.mock("./ai", () => ({ aiReady: () => true, ask: service.ask }));
const { db, applySchema } = await import("./db");
const { save } = await import("./save");
const { Listing } = await import("./listing");
const { runEnrichment } = await import("./enrich");
const url = "https://www.fotocasa.es/es/comprar/vivienda/barcelona/synthetic/190311653/d";
const src = { url_original: url, url_normalized: url, portal: "fotocasa", portal_ref: "190311653" };
const opts = { user: { id: "u" }, via: "paste" as const, presence: { title: "present" as const }, raw: { text: "Anuncio de prueba con 3 habitaciones y 90 m². ".repeat(20) } };
const source = async () => (await db.execute("SELECT * FROM sources")).rows[0];
beforeAll(async () => {
  await applySchema();
  await db.execute("INSERT INTO users (id,email,name,capture_token,created_at) VALUES ('u','reader@example.com','Reader','synthetic-token','2026-01-01')");
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-12T00:00:00Z"));
  await db.executeMultiple("DELETE FROM events; DELETE FROM sources; DELETE FROM properties;");
  await save(Listing.parse({ title: "Synthetic home" }), src, opts);
  service.ask.mockReset();
});
afterEach(() => vi.useRealTimers());
it("retries after an outage with backoff, and completes when the service recovers", async () => {
  service.ask.mockResolvedValue(null);
  expect(await runEnrichment()).toMatchObject({ retrying: 1 });
  expect((await source()).enriched_at).toBeNull();
  expect((await source()).enrichment_attempts).toBe(1);
  await runEnrichment(); expect(service.ask).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 61_000);
  service.ask.mockResolvedValue({ rooms: 3 });
  expect(await runEnrichment()).toMatchObject({ filled: 1, retrying: 0 });
  expect((await source()).enriched_at).toBeTruthy();
  expect((await db.execute("SELECT rooms FROM properties")).rows[0].rooms).toBe(3);
});
it("treats valid empty output as complete, without retrying forever", async () => {
  service.ask.mockResolvedValue({});
  await runEnrichment(); vi.setSystemTime(Date.now() + 120_000); await runEnrichment();
  expect(service.ask).toHaveBeenCalledTimes(1);
  expect((await source()).enriched_at).toBeTruthy();
});
it("claims each observation once across overlapping workers", async () => {
  let release!: (value: Record<string, unknown>) => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => { started = r; });
  service.ask.mockImplementation(() => { started(); return new Promise((r) => { release = r; }); });
  const first = runEnrichment(); await ready;
  await runEnrichment(); expect(service.ask).toHaveBeenCalledTimes(1);
  release({ rooms: 3 }); await first;
  expect((await source()).enriched_at).toBeTruthy();
  expect((await db.execute("SELECT COUNT(*) AS n FROM events WHERE kind = 'enriched'")).rows[0].n).toBe(1);
});
it("discards an AI response after a newer recapture and preserves the new facts and provenance", async () => {
  let release!: (value: Record<string, unknown>) => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => { started = r; });
  service.ask.mockImplementation(() => { started(); return new Promise((r) => { release = r; }); });
  const first = runEnrichment(); await ready;
  await save(Listing.parse({ title: "Synthetic home", rooms: 4 }), src, { ...opts, presence: { title: "present", rooms: "present" } });
  release({ rooms: 2 }); await first;
  expect((await db.execute("SELECT rooms FROM properties")).rows[0].rooms).toBe(4);
  const s = await source();
  expect(JSON.parse(String(s.facts_json)).rooms).toBe(4);
  expect(JSON.parse(String(s.field_origin_json)).rooms).toBe("portal");
  expect(s.enriched_at).toBeNull();
  expect((await db.execute("SELECT COUNT(*) AS n FROM events WHERE kind = 'enriched'")).rows[0].n).toBe(0);
});
it("recovers an expired worker lease", async () => {
  await db.execute("UPDATE sources SET enrichment_token = 'crashed-worker', enrichment_lease_until = '2000-01-01'");
  service.ask.mockResolvedValue({}); await runEnrichment();
  expect(service.ask).toHaveBeenCalledTimes(1);
  expect((await source()).enrichment_token).toBeNull();
  expect((await source()).enriched_at).toBeTruthy();
});
