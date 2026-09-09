# Code map

_Paths in this file are relative to `src/`._

Next.js 16 App Router, everything server-rendered unless a file says `"use client"`. There are
seven client components in the whole application: the map, the theme toggle, the navigation
links, the search bar, the filter bar, the gallery and a home's own map. Nothing else ships
JavaScript.

## The two paths through the code

**A listing comes in.** Every entry point ends in the same two functions, so a capture, a paste
and the browser reader can never disagree. A link is accepted first and read afterwards: the only
refusal left is a host outside the allowlist.

```
paste a URL   → app/api/import/route.ts   → isAllowedHost → fetch → ┐
bookmarklet   → app/api/capture/route.ts  → capture_token check   → ┤
browser reader ─ scripts/capture-agent.mjs ─ real Chrome ─ /api/capture ┘
                                                                    ↓
                                            extract()  →  save()  →  savePhotos()
                                          (layer 1)         │       (allowlisted hosts only)
                                                            ↓
                                    nothing read? the record exists anyway: a placeholder
                                    title, the reason it is empty, and the page kept for
                                            lib/enrich.ts — layers 2 and 3
```

**A record is filled.** Three layers, in order, each one only over what the last left empty:

| Layer | Where it looks | May fill |
|---|---|---|
| 1 · `extract.ts` | the portal's own blob, JSON-LD, OpenGraph, the page text | anything |
| 2 · `enrich.ts` read | the stored page, copying words that are literally in it | anything but coordinates |
| 3 · `enrich.ts` deduce | the description and up to four photographs | eight fields that are visible or plainly stated — never a price, an address or a description |

Which layer produced each field is stored in `sources.field_origin_json`, and the detail page
marks a deduced value «deducido». A field no layer can fill stays empty; that is a result.

**A page is rendered.** `proxy.ts` verifies the Cloudflare Access JWT on every request and sets
`x-user-email`; `currentUser()` reads that header and creates the `users` row on first sight. The
page then queries SQLite directly — there is no data-access layer and no ORM.

## Directories

| Path | What is in it |
|---|---|
| `app/` | routes: five pages, five API routes, one server-action file |
| `components/` | presentation only. No SQL, no `fetch` to a portal |
| `lib/` | everything that is not a route or a component. Pure functions where possible |
| `lib/__fixtures__/` | saved portal pages the extractor tests run against. See its `README.md` |

## `lib/` — one file, one job

| File | Job | Pure? |
|---|---|---|
| `db.ts` | the libSQL client, `applySchema()` which runs `schema.sql`, and the ordered migration chain after it | no |
| `schema.sql` | the eight tables, all `CREATE TABLE IF NOT EXISTS`. Version 1; everything after it is a migration in `db.ts` | — |
| `listing.ts` | the zod schema of an extracted listing, plus the stage, dimension and event vocabularies | yes |
| `auth.ts` | verifies the Access JWT (`jose`); `currentUser()` maps the email to a `users` row | half |
| `url.ts` | `ALLOWED_HOSTS` (the SSRF guard and the intake gate, six sites), `PORTAL_HOSTS` (the three with an extractor branch), `ALLOWED_IMAGE_HOSTS` (the download allowlist), the listing reference per portal | yes |
| `extract.ts` | one extractor for every portal: JSON-LD → OpenGraph → the portal's own blob. `extractResult()` says **why** a page gave nothing — `removed`, `blocked` or `unreadable` — and which fields it carried | yes |
| `fetching.ts` | every request the server makes outward: https only, no credentials, default port, allowlist on **each redirect hop**, and a streamed byte cap | half |
| `intake.ts` | what the intake routes share: the deadlines, the Spanish sentence per outcome, the placeholder record a link becomes before it is read, and where a form post is sent instead of a JSON body | yes |
| `ai.ts` | the whole model client: one POST to the Messages API, structured output through one tool whose schema comes from `Listing` itself. No key → every call answers null. `AI_BASE_URL` points it at `scripts/ai-bridge.mjs` on the server, which needs no key at all | half |
| `enrich.ts` | layers 2 and 3, and the pass that walks the queue. `sources.enriched_at` **is** the queue: a new observation sets it back to NULL | half |
| `bookmarklet.ts` | the collector both readers run, and the bookmarklet that wraps it in a form post | yes |
| `photos.ts` | downloads, deduplicates by sha256, resizes to one 800 px JPEG, stores under `DATA_DIR`. 40 per property, not per call | no |
| `save.ts` | the one way an observation reaches the database. A new source becomes a property; a known source is **refreshed** — freshness only when nothing moved, facts and one event per change when something did | no |
| `changes.ts` | canonical form and hash of the facts, what changed between two extractions, and the `properties` column allowlist | yes |
| `availability.ts` | whether the advertisement is still up — the gone streak, the property's status from all its sources, staleness, and the Spanish for each. Deliberately not a stage | yes |
| `recheck.ts` | the 48-hour loop: refetch, compare, write events, move the source's availability. Never writes a stage | no |
| `ratings.ts` | averages and the upsert statement. Deliberately has no `db` import, so the test needs no data directory | yes |
| `selection.ts` | which homes a person picked to compare. Pure: the storage and the React binding are in `components/comparar/` | yes |
| `filters.ts` | **the one contract for which homes qualify.** Parses the URL, builds the statement, runs the text and area pass, and writes every link back out. The list and the map share it | yes |
| `search.ts` | free-text matching, the condition presets and the storey bands, accent-insensitive, in JavaScript over the loaded rows. `floor` is free text — «7ª planta», «Bajo», «Ático» — so a band is decided here, never in SQL | yes |
| `buckets.ts` | the bars over a range slider: how many homes fall in each slice, and a round step. Pure, so the page computes them from rows it already has | yes |
| `geo.ts` | point in polygon for the map's area overlays, and `isIn` for one property. Twenty lines, no dependency. Also the shape of a zone: `rank` 1–6 and `parent` | yes |
| `areas.ts` | loads `public/areas.geojson` once; `findArea`, and `areaChain` for the zone read widest first | no |
| `settings.ts` | the key/value table; today it holds only the budget. Either bound alone is valid, and both empty clears it | no |

