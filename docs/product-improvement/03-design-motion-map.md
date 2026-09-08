# 03 — Visual system, motion, and map

Version 1.1. These values are proposed implementation targets. They do not describe a completed visual redesign. Update `DESIGN.md` when PIP-03 lands. Preserve the existing font and brand; use semantic tokens in components.

## 1. Visual hierarchy and color balance

Photos and useful information should dominate. Canvas, surfaces, text, and dividers remain neutral. Red identifies the brand and a primary action. Yellow identifies selection. Semantic success, warning, information, and visit colors are reserved for labeled status, not decoration.

Use at most one filled primary action per local decision area. A detail page can have a primary opinion action and a separate primary action inside an open editor, but should not show three equally strong red buttons in one rail. Secondary actions use a neutral outline or text treatment.

Do not use yellow for all important numbers. Prices use ink. A family score uses ink plus contributor count. Selected filters use a yellow tint and border, not a continuous row of bright yellow fills. Error state must contain text and an icon or shape, not color alone.

Avatar identity is established by display name and initials. Use neutral avatar backgrounds by default. Do not assign family members the same red/green colors used for agreement and rejection.

### Surface rules

- Page canvas: retain the existing subtle gradient. Day runs from `#fbfaf7` to `#f1efe8`; night from `#0b0b0d` to `#141418`. No evidence requires its removal. Put essential controls and long text on defined surfaces; check both gradient endpoints where text sits directly on the canvas.
- Raised cards and dialogs use `--raised`; recessed metadata uses `--sunken`.
- Decorative dividers use `--hairline`. Interactive borders use `--control-border`; a low-contrast divider must not be the only sign that an input exists.
- Night elevation uses a lighter surface and a defined border. Shadows are supplementary.
- Keep the existing 14 px identity radius for cards, photos, dialogs, and ordinary controls. Pills remain for short statuses, filters, and map prices. Do not add a second radius system.

## 2. Application color tokens

Exact starting values for this release:

| Token | Day | Night | Role |
|---|---|---|---|
| `--canvas` | `#fbfaf7` | `#0b0b0d` | Page background |
| `--canvas-far` | `#f1efe8` | `#141418` | Existing gradient endpoint |
| `--raised` | `#ffffff` | `#17171c` | Card/dialog/input surface |
| `--sunken` | `#f4f2ec` | `#111116` | Recessed surface |
| `--surface-strong` | `#eae7de` | `#23232a` | Selected neutral surface |
| `--ink` | `#16161a` | `#f6f5f2` | Titles, prices, selected text |
| `--body` | `#3f3d39` | `#c9c6bf` | Body text |
| `--muted` | `#68645c` | `#a39f97` | Secondary information, including gradient endpoints |
| `--placeholder` | `#68645c` | `#a39f97` | Supplemental placeholder text; alias muted |
| `--hairline` | `#e4e1d9` | `#2a2a31` | Decorative separator |
| `--control-border` | `#8b867d` | `#77747e` | Interactive boundary |
| `--accent` | `#e02a1f` | `#ff453a` | Brand/ornamental red; not filled button background |
| `--action-bg` | `#c52b22` | `#c83a2f` | Filled primary action |
| `--action-hover` | `#b5261e` | `#be342a` | Primary hover |
| `--action-pressed` | `#a9221a` | `#a92a22` | Primary pressed |
| `--on-action` | `#ffffff` | `#ffffff` | Primary text/icon |
| `--secondary` | `#e0a800` | `#ffd60a` | Selection edge/marker |
| `--selection-bg` | `#fdf6e0` | `#2a2405` | Selected control tint |
| `--selection-ink` | `#695200` | `#ffe17a` | Selected label |
| `--on-secondary` | `#16161a` | `#16161a` | Text on solid yellow |
| `--focus` | `#245f89` | `#98cbee` | Focus ring |
| `--success-bg` | `#e6f4ec` | `#10241a` | Positive status surface |
| `--success-ink` | `#176b3e` | `#90d3aa` | Positive status text |
| `--warning-bg` | `#fff5dc` | `#302615` | Uncertain/pending surface |
| `--warning-ink` | `#815c00` | `#f2c86e` | Uncertain/pending text |
| `--danger-bg` | `#fcedeb` | `#351c1b` | Confirmed problem surface |
| `--danger-ink` | `#b52a22` | `#ff938c` | Error/removal text |
| `--info-bg` | `#eef5fa` | `#182631` | Informational surface |
| `--info-ink` | `#245f89` | `#98cbee` | Informational text |
| `--visit-bg` | `#f4effa` | `#292236` | Existing visit-stage surface; not a scheduled appointment |
| `--visit-ink` | `#6b4b8a` | `#c5addf` | Existing visit-stage text |

