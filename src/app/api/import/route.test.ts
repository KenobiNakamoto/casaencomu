import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), enrich: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn(async () => ({ id: "demo-user" })) }));
vi.mock("@/lib/fetching", () => ({ fetchGuarded: h.fetch }));
vi.mock("@/lib/save", () => ({ save: h.save }));
vi.mock("@/lib/enrich", () => ({ runEnrichment: h.enrich }));
const { POST } = await import("./route");

const listingUrl = "https://www.idealista.com/inmueble/12345678/?utm_source=share";
function request(origin: string | null = "http://127.0.0.1:3120", extra: Record<string, string> = {}) {
  // The actual regression: Next's internal URL differs from the browser's request Host.
  return new Request("http://localhost:3120/api/import", {
    method: "POST",
    headers: { host: "127.0.0.1:3120", "content-type": "application/json", ...(origin ? { origin } : {}), ...extra },
    body: JSON.stringify({ url: listingUrl }),
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("PUBLIC_URL", "");
  delete process.env.PUBLIC_URL;
  h.fetch.mockResolvedValue({ status: 403, finalUrl: listingUrl, body: Buffer.from("<html>Access denied</html>"), truncated: false });
  h.save.mockResolvedValue({ propertyId: "saved-home", outcome: "created", photosMissing: 0 });
  h.enrich.mockResolvedValue(undefined);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("listing import from the local demo", () => {
  it("accepts the browser's real origin despite Next's normalized localhost URL", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ location: "/propiedades/saved-home", outcome: "created" });
    expect(h.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      url_original: listingUrl, url_normalized: "https://idealista.com/inmueble/12345678",
    }), expect.objectContaining({ pending: "blocked" }));
  });

  it.each(["https://foreign.example", "http://127.0.0.1:3121", "https://127.0.0.1:3120", "http://localhost:3120", "null", null])(
    "rejects a foreign, mismatched or missing origin: %s", async (origin) => {
      expect((await POST(request(origin))).status).toBe(403);
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.save).not.toHaveBeenCalled();
    },
  );

  it("honors PUBLIC_URL behind a proxy and refuses Host or forwarded-header overrides", async () => {
    vi.stubEnv("PUBLIC_URL", "https://casa.example.com");
    expect((await POST(request("https://casa.example.com"))).status).toBe(200);
    h.fetch.mockClear();
    expect((await POST(request("http://127.0.0.1:3120", { "x-forwarded-host": "127.0.0.1:3120" }))).status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("does not use the development Host fallback in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request())).status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("still rejects unsupported URLs before fetching", async () => {
    const req = request();
    const invalid = new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ url: "https://example.com/flat" }) });
    expect((await POST(invalid)).status).toBe(400);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("reports a malformed body without crashing", async () => {
    const req = request();
    const invalid = new Request(req.url, { method: "POST", headers: req.headers, body: "{" });
    expect((await POST(invalid)).status).toBe(400);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("keeps a link when the portal is unreachable and redirects plain forms", async () => {
    h.fetch.mockRejectedValue(new Error("offline"));
    const res = await POST(new Request("http://localhost:3120/api/import", {
      method: "POST", headers: { host: "127.0.0.1:3120", origin: "http://127.0.0.1:3120" },
      body: new URLSearchParams({ url: listingUrl }),
    }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/propiedades/saved-home");
    expect(h.save).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ pending: "offline" }));
  });
});
