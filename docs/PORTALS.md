# Portals — what each one serves

Everything the extractor knows about the listing sites, measured, not assumed. Read this before
changing `src/lib/extract.ts` or `src/lib/url.ts`. Two rounds: the three original portals
(2026-09-04, § 1) and the three the family's own links added (2026-09-07, § 2).

**The rule that never changes: never work around an anti-bot block.** A page a portal refuses to
a server is collected in a real browser with the bookmarklet, or it is not collected.

## 1. Spike — 2026-09-04

Pro = the work Mac, `curl`, UA from `SCAFFOLD.md` § 0b. Air = `ssh air`, same loop, same UA,
17:44 CEST (reachable, on AC power). One live "comprar piso" in Barcelona per portal plus one
dead id per portal. Raw pages were saved under `_local/spike/` (never committed); trimmed copies
are in `src/lib/__fixtures__/` (agency names, phones, the client IP and the Google Maps key are
redacted; the rest is verbatim).

| portal | fetch Pro | fetch Air | JSON-LD | other blob | photo host + pattern | hotlink? | lat/lng precision | removed marker |
|---|---|---|---|---|---|---|---|---|
| idealista | **403** DataDome challenge (773 B, `captcha-delivery.com`) on search, listing and dead id. In the user's Chrome: listing 200, no CAPTCHA; page pulled with a form POST | 403, same body | none | inline `<script>` (no id) with `var config = {…}`, `var adMultimediasInfo = {…}`, `var adDetail = {…}` — JS literals, not JSON. Price `adDetail.price` (`1350000.0`). Rooms/area are **not numeric in JS**: `.info-features` DOM text (`209 m²`, `4 hab.`) or `og:description` (`piso de 209 m²`). Lat/lng only inside `config.multimediaCarrousel.map.src`, a Google static-map URL with `center=41.40096540%2C2.18232630`. Photos `adMultimediasInfo.fullScreenGalleryPics[].imageDataService` (jpg) / `.imageDataServiceWebp`; 132 entries, plans flagged by `isPlan` | `img4.idealista.com` — `https://img4.idealista.com/blur/<SIZE>/0/id.pro.es.image.master/xx/xx/xx/<id>.jpg` (or `.webp`); sizes seen `WEB_DETAIL`, `WEB_DETAIL_TOP-L-L`, `WEB_DETAIL-M-L`. Only 3 `<img>` at load (lazy gallery) | yes — 200 with no Referer from Pro and Air, also with no UA | 8 decimals; `config.multimediaCarrousel.map.addressVisibility` = `"EXACT"` here (street and number shown in `#headerMap`); any other value → approximate | HTTP **404** with `<h1>Lo sentimos, este anuncio ya no está publicado</h1>`; no `og:*`, no `adMultimediasInfo`. A server fetch never gets this far (403 first) |
| fotocasa | 200 (638 KB) | 200, identical | `BreadcrumbList` only | `<script id="__initial_props__" type="application/json">` (64 KB; also `window.__INITIAL_PROPS__`). `realEstate.id`, `realEstate.price` (int €), `realEstate.features.rooms` / `.bathrooms` / `.surface`, `realEstate.coordinates.latitude` / `.longitude`, `realEstate.multimedia[].src` where `type == "image"` (68 images + 1 tour + 1 youtube), `realEstateAdDetailEntityV2.description` | `static.fotocasa.es` — `https://static.fotocasa.es/images/ads/<uuid>?rule=<rule>`; rules seen `original`, `web_948x542_ar`, `web_482x269_ar`, `f_640x480_jpg_70`. Only 6 `<img>` in the HTML | yes — 200, no Referer, Pro and Air | 6–7 decimals but `realEstateAdDetailEntityV2.address.isExact = false`, `visibilityMode = 2`, `realEstate.coordinates.accuracy = 0` → approximate here | **302** → `/es/comprar/viviendas/<zone>/l?propertyNotFound` (200). Body is the normal search page (its i18n has `PROPERTY_NOT_FOUND_TITLE: "Anuncio no disponible"`); no `realEstate` key. Marker = final URL |
| habitaclia | 200 (423 KB) | 200, identical | none | `og:*` is the richest source: `og:type = habitaclia_action:inmueble`, `og:title = "Ático por 350.000 € de 51 metros …"`, `og:image` protocol-relative. Inline `<script>` `var FichaDesktopDTO = {…}` (JS literal) with `GMapsConfig: JSON.parse("…")` → `VGPSLat` / `VGPSLon`, and `realEstateAdId`. Price `span[itemprop=price]` (`350.000 €`), rooms/area/baths in the `<article>` "Distribución" `<li>`s, description `#js-detail-description`. `dataLayer` holds only page type (and the client IP) | `images.habimg.com` — `//images.habimg.com/imgh/<agencyId>-<adId>/<slug>_<uuid><size>.jpg`, size suffix empty / `P` / `G` / `XL`. All 30 photos are `<img>` tags in the HTML | yes — 200, no Referer, Pro and Air | 7 decimals (`41.3847330000`), `mostrarHab: 3`; no exact/approximate flag found → treat as approximate | **301** → `/viviendas-barcelona.htm?state=1` (200). Body is the search page with `<div class="imagen-no-disponible301">`; no `og:type = habitaclia_action:inmueble`. Marker = final URL |

