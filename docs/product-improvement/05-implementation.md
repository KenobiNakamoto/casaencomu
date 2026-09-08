# 05 — Implementation contracts and ordered work

Version 1.1. Revised with Ponytail and Design Lego. Implement the core only. Deferred work has no reserved schema, routes, or hidden controls.

## 1. Architecture constraints

Keep the existing stack, one process, raw SQL, and current component paths. No new runtime dependency is required.

Reuse `search.ts`, `ratings.ts`, `save.ts`, `changes.ts`, and existing property components before adding equivalent modules. Extract a helper only when multiple actual consumers need it. Native controls and database constraints come before custom frameworks.

Three new tables serve the core: published reviews, private drafts, and explicit activity reads. Do not create receipt, question, task, visit, attendee, or override tables.

<!-- ponytail: three bounded tables cover opinions and exact explicit read state. Additional workflows require the triggers below. -->

## 2. File and component reuse map

| Existing location | Change / reuse |
|---|---|
| `src/lib/search.ts` | Shared filter parsing, serialization, and SQL predicates for list/map/markers |
| `src/lib/ratings.ts` | Equal-person aggregation and publication queries for every score consumer |
| `src/lib/save.ts`, `extract.ts`, `photos.ts`, `url.ts` | Repair import/refresh and trust boundaries in place |
| `src/lib/db.ts`, `schema.sql` | Small ordered migration runner; no migration framework |
| `src/components/propiedades/chip.tsx` | Retokenize existing Chip, StageBadge, and BudgetChip |
| Existing card/rows/filter/rating components | Extend markup; preserve working native controls |
| Existing `propiedades/actions.ts` | Validated writes and private editor loader; split only at a real feature boundary |
| Existing nav and theme components | Fix layout, focus, reduced motion, and theme state |
| `src/components/mapa/Mapa.tsx` | Stable lifecycle; a small style helper/snapshot supports complete layer coverage |
| New shared dialog component | One native-dialog wrapper for add, filters, opinions, and photo viewer |
| New comparison selection component | Tab-scoped selection shared across all selection controls and tray |
| New opinion components | Only the actual editor and person-card/summary views |

A shared event formatter replaces duplicated detail/activity wording. Do not precreate generic `ui/*`, `workflow/*`, or mutation-service folders.

Retain import/capture endpoints. A styled HTML error-result route is allowed when existing redirects cannot present errors safely. It accepts safe outcome codes and record identifiers, never authored text, captured HTML, exceptions, or tokens.

Load the private editor through an authenticated server action when it opens. No draft-session endpoint or updates API is required.

## 3. Mutation contract without a receipt framework

Use the authenticated user, server validation, and explicit pending/error/success UI. A small shared return type is sufficient:

```ts
type ActionResult<T> =
  | { ok: true; data: T; unchanged?: boolean }
  | { ok: false; code: "validation" | "conflict" | "unauthorized" | "not_found" | "unavailable";
      message: string; fieldErrors?: Record<string, string> };
```

Network failure can produce no result. Preserve input and allow retry. Never expose exception text.

Compare record versions and write under the same SQLite write transaction. Append events atomically. Do not read, release the lock, then write unconditionally.

- Stage: `stage_version` advances only for family stage edits, not source refreshes.
- Budget: keep a version beside the existing budget setting and update both transactionally.
- Reviews/drafts: use the two-version contract below.
- Comments: version-check edits/removal. New comments use a browser-generated UUID as the primary key. Retrying cannot create another row. Return the existing result only when owner, property, body, and references still match; otherwise return conflict. Retrying never resurrects edited/deleted content.

A stale publication retry may return conflict and require loading the current review. Do not promise historical response replay. Disable repeated submissions locally, but keep database protection.

Revalidate every actual consumer after public writes. Private writes return only the author's state and cause no public event/invalidation.

## 4. Minimal database evolution

Retain the version-1 bootstrap. Fresh and existing databases run the same atomic migration chain before serving or starting rechecks. Advance `PRAGMA user_version` within each transaction. Failed migration stops startup.

