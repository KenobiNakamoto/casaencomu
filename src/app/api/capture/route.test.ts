import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ identity: vi.fn(async () => null) }));
vi.mock("@/lib/auth", () => ({ captureIdentity: h.identity }));
vi.mock("@/lib/enrich", () => ({ runEnrichment: vi.fn() }));
vi.mock("@/lib/save", () => ({ save: vi.fn() }));
vi.mock("@/lib/db", () => ({ inProject: vi.fn() }));
const { POST } = await import("./route");
afterEach(() => h.identity.mockClear());
it("cancels a body above the cap without buffering it to the end or checking a token", async () => {
  let chunks = 0; let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(512 * 1024)); },
    cancel() { cancelled = true; },
  });
  const req = new Request("http://localhost/api/capture", { method: "POST", body, duplex: "half", headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "1" } } as RequestInit);
  expect((await POST(req)).status).toBe(413);
  expect(cancelled).toBe(true); expect(chunks).toBeLessThanOrEqual(4);
  expect(h.identity).not.toHaveBeenCalled();
});
it("returns a readable rejection for a malformed multipart body", async () => {
  const req = new Request("http://localhost/api/capture", { method: "POST", body: "invalid", headers: { "content-type": "multipart/form-data" } });
  expect((await POST(req)).status).toBe(400);
  expect(h.identity).not.toHaveBeenCalled();
});