### Other findings

- Idealista blocks the SCAFFOLD UA from both machines. Idealista sources are bookmarklet-only;
  the recheck loop must map 403 → `unknown`, never "gone".
- A form POST from an idealista.com page to a foreign origin was not blocked by CSP. It arrived
  with `Origin: null`, so `Origin` cannot serve as the CSRF check; `capture_token` is the guard.
  A page-script `fetch()` to 127.0.0.1 hung on Chrome's local-network check — irrelevant for
  the public URL, but keep the bookmarklet a form POST.
- No photo host has hotlink protection.
- `<img>` tags are enough only for Habitaclia (30/30). Fotocasa has 6 of 68 and Idealista 3 of
  132 in the DOM; the extractor must read the blobs for photos.
- Fotocasa serves a live page for an unknown slug as long as the id is right; Habitaclia too
  (`comprar-piso-x-barcelona-i<id>.htm` → 200). The ref is the id, never the slug.
- Fetching from the Air needs no extra setup: `/usr/bin/curl` 8.7.1, same results as the Pro.
- No `package.json` on `main` yet, so `pnpm test` / `pnpm build` have nothing to run.

### Outputs

```ts
// src/lib/url.ts — copy verbatim (issue #10)
const ALLOWED_HOSTS = new Set(['idealista.com', 'fotocasa.es', 'habitaclia.com']); // after dropping `www.`
const ALLOWED_IMAGE_HOSTS = new Set(['img4.idealista.com', 'static.fotocasa.es', 'images.habimg.com']);

// listing ref, matched on the pathname
const REF: Record<string, RegExp> = {
  idealista: /\/inmueble\/(\d+)\/?$/,     // https://www.idealista.com/inmueble/112446118/
  fotocasa: /\/(\d+)\/d\/?$/,             // https://www.fotocasa.es/es/comprar/vivienda/<zone>/<slug>/190311653/d
  habitaclia: /-i(\d+)\.htm$/,            // https://www.habitaclia.com/comprar-<slug>-barcelona-i8166003810008.htm
};

// removed markers
// idealista: HTTP 404, or body contains 'Lo sentimos, este anuncio ya no está publicado'
// fotocasa: finalUrl contains 'propertyNotFound'
// habitaclia: finalUrl contains 'state=1' (body also contains 'imagen-no-disponible301')

// blob per portal
// idealista: the inline <script> containing 'var adMultimediasInfo' (JS, not JSON):
//   adDetail.price · config.multimediaCarrousel.map.src ('center=<lat>%2C<lng>') ·
//   config.multimediaCarrousel.map.addressVisibility ('EXACT' | other) ·
//   adMultimediasInfo.fullScreenGalleryPics[].imageDataService (skip isPlan)
// fotocasa: JSON.parse(script#__initial_props__) →
//   realEstate.id · realEstate.price · realEstate.features.{rooms,bathrooms,surface} ·
//   realEstate.coordinates.{latitude,longitude} · realEstate.multimedia[type=image].src ·
//   realEstateAdDetailEntityV2.description · realEstateAdDetailEntityV2.address.isExact
// habitaclia: the inline <script> containing 'var FichaDesktopDTO' → GMapsConfig JSON string →
//   VGPSLat, VGPSLon · price span[itemprop=price] · rooms/area from the "Distribución" <li>s ·
//   description #js-detail-description · og:title carries price and m² too
```

