import { Listing } from "./listing";
import { isAllowedImageHost, normalizeUrl, type Portal } from "./url";

/**
 * Two entry shapes. The server fetch fills `html`; everything else is pulled out of it here.
 * The bookmarklet fills the rest directly: `ld` = parsed `script[type="application/ld+json"]`,
 * `og` = `{ "og:title": … }`, `imgs` = `img.currentSrc`, `text` = `body.innerText`, and `blob` =
 * the text of the portal's own script: Fotocasa `script#__initial_props__`, Idealista the inline
 * script holding `var adMultimediasInfo`, Habitaclia the inline script holding `var FichaDesktopDTO`,
 * anything else `#__NEXT_DATA__`.
 */
export type Page = {
  url: string;
  finalUrl?: string;
  status?: number;
  html?: string;
  ld?: unknown[];
  og?: Record<string, string>;
  blob?: string;
  imgs?: string[];
  text?: string;
};

// removed markers (spike/RESULTS.md): idealista 404 + body text, fotocasa 302 → ?propertyNotFound, habitaclia 301 → ?state=1
const GONE_URL = /[?&](propertyNotFound|state=1)(?:&|$)/;
const GONE_TEXT = /Lo sentimos, este anuncio ya no está publicado|imagen-no-disponible301|\?propertyNotFound/;
// DataDome challenge page. Never bypassed: recognised and returned as null.
const BLOCKED = /captcha-delivery\.com/;

const BLOB_MARK: Record<Portal, string> = {
  idealista: "var adMultimediasInfo",
  fotocasa: 'id="__initial_props__"',
  habitaclia: "var FichaDesktopDTO",
  generic: 'id="__NEXT_DATA__"',
};

// one photo, several sizes: dedupe on the image id, keep the first URL seen
const PHOTO_KEY: Partial<Record<Portal, RegExp>> = {
  idealista: /\/(\d+)\.(?:jpg|webp)$/,
  fotocasa: /\/ads\/([0-9a-f-]{36})/i,
  habitaclia: /_([0-9a-f-]{36})[A-Z]*\.jpe?g$/i,
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const hex = e[1] === "x" || e[1] === "X";
    const n = parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });

