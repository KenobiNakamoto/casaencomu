# Code map

_Paths in this file are relative to `src/`._

Next.js 16 App Router, everything server-rendered unless a file says `"use client"`. There are
five client components in the whole application: the map, the theme toggle, the navigation
links, the search bar and the filter bar. Nothing else ships JavaScript.

## The two paths through the code

**A listing comes in.** Both entry points end in the same two functions, so a capture and a paste
can never disagree:

```
paste a URL   → app/api/import/route.ts   → isAllowedHost → fetch → ┐
bookmarklet   → app/api/capture/route.ts  → capture_token check   → ┴→ extract() → save()
                                                                          │
                                                          savePhotos() ───┘  (allowlisted hosts only)
```

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
| `db.ts` | the libSQL client, and `applySchema()` which runs `schema.sql` | no |
| `schema.sql` | the eight tables, all `CREATE TABLE IF NOT EXISTS` | — |
| `listing.ts` | the zod schema of an extracted listing, plus the stage, dimension and event vocabularies | yes |
| `auth.ts` | verifies the Access JWT (`jose`); `currentUser()` maps the email to a `users` row | half |
| `url.ts` | `ALLOWED_HOSTS` (the SSRF guard), `ALLOWED_IMAGE_HOSTS` (the download allowlist), portal detection, the listing reference per portal | yes |
| `extract.ts` | one extractor for every portal: JSON-LD → OpenGraph → the portal's own blob | yes |
| `bookmarklet.ts` | the bookmarklet source and the exact field list it posts | yes |
| `photos.ts` | downloads, deduplicates by sha256, resizes to one 800 px JPEG, stores under `DATA_DIR` | no |
| `save.ts` | writes a property, its source and its photos; detects an exact duplicate by reference | no |
| `changes.ts` | canonical form and hash of the facts, and what changed between two extractions | yes |
| `recheck.ts` | the 48-hour loop: refetch, compare, write events, mark a listing unavailable | no |
| `ratings.ts` | averages and the upsert statement. Deliberately has no `db` import, so the test needs no data directory | yes |
| `search.ts` | free-text matching and the filter presets, accent-insensitive, in JavaScript over the loaded rows | yes |
| `geo.ts` | point in polygon for the map's area overlays. Twenty lines, no dependency | yes |
| `areas.ts` | loads `public/areas.geojson` once and counts properties per area | no |
| `settings.ts` | the key/value table; today it holds only the budget, which is empty until a member sets it | no |

## `app/` — routes

| Route | File | Note |
|---|---|---|
| `/` | `app/page.tsx` | redirects to `/propiedades` |
| `/propiedades` | `app/propiedades/page.tsx` | the list. Filters live in the URL, so a link is a saved search |
| `/propiedades/[id]` | `app/propiedades/[id]/page.tsx` | photos, facts, description, ratings, comments, timeline |
| `/mapa` | `app/mapa/page.tsx` | the shell; the map itself is `components/mapa/Mapa.tsx` |
| `/comparar` | `app/comparar/page.tsx` | 2 to 4 columns, differing rows highlighted |
| `/actividad` | `app/actividad/page.tsx` | the `events` table, newest first |
| `/ayuda` | `app/ayuda/page.tsx` | the bookmarklet to drag, and how to use it |
| `POST /api/capture` | `app/api/capture/route.ts` | the bookmarklet target. `capture_token` is the CSRF guard, because the request arrives with `Origin: null` |
| `POST /api/import` | `app/api/import/route.ts` | a pasted URL. Refuses any host outside `ALLOWED_HOSTS` |
| `GET /api/photos/[id]` | `app/api/photos/[id]/route.ts` | streams a stored photo; authenticated like every other route |
| `GET /api/markers` | `app/api/markers/route.ts` | coordinates for the map, filtered the same way as the list |
| `GET /api/health` | `app/api/health/route.ts` | the container health check. The only route the proxy lets through unauthenticated |

Mutations are server actions in `app/propiedades/actions.ts`: rate, comment, change stage, set the
budget. They call `revalidatePath`, so there is no client-side cache to invalidate.

## Boot

`instrumentation.ts` runs once in the Node runtime: it applies `schema.sql`, then starts the
hourly recheck loop with a single `running` flag instead of a queue. It does nothing during the
production build.

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
| `extract.test.ts` | every portal, live and withdrawn, against saved pages |
| `changes.test.ts` | a price change that produces no event, or a phantom event |
| `ratings.test.ts` | an average that counts a missing dimension |
| `auth.test.ts` | a token with the wrong audience, issuer or expiry being accepted |
| `geo.test.ts`, `search.test.ts` | the area filter and accent-insensitive search |

## Adding something

- **A new portal.** Measure it first and record it in `docs/PORTALS.md`. Then add its photo host
  to `ALLOWED_IMAGE_HOSTS`, add a fixture, and extend the generic branch of `extract.ts`. Add the
  host to `ALLOWED_HOSTS` only if a plain server fetch really works — that list is a security
  boundary, not a convenience.
- **A new field on a listing.** `listing.ts`, then the column in `schema.sql`, then `save.ts`,
  then the detail page. `changes.ts` picks it up on its own.
- **A new page.** A server component by default. Reach for `"use client"` only when the browser
  has to hold state.
