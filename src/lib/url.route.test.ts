import { describe, expect, it } from "vitest";
import { ALLOWED_HOSTS, routeFor } from "./url";

describe("routeFor — decide in the browser, before anything is sent (F16)", () => {
  it("sends to the server only what the server can actually read", () => {
    expect(routeFor("https://www.fotocasa.es/es/comprar/vivienda/barcelona/x/1")).toBe("server");
    expect(routeFor("https://www.habitaclia.com/comprar-piso-barcelona-1.htm")).toBe("server");
  });

  it("never posts an Idealista link, which answers 403 every time", () => {
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