/** Tags out, line breaks kept (`<br>` and block ends), entities decoded — roughly `innerText`. */
const toText = (html: string) =>
  decode(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/(?:p|li|div|h\d|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\r]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const int = (s?: string | null) => {
  const n = s == null ? NaN : parseInt(String(s).replace(/\./g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
const num = (s?: string | null) => {
  const n = s == null ? NaN : parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
const m1 = (s: string, re: RegExp) => s.match(re)?.[1] ?? null;
/** A single-quoted JS string literal `key: '…'` from a JS object blob, unescaped. */
const jsStr = (blob: string, key: string) => {
  const raw = m1(blob, new RegExp(`\\b${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  if (raw == null) return null;
  try {
    return JSON.parse(`"${raw.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) as string;
  } catch {
    return raw; // ponytail: an escape JSON does not know → keep the raw text
  }
};
/** `key: JSON.parse("…")` inside a JS object blob → the parsed value. */
const jsJson = (blob: string, key: string): unknown => {
  const lit = m1(blob, new RegExp(`\\b${key}\\s*:\\s*JSON\\.parse\\("((?:[^"\\\\]|\\\\.)*)"\\)`));
  if (lit == null) return null;
  try {
    return JSON.parse(JSON.parse(`"${lit}"`) as string);
  } catch {
    return null;
  }
};
const title = (s?: string | null) => s?.replace(/\s*(?:—|-|\|)\s*(?:idealista|fotocasa|habitaclia)(?:\.\w+)?\s*$/i, "").trim() || null;

const ogOf = (html: string) =>
  Object.fromEntries(
    [...html.matchAll(/<meta\s[^>]*?property="(og:[^"]+)"[^>]*?content="([^"]*)"/g)].reverse().map((m) => [m[1], decode(m[2])]),
  );
const ldOf = (html: string) =>
  [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((m) => {
    try {
      return [JSON.parse(m[1]) as unknown];
    } catch {
      return [];
    }
  });
const blobOf = (portal: Portal, html: string) =>
  [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find((m) => m[0].includes(BLOB_MARK[portal]))?.[1];
const imgsOf = (html: string) => [...html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)].map((m) => decode(m[1]));

function photos(portal: Portal, urls: (string | undefined | null)[], scope: (u: string) => boolean = () => true) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let u of urls) {
    if (!u) continue;
    if (u.startsWith("//")) u = "https:" + u;
    if (!/^https?:\/\//.test(u) || !scope(u)) continue;
    const key = PHOTO_KEY[portal]?.exec(u)?.[1] ?? u;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

type LdThing = { "@type"?: string; name?: string; description?: string; image?: string | string[] | { url?: string } };
type FotocasaProps = {
  seoTitle?: string;
  propertyTitle?: string;
  realEstate?: {
    price?: number;
    location?: string;
    energyCertificate?: string;
    clientAlias?: string;
    clientName?: string;
    extras?: string[];
    features?: { rooms?: number; bathrooms?: number; surface?: number };
    featuresList?: { label?: string; value?: unknown }[];
    coordinates?: { latitude?: number; longitude?: number };
    multimedia?: { type?: string; src?: string }[];
    address?: { neighborhood?: string };
    descriptions?: Record<string, string>;
  };
  realEstateAdDetailEntityV2?: {
    description?: string;
    price?: { amount?: number };
    address?: { isExact?: boolean; neighborhood?: string; street?: { name?: string; number?: number } };
    multimedias?: { type?: string; url?: string }[];
  };
};

export function extract(page: Page): Listing | null {
  const { portal } = normalizeUrl(page.url);
  const html = page.html ?? "";
  if (page.status === 404 || page.status === 410 || page.status === 403) return null;
  if (GONE_URL.test(page.finalUrl ?? "")) return null;
  if (GONE_TEXT.test(html) || GONE_TEXT.test(page.text ?? "")) return null;
  if (BLOCKED.test(html)) return null;

  const og = page.og ?? ogOf(html);
  const ld = (page.ld ?? ldOf(html)) as LdThing[];
  const blob = page.blob ?? blobOf(portal, html) ?? "";
  const text = page.text ?? toText(html);
  const imgs = page.imgs ?? imgsOf(html);

  // 1. JSON-LD, 2. og:* — generic sources, the portal blob overrides below
  const thing = ld.find((x) => x && typeof x === "object" && x["@type"] !== "BreadcrumbList");
  const ldImg = thing?.image;
  const out: Partial<Listing> = {
    title: title(thing?.name) ?? title(og["og:title"]) ?? title(m1(html, /<title[^>]*>([^<]*)<\/title>/)) ?? undefined,
    description: thing?.description ?? null,
  };
  const pagePics: (string | undefined | null)[] = [
    og["og:image"],
    ...(Array.isArray(ldImg) ? ldImg : [typeof ldImg === "string" ? ldImg : ldImg?.url]),
    ...imgs,
  ];
  // the blob lists only the listing's own photos; the page's <img>s also carry logos and similar listings
  let blobPics: (string | undefined)[] = [];

  // 3. the portal blob
  switch (portal) {
    case "idealista": {
      // JS object literals, not JSON → one regex per field
      const feat = (name: string) =>
        blob.match(new RegExp(`"text":"([^"]*)"[^}]*?"subText":"([^"]*)"[^}]*?"featureName":"${name}"`));
      // text fallback scoped to the listing's own blocks: `.info-features` and "Características básicas"
      const own = html
        ? toText(
            (m1(html, /<div class="info-features">([\s\S]*?)<\/div>/) ?? "") +
              "\n" +
              (m1(html, /Características básicas<\/h\d>\s*<div class="details-property_features">([\s\S]*?)<\/div>/) ?? ""),
          )
        : (text.match(/\d[\d.]*\s*m²\s+\d+\s*hab\./)?.[0] ?? "") + "\n" + (text.match(/Características básicas\n(?:[^\n]*\n){0,16}/)?.[0] ?? "");
      const floor = feat("FLOOR_NUMBER");
      const visibility = m1(blob, /"addressVisibility":"(\w+)"/);
      const center = blob.match(/center=(-?[\d.]+)%2C(-?[\d.]+)/);
      Object.assign(out, {
        price_eur: int(m1(blob, /^\s*price:\s*(\d+)/m)) ?? int(m1(text, /(\d[\d.]*)\s*€/)),
        area_m2: int(feat("CONSTRUCTED_AREA")?.[1]) ?? int(m1(own, /(\d[\d.]*)\s*m(?:²|2\b)/)),
        rooms: int(feat("ROOM_NUMBER")?.[1]) ?? int(m1(own, /(\d+)\s*hab(?:\.|itaci)/)),
        bathrooms: int(feat("BATH_NUMBER")?.[1]) ?? int(m1(own, /(\d+)\s*baños?\b/i)),
        floor: floor?.[1] ?? null,
        outdoor: m1(floor?.[2] ?? "", /\b(exterior|interior)\b/),
        lift: floor ? (/con ascensor/.test(floor[2]) ? true : /sin ascensor/.test(floor[2]) ? false : null) : null,
        description: m1(html, /class="adCommentsLanguage[^"]*"[^>]*>\s*<p>([\s\S]*?)<\/p>/)?.trim() ?? null,
        address_text: m1(og["og:title"] ?? "", / en (?:venta|alquiler) en (.+?)(?: — idealista)?$/) ?? null,
        neighborhood: m1(text, /^Barrio (.+)$/m),
        lat: num(center?.[1]),
        lng: num(center?.[2]),
        address_precision: visibility === "EXACT" ? "exact" : visibility ? "approx" : "none",
      });
      if (out.description) out.description = toText(out.description);
      // fullScreenGalleryPics / verticalGalleryPics / picturesWithoutPlans list the same photos (44 × 3 = 132 here)
      blobPics = [...blob.matchAll(/\{[^{}]*?"isPlan":(true|false)[^{}]*?imageDataService:"([^"]+)"/g)]
        .filter((m) => m[1] === "false")
        .map((m) => m[2]);
      break;
    }
    case "fotocasa": {
      let j: FotocasaProps = {};
      try {
        j = JSON.parse(blob) as FotocasaProps;
      } catch {
        /* no blob → og only */
      }
      const re = j.realEstate ?? {};
      const v2 = j.realEstateAdDetailEntityV2 ?? {};
      const fl = Object.fromEntries((re.featuresList ?? []).map((f) => [f.label, f.value]));
      const street = v2.address?.street;
      const outdoor = (re.extras ?? []).filter((x) => /terraza|balc[oó]n|jard[ií]n|patio/i.test(x));
      Object.assign(out, {
        title: out.title ?? title(j.seoTitle ?? j.propertyTitle) ?? undefined,
        price_eur: re.price ?? v2.price?.amount ?? null,
        area_m2: re.features?.surface ?? null,
        rooms: re.features?.rooms ?? null,
        bathrooms: re.features?.bathrooms ?? null,
        floor: typeof fl.floor === "string" ? fl.floor : null,
        condition: typeof fl.conservationState === "string" ? fl.conservationState : null,
        lift: fl.elevator == null ? null : fl.elevator === "YES",
        parking: fl.parking ? true : null,
        energy_rating: re.energyCertificate || null,
        outdoor: outdoor.length ? outdoor.join(", ") : null,
        description: v2.description ?? re.descriptions?.["es-ES"] ?? out.description,
        address_text: street?.name ? `${street.name}${street.number ? `, ${street.number}` : ""}` : re.location || null,
        neighborhood: re.address?.neighborhood ?? v2.address?.neighborhood ?? null,
        agency: re.clientAlias || re.clientName || null,
        lat: re.coordinates?.latitude ?? null,
        lng: re.coordinates?.longitude ?? null,
        address_precision: v2.address?.isExact == null ? "none" : v2.address.isExact ? "exact" : "approx",
      });
      blobPics = [
        ...(re.multimedia ?? []).filter((m) => m.type === "image").map((m) => m.src),
        ...(v2.multimedias ?? []).filter((m) => m.type === "image").map((m) => m.url),
      ];
      break;
    }
    case "habitaclia": {
      // FichaDesktopDTO / WideMediaDTO are JS literals; GMapsConfig and image are JSON strings passed to JSON.parse
      const gps = (jsJson(blob, "GMapsConfig") ?? {}) as { VGPSLat?: number; VGPSLon?: number };
      const imgList = (jsJson(blob, "image") ?? []) as { URLXL?: string; URLG?: string; src?: string }[];
      const desc = jsStr(blob, "observaciones") ?? m1(html, /id="js-detail-description"[^>]*>([\s\S]*?)<\/p>/);
      // text fallback scoped to the listing's own block: `ul.feature-container` + "Distribución",
      // or the first "N m2 / N hab. / N baño" run in innerText (the search form and similar listings never match it first)
      const own = html
        ? toText(
            (m1(html, /<ul class="feature-container">([\s\S]*?)<\/ul>/) ?? "") +
              "\n" +
              (m1(html, /Distribuci(?:ón|&#xF3;n)<\/h\d>\s*<ul>([\s\S]*?)<\/ul>/) ?? ""),
          )
        : (text.match(/\d[\d.]*\s*m2?\s+\d+\s*hab\.?(?:\s+\d+\s*baños?)?/i)?.[0] ?? "");
      Object.assign(out, {
        title: title(jsStr(blob, "destacado")) ?? out.title,
        price_eur: int(jsStr(blob, "precioProducto")) ?? int(m1(og["og:title"] ?? "", /por ([\d.]+) €/)),
        area_m2: int(m1(og["og:title"] ?? "", /de ([\d.]+) metros/)) ?? int(m1(own, /(\d[\d.]*)\s*m(?:²|2\b)/)),
        rooms: int(m1(own, /(\d+)\s*hab(?:\.|itaci)/)),
        bathrooms: int(m1(own, /(\d+)\s*baños?\b/i)),
        description: desc ? toText(desc) : out.description,
        neighborhood: m1(html, /id="js-ver-mapa-zona"[^>]*>\s*([^<]+?)\s*</) ?? null,
        lat: gps.VGPSLat ?? null,
        lng: gps.VGPSLon ?? null,
        address_precision: gps.VGPSLat != null ? "approx" : "none", // no exact/approx flag on the page
      });
      if (out.neighborhood) out.neighborhood = decode(out.neighborhood);
      blobPics = imgList.map((i) => i.URLXL ?? i.URLG ?? i.src);
      break;
    }
    case "generic":
      out.description ??= og["og:description"] ?? null;
      break;
  }

  if (!out.title) return null;
  // no blob list → the page's images, portal hosts only; Habitaclia additionally scoped to og:image's ad folder
  const folder = m1(og["og:image"] ?? "", /\/imgh\/([^/]+)\//);
  const scope = portal === "generic" ? undefined : (u: string) => isAllowedImageHost(u) && (!folder || u.includes(`/imgh/${folder}/`));
  return Listing.parse({ ...out, photos: blobPics.length ? photos(portal, blobPics) : photos(portal, pagePics, scope) });
}