| Migration key | Owner | Change |
|---|---|---|
| Import observations | PIP-01 | Source outcome/presence metadata and photo source URL |
| Source availability | PIP-02 | Separate gone counter, stage version, legacy availability/stage repair |
| Personal reviews | PIP-09 | Reviews and private drafts; preserve legacy ratings |
| Comment context | PIP-11 | Comment replies/review references and editing/removal versions |
| Activity reads | PIP-13 | Explicit event reads |

Allocate the next unused integer version to each migration when its task lands. Record the task/version mapping. PIP-13 can land before personal reviews; it must not require their tables. Preserve the actual merged sequence in the runner. Never reserve versions for deferred work or modify an applied migration.

| Table | Required additions / contract |
|---|---|
| `sources` | `last_check_outcome TEXT`, `consecutive_gone INTEGER NOT NULL DEFAULT 0`, `field_presence_json TEXT NOT NULL DEFAULT '{}'`, `photo_urls_json TEXT NOT NULL DEFAULT '[]'` |
| `properties` | `stage_version INTEGER NOT NULL DEFAULT 1` |
| `photos` | `source_url TEXT NULL`; never guess legacy URLs |
| `reviews` | PK `(property_id,user_id)`; nullable stance; reasoning TEXT default empty; blocker INTEGER default 0; nullable basis; legacy INTEGER; version INTEGER; published_at, updated_at, withdrawn_at nullable timestamps |
| `review_drafts` | PK `(property_id,user_id)`; nullable payload_json; version INTEGER; based_on_published_version INTEGER; nullable saved_at |
| `comments` | Nullable parent_id, review_user_id, updated_at, deleted_at; version INTEGER default 1; preserve existing ID/body/author |
| `event_reads` | PK `(user_id,event_id)`; read_at; user/event foreign keys |

Use UTC timestamps, UUID keys, foreign keys, and practical enum CHECK constraints. Published numeric scores remain solely in `ratings`. Draft payloads include unpublished scores.

### Draft and publication revisions

Absent review/draft means expected version 0. Private loading returns both versions and the author's saved payload, without creating rows.

`saveDraft` validates input with optional stance and checks both versions. Insert or update the draft at version +1. Record its publication base. A stale base requires deliberate reconciliation.

`publishReview` validates complete input and checks both versions. Insert/update the review and rating rows atomically. A changed publication advances its version and creates one event. Then clear draft payload/saved_at and advance draft version, creating an empty version-1 row if absent.

Unchanged publication still clears the draft and advances its revision. `discardDraft` also advances the revision. Never delete the revision row: it rejects delayed writes after discard/publication. No session ID, begin-session request, autosave queue, or closure record is required.

`withdrawReview` checks both versions. Clear shared content, mark withdrawn, advance publication version, and remove rating rows. Preserve an existing private payload or copy the publication before clearing it. Advance draft revision and set its base to the new publication version. Redact legacy shared snapshots and append one content-free event atomically.

Published queries exclude withdrawn rows. Republishing clears withdrawn_at without resetting identity/version.

PIP-09 and PIP-10 ship together as one publication cutover. Retire the old direct rating-write action when wiring the revised form. Every score change must pass through the publication transaction; no legacy action may bypass review versions or create score rows without a corresponding publication. Do not add a feature-flag system solely for this cutover.

Normalize authored outer whitespace and line endings. Preserve internal line breaks. Compare complete normalized input for no-op publication. Scores include all six keys with explicit nulls. Source descriptions remain verbatim.

### Legacy and migration safety

Create legacy reviews from rating author/property pairs. Preserve every score; stance/basis remain null with no invented reasoning. Existing comments remain roots.

For legacy `no_disponible`, derive source availability and restore the latest valid user stage from events. Otherwise use `revisando` with an explicit migration note. Initialize historical gone streaks to zero.

Backfill event_reads only for events at or before each user's old last_seen_at. Null means no backfill. Retain the old column for compatibility but stop updating it during rendering.

Test nonempty migrations on a temporary copy. Never reset family data. Add only indexes needed by actual queries and inspect their plans.

## 5. Import and source observation contract

Create a typed result from the extractor: `listing`, `removed`, `blocked`, or `unreadable`, with a reason code. Maintain an `extract()` compatibility wrapper if tests/scripts require `Listing | null`, but implement parsing only once. Import, capture, and recheck use the typed result.

