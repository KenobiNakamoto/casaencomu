import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLOWED_HOSTS, routeFor } from "./url";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

describe("routeFor — a forecast of which path will read the page, not a gate", () => {
  it("sends to the server only what the server can actually read", () => {
    expect(routeFor("https://www.fotocasa.es/es/comprar/vivienda/barcelona/x/1")).toBe("server");
    expect(routeFor("https://www.habitaclia.com/comprar-piso-barcelona-1.htm")).toBe("server");
  });

  it("says a browser has to open an Idealista link, which answers 403 every time", () => {
    expect(routeFor("https://www.idealista.com/inmueble/12345/")).toBe("capture");
  });

  it("names the other measured portals that only the browser can read", () => {
    expect(routeFor("https://www.housfy.com/comprar/piso-1")).toBe("capture");
    expect(routeFor("https://www.vivalta.es/es/ref-7688_1168")).toBe("capture");
    expect(routeFor("https://www.iadespana.es/anuncio/piso-x/r911605")).toBe("capture");
  });

  it("says so plainly for anything else, and never throws on rubbish", () => {
    expect(routeFor("https://example.com/x")).toBe("unsupported");
    expect(routeFor("not a url")).toBe("unsupported");
    expect(routeFor("")).toBe("unsupported");
    expect(routeFor("javascript:alert(1)")).toBe("unsupported");
  });

  it("ignores `www.` and capitals, the way the allowlist does", () => {
    expect(routeFor("https://FOTOCASA.es/x")).toBe("server");
    expect(routeFor("https://www.Fotocasa.es/x")).toBe("server");
  });

  it("is narrower than the allowlist, and never wider", () => {
    // The allowlist is what the server may fetch at all. Idealista is on it — a bookmarklet
    // capture still arrives from that host — but it is not worth a server fetch.
    expect(ALLOWED_HOSTS.has("idealista.com")).toBe(true);
    expect(routeFor("https://idealista.com/x")).not.toBe("server");
    for (const host of ["fotocasa.es", "habitaclia.com"]) {
      expect(ALLOWED_HOSTS.has(host), `${host} must stay fetchable`).toBe(true);
    }
  });
});

/**
 * The change issue #111 made, guarded from both ends: a link a person pastes is accepted and read
 * afterwards. Refusing an Idealista link in the browser was losing it — the record never existed,
 * so nothing came back to it, and the person had to keep the tab open and remember.
 */
describe("a portal that blocks the server no longer costs the person the link", () => {
  const add = read("../components/propiedades/search-bar.tsx");
  const route = read("../app/api/import/route.ts");

  it("the add field refuses only a site we do not take at all", () => {
    expect(add).toContain('routeFor(value) === "unsupported"');
    expect(add).not.toContain('=== "capture"');
    expect(add).not.toContain("bloquea la lectura");
  });

  it("the endpoint takes every allowed host and saves the ones it cannot read", () => {
    // `isAllowedHost` is the only refusal left, and it is the SSRF allowlist.
    expect(route).toContain("!url || !isAllowedHost(url)");
    expect(route).toContain("pendingRecord(url, norm.portalRef)");
    // Whatever was downloaded is kept for the fill layers — except a challenge page, which says
    // nothing and would only cost a model call to rediscover.
    expect(route).toContain('r.kind === "blocked" ? null : rawOf(input)');
    expect(route).toContain("runEnrichment");
  });

  it("every host on the allowlist has a route, so none can be accepted and then forgotten", () => {
    for (const host of ALLOWED_HOSTS) {
      expect(routeFor(`https://www.${host}/x/1`), host).not.toBe("unsupported");
    }
  });
});
