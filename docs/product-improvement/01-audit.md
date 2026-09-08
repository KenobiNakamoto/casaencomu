# 01 — Current product audit

Baseline: `3002a67`, inspected 2026-09-07. See the [package index](README.md) for scope and confidence.

Version 1.1 retains the baseline evidence. The [skill re-review](07-skill-review.md) narrows the implementation scope. A missing capability is not automatically a required feature; formal questions, visits/tasks, and overrides are deferred.

## What is already useful

The app brings six portals into one private workspace. Imported facts come from advertisements. Its list, map, and property page share stored data. Source references prevent exact duplicates. Photos remain available locally. The rating model supports missing dimensions. The system already has comments, events, stage changes, and automatic checks.

The visual foundation is coherent: one font family, restrained surfaces, property photography, theme tokens, responsive navigation, and explicit approximate map positions. These should be improved rather than replaced with a new landing-page aesthetic.

## Evidence labels and priority

- **Code:** directly visible in implementation. A browser reproduction may still be needed to measure its visual consequence.
- **Measured:** a calculation, fixture execution, database query, or inspection of the fetched style.
- **Risk:** an expected consequence that has not been reproduced in the rendered app.
- **Gap:** a proposed capability absent from the inspected code; it is not necessarily a regression.

P0 means correctness or data trust must be fixed before release. P1 means core usability. P2 means refinement or extended workflow. These labels are independent of implementation order.

## Findings register