Each extracted field has presence `present`, `absent`, or `explicit_null`. For a new listing, absent fields store null. For a refresh, absent fields retain the previous known value and are marked as not present in the latest observation. Only explicit, reliable source evidence clears a value. Return presence metadata from actual extraction branches; do not reconstruct it from a default-filled zod object.

For the same source: normalized facts and presence unchanged → update successful observation time without a change event. Facts changed → update source snapshot and baseline property fields, then emit exact diffs. Keep review/comment/stage data untouched. The first version still deduplicates by URL or portal reference; cross-portal fuzzy merges are not introduced.

Manual overrides, when introduced, are an effective-value layer on top of source fields. An import updates the source baseline but never overwrites an override. A field with an override displays its author, date, reason, and the latest source value.

Availability rules:

- Successful listing observation → source active; reset both failure counters; update `last_ok_at` and `last_checked_at`.
- A scheduled HTTP 404/410 → increment `consecutive_gone`; mark removed only on two consecutive scheduled gone checks. An intervening blocked, unreadable, timeout, or success outcome resets the gone streak.
- A tested portal-specific explicit removal marker or removal redirect can confirm removal directly. A 200 response alone is not removal evidence.
- Blocked, timeout, parser uncertainty → unknown; never change the family stage. Keep last successful data and its time.
- `last_checked_at` means last attempt. `last_ok_at` means last successful listing observation. UI labels must distinguish them.
- Property availability: active if any source has a current active observation; unknown if none are active and at least one is unknown; removed only when every existing source is confirmed removed. No sources means unknown.
- An active observation older than 48 hours is presented as stale, even if the stored source status remains active.

Manual recapture uses existing source uniqueness and normalized snapshot comparison inside the save transaction. Repeated unchanged payloads update freshness without duplicate property/change events or scheduled gone increments. Keep installed bookmarklets compatible. No new mutation field, five-minute receipt window, or receipt table is required. Validate capture tokens as before.

Fetch constraints: HTTPS only, no embedded credentials, default port only; validate every redirect hop against the relevant allowlist, maximum three redirects. Do not bypass CAPTCHA or expand allowed hosts incidentally. Bound HTML bodies to 2 MiB and capture form bodies to 1 MiB before full parsing. Keep current bookmarklet field limits and reject oversized submissions with a styled 413 result.

`POST /api/import` also requires a same-origin request, checked against the configured application origin. Reject foreign or null Origin headers for this endpoint; trusted local scripts use the ingestion functions directly. `/api/capture` remains the deliberate cross-origin exception and validates the current user's capture token, including for null Origin. Preserve Next.js server-action origin checks. A valid authentication cookie alone must not authorize an arbitrary foreign site's form to mutate the app.

Photos: maximum 40, concurrency four, maximum 5 MiB per streamed response, five-second per-photo timeout. Enforce a total import deadline of 25 seconds including page fetch and photos; page fetch gets at most 12 seconds and cannot exceed the shared deadline. Save available facts and successful photos; report partial photo import honestly. A later explicit refresh can fetch missing photos. No background job continues after the response unless a later task explicitly introduces a queue.

These bounds replace the previous aspirational under-20-second comment with enforceable behavior. Measure actual portal imports. A future queue requires evidence that the bounded synchronous behavior is insufficient.

## 6. Activity and deliberately deferred workflows

Use one formatter for detail and activity. New review/comment events contain references, not duplicated authored text. Unknown legacy kinds render neutral copy.

Keep stable `(created_at,id)` pagination with 40 rows per page. Do not group edits in time windows.

There is no automatic read tracking. Show `Marcar estas N novedades como leídas` for loaded, unread, eligible event IDs. Mark only those IDs, at most 100 per request. The server verifies each ID. Unloaded pages and events created after rendering stay unread. Prefetch and ordinary rendering write nothing.

Keep own events visible but exclude them from the owner's unread count. Duplicate/no-op changes and private draft saves create no activity.

The feed has `Actualizar`. Navigation and explicit refresh load current data. Do not add polling, visibility timers, IntersectionObserver read heuristics, an updates API, or event grouping. Refreshing activity must not affect saved drafts.

