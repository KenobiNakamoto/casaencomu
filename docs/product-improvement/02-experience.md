# 02 — Experience and screen specification

Version 1.1. This document defines the reduced core release. [Visual tokens and motion](03-design-motion-map.md) supply the presentation rules. [Family reviews](04-family-reviews.md) defines what assessment data means.

## 1. Navigation and persistent context

Keep four primary destinations: `Propiedades`, `Mapa`, `Comparar`, and `Actividad`. Keep `Ayuda` secondary. Add a compact profile menu for display name, theme preference, and shared search settings. Do not add a dashboard before the property list.

Desktop header, at 1024 px and wider: brand, primary navigation, `Añadir propiedad`, profile. Theme control can remain directly accessible beside the profile. On smaller screens: brand and compact theme/profile controls at the top; four destinations in the bottom navigation. Labels must remain visible. `Comparar` shows the current selection count, not an unrelated unread badge. `Actividad` shows new meaningful events, capped visually at `99+` with an exact accessible label.

Header and bottom-navigation dimensions are fixed by document 03. Hide neither the destination labels nor the primary way to add a property. At 320 px, use a compact brand mark with accessible name `CasaEnComú`; retain the full wordmark from 375 px when it fits.

### Context contract

One parser and serializer must define filter state for list, map, markers, and comparison entry links. Preserve these existing keys:

`q`, `precio`, `hab`, `banos`, `m2`, `estado`, `etapa`, `barrio`, `zona`, `puntuacion`, `orden`, `vista`.

Add these keys:

| Key | Values | Meaning |
|---|---|---|
| `opinion` | `pendiente`, `me_interesa`, `dudas`, `no_me_encaja` | Current person's published stance; `pendiente` includes no published review and legacy ratings without stance |
| `desacuerdo` | `1` or omitted | At least one pair of published per-dimension scores differs by two or more, or published stances include both interest and rejection |
| `archivo` | `1` or omitted | Include discarded properties and properties with all sources confirmed removed |

Unknown keys are dropped by serialization. Unknown enum values revert to their documented default. Trim text. Numeric values must be finite nonnegative integers within field-specific validation limits. Reject contradictory price bounds with an inline message; do not silently swap a filter range. The existing family budget form's swap behavior is also replaced with an explicit validation message.

Filter validation limits: text query up to 200 characters; price/budget bounds 0–100,000,000 euros; area bound 0–10,000 m²; rooms/bathrooms bounds 0–100; score bound 1–5. These are input-sanity limits, not search defaults or inferred family preferences. Validate area IDs against the bundled areas and stage/condition values against their enums. A malformed shared URL falls back to valid defaults and identifies discarded constraints in a nonblocking notice.

Defaults: newest first, gallery, no budget or numeric filters, archive excluded. `etapa=descartada` explicitly includes discarded results even without `archivo=1`. There is no user-set `no_disponible` stage after the availability migration.

The list and map share the same filtered property set. The map displays the subset with usable coordinates and says, for example, `19 en el mapa · 4 sin ubicación`. Those without coordinates remain accessible in the list. Changing view must not silently change which properties meet the filters.

Each property link includes a validated `volver` path to its originating list/map/comparison. Allow only relative `/propiedades`, `/mapa`, or `/comparar` paths with permitted query keys. Reject protocols, `//`, backslashes, encoded bypasses, and arbitrary destinations. Fallback is `/propiedades`. Do not use a raw query parameter as a redirect.

Store list scroll position and map camera per authenticated user and canonical filter key in session storage. Preserve the clicked item ID. On return, restore after results are ready; focus the originating item with `preventScroll`. If it no longer exists, retain filters and show `La propiedad ya no está en estos resultados`. Browser Back must also work.

## 2. Property list

### Information order

1. Search, an explicit `Añadir propiedad` action, and `Filtros`.
2. Shortcuts: `Por valorar`, `Me interesan`, `Preseleccionadas`, `Con dudas`. These are actual named filters, not unexplained dashboard counters.
3. Result count; removable active filters; visible sort and gallery/list control.
4. Properties; embedded map when the viewport has room.
5. Comparison tray when any properties are selected.

Search placeholder becomes `Barrio, calle o palabras del anuncio`. Numeric constraints belong in labeled filters. Submit with Enter or a visible search button; include `enterKeyHint="search"`. Maintain the submitted search while a new query is loading. Clearing the field only clears text search.

Quick numeric filters must use truthful labels: `3+ hab.`, `4+ hab.`, `2+ baños`, `80+ m²`, `100+ m²`. Selecting `4+ hab.` replaces `3+ hab.` because they share one bound. Count all active constraints consistently, including stage and personal stance. Count a price range as one constraint.