## `app/` — routes

| Route | File | Note |
|---|---|---|
| `/` | `app/page.tsx` | redirects to `/propiedades` |
| `/propiedades` | `app/propiedades/page.tsx` | the list. Filters live in the URL, so a link is a saved search. `lib/filters.ts` decides what they mean |
| `/propiedades/[id]` | `app/propiedades/[id]/page.tsx` | photos, facts, description, ratings, comments, timeline, and a full-width map of this home alone |
| `/mapa` | `app/mapa/page.tsx` | the shell; the map itself is `components/mapa/Mapa.tsx`. Reads the same filters as the list |
| `/ayuda` and route states | `app/{error,not-found,loading}.tsx` | every flow's own error, missing-page and loading screens |
| `/comparar` | `app/comparar/page.tsx` | 2 to 4 columns, differing rows highlighted. The `ids` in the URL win; the tray is how they get there |
| `/actividad` | `app/actividad/page.tsx` | the `events` table, newest first |
| `/ayuda` | `app/ayuda/page.tsx` | the bookmarklet to drag, and how to use it |
| `POST /api/capture` | `app/api/capture/route.ts` | the bookmarklet and browser-reader target. Outside the proxy: the request arrives with `Origin: null` and no cookie, so `capture_token` is both the guard and the identity |
| `POST /api/import` | `app/api/import/route.ts` | a pasted URL. Refuses only a host outside `ALLOWED_HOSTS`; a page it cannot read is saved anyway |
| `GET /api/capture/pending` | `app/api/capture/pending/route.ts` | the links still unread, and the collector to run in them. Read by the browser reader on the host |
| `GET /api/photos/[id]` | `app/api/photos/[id]/route.ts` | streams a stored photo; authenticated like every other route |
| `GET /api/health` | `app/api/health/route.ts` | the container health check. The only route the proxy lets through unauthenticated |

Mutations are server actions in `app/propiedades/actions.ts`: rate, comment, change stage, set the
budget. They call `revalidatePath`, so there is no client-side cache to invalidate.

## Boot

`instrumentation.ts` runs once in the Node runtime: it applies `schema.sql`, then starts two
loops, each with a single flag instead of a queue — the hourly recheck, and the two-minute fill
pass. An import fires its own fill pass immediately, so the timer is the safety net. It does
nothing during the production build.

`scripts/capture-agent.mjs` is the one moving part outside the container, because a container
cannot drive a browser. `air/README.md` is its runbook.

## Themes

`app/globals.css` holds both palettes as CSS variables behind Tailwind's `@theme inline`, so every
colour utility resolves at runtime. `data-theme` on `<html>` selects one. The inline script in
`app/layout.tsx` sets it before the first paint, `components/theme-toggle.tsx` writes it and mirrors
it to `localStorage.tema`, and `components/use-theme.ts` reads it back through
`useSyncExternalStore` for the map, which needs the value in JavaScript. Roles and hex values:
`DESIGN.md`. Never write a raw colour in a component.

## Tests

`*.test.ts` next to the file it tests; run them with `pnpm test`.

| File | What would break without it |
|---|---|
| `url.test.ts` | the SSRF allowlist, and the reference regular expressions that identify a duplicate |
| `fetching.test.ts` | a redirect off the allowlist being followed, or an oversized body being read whole |
| `extract.test.ts` | every portal, live and withdrawn, against saved pages — and a blocked page being called "removed" |
| `save.test.ts` | a second look at an advertisement erasing a fact it did not observe, a phantom event, or a link being lost because its page would not load |
| `enrich.test.ts` | layer 3 inventing a price or an address, a value outside its range being stored, or a model answer overwriting what the portal said |
| `bookmarklet.test.ts` | the bookmarklet and the browser reader drifting apart, or the collector carrying a token |
| `availability.test.ts` | a blocked page counting as evidence that a listing is gone |
| `migrate.test.ts` | a migration that loses the family's stage, or that cannot run twice |
| `changes.test.ts` | a price change that produces no event, or a phantom event |
| `ratings.test.ts` | an average that counts a missing dimension |
| `auth.test.ts` | a token with the wrong audience, issuer or expiry being accepted |
| `geo.test.ts`, `search.test.ts` | the area filter and accent-insensitive search |

## Adding something

- **A new portal.** Measure it first and record it in `docs/PORTALS.md`. Then add its photo host
  to `ALLOWED_IMAGE_HOSTS`, add a fixture, and extend the generic branch of `extract.ts`. Add the
  host to `ALLOWED_HOSTS` — it is the intake gate and the SSRF guard, and a site nobody may paste
  does not belong on it. Set `routeFor` from what a `curl` actually returns: it no longer refuses
  anything, but it is what tells the browser reader which links to open.
- **A new field on a listing.** `listing.ts`, then the column in `schema.sql`, then `save.ts`,
  then the detail page. `changes.ts` picks it up on its own.
- **A new page.** A server component by default. Reach for `"use client"` only when the browser
  has to hold state.
