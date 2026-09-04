# Portal spike — 2026-09-04

Pro = this Mac, `curl`, UA from `SCAFFOLD.md` § 0b. Air = `ssh air`, same loop, same UA,
17:44 CEST (reachable, on AC power). One live "comprar piso" in Barcelona per portal plus one
dead id per portal. Raw pages in `spike/*.html` (gitignored); trimmed copies in
`src/lib/__fixtures__/` (agency names, phones, the client IP and the Google Maps key are
redacted; the rest is verbatim).

| portal | fetch Pro | fetch Air | JSON-LD | other blob | photo host + pattern | hotlink? | lat/lng precision | removed marker |
|---|---|---|---|---|---|---|---|---|
| idealista | **403** DataDome challenge (773 B, `captcha-delivery.com`) on search, listing and dead id. In the user's Chrome: listing 200, no CAPTCHA; page pulled with a form POST | 403, same body | none | inline `<script>` (no id) with `var config = {…}`, `var adMultimediasInfo = {…}`, `var adDetail = {…}` — JS literals, not JSON. Price `adDetail.price` (`1350000.0`). Rooms/area are **not numeric in JS**: `.info-features` DOM text (`209 m²`, `4 hab.`) or `og:description` (`piso de 209 m²`). Lat/lng only inside `config.multimediaCarrousel.map.src`, a Google static-map URL with `center=41.40096540%2C2.18232630`. Photos `adMultimediasInfo.fullScreenGalleryPics[].imageDataService` (jpg) / `.imageDataServiceWebp`; 132 entries, plans flagged by `isPlan` | `img4.idealista.com` — `https://img4.idealista.com/blur/<SIZE>/0/id.pro.es.image.master/xx/xx/xx/<id>.jpg` (or `.webp`); sizes seen `WEB_DETAIL`, `WEB_DETAIL_TOP-L-L`, `WEB_DETAIL-M-L`. Only 3 `<img>` at load (lazy gallery) | yes — 200 with no Referer from Pro and Air, also with no UA | 8 decimals; `config.multimediaCarrousel.map.addressVisibility` = `"EXACT"` here (street and number shown in `#headerMap`); any other value → approximate | HTTP **404** with `<h1>Lo sentimos, este anuncio ya no está publicado</h1>`; no `og:*`, no `adMultimediasInfo`. A server fetch never gets this far (403 first) |
| fotocasa | 200 (638 KB) | 200, identical | `BreadcrumbList` only | `<script id="__initial_props__" type="application/json">` (64 KB; also `window.__INITIAL_PROPS__`). `realEstate.id`, `realEstate.price` (int €), `realEstate.features.rooms` / `.bathrooms` / `.surface`, `realEstate.coordinates.latitude` / `.longitude`, `realEstate.multimedia[].src` where `type == "image"` (68 images + 1 tour + 1 youtube), `realEstateAdDetailEntityV2.description` | `static.fotocasa.es` — `https://static.fotocasa.es/images/ads/<uuid>?rule=<rule>`; rules seen `original`, `web_948x542_ar`, `web_482x269_ar`, `f_640x480_jpg_70`. Only 6 `<img>` in the HTML | yes — 200, no Referer, Pro and Air | 6–7 decimals but `realEstateAdDetailEntityV2.address.isExact = false`, `visibilityMode = 2`, `realEstate.coordinates.accuracy = 0` → approximate here | **302** → `/es/comprar/viviendas/<zone>/l?propertyNotFound` (200). Body is the normal search page (its i18n has `PROPERTY_NOT_FOUND_TITLE: "Anuncio no disponible"`); no `realEstate` key. Marker = final URL |
| habitaclia | 200 (423 KB) | 200, identical | none | `og:*` is the richest source: `og:type = habitaclia_action:inmueble`, `og:title = "Ático por 350.000 € de 51 metros …"`, `og:image` protocol-relative. Inline `<script>` `var FichaDesktopDTO = {…}` (JS literal) with `GMapsConfig: JSON.parse("…")` → `VGPSLat` / `VGPSLon`, and `realEstateAdId`. Price `span[itemprop=price]` (`350.000 €`), rooms/area/baths in the `<article>` "Distribución" `<li>`s, description `#js-detail-description`. `dataLayer` holds only page type (and the client IP) | `images.habimg.com` — `//images.habimg.com/imgh/<agencyId>-<adId>/<slug>_<uuid><size>.jpg`, size suffix empty / `P` / `G` / `XL`. All 30 photos are `<img>` tags in the HTML | yes — 200, no Referer, Pro and Air | 7 decimals (`41.3847330000`), `mostrarHab: 3`; no exact/approximate flag found → treat as approximate | **301** → `/viviendas-barcelona.htm?state=1` (200). Body is the search page with `<div class="imagen-no-disponible301">`; no `og:type = habitaclia_action:inmueble`. Marker = final URL |

Other findings:

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

## Outputs

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