Use a modal filter sheet below 1024 px, with a sticky `Mostrar resultados` footer, `Limpiar filtros`, and explicit labels. On desktop, use a bounded popover/dialog aligned to the filter button, not a full-page absolute element whose containing block is unclear. The filter form is a draft: apply only on submit; close without applying restores the submitted filters. Shared family budget moves out of this temporary filter form.

### Card contract

The photo is 4:3. The photo and title open detail. Comparison checkbox and overflow action are sibling controls outside the link; never nest controls inside an anchor.

Reading order below the photo:

1. Price, with currency, then optional €/m² in quieter text.
2. A meaningful title up to two lines. Prefer a stored display title if supplied; do not invent a street or remove source meaning.
3. Neighborhood, area, rooms, and bathrooms when known.
4. Family review summary and current person's stance.
5. Source freshness or confirmed availability when it needs attention.

Keep one stage badge at the photo's top left and the compare control top right. Put the family score below the photograph so it has space for its contributor count. Do not stack three badges over an image. A price above the shared maximum shows `35.000 € sobre el máximo`; below the optional minimum shows a neutral `Por debajo del rango`. No budget means no budget badge.

Example with fictional values:

```text
[photo                               □ Comparar]
485.000 € · 5.511 €/m²
Piso luminoso en Example Street
Eixample · 88 m² · 3 hab. · 1 baño
3,7/5 · 3 personas · opiniones distintas
Tu opinión: Con dudas
Actualizado hace 2 días
```

Missing data is omitted from compact metadata rather than repeated as dashes. On detail, missing facts remain explicit. With no published reviews, show `Sin opiniones · Añade la tuya`. With a saved server draft, show `Tu borrador` only to its owner. Unsaved tab recovery appears in the editor, not in shared card data.

### Rows view

At 768 px and wider, show comparison checkbox, property/photo, price, area, rooms, stage, personal stance, and family score with count. Keep sorting available outside the table. Do not uppercase every column heading.

Below 768 px, rows become compact stacked list items. Preserve the selected view preference but avoid a 640 px table scrolling sideways on a phone. Each item presents the same essential fields as a gallery card, with a 96 × 72 thumbnail. Wide comparison tables have a separate exception below.

### List states

- No properties: explain the two intake paths; actions `Añadir enlace` and `Instalar marcador`.
- No matching properties: retain filters and show `Quitar filtros`; do not show onboarding.
- Pending query: retain results at normal opacity and show a small status next to the count. Do not erase the whole screen.
- Query error: retain controls and provide `Reintentar`; no empty result count masquerading as an error.
- Missing image: a consistent placeholder with `Sin foto`, not a broken-image icon.
- Missing location: list remains usable; count those excluded from map.

## 3. Add and refresh a property

### Add control

**Superseded 2026-09-08. The expanding + field is the shipped control and is not to be replaced.** The dialog this section described was built and then reversed at the owner's request; its component was deleted. Read the rest of this section as the contract the control must meet, not as an instruction to build a dialog. `src/components/propiedades/search-bar.tsx` is the implementation.

One labeled URL field, `Añadir enlace`, and a route to `Guardar desde el anuncio` with installation instructions. Keep the user's input after validation or network errors — a close and reopen must bring it back. Move focus to the field on open and return it to the trigger on close.

The URL is classified before server fetch:

- Fotocasa/Habitaclia: use the existing server-import capability.
- Idealista/Housfy: explain that the user must open the advertisement and use the bookmarklet. Do not send a known blocked request just to rediscover the block.
- Vivalta/iad: support browser capture in this release. Do not expand the server allowlist solely because this proposal mentions the portals.
- Other hosts: say `Este portal no admite importación por enlace. Puedes probar el marcador en la página del anuncio.` Extraction may still fail honestly.

Pending state: disable only duplicate submission; keep the page responsive. Show `Leyendo el anuncio…` and, only when the server actually reports that phase, `Guardando fotos…`. A synchronous endpoint without progress must use `Guardando propiedad…`; do not fabricate percentage progress. After 10 seconds, explain that the operation is still in progress. The server must impose its real maximum duration.

Success returns the saved property and announces `Propiedad guardada`. The detail page offers `Añadir tu opinión`. An identical recapture returns `Ya estaba guardada. Comprobada ahora.` A changed recapture says `Anuncio actualizado` and highlights actual changed facts.

Error copy uses a reason and one next step:

| Condition | Message / action |
|---|---|
| Invalid URL | `Introduce un enlace completo, como https://…` |
| Browser capture needed | `Abre el anuncio y usa Guardar en CasaEnComú.` / `Ver cómo instalarlo` |
| Timeout | `No hemos podido terminar. Tu enlace sigue aquí.` / `Reintentar` |
| Parser cannot identify listing | `No hemos podido leer los datos de este anuncio.` / browser-capture instructions |
| Explicit removal evidence | `El anuncio ya no está publicado. Si ya lo guardaste, sus datos siguen disponibles.` |
| Invalid/expired capture token | `Actualiza tu marcador desde Ayuda y vuelve a intentarlo.` |
| Session expired | Explain that sign-in is needed and preserve safe return context. Do not store or echo capture tokens in URLs. |

