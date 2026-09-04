import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extract, type Page } from "./extract";
import { Listing } from "./listing";
import { isAllowedImageHost } from "./url";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}.html`, import.meta.url), "utf8");

// Expected values read off the fixtures (spike 2026-09-04). Photo counts are unique images:
// Idealista lists the same 44 in three arrays (132 entries), Habitaclia repeats photo 1 in two print sizes.
const live = [
  {
    name: "idealista",
    url: "https://www.idealista.com/inmueble/112446118/",
    title: "Piso en venta en Gran Via de les Corts Catalanes, 751, El Fort Pienc, Barcelona",
    price_eur: 1350000,
    area_m2: 209,
    rooms: 4,
    photos: 44,
    extra: { floor: "2ª planta", lift: true, outdoor: "exterior", address_precision: "exact", lat: 41.4009654, lng: 2.1823263, neighborhood: "El Fort Pienc" },
  },
  {
    name: "fotocasa",
    url: "https://www.fotocasa.es/es/comprar/vivienda/barcelona-capital/some-slug/190311653/d",
    title: "Ático en venta en Consell de Cent, Dreta de l'Eixample, Barcelona Capital",
    price_eur: 1644999,
    area_m2: 180,
    rooms: 3,
    photos: 68,
    extra: { bathrooms: 3, floor: "Ático", lift: true, energy_rating: "B", address_precision: "approx", lat: 41.395466, lng: 2.1719298, neighborhood: "Dreta de l'Eixample" },
  },
  {
    name: "habitaclia",
    url: "https://www.habitaclia.com/comprar-atico-some-slug-barcelona-i8166003810008.htm",
    title: "Ático renovado y encantador en Eixample Esquerra",
    price_eur: 350000,
    area_m2: 51,
    rooms: 2,
    photos: 30,
    extra: { bathrooms: 1, address_precision: "approx", lat: 41.384733, lng: 2.160988 },
  },
] as const;

describe("extract on the live fixtures (server fetch → html)", () => {
  for (const f of live) {
    it(f.name, () => {
      const r = extract({ url: f.url, html: fixture(f.name) });
      expect(r).not.toBeNull();
      const l = r!;
      expect(l).toMatchObject({ title: f.title, price_eur: f.price_eur, area_m2: f.area_m2, rooms: f.rooms, ...f.extra });
      expect(l.photos).toHaveLength(f.photos);
      expect(new Set(l.photos).size).toBe(f.photos);
      expect(l.photos.every((p) => /^https:\/\//.test(p) && isAllowedImageHost(p))).toBe(true);
      // description verbatim: tags stripped, line breaks kept
      expect(l.description).toMatch(/\n/);
      expect(l.description).not.toMatch(/<br|<p>|&#/);
      expect(Listing.safeParse(l).success).toBe(true);
    });
  }

  it("idealista: description is the full ad text with paragraph breaks", () => {
    const l = extract({ url: live[0].url, html: fixture("idealista") })!;
    expect(l.description).toMatch(/^Presentamos en exclusiva esta propiedad de lujo de 209 m² construidos/);
    expect(l.description).toMatch(/\n\n/);
  });
});

describe("extract → null on removed or blocked pages", () => {
  it("each removed fixture", () => {
    for (const f of live) expect(extract({ url: f.url, html: fixture(`${f.name}-removed`) })).toBeNull();
  });

  it("finalUrl carrying the redirect markers", () => {
    const html = fixture("fotocasa");
    expect(extract({ url: live[1].url, html, finalUrl: "https://www.fotocasa.es/es/comprar/viviendas/barcelona-capital/todas-las-zonas/l?propertyNotFound" })).toBeNull();
    expect(extract({ url: live[2].url, html: fixture("habitaclia"), finalUrl: "https://www.habitaclia.com/viviendas-barcelona.htm?state=1" })).toBeNull();
    // the listing's own URL as finalUrl stays live
    expect(extract({ url: live[1].url, html, finalUrl: live[1].url })).not.toBeNull();
  });

  it("status 404 / 410 / 403 and a DataDome challenge page", () => {
    const html = fixture("habitaclia");
    for (const status of [404, 410, 403]) expect(extract({ url: live[2].url, html, status })).toBeNull();
    const challenge = '<html><head><title>idealista.com</title><script src="https://ct.captcha-delivery.com/c.js"></script></head><body></body></html>';
    expect(extract({ url: live[0].url, html: challenge })).toBeNull();
  });

  it("no title anywhere → null", () => {
    expect(extract({ url: "https://example.com/x", html: "<html><body>nada</body></html>" })).toBeNull();
  });
});

describe("extract on a bookmarklet-shaped page (og + blob, no html)", () => {
  it("fotocasa", () => {
    const html = fixture("fotocasa");
    const blob = html.match(/<script[^>]*id="__initial_props__"[^>]*>([\s\S]*?)<\/script>/)![1];
    const page: Page = {
      url: live[1].url,
      og: { "og:title": "Ático en venta en Consell de Cent, Dreta de l'Eixample, Barcelona Capital" },
      blob,
    };
    const l = extract(page);
    expect(l).not.toBeNull();
    expect(l).toMatchObject({ title: live[1].title, price_eur: 1644999, area_m2: 180, rooms: 3, bathrooms: 3 });
    expect(l!.photos).toHaveLength(68);
  });

  it("generic host: og only", () => {
    const l = extract({
      url: "https://example.com/casa/1",
      og: { "og:title": "Casa de ejemplo", "og:description": "Texto", "og:image": "https://cdn.example.com/a.jpg" },
      imgs: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg", "/relative.jpg"],
    });
    expect(l).toMatchObject({ title: "Casa de ejemplo", description: "Texto", address_precision: "none" });
    expect(l!.photos).toEqual(["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"]);
  });
});