## 2. Second round — 2026-09-07

The family's own 25 links reached beyond the three portals above. Measured by ingesting all of
them through `extract()` (`scripts/ingest.mts`), not by reading documentation.

| Portal | Server fetch (`/api/import`) | Where the facts are | Withdrawn ad answers |
|---|---|---|---|
| Idealista | **403, DataDome** | the `adMultimediasInfo` blob — browser only | 404 + "ya no está publicado" (never reached from a server) |
| Fotocasa | 200 | `script#__initial_props__` | 302 → `…?propertyNotFound` |
| Habitaclia | 200 | `var FichaDesktopDTO` + `og:*` | 301 → `…?state=1` |
| Housfy | 200, but an **empty SPA shell** | the rendered text — browser only | **410** |
| Vivalta | 200 | `og:description` + the summary line | **200 with the agency home page** — a soft 404 |
| iad España | 200 | a schema.org `@graph`: `Apartment` + `Offer` + `RealEstateAgent` | — |

Consequences, all of them live in `src/lib/extract.ts`:

- Housfy and Idealista are bookmarklet-only. The recheck loop maps 403 to `unknown`, never
  "gone".
- Vivalta's soft 404 is caught by checking that the listing ref from the URL still appears in the
  page. Without that check a withdrawn ad imports as the agency's home page.
- The generic branch reads the schema.org `@graph`, then falls back to a window of text around
  the price. Portals write "83 m²" at the end of a line, so the area pattern must not depend on a
  word boundary after `²`.
- Idealista orders the keys of a photo record differently between ads. Match the record, then
  pull `imageDataService` out of it; do not assume a fixed key order.

Photo hosts added to `ALLOWED_IMAGE_HOSTS` (a **download** allowlist, not a display filter):
`media.mobiliagestion.es` (Vivalta), `images.iadespana.es` (iad), `static0.housfy.com` (Housfy).
`cms.housfy.com` is site furniture and stays out. `ALLOWED_HOSTS` — the SSRF guard on the paste
path — is unchanged: the three original portals only.

## 3. A portal in another country

Nothing in `extract.ts` is Spanish. It reads JSON-LD, then OpenGraph, then a window of text
around the price, and most portals in most countries publish at least the first of those. What is
country-specific is the three lines that name a site, and they are all in `src/lib/url.ts`:

1. **`routeFor`** — `SERVER` if a plain server fetch returns the page, `CAPTURE` if the site
   answers a challenge or serves an empty shell. Measure it with `curl` first, the way § 1 did.
   Guessing wrong costs the person ten seconds per link.
2. **`ALLOWED_HOSTS`** — only if the fetch really works. It is the SSRF guard on `/api/import`,
   not a list of sites we like. A capture-only portal stays off it and imports as `generic`.
3. **`ALLOWED_IMAGE_HOSTS`** — the photo host, and only the photo host. Site furniture and
   tracking pixels stay out.

Then a reference pattern in `REF` if the URL carries a listing id, and one trimmed fixture in
`src/lib/__fixtures__/` so the extractor has something to be tested against.

That is the whole job per portal. It is deliberately not a plugin system: six portals do not earn
one, and the fourth column of the table in § 1 is the part that actually takes the time.
