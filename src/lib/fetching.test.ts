import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGuarded, refuse } from "./fetching";
import { isAllowedHost } from "./url";

const OK = "https://www.fotocasa.es/es/comprar/vivienda/barcelona-capital/x/190311653/d";

describe("refuse — the four rules every outward URL passes", () => {
  it("accepts a plain https portal URL", () => {
    expect(refuse(OK, isAllowedHost)).toBeNull();
  });
  it("refuses plain http", () => {
    expect(refuse("http://www.fotocasa.es/x", isAllowedHost)).toBe("scheme");
  });
  it("refuses embedded credentials", () => {
    expect(refuse("https://user:pw@www.fotocasa.es/x", isAllowedHost)).toBe("credentials");
  });
  it("refuses a non-default port", () => {
    expect(refuse("https://www.fotocasa.es:8443/x", isAllowedHost)).toBe("port");
  });
  it("refuses a host off the allowlist, and anything unparsable", () => {
    expect(refuse("https://evil.example/x", isAllowedHost)).toBe("host");
    expect(refuse("not a url", isAllowedHost)).toBe("host");
  });
});

/** One fake response per call, in order. */
function stubFetch(...responses: Response[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return responses.shift() ?? new Response("", { status: 500 });
    }),
  );
  return calls;
}

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

afterEach(() => vi.unstubAllGlobals());

describe("fetchGuarded", () => {
  it("follows a same-host redirect and reports the URL it ended on", async () => {
    const calls = stubFetch(redirect(OK + "?propertyNotFound"), new Response("gone", { status: 200 }));
    const r = await fetchGuarded(OK, { allow: isAllowedHost, maxBytes: 1000, timeoutMs: 500 });
    expect("refused" in r).toBe(false);
    expect((r as { finalUrl: string }).finalUrl).toContain("propertyNotFound");
    expect(calls).toHaveLength(2);
  });

  it("refuses a redirect that leaves the allowlist, before taking the hop", async () => {
    const calls = stubFetch(redirect("https://evil.example/steal"));
    const r = await fetchGuarded(OK, { allow: isAllowedHost, maxBytes: 1000, timeoutMs: 500 });
    expect(r).toEqual({ refused: "host" });
    expect(calls).toEqual([OK]); // the second host was never contacted
  });

  it("gives up after three redirects", async () => {
    stubFetch(redirect(OK + "?a"), redirect(OK + "?b"), redirect(OK + "?c"), redirect(OK + "?d"));
    const r = await fetchGuarded(OK, { allow: isAllowedHost, maxBytes: 1000, timeoutMs: 500 });
    expect(r).toEqual({ refused: "redirects" });
  });

  it("stops an oversized body at the cap even with no content-length", async () => {
    // a stream that would never end on its own
    const body = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(1024));
      },
    });
    stubFetch(new Response(body, { status: 200 }));
    const r = await fetchGuarded(OK, { allow: isAllowedHost, maxBytes: 4096, timeoutMs: 500 });
    expect(r).toMatchObject({ truncated: true });
    expect((r as { body: Buffer }).body.byteLength).toBeLessThanOrEqual(4096);
  });

  it("refuses an oversized body that declares its length, without reading it", async () => {
    stubFetch(new Response("x".repeat(10), { status: 200, headers: { "content-length": "99999" } }));
    const r = await fetchGuarded(OK, { allow: isAllowedHost, maxBytes: 4096, timeoutMs: 500 });
    expect(r).toMatchObject({ truncated: true, body: Buffer.alloc(0) });
  });
});