| ID | Priority / evidence | Current behavior and consequence | Source | Resolution |
|---|---|---|---|---|
| F01 | P0 · Measured | Capture validates `title` but omits it from `extract()`. The Housfy fixture fails without it and succeeds with it. | `src/app/api/capture/route.ts:42`, `:51`; `src/lib/extract.test.ts` | PIP-01 |
| F02 | P0 · Code | Capturing an existing source adds a duplicate event and returns. The `Comprobar` instruction therefore does not refresh facts or check timestamps. | `src/lib/save.ts:37`; `src/app/propiedades/[id]/page.tsx:277` | PIP-01 |
| F03 | P0 · Code | A successful HTTP response that yields no listing is described as unavailable. A blocked or unfamiliar page can be mistaken for a removed ad. | `src/app/api/import/route.ts:52` | PIP-01 |
| F04 | P0 · Code | The global activity page renders every availability event as unavailable, including `{to:"unknown"}` warnings. | `src/app/actividad/page.tsx:36`; `src/lib/recheck.ts` | PIP-02 |
| F05 | P0 · Code | A 403/timeout contributes to the same failure counter as a 404. One later 404 can therefore trigger removal. | `src/lib/recheck.ts:116` | PIP-02 |
| F06 | P1 · Measured | White on the night accent is 3.41:1. Normal-size button text does not meet the 4.5:1 target. | `src/app/globals.css:87`; rating/stage buttons use `text-white bg-accent` | PIP-03 |
| F07 | P1 · Measured | Placeholder colors on raised surfaces are 3.18:1 in day and 3.42:1 in night. They are difficult to read if needed for instructions. | `src/app/globals.css`; search and input components | PIP-03 |
| F08 | P1 · Code | Sky, amber, and violet chip utilities bypass theme tokens. Their pale backgrounds remain pale in night mode. | `src/components/propiedades/chip.tsx:3` | PIP-03 |
| F09 | P1 · Measured | The basemap has 52 layers with explicit color properties. Only seven receive theme color overrides. Roads and most labels retain the light style. | `src/components/mapa/Mapa.tsx:34`, `:139`; fetched Positron style | PIP-04 |
| F10 | P1 · Code / Risk | Map construction and destruction depend on theme, markers, filter objects, and route state. Re-renders can recreate the map and refit the camera. | `src/components/mapa/Mapa.tsx:116`, `:334`, `:336` | PIP-04 |
| F11 | P1 · Code | Area boundaries, approximate-position circles, and active pins all use red. Different meanings compete visually. | `src/components/mapa/Mapa.tsx:209`, `:232`, `:249`; `.pin.is-active` | PIP-04 |
| F12 | P1 · Code / Risk | Pins are built from divs and hover syncing listens to mouse events. Keyboard and touch selection parity is not established. | `src/components/mapa/Mapa.tsx:157`, `:313` | PIP-04 |
| F13 | P1 · Code | List-to-map links preserve only stage and area; map and marker queries implement different subsets of list filters. | `src/app/propiedades/page.tsx:135`; `src/app/mapa/page.tsx`; `src/app/api/markers/route.ts` | PIP-05 |
| F14 | P1 · Code | Detail back links always point to `/propiedades`. Previous filter and view context is not encoded. | `src/app/propiedades/[id]/page.tsx:155` | PIP-05 |
| F15 | P1 · Gap | Comparison accepts 2–4 IDs but no list or detail control selects them. The empty page asks users to compose a URL. | `src/app/comparar/page.tsx:60`; repository search for comparison controls | PIP-06 |
| F16 | P1 · Code | Plain import form errors navigate to a JSON response. There is no pending state, retry panel, or preserved error context. | `src/components/propiedades/search-bar.tsx:54`; import route | PIP-01, PIP-08 |
| F17 | P1 · Code / Risk | The add control animates layout width for 300 ms and hides search on phones. This can move neighboring content and interrupt context. | `src/components/propiedades/search-bar.tsx:59`, `:62` | PIP-08 |
| F18 | P1 · Code | The theme wipe lasts 520 ms. Reduced motion only disables the theme icon/wipe path; card zoom and pin scale still have motion. | `src/app/globals.css:236`; `card.tsx`; `.pin` | PIP-03, PIP-08 |
| F19 | P1 · Code | On mobile the full stage and six-dimension form precede facts, description, and family comments. | detail page aside before the main content column | PIP-07 |
| F20 | P1 · Gap | No full-screen photo viewer, keyboard photo navigation, photo counter, or clear missing-image recovery exists. Desktop photo expansion repeats thumbnails. | detail page gallery; `src/components/propiedades/card.tsx:24` | PIP-07 |
| F21 | P1 · Measured | The family score averages rating rows. Someone with six scores has six times the influence of someone with one score. | `src/lib/ratings.ts:14`; SQL `AVG(score)` in list/compare | PIP-09 |
| F22 | P1 · Gap | A star average omits participation count, disagreement, personal stance, and the reasons behind scores. | card badge and detail header | PIP-09, PIP-10 |
| F23 | P1 · Gap | Scores have no meaning labels, `No lo sé`, or way to clear a saved score. Comments are separate from the person's assessment. | `rating-form.tsx`; `rateAction` | PIP-10 |
| F24 | P1 · Gap | Comments have no edit/delete controls, reply context, question status, or draft recovery. | detail comments; `commentAction` | PIP-11 |
| F25 | P1 · Code | Actions silently return for some invalid input. Saves lack clear feedback and lost-update protection. The revised solution does not require a universal mutation-ID system. | `src/app/propiedades/actions.ts` | PIP-08 through PIP-11 |
| F26 | P2 · Code | `users.name` is the email local part. No profile control lets someone choose their displayed name. | `src/lib/auth.ts:35`; navigation | PIP-14 |
| F27 | P1 · Code | Global activity marks the feed read during server rendering, shows only 200 events, and does not mark first-visit rows as new. Read state can diverge from what was actually viewed. | `actividad/page.tsx:76`, `:90`; `nav.tsx` | PIP-13 |
| F28 | P2 · Gap | `Visita prevista` stores no date, assignee, or follow-up. Stage changes do not explain why. | `schema.sql`; `setStageAction` | PIP-12 |
| F29 | P1 · Code | List, map, and comparison may represent hidden/unavailable properties differently. Availability also overwrites a workflow stage. | list/map queries; `recheck.ts` | PIP-02, PIP-05 |
| F30 | P2 · Code | Budget requires both bounds and cannot be cleared. A below-minimum property receives the same red warning as an unaffordable one. | `settings.ts`; budget form; `outOfBudget()` | PIP-05, PIP-14 |
| F31 | P2 · Code | Search advertises price and area but performs text matching. Quick filters say `3 hab` while their actual meaning is at least three. The filter count excludes stage. | `search-bar.tsx`; `filters-row.tsx`; list `activeFilters` | PIP-05 |
| F32 | P1 · Code / Risk | Several controls are 24–40 px, text fields use 14 px, and some focus styles remove the outline. Mobile touch comfort, iOS zoom, and focus visibility need verification. | global CSS, nav, map controls, filters, textarea | PIP-03, PIP-08 |
| F33 | P2 · Code / Risk | The full desktop navigation begins at 768 px despite a large brand, four labels, greeting, and two controls. Width pressure needs rendered verification. | `nav.tsx`; `nav-links.tsx` | PIP-03 |
| F34 | P1 · Gap | No route-specific loading, error, or not-found components exist. A failing map dependency also has no local fallback. | `src/app`; `Mapa.tsx` | PIP-08, PIP-16 |
| F35 | P2 · Measured | All 23 properties lack energy data; five lack floor; three lack lift. A dense wall of `Sin datos` does not help resolve these questions. | read-only aggregate queries | PIP-07, PIP-15 |
| F36 | P2 · Code | Card titles are one-line truncated. Facts, reviews, source information, and raw events have similar visual prominence on detail pages. | `card.tsx`; detail page | PIP-07 |
| F37 | P2 · Code | Help focuses on three portals, exposes a long bookmarklet string, and leads with desktop installation even on a phone. | `src/app/ayuda/page.tsx` | PIP-14 |
| F38 | P0 · Code / Risk | Fetch allowlists check the initial host but follow redirects. The image byte limit is checked after buffering when length is absent. Redirect and resource limits need enforcement. | `url.ts`; import route; `recheck.ts`; `photos.ts` | PIP-01 |
| F39 | P2 · Code | Cover queries use `position = 0` in some consumers but first available position in others. A failed first image can produce a blank cover only on some screens. | compare and markers queries versus list query | PIP-05 |
| F40 | P2 · Documentation | Public workplan prerequisites conflict with later private session records. Deployment and restore readiness cannot be inferred from the summary. Photos are excluded from backups. | workplan; memory; `air/README.md` | PIP-16 |