HTML form callers receive an HTML result or redirect to a styled app result page. JSON callers receive a structured result. Both paths use the same outcome codes. Invalid capture responses must not expose raw stack traces or payloads.

### Refresh semantics

Distinguish `Guardada`, `Comprobada`, and `Publicación retirada`. The capture time records observation, not guaranteed future availability. Reusing a bookmarklet can update source facts, freshness, and availability without touching reviews, comments, or the family's stage. Manual overrides are deferred.

If a field disappears from an extraction, preserve the last known value with a stale/missing marker until a reliable update resolves it. A deliberate source change to a known null value needs typed extraction evidence; generic parser failure must not clear every field. The merge policy is specified in document 05.

## 4. Property detail

### Proposed arrangement

```text
Return to previous results                    Compare □
Title
Price · €/m² · neighborhood · key facts
Photo gallery

Desktop main column                    Compact side panel
Family overview                        Shared stage
Facts and what needs checking          Your stance or draft shortcut
Location                              Publish/edit opinion action
Description
Family opinions
Conversation
Sources and history
```

On phones, use this DOM order: return link; title and price; gallery; family overview; primary actions; facts; location; description; family opinions; conversation; sources/history. The full rating editor is opened explicitly. It must not appear above the facts merely because a desktop aside moves first.

Use anchor navigation on detail: `Resumen`, `Opiniones`, `Conversación`, `Historial`. On small screens it can scroll horizontally, with the current section indicated by a line and label weight. Anchor targets account for sticky header height. Do not create separate tab panels that make browser Find or deep links unreliable.

### Family overview

Show published-author count, stance counts, and the current person's status. Do not imply a complete family roster or show formal question counters. Display a numeric family score only when published scores exist. Label it `Media por persona`. Add `Parcial` when any contributing person has fewer than six scores. Never use a high score as a badge of agreement.

When there is disagreement, show the concrete dimension or stance difference: `Luz y vistas: 2–5, según 3 personas`. Link to those reviews. For blockers, show `2 personas señalan un impedimento` and link directly to each author's reasoning. Do not label a property itself as blocked unless the family changes its shared stage.

### Facts and evidence

Group facts into `Espacio`, `Edificio`, and `Ubicación`. Price remains near the title. Show a short `Por comprobar` list for important missing facts: floor, lift, outdoor space, fees, and energy information when missing. Display `No consta en el anuncio`; absence is not `No`.

Keep the original description verbatim and in its original language. Collapse after six lines with `Leer descripción completa`; expansion does not animate height. Never create an AI summary that looks like a verified source fact.

Location displays precision in text. An approximate location is not an exact point even if coordinates have many decimals. A location without coordinates shows the available text address and an explanation; do not silently geocode it as exact.

### Photos

Desktop: one large photo and up to four smaller photos; the whole gallery has an accessible `Ver las 24 fotos` action. Phone: one 4:3 image per viewport with swipe scrolling, index `1 / 24`, and explicit previous/next buttons. Do not render a second copy of every photo under an expanded details block.

Opening a photo launches a full-screen viewer with close, previous/next, counter, and optional thumbnail rail. Arrow keys navigate; Escape closes; focus is trapped and restored. Load the current photo and its two neighbors; lazy-load other thumbnails. Failed photos stay navigable as labeled placeholders. There is no automatic slideshow. Do not add a zoom animation that delays reading the photograph.

Photo captions must be truthful: `Foto 3 de 24 del anuncio`. Semantic room captions can be added manually later; do not infer them from file position. Preserve existing accessible property context around decorative card thumbnails.

### Shared stage

Shared stages are `Nueva`, `Revisando`, `Preseleccionada`, `Visita prevista`, and `Descartada`. Availability is a separate status. A person can publish `No me encaja` without discarding the home for everyone.

Stage changes show `Cambiar etapa para todos`. Confirm discard before saving. Other stages save explicitly through the control. Check the stage version to prevent stale overwrites. A person can change the stage again; no timed Undo or mandatory reason form is required. Reasons can be recorded in comments.

`Visita prevista` remains a shared stage, not proof of a scheduled appointment. Show `Fecha y detalles en la conversación`. Actual scheduling and assigned actions remain deferred in document 05.

## 5. Map experience

The full map shares list filters and has a compact result summary, `Lista`, `Filtros`, `Ver todos los resultados`, and `Zonas`. The embedded map shares the surrounding list state. In either context, changing theme or rating a property preserves camera and selection.