<!-- ponytail: explicit confirmation tracks read IDs without guessing attention. Add automatic detection only if members find this action burdensome. -->

Shared stages remain core. Their version checks and feedback belong to PIP-08. Changing stage again is the reversible action; no timed Undo subsystem is required.

Tasks, scheduled visits, formal question tracking, and manual overrides are deferred. Use comments for plans/questions and retain explicit missing-source labels. Never silently convert comments into structured records.

## 7. Ordered work packages

S = small local change; M = several connected modules; L = multiple flows or a migration. These are relative sizes, not promised elapsed times. Dependencies are technical prerequisites, not 16 serial releases. PIP-12 and PIP-15 are deferred. PIP-16 is used for each core release, not a final implementation bottleneck. Scope shared files in the actual workplan.

### PIP-01 — Reliable import and recapture · P0 · L

**Depends:** none. **Findings:** F01–F03, F16, F38.

**Files:** capture/import routes; `extract.ts`; `save.ts`; `photos.ts`; `url.ts`; existing database initializer and import-observation migration.

**Build:** title forwarding; typed outcomes; initial/refresh merge rules; friendly HTML/JSON result handling; safe bounded downloads; atomic source uniqueness and snapshot comparison. Keep authentication and source allowlists.

**Accept:** Housfy capture fixture succeeds through the route; unchanged recapture updates freshness without duplication; changed recapture updates facts and one event; malformed/blocked pages are not removal; off-allowlist redirect is refused before fetch; oversized streams stop at the cap; partial photos are reported. Tests: V01–V04, V23.

### PIP-02 — Availability separate from shared stage · P0 · M

**Depends:** PIP-01. **Findings:** F04–F05, F29.

**Files:** `recheck.ts`, `changes.ts`, typed source results, availability migration, shared event formatter, stage-version column, affected status displays.

**Build:** independent gone streak, typed removal evidence, multi-source availability, stale labels, legacy stage restoration, shared event wording.

**Accept:** timeout→404 does not remove; two scheduled 404s do; active source prevents whole-property removal; unknown events say cannot check; user stage survives any source change. Tests: V05–V06.

### PIP-03 — Tokens and accessible existing controls · P1 · M

**Depends:** none. **Findings:** F06–F08, F18, F32–F33.

**Files:** `globals.css`, `DESIGN.md`, existing `chip.tsx`, nav and theme components.

**Build:** document-03 tokens/type/layout; semantic statuses; 44 px targets; clear focus; three-state theme preference; global reduced motion.

**Accept:** color-pair tests use unrounded ratios; no default sky/amber/violet semantic classes remain; header fits all target widths; keyboard focus is visible; legacy theme choice migrates. Tests: V16–V19.

### PIP-04 — Stable, fully themed map · P1 · L

**Depends:** PIP-03. **Findings:** F09–F12, map part of F34.

**Files:** `Mapa.tsx`, map style helper/snapshot/manifest, map CSS, local map components.

**Build:** complete role mapping; independent mount/data/theme effects; stable camera; keyboard pins; exact-coordinate chooser; phone preview; failure fallback.

**Accept:** all snapshot layers mapped; no light-only road/halo defaults in night style; zero map reconstruction on theme/filter update; camera and selected property persist; failed overlays do not block map. Tests: V15, V18–V20.

### PIP-05 — One search and context contract · P1 · M

**Depends:** PIP-02, PIP-03. **Findings:** F13–F14, F29–F31, F39.

**Files:** list/map/markers queries, filter/search components, settings helper, existing search/rating helpers, detail return links.

**Build:** shared filters; archive policy; truthful labels; optional independent budget bounds and clear action; consistent first available cover; saved return/scroll context. Reserve opinion filters until PIP-10 rather than rendering nonfunctional controls.

**Accept:** the same query yields the same qualifying IDs in list/map data; coordinate omissions are counted; Back retains filters/scroll; cover fallback consistent; budget can be max-only and cleared. Tests: V07–V08.

### PIP-06 — Usable comparison selection · P1 · M

**Depends:** PIP-05. **Findings:** F15.

**Files:** compare route, card/row/detail/map-preview selection controls, selection provider/tray, nav comparison link.