This is a broad product and implementation audit, not a claim that every possible defect has been found.

## Measured color evidence

Ratios use the sRGB relative-luminance formula. Values are displayed to two decimals; pass/fail must use the unrounded ratio. The backgrounds below are solid raised surfaces. Photo overlays, gradients, hover states, and antialiased text require additional rendered checks.

| Pair | Current ratio | Assessment |
|---|---:|---|
| White `#ffffff` on dark accent `#ff453a` | 3.41:1 | Fails normal-text target |
| White on day accent `#e02a1f` | 4.65:1 | Passes, with limited margin |
| Day muted `#6f6c66` on canvas `#fbfaf7` | 5.01:1 | Passes |
| Night muted `#8f8c85` on raised `#17171c` | 5.32:1 | Passes |
| Day placeholder `#93908a` on white | 3.18:1 | Fails when treated as needed instructional text |
| Night placeholder `#6f6c68` on raised | 3.42:1 | Fails when treated as needed instructional text |

Normal text should meet 4.5:1; qualifying large text can meet 3:1. Do not round a failing ratio up to a pass. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Measured map evidence

The inspected [Positron style](https://tiles.openfreemap.org/styles/positron) has 55 layers, including 52 with explicit color properties. The app changes seven: `background`, `park`, `water`, `landuse_residential`, `landcover_wood`, `waterway`, and `building`.

Examples of remaining light-style paint values:

- `highway_major_inner`: white.
- `highway_minor`: light gray.
- `railway_dashline`: nearly white.
- `label_city`: black text with a white halo.
- `highway-name-major`: dark gray text.
- `airport`: dark gray text with a white halo.

Some layers are outside the Barcelona view or hidden at particular zoom levels. The count is a style-coverage measurement, not a count of visible defects. It nevertheless establishes that the current implementation does not provide complete night theming.

## Family assessment example

Fictional diagnostic case: Member A scores all six dimensions 5. Member B scores one dimension 1.

- Current row average: `(6 × 5 + 1) / 7 = 4.43`, displayed as `4,4`.
- Proposed equal-person average: `(5 + 1) / 2 = 3`, displayed as `3,0`.

Neither number describes agreement. The UI must also show two contributors, incomplete coverage, and the actual opposing opinions. There are no real reviews in the inspected development database, so this is an illustrative scenario rather than an analysis of family behavior.

## External references checked

| Reference | How it informs this proposal |
|---|---|
| [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Text contrast thresholds and unrounded calculations |
| [W3C target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | AA minimum is 24 × 24 CSS px with exceptions; this product chooses a stricter 44 × 44 comfort target |
| [W3C animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | Interaction motion can be disabled; this is an AAA criterion adopted as a product requirement |
| [MapLibre Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/) | Updating paint, feature state, and camera without recreating the map |
| [Current Positron style](https://tiles.openfreemap.org/styles/positron) | Actual layer inventory and untouched paint values |

The installed MapLibre 5 type definitions were also checked. Online documentation can move ahead of the installed library; implementation must compile against the installed version. Public fetched references are cached only under `_local/.firecrawl/`, which is ignored by git.