Default area outlines are neutral and quiet. A selected district or neighborhood uses yellow. Hover does not imply selection. A selected property uses a high-contrast pin and a preview; approximate-address uncertainty uses a separate muted ring. A short legend explains these meanings.

On phone, tapping a property opens a bottom preview card above the navigation, not a tiny popup under the finger. The preview shows price, key facts, personal stance, and `Ver propiedad`. A second action selects it for comparison. Close returns focus to the pin. Exact-coordinate overlap behavior and the list fallback are defined in document 03.

Pan and zoom do not automatically filter the list. Provide `Buscar en esta zona` only in a later release if viewport search is implemented with a clear bounding-box contract. This release supports named district/neighborhood filters. The user must not mistake panning for changing the search.

Loading tiles show a quiet map background with status. Failure of the tile provider must offer `Ver lista` and `Reintentar mapa`; filters and stored properties remain available. Missing area overlays must not block the basemap.

## 6. Comparison

Selection belongs to the current person and browser tab, not the whole family. Persist property IDs in session storage under the authenticated user ID; never include capture tokens or emails. Canonical shared links use `/comparar?ids=<id1>,<id2>`. The URL is authoritative when present.

Check a card, row, detail action, or map preview to add it. The fixed tray says `2 propiedades seleccionadas` and offers `Comparar` and `Limpiar`. At one selection, the compare action is disabled with `Elige otra propiedad`. At four, preserve selection and announce `Puedes comparar hasta 4 propiedades` if a fifth is attempted. Never evict an item silently.

Selection persists across filters; the tray can say `1 fuera de estos resultados`. Returning to a selected card keeps its checkbox checked. Filter changes must not discard hidden selections. Unavailable properties remain comparable if explicitly selected, with a status label.

Comparison has these sections: essential facts; stances and published-author count; reasoning and blockers by person; optional scores by dimension; sources and availability. Provide `Solo diferencias`, preserving row labels. Compare typed raw values before formatting. Null differs from a known value; two nulls do not differ.

Desktop supports 2–4 columns with sticky property headers and left-hand row labels. On phone, show two columns at a time with an explicit selector for the second property and a fixed first property. If the URL contains 3–4, retain all selections and allow switching the visible pair. At 320 px, stack each labeled comparison row into two cells rather than shrinking text below 14 px. Only the comparison region may scroll horizontally on intermediate widths; the page must not overflow.

An invalid or removed ID produces a recoverable explanation and the remaining selections. Never silently compare fewer properties under a header that says four. Use IDs only internally; no interface asks users to type them.

## 7. Activity

Separate useful news from raw history. Use `Todo`, `Opiniones`, `Comentarios`, and `Anuncios` filters. Keep chronological items; no time-window grouping.

Each item includes actor, property title/thumbnail, specific change, timestamp, and a deep link. A publication event links to the current opinion. Avoid duplicating authored text in event payloads. A failed check says `No se ha podido comprobar el anuncio`; only confirmed removal says the advertisement is no longer published.

Private drafts and no-op saves produce no events or badges. Own events stay in history but do not increase the owner's unread count.

Rendering and prefetch never mark anything read. Provide `Marcar estas N novedades como leídas` for loaded eligible rows and `Actualizar` for new activity. Unloaded pages stay unread. The exact ID-based contract is in document 05. No row-visibility timer or polling is required.

## 8. Profile, help, and shared settings

Profile lets each person choose a display name and theme (`Sistema`, `Día`, `Noche`). Use the stable user ID for authorship. Renaming someone updates presentation, not event ownership. Do not show email addresses on cards or public-looking screenshots.

Shared settings contain optional minimum and maximum budget, visible as `Preferencias de búsqueda · compartidas`. Either bound can be set independently. `Quitar presupuesto` clears both. Changing shared settings records actor and time, with a version check. Budget is not prepopulated.

Help detects no privileged device information. Offer explicit `Ordenador` and `iPhone / iPad` tabs. Explain the supported intake path for all six measured portals. Add `Copiar código` with a manual selection fallback, plus a short install check that never claims to verify the portal until an actual capture succeeds. Keep technical server uptime collapsed under `Información técnica`.

Do not promise a Web Share Target or native share extension on iOS. Those are separate capabilities with separate platform checks.

## 9. General interaction rules

All mutation forms implement idle, editing, pending, success, validation error, network error, unauthorized, and conflict states. Errors appear near the relevant field and in a summary when there are several. Status is announced politely without stealing focus. Only failure or required correction persists; routine success can fade after four seconds.

Navigation may use pending indicators, but never disables reading existing content. Save buttons prevent duplicate submission and retain text. Closing an unsaved editor offers `Seguir editando` and `Descartar cambios`; an already saved private draft can close without data loss.

Load new family information on navigation or explicit refresh. Do not reset an editor or reorder content while someone is typing. No automatic freshness prompt or polling is required. Version checks detect competing writes as specified in document 05.