Retain existing token names as temporary aliases where needed. For example, `--ok` can reference `--success-ink`. Remove legacy Tailwind sky/amber/violet utilities from semantic components. Raw color values belong in the token block or the documented external style fixture, never in JSX.

Measured proposed primary pairs: day white/action = 5.61:1; night white/action = 5.12:1. Proposed control borders against raised surfaces = 3.62:1 day and 3.90:1 night. These are calculations, not screenshots. All semantic pairs, translucent surfaces, and states must be tested unrounded during implementation.

Text target is at least 4.5:1 for normal text and 3:1 for qualifying large text. Use 3:1 as the product target for focus rings and essential interactive boundaries against adjacent surfaces. Placeholder text is never the only label. [W3C text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### Status mapping

| Meaning | Surface/text | Extra cue |
|---|---|---|
| Nueva | info | Small outlined dot + text |
| Revisando / Con dudas | warning | Question mark + text |
| Preseleccionada / Me interesa | success | Check + text |
| Visita prevista | visit | Calendar + text |
| Descartada / No me encaja | neutral | Minus + text; personal versus shared label stays explicit |
| Confirmed source removal | danger | Unavailable icon + text |
| Cannot check source | warning | `Sin comprobar` + last successful timestamp |
| Selected filter / selected area | selection | Check/border + text |

## 3. Type, spacing, and responsive layout

Font: Plus Jakarta Sans, existing self-hosted weights 400, 500, 600, 700. No new font dependency. Use tabular numerals for prices, scores, dimensions, and tables. Spanish formatting uses comma decimals and thousands separators.

| Role | Size / line-height | Weight |
|---|---|---|
| Page/property title | 28/34 desktop, 24/30 phone | 600 |
| Detail price | 28/34 desktop, 26/32 phone | 600 |
| Section title | 20/28 | 600 |
| Body / form input | 16/24 | 400 |
| Card title / card price | 16/22 | 500 / 600 |
| Secondary metadata | 14/20 | 400 |
| Compact badge/counter | 12/16 | 600 |
| Bottom-nav label | 12/16 | 500 |

Never shrink editable inputs below 16 px on mobile. Keep body measure between 45 and 75 characters where practical. Use sentence case. Do not uppercase table headers. Long names and source titles wrap; use two-line truncation only on compact cards, with the full name on detail.

Spacing tokens: `--space-1:4px`, `--space-2:8px`, `--space-3:12px`, `--space-4:16px`, `--space-5:20px`, `--space-6:24px`, `--space-8:32px`, `--space-10:40px`, `--space-12:48px`.

| Viewport | Layout |
|---|---|
| 320–639 px | 16 px gutters; one gallery column; compact stacked rows; 64 px header; bottom navigation |
| 640–767 px | 24 px gutters; two gallery columns; bottom navigation |
| 768–1023 px | 24 px gutters; two gallery columns; table rows allowed; bottom navigation |
| 1024–1279 px | 32 px gutters; 72 px desktop header; two gallery columns; full map is separate |
| 1280 px and wider | Maximum 1440 px page; list/map split 58/42 with 24 px gap; two cards per list row |

Allow a user to hide the embedded map. The resulting full-width gallery uses three columns from 1024 px. Do not persist that choice as a family preference.

Detail maximum width: 1200 px. From 1024 px, main content is flexible and side panel is 320 px with a 32 px gap. The side panel contains only short actions and summary, not the complete six-dimension editor. Its sticky offset is header height + 24 px; disable sticky when its measured height exceeds the available viewport.

Bottom navigation height is `64px + env(safe-area-inset-bottom)`. Every fixed tray sits above it. Define one CSS custom property for each obstruction and use it in content padding, map height, dialogs, and scroll margins. Do not repeat different hard-coded `bottom-20` offsets.

Use 44 × 44 CSS px minimum hit areas for touch controls, including chip dismissal, map controls, close buttons, and viewer navigation. The visible glyph can be smaller. The product adopts this comfort target; WCAG 2.2 AA's minimum is 24 × 24 with defined exceptions. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## 4. Component state system

Reuse the existing Chip/StageBadge, RatingForm, filters, navigation, cards, and rows. Extend their semantic markup and classes in place. Add one shared native-dialog wrapper because add, filters, opinions, and the viewer need the same behavior. Do not prebuild Button, IconButton, Field, EmptyState, or generic form frameworks before actual repeated use requires them. See the component decisions in [07 — Skill review](07-skill-review.md).

Every interactive component defines default, hover, focus-visible, pressed, disabled, pending, error, and success behavior where applicable. A non-mutating link does not need a fake success state. Disabled controls explain why when the reason is not evident.

Focus ring: 2 px solid `--focus`, 2 px offset, visible immediately. Never animate focus appearance. Inputs keep a visible label, an error description referenced through `aria-describedby`, and `aria-invalid` only when invalid. Links use underlines in body copy. Toggle filters must use button semantics or a valid link/current-state pattern; do not put `aria-pressed` on an ordinary navigation link.

Use native `<dialog>` and `showModal()` for browser-managed modality. Label it with `aria-labelledby`, set appropriate initial focus, handle the cancel event for unsaved changes, and restore focus to the trigger. Do not hand-code an alternative focus trap alongside it. Use the same component with responsive CSS for phone sheets; no drag-to-dismiss implementation. Native `<details>` is appropriate for inline scores/descriptions, not modal filters. Keep the action footer reachable above the keyboard. If a tested target browser fails these requirements, evaluate one registry Dialog implementation as the bounded fallback.

## 5. Motion specification

Motion should explain continuity and state. It must not compensate for slow requests or repeatedly move content while people read.

Tokens:

```css
--duration-fast: 120ms;
--duration-standard: 180ms;
--duration-theme: 320ms;
--ease-out: cubic-bezier(0.2, 0, 0, 1);
```

| Interaction | Standard behavior | Reduced motion |
|---|---|---|
| Button hover | Color 120 ms; no movement | Instant color |
| Button press | Immediate pressed color; no added scale effect | Same |
| Card hover | Border/metadata emphasis; remove automatic photo zoom | Same, instant |
| Dialog open | Opacity 0→1 and translateY 8→0, 180 ms ease-out | Opacity 100 ms |
| Phone sheet open | Same dialog animation: opacity plus translateY 8→0, 180 ms ease-out | Opacity 100 ms |
| Panel close | Immediate native close and focus restoration; no delayed unmount | Same |
| Filter results | Existing content remains; status text changes; no mass card entrance | Same |
| Compare tray | Opacity + translateY 8→0, 180 ms | Opacity 100 ms |
| Opinion saved | Status text/check appears; no confetti, shake, or page jump | Same |
| Description expansion | Immediate expansion; retain trigger/focus | Same |
| Pin focus/selection | Instant ring; color 120 ms; no scale required | Instant |
| Explicit map `Ver todos` | `fitBounds` up to 280 ms; map must not move for incidental updates | Duration 0 |
| Theme change | Circular wipe from toggle, 320 ms, only if map readiness permits | Apply immediately |
| Photo change | Immediate image swap with stable layout; no sliding stage animation | Same |

No width, height, margin, or top/left animation. Layout changes happen once at their final dimensions; a surface can then animate opacity/transform. Do not use `transition: all`. Low-frequency color transitions are allowed; motion paths use transform/opacity, with the theme clip-path as the one deliberate exception.

Theme switching must update every surface and map paint before the new state is presented. Keep the map alive. Serialize theme requests: while a wipe runs, retain the latest requested theme and apply it once the active transition finishes or is skipped. Always clean up the wipe flag in `finally`. Never leave the toggle disabled after a rejected transition.

Do not enable WebGL `preserveDrawingBuffer` permanently to make the transition look better. If the browser snapshots the map as blank, skip the circular transition whenever a map is visible and apply the theme immediately. This fallback is part of the specification, not a failed cosmetic test.

Theme preference has three states: system, day, night. Store `sistema|light|dark`; read legacy `tema` values. When system mode is selected, listen for system changes; explicit selection ignores them. Sync valid changes from other tabs. Guard storage reads/writes. For no-JavaScript or blocked script initialization, CSS system-media rules supply a usable theme.

Respect reduced motion in CSS and JavaScript, including map camera actions. User-triggered spatial motion can be disabled; this proposal adopts that behavior even where the relevant WCAG criterion is AAA. [W3C interaction-animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## 6. Map palette

The map should read as geography behind the family's properties. Day retains blue water and subdued parks. Night uses dark geography with legible streets and labels, without pale road networks or white text halos.

| Token | Day | Night |
|---|---|---|
| `--map-bg` | `#f4f3ee` | `#12151a` |
| `--map-building` | `#e6e3da` | `#242a32` |
| `--map-water` | `#c7deeb` | `#152d3c` |
| `--map-park` | `#dce8d5` | `#1b3029` |
| `--map-wood` | `#d4e1cc` | `#20372e` |
| `--map-road-minor` | `#ffffff` | `#39414c` |
| `--map-road-major` | `#ffffff` | `#505b69` |
| `--map-road-casing` | `#d8d4cb` | `#242a33` |
| `--map-path` | `#ddd8cf` | `#353e46` |
| `--map-rail` | `#b5b1aa` | `#65717e` |
| `--map-boundary` | `#8c8982` | `#65707c` |
| `--map-label` | `#4b4a43` | `#d3d8de` |
| `--map-label-secondary` | `#68665f` | `#aab3bd` |
| `--map-water-label` | `#385971` | `#a2c6da` |
| `--map-halo` | `#f4f3ee` | `#12151a` |
| `--pin-bg` | `#ffffff` | `#252b34` |
| `--pin-ink` | `#16161a` | `#f6f5f2` |
| `--pin-border` | `#716d65` | `#a39f97` |
| `--pin-selected-bg` | `#e0a800` | `#ffd60a` |
| `--pin-selected-ink` | `#16161a` | `#16161a` |

Area default outline: `--map-boundary`, 1 px, opacity 0.35. Hover: `--secondary`, 1.5 px, opacity 0.8, fill 0.06. Selected: `--secondary`, 2 px, opacity 1, fill 0.10 day / 0.12 night. At district zoom, increase widths by 0.5 px. These are selection highlights, not errors.

A selected property pin uses solid yellow with dark text. Alias its background to `--secondary` and its text to `--on-secondary`. Red remains available for an explicit primary action in the preview. The different shapes distinguish a selected geographic area from a selected property without assigning contradictory meanings to color.

Show the 180 m illustrative uncertainty circle only for the selected approximate property. Its line uses `--map-label-secondary`, opacity 0.65, with a 4/3 dash pattern; fill opacity 0.05. State `Ubicación aproximada; el círculo es orientativo`. The radius is not a portal-provided error bound. Never imply that the property lies within a mathematically verified boundary.

## 7. Complete basemap theming contract

Add a small versioned local snapshot of the provider's style as `src/lib/map-style-base.json`, with source URL, retrieval date, and license/attribution record in a neighboring README. Preserve source, sprite, glyph, and attribution information. This pins visual inputs without hosting tiles or changing providers. Review source licensing when copying the snapshot. Do not vendor credentials or tile data.

`src/lib/map-style.ts` builds a fresh style object from that snapshot and resolved theme tokens. A layer-role manifest must account for every layer. Keep zoom bounds, source layers, filters, widths, and layout expressions unless a change below explicitly requires otherwise. Do not perform a blind recursive replacement of every string; expressions contain non-color data.

| Layer IDs / family | Treatment |
|---|---|
| `background`, `landuse_residential`, `road_area_pier` | Map background color |
| `park`, `landcover_wood` | Park / wood token |
| `water`, `waterway` | Water token, respecting fill/line type |
| `building` | Building token |
| `landcover_ice_shelf`, `landcover_glacier` | Background token; preserve opacity |
| `road_pier`, `highway_path`, `aeroway-taxiway` | Path token |
| `highway_minor` | Minor-road token |
| `highway_major_casing`, `highway_motorway_casing`, `highway_motorway_bridge_casing`, `tunnel_motorway_casing`, `aeroway-runway-casing` | Road-casing token |
| `highway_major_inner`, `highway_motorway_inner`, `highway_motorway_bridge_inner`, `tunnel_motorway_inner`, `aeroway-runway` | Major-road token |
| `highway_major_subtle`, `highway_motorway_subtle` | Minor-road token at existing opacity |
| `aeroway-area` | Building token |
| `railway`, `railway_service`, `railway_transit` | Rail token |
| `railway_dashline`, `railway_service_dashline`, `railway_transit_dashline` | Background token, preserving dash layout |
| `boundary_2`, `boundary_3`, `boundary_disputed` | Boundary token, preserving disputed dash pattern |
| `waterway_line_label`, `water_name_point_label`, `water_name_line_label` | Water-label text plus map halo |
| `highway-name-path`, `highway-name-minor`, `highway-name-major` | Secondary text plus map halo |
| `airport`, `label_village`, `label_town`, `label_state`, `label_city`, `label_city_capital`, `label_country_1`, `label_country_2`, `label_country_3` | Main text plus map halo |
| `label_other` | Hide only while custom district/neighborhood labels are active; otherwise theme as secondary text |
| `highway-shield-non-us`, `highway-shield-us-interstate`, `road_shield_us` | Hide in this Barcelona home-search view; avoids untinted sprite shields |

For the inspected style this covers all 55 layers. Major-road color expressions can be replaced with the role token because zoom width/opacity behavior remains intact. Preserve existing distinct width stops. A new upstream snapshot with an unmapped layer fails the style-coverage test; do not silently ship light defaults.

Set text halo color for every enabled text layer, including layers that did not originally declare a halo. Halo width is 1 px for streets and 1.25 px for place names. The custom area label uses 1.5 px. Test halos against water, parks, and roads in both themes. Preserve meaningful place and route labels; change only geographic name expressions to the existing local-name fallback.

## 8. Map lifecycle and interaction

Split the current effect into bounded responsibilities:

1. **Mount/unmount:** construct one MapLibre map per mounted map surface; destroy only when that surface unmounts. Set controls and global error listeners here.
2. **Initial style load:** add custom sources/layers once and record readiness. Use the latest theme/state if props changed while loading.
3. **Theme update:** update paint on existing layers and controls; preserve camera, selected pin, markers, and source data. MapLibre supports paint updates without map recreation. [Official Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/).
4. **Data update:** update GeoJSON sources through `setData`; diff HTML markers by property ID. Add, update, and remove only changed markers. Do not re-fit after every result change.
5. **Area/selection update:** update feature state and filters; move the camera only for an explicit area selection or `Ver todos` action.
6. **Resize:** use one ResizeObserver to call `map.resize()` when the container actually changes dimensions. Disconnect on unmount.

If the selected property leaves the result set, clear its preview and announce `La propiedad seleccionada no coincide con los filtros`. If it remains, keep selection and camera. Update counts on already-mounted area sources. Avoid event handlers that close over stale filters; use stable handlers reading current refs.

Use real buttons for interactive pins. Give each an accessible name containing price, neighborhood/title, and approximate status. Enter/Space opens its preview; Escape closes it. Support focus sync from cards as well as pointer hover. Keep mouse events scoped to the results container instead of a document-wide listener.

At the current scale, retain HTML price pins. Group identical stored coordinate pairs using a plain Map keyed by longitude/latitude, without rounding nearby homes together. A group pin shows its count and opens a price/title chooser ordered by property ID. Keep approximate/exact labels on each chooser item. This resolves shared approximate centroids without a screen-space collision algorithm.

For different coordinates whose labels overlap, preserve keyboard access with focused-pin stacking and offer zoom plus the always-visible list route. Do not promise automatic collision avoidance. Add screen-space grouping only when actual use shows those controls are insufficient. No clustering dependency or per-frame overlap scan is required.

<!-- ponytail: exact-coordinate grouping covers shared centroids. Upgrade only after distinct-location overlap repeatedly blocks selection. -->

A selected pin has a 2 px focus/selection outline and a higher stacking order. Do not use a repeated scale pulse. All map controls use 44 px targets, with labels for zoom in/out and full extent. Preserve attribution in both themes; it must not sit beneath the phone preview or navigation.

Failure behavior: style error leaves a fallback panel; overlay error leaves the basemap usable; individual photo error leaves the preview readable; WebGL context loss offers retry/list. A theme failure must retain the last fully rendered state and an operable toggle. No infinite retry loop.

## 9. Performance targets

These are proposed test targets, not current measurements:

- Theme switching constructs zero new map instances and preserves center/zoom within floating-point tolerance.
- Marker/filter updates construct zero new map instances.
- No duplicate listeners after repeated navigation or development Strict Mode mounts.
- Card selection and input feedback appear on the next available render; no artificial delay.
- On the agreed reference phone, aim for interaction-to-next-paint under 200 ms for local UI actions, measured separately from portal latency.
- Record theme-transition frames and long tasks. Do not claim a fixed 60 fps result from a desktop-only test.
- Critical images retain dimensions before load; content must not move because an image arrives.

If a decorative effect prevents these targets, use the defined simpler fallback. The proposal prioritizes stable content and reliable state over retaining an animation at any cost.