**Build:** per-person/tab selection, 2–4 rules, canonical shared URL, responsive pair view, raw-value differences.

**Accept:** select two without typing IDs; fifth selection produces feedback; hidden selections survive filters; shared URL restores order; null comparisons and phone pair switching work. Tests: V09.

### PIP-07 — Detail and listing information hierarchy · P1 · L

**Depends:** PIP-03, PIP-05. **Findings:** F19–F20, F35–F36.

**Files:** property detail, cards/rows, photo components, facts/location/source sections.

**Build:** document-02 order and layouts; 4:3 card photos; useful missing-data section; full-screen viewer; compact action rail; section anchors. Use the existing review summary until PIP-10 replaces it.

**Accept:** mobile facts precede full review editor; gallery loads one current image plus neighbors; keyboard controls and focus restoration work; missing photos and long descriptions have usable states. Tests: V10, V17.

### PIP-08 — Saving, errors, and purposeful motion · P1 · M

**Depends:** PIP-01, PIP-02, PIP-03. **Findings:** F16–F18, F25, F34.

**Files:** existing actions, add dialog, inline feedback, route loading/error/not-found components, one native-dialog wrapper.

**Build:** small action results; preserved input; pending/failed/conflict states; versioned stage changes; bounded motion; map-aware theme fallback; shared native dialog. No receipt service or timed Undo.

**Accept:** no raw JSON error page in user flows; failures preserve input; duplicate submission prevented; reduced motion removes spatial animation; Escape and focus restoration work. Tests: V01, V11, V17–V19, V22.

### PIP-09 — Review persistence and fair aggregates · P1 · L

**Depends:** PIP-02, PIP-08. **Findings:** F21–F23, F25.

**Files:** review/draft migration; existing rating helper and actions; private editor loader; all score consumers.

**Build:** document-04 data, publication, and withdrawal transactions; legacy migration; private draft authorization; equal-person aggregates and disagreement logic.

**Accept:** all worked cases pass; another member cannot fetch a draft; delayed explicit saves cannot recreate discarded work; all numeric consumers agree; no no-op publication event. Tests: V12–V14, V23–V24.

### PIP-10 — Opinion editor and family presentation · P1 · L

**Depends:** PIP-09. **Findings:** F22–F23.

**Files:** existing rating form plus opinion editor/person cards; detail/list/map/compare summaries; opinion filters.

**Build:** quick stance, one reasoning field, optional blocker, explicit draft save/publication, author-only withdrawal, optional labeled scores, person cards, disagreement links, comparison person filter.

**Accept:** stance-only publication works; published and draft content never mix; withdrawal removes shared content while preserving private work; contributor count does not imply a complete family roster; partial numeric coverage is visible; no consensus inferred from a high mean. Tests: V12–V14, V17.

### PIP-11 — Simple conversation and reply context · P1 · M

**Depends:** PIP-10. **Findings:** F24–F25.

**Files:** existing comments/actions; comment migration; reply/edit/remove controls; shared event formatter.

**Build:** one-level replies, author-only edit/remove, private composer recovery, optional review reference, cross-property validation, legacy event-text redaction. Questions remain ordinary comments.

**Accept:** unauthorized edits fail; deleting a root keeps replies; retrying comment creation does not duplicate it; draft text never enters events; cross-property references rejected. Tests: V14, V21, V23.

### PIP-12 — Scheduled visits and assigned tasks · P2 · Deferred

**Depends:** PIP-11 only after the trigger is met. **Findings:** F28.

**Trigger:** actual visits or follow-ups are missed because comments and existing calendars do not provide enough structure.

**Scope when approved:** dated visits or assigned tasks, choosing only the demonstrated need. Define ownership, date/time behavior, notification expectations, and migration then. Do not create both systems automatically.

**Core substitute:** shared stage plus ordinary comments. Stage safety already belongs to PIP-08.

### PIP-13 — Meaningful activity and freshness · P1 · M

**Depends:** PIP-02, PIP-08. **Findings:** F04, F27.

**Files:** activity route/components, event-read migration/action, nav badge, shared event formatter.

**Build:** explicit read button for loaded IDs, pagination, deep links, manual refresh. No polling, time-window grouping, or guessed attention.

