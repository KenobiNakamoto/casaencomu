import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extract, extractResult, type Page } from "./extract";
import { Listing } from "./listing";
import { isAllowedImageHost } from "./url";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}.html`, import.meta.url), "utf8");
// the untrimmed spike pages, never committed: `_local/spike/`. Absent → these three tests skip.
const RAW_DIR = fileURLToPath(new URL("../../_local/spike/", import.meta.url));
const HAS_RAW = existsSync(join(RAW_DIR, "habitaclia.html"));

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

describe("extract on the untrimmed spike pages (search form, similar listings, logos present)", () => {
  // Habitaclia's search form reads "+5 … Baños"; the raw page once yielded bathrooms = 5 for a 1-bath flat
  it.skipIf(!HAS_RAW)("habitaclia: own feature block only", () => {
    const l = extract({ url: live[2].url, html: readFileSync(join(RAW_DIR, "habitaclia.html"), "utf8") })!;
    expect(l).toMatchObject({ bathrooms: 1, rooms: 2, area_m2: 51, price_eur: 350000 });
    expect(l.photos).toHaveLength(30);
  });
  it.skipIf(!HAS_RAW)("idealista: own feature block only", () => {
    const l = extract({ url: live[0].url, html: readFileSync(join(RAW_DIR, "idealista.html"), "utf8") })!;
    expect(l).toMatchObject({ bathrooms: 3, rooms: 4, area_m2: 209, price_eur: 1350000 });
    expect(l.photos).toHaveLength(44);
  });
  it.skipIf(!HAS_RAW)("fotocasa: blob only", () => {
    const l = extract({ url: live[1].url, html: readFileSync(join(RAW_DIR, "fotocasa.html"), "utf8") })!;
    expect(l).toMatchObject({ bathrooms: 3, rooms: 3, area_m2: 180, price_eur: 1644999 });
    expect(l.photos).toHaveLength(68);
  });

  it("habitaclia innerText: the search form and similar listings do not win over the listing's own block", () => {
    const text = "Habitaciones\n+1\n+2\n+3\n+4\n+5\nBaños\n+1\n+2\n\n350.000 €\n\n51 m2\n\n2 hab.\n\n1 baño\n\n6.863 €/m2\n\nSimilares\n\n80 m2\n3 hab.\n2 baños\n";
    const l = extract({ url: live[2].url, og: { "og:title": "Ático por 350.000 € de 51 metros x en y Barcelona - habitaclia" }, text })!;
    expect(l).toMatchObject({ rooms: 2, bathrooms: 1, area_m2: 51, price_eur: 350000 });
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

// Finding F03: the import route called every one of these "ya no está disponible". Only the
// first group is evidence of that; the rest is evidence that we could not read the page.
describe("extractResult — why a page yielded no listing", () => {
  const kind = (p: Page) => extractResult(p).kind;
  const html = fixture("habitaclia");

  it("calls a withdrawn advertisement removed", () => {
    for (const f of live) expect(kind({ url: f.url, html: fixture(`${f.name}-removed`) })).toBe("removed");
    expect(kind({ url: live[2].url, html, status: 404 })).toBe("removed");
    expect(kind({ url: live[2].url, html, status: 410 })).toBe("removed");
    expect(kind({ url: live[1].url, html: fixture("fotocasa"), finalUrl: "https://www.fotocasa.es/l?propertyNotFound" })).toBe("removed");
    // a small portal answering a withdrawn ad with its own home page, status 200
    expect(kind({ url: "https://www.vivalta.es/es/ref-7742_1168", html: fixture("vivalta-removed"), status: 200 })).toBe("removed");
  });

  /**
   * Measured 2026-09-09, once a real browser could reach these pages at all. A server only ever
   * sees Idealista's challenge, so the site's soft 404 had never been observed: it answers a dead
   * id with 200 and its own home page, under the requested URL, with no blob. Taken at face value
   * that imported as a property called "Viviendas venta. Viviendas alquiler…".
   */
  it("calls Idealista's own home page under a dead id removed, not a listing", () => {
    const home = { url: "https://www.idealista.com/inmueble/999999999/", title: "Viviendas venta. Viviendas alquiler. Pisos. Chalets — idealista", text: "En idealista utilizamos cookies. ".repeat(120) };
    expect(kind(home)).toBe("removed");
    // and the live one, whose blob names it, is still a listing
    expect(kind({ ...home, url: "https://www.idealista.com/inmueble/112006681/", title: "Piso en venta en Calle del Rosselló", blob: 'var adMultimediasInfo = {"adId":112006681}' })).toBe("listing");
    // a fragment is not evidence of anything: unreadable, never "the advertisement is gone" (F03)
    expect(kind({ url: "https://www.idealista.com/inmueble/112006681/", text: "Piso\n87 m²\n3 hab." })).not.toBe("removed");
  });

  it("calls a block a block, never a removal", () => {
    expect(kind({ url: live[2].url, html, status: 403 })).toBe("blocked");
    const challenge = '<html><head><title>idealista.com</title><script src="https://ct.captcha-delivery.com/c.js"></script></head><body></body></html>';
    expect(kind({ url: live[0].url, html: challenge })).toBe("blocked");
  });

  it("calls an unfamiliar page unreadable, never a removal", () => {
    expect(kind({ url: "https://example.com/x", html: "<html><body>nada</body></html>" })).toBe("unreadable");
  });

  it("reports which fields the observation carried", () => {
    const r = extractResult({ url: live[1].url, html: fixture("fotocasa") });
    expect(r.kind).toBe("listing");
    if (r.kind !== "listing") return;
    expect(r.presence.price_eur).toBe("present");
    expect(r.presence.title).toBe("present");
    // a fixture with no energy rating must say `absent`, not carry a null as if it were observed
    expect(new Set(Object.values(r.presence))).toEqual(new Set(["present", "absent"]));
    expect(Object.keys(r.presence)).not.toContain("photos");
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

  // Idealista is bookmarklet-only (server fetches get a DataDome 403), so its description must come from innerText
  it("idealista: og + blob + innerText → verbatim description", () => {
    const html = fixture("idealista");
    const blob = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find((m) => m[1].includes("var adMultimediasInfo"))![1];
    const ad = html
      .match(/class="adCommentsLanguage[^"]*"[^>]*>\s*<p>([\s\S]*?)<\/p>/)![1]
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/ ?\n ?/g, "\n") // innerText drops the spaces around a line break
      .trim();
    const text = `1.350.000 €\n\n209 m²\n\n4 hab.\n\n2ª planta exterior con ascensor\n\nComentario del anunciante\n\nDisponible en:\nEspañol\nCatalà\nEnglish\n\nOtros idiomas\n\nCatalà\n\nEnglish\n\n${ad}\n\nLeer comentario completo\n\nCaracterísticas básicas\n\n209 m² construidos\n\n4 habitaciones\n\n3 baños\n`;
    const l = extract({ url: live[0].url, og: { "og:title": "Piso en venta en Gran Via de les Corts Catalanes, 751, El Fort Pienc, Barcelona — idealista" }, blob, text })!;
    expect(l).toMatchObject({ price_eur: 1350000, area_m2: 209, rooms: 4, bathrooms: 3 });
    expect(l.description).toMatch(/^Presentamos en exclusiva esta propiedad de lujo de 209 m² construidos/);
    expect(l.description).toMatch(/\n\n/);
    expect(l.description).not.toMatch(/Disponible en|Otros idiomas|Leer comentario/);
    // identical to the server-html extraction of the same fixture
    expect(l.description).toBe(extract({ url: live[0].url, html })!.description);
  });

  it("og:description is the last resort on every portal", () => {
    const l = extract({ url: live[0].url, og: { "og:title": "Piso en venta en X — idealista", "og:description": "piso de 80 m²" } });
    expect(l).toMatchObject({ title: "Piso en venta en X", description: "piso de 80 m²" });
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

// The three smaller portals the family also uses (measured 2026-09-07). Each one publishes its
// facts differently, which is what the `generic` branch has to cope with:
// iad España a schema.org @graph, Vivalta a Spanish summary line, Housfy nothing at all until
// the page has run its JavaScript — so its fixture is a bookmarklet capture, not html.
describe("generic portals", () => {
  it("iad España: schema.org Apartment + Offer", () => {
    const l = extract({
      url: "https://www.iadespana.es/anuncio/piso-venta-3-habitaciones-barcelona-88m2/r911605",
      html: fixture("iad"),
      status: 200,
    });
    expect(l).toMatchObject({ price_eur: 485000, area_m2: 88, rooms: 3, bathrooms: 1 });
    expect(l!.agency).toContain("iad");
  });

  it("Vivalta: the summary line and og:description", () => {
    const l = extract({ url: "https://www.vivalta.es/es/ref-7688_1168", html: fixture("vivalta"), status: 200 });
    // 587.007 € · 87 m2 · 3 Habitaciones · 2 Baños, and "Ascensor" only in og:description
    expect(l).toMatchObject({ price_eur: 587007, area_m2: 87, rooms: 3, bathrooms: 2, lift: true });
    expect(l!.title).toBe("UNA REFORMA INTEGRAL EN PLENA DIAGONAL");
  });

  it("Vivalta: a withdrawn ad answers 200 with the agency home page", () => {
    // the page never names ref 7742, so it is not that advertisement
    expect(extract({ url: "https://www.vivalta.es/es/ref-7742_1168", html: fixture("vivalta-removed"), status: 200 })).toBeNull();
  });

  it("Housfy: a client-rendered page, read from a bookmarklet capture", () => {
    const cap = JSON.parse(readFileSync(new URL("./__fixtures__/housfy-capture.json", import.meta.url), "utf8"));
    const l = extract({
      url: cap.url,
      title: cap.title,
      og: JSON.parse(cap.og),
      ld: JSON.parse(cap.ld),
      imgs: JSON.parse(cap.imgs),
      text: cap.text,
      status: 200,
    });
    // no og, no JSON-LD: the title comes from `document.title` alone
    expect(l).toMatchObject({ price_eur: 500000, area_m2: 83, rooms: 4, bathrooms: 2, lift: true, neighborhood: "Eixample" });
    expect(l!.title).toBe("Piso en venta en Calle Consell de cent, Eixample, Barcelona");
  });

  it("m² is matched when a newline follows it", () => {
    // `m(?:²|2)\\b` never matches `83 m²\\n`: there is no word boundary after `²`
    const l = extract({
      url: "https://example.com/p/123456",
      title: "Piso en venta en Calle X, Zona, Ciudad",
      text: "400.000 €\n83 m²\n3 Habs.\n1 Baño\nRef: 123456",
    });
    expect(l).toMatchObject({ area_m2: 83, rooms: 3, bathrooms: 1, price_eur: 400000 });
  });
});
