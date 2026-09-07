import { describe, expect, it } from "vitest";
import { ALLOWED_HOSTS, ALLOWED_IMAGE_HOSTS, isAllowedHost, isAllowedImageHost, normalizeUrl } from "./url";

const cases = [
  {
    portal: "idealista",
    ref: "112446118",
    normalized: "https://idealista.com/inmueble/112446118",
    variants: [
      "https://www.idealista.com/inmueble/112446118/",
      "https://idealista.com/inmueble/112446118",
      "https://WWW.Idealista.com/inmueble/112446118/?utm_source=x&utm_medium=y",
      "https://www.idealista.com/inmueble/112446118/#photos",
    ],
  },
  {
    portal: "fotocasa",
    ref: "190311653",
    normalized: "https://fotocasa.es/es/comprar/vivienda/barcelona-capital/some-slug/190311653/d",
    variants: [
      "https://www.fotocasa.es/es/comprar/vivienda/barcelona-capital/some-slug/190311653/d",
      "https://www.fotocasa.es/es/comprar/vivienda/barcelona-capital/some-slug/190311653/d/",
      "https://www.fotocasa.es/es/comprar/vivienda/barcelona-capital/some-slug/190311653/d?utm_campaign=z",
      "https://fotocasa.es/es/comprar/vivienda/barcelona-capital/some-slug/190311653/d#map",
    ],
  },
  {
    portal: "habitaclia",
    ref: "8166003810008",
    normalized: "https://habitaclia.com/comprar-atico-some-slug-barcelona-i8166003810008.htm",
    variants: [
      "https://www.habitaclia.com/comprar-atico-some-slug-barcelona-i8166003810008.htm",
      "https://habitaclia.com/comprar-atico-some-slug-barcelona-i8166003810008.htm?utm_source=a#top",
      "https://www.habitaclia.com/comprar-atico-some-slug-barcelona-i8166003810008.htm/",
    ],
  },
] as const;

describe("normalizeUrl", () => {
  for (const c of cases) {
    it(`${c.portal}: every variant gives the same ref and normalized URL`, () => {
      for (const v of c.variants) {
        expect(normalizeUrl(v)).toEqual({ portal: c.portal, portalRef: c.ref, normalized: c.normalized });
      }
    });
  }

  it("portal page without a ref → ref null", () => {
    expect(normalizeUrl("https://www.idealista.com/venta-viviendas/barcelona/")).toEqual({
      portal: "idealista",
      portalRef: null,
      normalized: "https://idealista.com/venta-viviendas/barcelona",
    });
  });

  it("unknown host → generic, ref null", () => {
    expect(normalizeUrl("https://www.example.com/casa/123/?x=1")).toEqual({
      portal: "generic",
      portalRef: null,
      normalized: "https://example.com/casa/123",
    });
  });

  it("invalid string → throws", () => {
    expect(() => normalizeUrl("not a url")).toThrow();
    expect(() => normalizeUrl("")).toThrow();
  });
});

describe("allowlists", () => {
  it("hosts", () => {
    expect([...ALLOWED_HOSTS]).toEqual(["idealista.com", "fotocasa.es", "habitaclia.com"]);
    expect(isAllowedHost("https://www.idealista.com/inmueble/1/")).toBe(true);
    expect(isAllowedHost("https://idealista.com.evil.com/inmueble/1/")).toBe(false);
    expect(isAllowedHost("http://127.0.0.1/")).toBe(false);
    expect(isAllowedHost("nope")).toBe(false);
  });
  it("image hosts", () => {
    expect(ALLOWED_IMAGE_HOSTS.size).toBe(6);
    expect(isAllowedImageHost("https://static.fotocasa.es/images/ads/x?rule=original")).toBe(true);
    expect(isAllowedImageHost("https://img4.idealista.com/blur/WEB_DETAIL/0/x.jpg")).toBe(true);
    expect(isAllowedImageHost("https://images.habimg.com/imgh/1-2/x.jpg")).toBe(true);
    expect(isAllowedImageHost("https://media.mobiliagestion.es/Portals/x/Images/7688/1-large.jpg")).toBe(true);
    expect(isAllowedImageHost("https://images.iadespana.es/property/broadcast/2026/05/07/x.jpg")).toBe(true);
    expect(isAllowedImageHost("https://static0.housfy.com/prod/property-img/987141/x-1200x800.jpg")).toBe(true);
    expect(isAllowedImageHost("https://www.idealista.com/x.jpg")).toBe(false);
    expect(isAllowedImageHost("//images.habimg.com/x.jpg")).toBe(false);
    // in the same pages' image lists, and never to be fetched
    expect(isAllowedImageHost("https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/x.png")).toBe(false);
    expect(isAllowedImageHost("https://www.facebook.com/tr?id=1&ev=PageView")).toBe(false);
    expect(isAllowedImageHost("https://cms.housfy.com/assets/5e25c115")).toBe(false);
  });
});