**Accept:** prefetch clears nothing; unseen pages remain unread; private drafts produce no events; unknown/removal messages differ; new data does not reset editors. Tests: V06, V25.

### PIP-14 — Profile, preferences, and capture help · P2 · M

**Depends:** PIP-03, PIP-05, PIP-08. **Findings:** F26, F30, F37.

**Files:** profile/help components/routes/actions, settings helper and version key, nav.

**Build:** editable own display name, shared budget preferences with actor/version, desktop/mobile bookmarklet instructions for six portals, copy fallback, technical details disclosure. No participation-management feature.

**Accept:** profile changes preserve user ID; no other person's profile can be edited; help names real supported capture paths; budget changes are clearly shared; no iOS share-extension promise. Tests: V08, V26.

### PIP-15 — Traceable manual fact corrections · P2 · Deferred

**Depends:** PIP-11 only after the trigger is met. **Findings:** F35.

**Trigger:** a family member repeatedly needs an important known correction that recapture cannot supply.

**Scope when approved:** allowlisted fields, typed values, source/effective-value distinction, author/reason, revert action, and consistent queries. Specify this workflow before adding its table. V27 remains a deferred acceptance outline.

**Core substitute:** explicit missing/stale facts and comments containing separately attributed observations. Never overwrite source facts with opinion text.

### PIP-16 — Performance, recovery, and release proof · P1 · M

**Depends:** applicable core work in the release being checked; never deferred work. **Findings:** F34, F40.

**Files:** relevant fixes, test fixtures, docs/status, backup/restore docs or scripts if required.

**Build:** complete document-06 matrix; read-only health check with actual database probe; no dev bypass in production; measured import and map timings; clean-data migration/restore rehearsal; reconcile deployment notes from actual evidence.

**Accept:** all mandatory V checks for the release pass with recorded evidence; no untested visual claims; database backup restores; photographs' recovery scope is stated explicitly; owner can distinguish code-ready from deployed-and-verified. No deployment is implied by this proposal task.

## 8. Follow-ups outside the required release

| Idea | Trigger and concrete direction |
|---|---|
| Structured questions | Unresolved questions repeatedly disappear in comments; define ownership and resolution before creating a table. |
| Background draft autosave | Explicit saving causes observed loss or abandonment; retain privacy/revision checks and add bounded autosave. |
| Structured strengths/concerns | Real reasoning becomes hard to compare; add only fields users need. |
| Participation management | Registered users no longer represent the desired scoring group; define exclusion semantics before changing averages. |
| Screen-space pin grouping | Distinct locations repeatedly obscure each other despite zoom/list access; add bounded grouping and measure it. |
| Photo-inclusive backup | Before treating saved photos as durable after server loss, add encrypted photo archives alongside database backups; measure storage and restore both. Current database-only backup cannot preserve images after an ad disappears. |
| Original-resolution photo storage | Family cannot assess condition from 800 px images; retain a bounded original plus thumbnail from allowed hosts, with explicit storage limits. |
| Cross-portal duplicate suggestions | Two real duplicate homes escape exact matching; show human-confirmed merge suggestions with reversible source moves, never auto-merge from similar photos. |
| Saved named searches | Family repeatedly rebuilds the same filter combinations; save canonical query strings, initially per person. |
| Explicit map viewport search | Named areas are insufficient; add a visible `Buscar en esta zona` action and one shared bounding-box predicate. |
| Browser extension / native share route | Bookmarklet setup causes observed repeated abandonment; design and verify platform-specific support before promising it. |
| Notification delivery | A supported workflow exists and members miss relevant changes; obtain explicit opt-in before designing delivery. |
| Offline app shell | Repeated loss of reading access is observed; cache only scoped safe data with an explicit expiration and sign-out policy. No offline conflict resolution by accident. |
| Automatic freshness | Members miss updates between visits; add a refresh prompt first, then bounded foreground polling only if needed. SSE remains later. |
| AI-assisted text | Family explicitly requests it later; clearly label suggestions and require author confirmation. Never infer personal opinions or silently replace source facts. |

Do not implement these follow-ups simply because they appear in this table.
