# 06 — Verification and release acceptance

Version 1.1. These checks apply to the reduced core during implementation. V27 is deferred. They have not been run against the proposed product because it is not implemented. Current baseline verification is recorded in [01 — Audit](01-audit.md).

## 1. Test environment and evidence

Use a disposable database and photo directory outside the family's working data. Start from the actual version-1 schema, then run migrations. Never use the real development database as a test fixture. Never invoke `ingest --reset` on it.

Create three fictional people (`Miembro A`, `Miembro B`, `Miembro C`, with example.com addresses) and five fictional properties:

| Fixture | Facts and purpose |
|---|---|
| Home A | Price 500000, area 100, rooms 3, bathrooms 2; exact coordinates in the test Barcelona bounds; 24 test photos; long title and description |
| Home B | Price 485000, area 88, rooms 3, bathrooms 1; approximate location; null lift/energy; two photos |
| Home C | No price, no coordinates, no photos; neutral missing-data case |
| Home D | Family stage preselected; two sources, one active and one removed |
| Home E | Family stage discarded; all sources removed; retained reviews/comments |

Use bundled/generated geometric image fixtures, not copied family captures. A test fixture's description states that it is fictional. Create zero-result, 23-result, and 100-result variants. Add a separate 500-property scenario only for a scale/performance investigation; it is not the normal household workload.

For each completed task, record commit, environment, commands, pass/fail, and material limitations. For visual work, attach screenshots or short recordings from both themes and identify viewport, browser, and whether the map's real tiles loaded. A screenshot with blank tiles is not proof of dark-map quality.

Run existing `pnpm test`, `pnpm lint`, TypeScript checks, and `pnpm build` for implemented code changes. Route and migration tests must exercise the boundaries that failed, not merely duplicate a helper's implementation. Use the existing toolchain; add an end-to-end dependency only if the authorized implementation workflow needs it and records why.

## 2. Scenario matrix

### V01 — Capture title and friendly outcomes

Send a valid, authenticated, form-encoded Housfy capture through the actual route with only `document.title` supplying its title. Expect one property with the expected title and a 303 success destination. Do not test only `extract()` in isolation.

Repeat with missing title, malformed JSON field, wrong capture token, and an oversized body. Expect typed, styled error handling for HTML callers and matching JSON outcome codes for API callers. No stack trace, token, or raw captured page may appear in the result URL.

### V02 — Refresh preserves family work

Create Home A with a source, existing ratings, comment, and stage. After PIP-09, add the published-review and private-draft cases. Manual overrides are tested only if PIP-15 is later approved. Capture the identical source again: property/source counts stay unchanged; last observation updates; no duplicate opinion, photo, or noise event appears.

Capture a changed price: exactly one price-change event; baseline price updates; existing family work remains unchanged. Omit a previously known field: retain its last known value and mark its stale presence. Exercise explicit-null evidence separately. Once overrides exist, verify they remain effective.

### V03 — Import failure and bounded photos

Return blocked HTML with HTTP 200, a network timeout, an unknown page, a real removal marker, a partial image set, and a photo that exceeds the stream cap without a Content-Length header.

Expect blocked/unreadable versus removed outcomes to differ. Preserve the URL in the add dialog after failure. Stop oversized streams while reading. End within the total deadline. Successful facts remain available when some photos fail, and the result explains the partial photo count. A retry must not create a second home.

### V04 — Redirect and URL boundaries

Test HTTPS allowed host, HTTP, an alternate port, URL credentials, deceptive suffix/subdomain, redirect to an unapproved host, redirect loop, and more than three hops. Verify the forbidden destination receives no request. Repeat for image allowlists. Malformed form data yields validation, not an unhandled exception.

### V05 — Availability streaks

With injected time and fetch responses, run: 403→404, timeout→404, 404→403→404, and 404→404. Only the final sequence confirms removal by HTTP status. A separately tested explicit removal marker may confirm directly.

Keep the family workflow stage unchanged in every sequence. Successful listing capture resets the gone streak and restores source-active status. The UI distinguishes last attempt from last successful observation.

### V06 — Source aggregation and event wording

Home D remains property-active with one active and one removed source. With active source stale, show stale freshness. With no active and one unknown source, show unknown. Only all-confirmed-removed yields property removal.

Render unknown, removed, active-again, missing legacy payload, and price-change events in global and detail feeds. Their wording must agree and contain no `undefined`, raw object string, or false removal claim.

### V07 — Filter parity and truthful controls

Apply combined price, rooms, bathroom, text, condition, area, stage, and archive filters. Compare IDs from the list query, map data query, and marker API: the same qualifying set precedes coordinate exclusion. Verify map count explains excluded locations.

Test malformed enum/numeric values, reverse price bounds, accent-insensitive text, clearing one constraint, clearing all, and `etapa=descartada`. Every displayed chip and count must represent the actual submitted predicate. Personal opinion filters are tested after PIP-10.

### V08 — Return state and shared budget

Filter and scroll the list, open detail, then use its return link and browser Back. Restore query, selected view, clicked item, and scroll. Repeat from the map and comparison. Change a filter while selection exists; comparison choices stay selected.

Try malicious `volver` values including external URLs, `//`, encoded paths, and backslashes. They must fall back safely.

Set max-only budget, min-only budget, both, invalid reverse bounds, then clear. Above maximum is a warning with amount; below minimum is neutral; no budget produces no budget indicators. Confirm the setting is shared and version-checked.

### V09 — Comparison without identifiers

Select Home A, then B, through visible controls. Reach comparison with two columns. Add C and D, then attempt E. Expect an explanatory limit message and no eviction. Filter selected homes out of the list; tray retains them. Reload and open the shared canonical URL in another authenticated session; preserve ID order.

Verify all-null rows, null versus known values, equal numeric values with different formatting, removed IDs, repeated IDs, and malformed IDs. On phone, retain all selected homes while switching the visible pair. No interaction asks a person to edit a URL.

### V10 — Detail reading and gallery

At 375 px, reach price, summary, photos, family overview, and facts without scrolling through the complete six-score editor. Expand/collapse description while preserving the current reading position as far as normal flow allows.

Open the gallery from photo 3; counter starts at 3. Navigate through keyboard and touch, handle one failed image, close with Escape, and restore focus to the initiating photo. Images reserve their layout space. Confirm that hidden gallery duplicates do not request all full-size images.

### V11 — Mutation feedback and recovery

For each mutation form, test pending, success, field validation, transport failure, unauthorized session, and version conflict. Preserve text/selection after failures. Rapidly submit twice; expect no duplicate record/event. A stale versioned retry can return conflict. Unchanged publication creates no public event; its private draft revision still advances.

Dialog close returns focus. A failed save does not close the editor or announce success. Network timeouts do not leave buttons permanently disabled.

### V12 — Private drafts and publication

A writes local input and then explicitly saves a private draft. B inspects relevant pages and action responses: A's draft text, existence, blocker state, and timestamp are absent. Draft saves do not alter global unread counts.

A publishes stance only: it becomes visible to B and counts toward participation, without a numeric score. A edits that review privately: B still sees the prior publication. A publishes replacement: metadata and ratings update atomically, with one public event.

A withdraws the publication: B sees no current opinion and no withdrawn text/scores in event payloads. A retains either the pre-existing private draft or a new private copy as specified. A stale device cannot restore the withdrawn version. Republishing uses the next version and correctly restores counts.

### V13 — Scoring and honest disagreement

A gives six 5s, B one 1: family mean is 3.0 before formatting; displayed `3,0`; two numeric contributors and partial coverage. A stance-only C does not change numeric mean but does change participation/stance counts.

Clear B's score through `No lo sé` and publish: row removed, not converted to zero. Test rounding only at presentation. Assert list, sort/filter, detail, map, and comparison use the same raw aggregate.

Verify dimension disagreement threshold at 1 versus 2 points. Verify interested/no-fit stance disagreement. A high average or silent registered user must never produce a whole-family agreement statement. Counts refer only to published authors.

After the PIP-09/PIP-10 cutover, verify that no legacy rating action can bypass publication, versions, or required review metadata.

### V14 — Concurrent explicit saves and reviews

Open A's editor on two devices. Device 1 saves or publishes; device 2 submits old versions. Return conflict and preserve device 2 text. Offer deliberate reload/reconciliation, not silent overwrite.

Delay an explicit draft-save request until after publication. Reject its stale revision. Repeat after unchanged publication and discard: the monotonic draft revision still rejects it without a session ID.

Start withdrawal while the other device changes the draft. Reject stale expectations without clearing the publication. A valid retry preserves the saved draft or creates a private copy and advances both versions.

Repeat publication with old versions: no duplicate event; conflict is allowed. Retry comment creation with the same UUID: at most one comment. A changed body or another author cannot reuse that ID to overwrite content. The server always determines authorship.

### V15 — Stable map lifecycle

Instrument map construction/destruction counts in the test harness. Open the map, pan to a chosen position, select a property, and switch theme ten times. Center/zoom and selection remain; no additional map instance is created while the surface stays mounted.

Change filters with the selected property still present, then absent. Preserve camera in both; clear preview only in the second case. Explicit area selection and `Ver todos` may refit. Repeated mount/unmount leaves one set of active listeners and no leaked map canvas.

### V16 — Token and contrast checks

Calculate every intended foreground/background pair in both themes: text, muted, placeholder, primary action in all enabled states, status chips, selection controls, focus, pin, popup, and map labels/halo. Use unrounded ratios for acceptance. For translucent/photo-overlay surfaces, calculate the composed background and verify against rendered examples.

No component uses a raw brand/status color or default sky/amber/violet semantic utility. Verify direct canvas text against both retained gradient endpoints. Decorative dividers may be quieter than controls. Disabled content is labeled as disabled rather than made to resemble missing content.

### V17 — Responsive and keyboard checks

Run the viewport matrix below. The page itself never scrolls sideways. Any deliberate internal comparison/table overflow is bounded and labeled. Inspect text at 200% zoom. Long property titles, display names, and Spanish labels do not cover adjacent controls.

Navigate with Tab/Shift+Tab. Every action has a visible focus indication and meaningful accessible name. Dialogs trap/restore focus. Rating groups are labeled and support arrow-key selection. Inputs retain visible labels. Bottom trays and the onscreen keyboard do not cover the primary action.

### V18 — Dark-map visual checks

At Barcelona zooms 11.5, 13.5, and 16, capture both themes. Check parks, sea, buildings, minor/major roads, railways, street names, place labels, controls, attribution, area labels, selected area, selected pin, approximate circle, and popup/phone preview.

Style-coverage tests must account for all 55 baseline layers. Inspect actual pixels for pale road defaults and white halos at night. A style change that adds an unmapped layer fails the fixture test. Preserve source attribution.

### V19 — Motion and theme resilience

Record add-dialog opening, comparison tray appearance, theme change with and without a map, and explicit map framing. Verify timings against document 03 and inspect for flashes, layout movement, or blank map frames.

Enable reduced motion and repeat: no spatial effects, card zoom, pin scale, circular wipe, or animated camera movement. Test unsupported View Transition API, rapid toggle clicks, backgrounding during a transition, denied storage, system-theme change, and cross-tab preferences. The latest requested theme wins; no stuck wipe flag.

### V20 — Map failure and accessibility

Fail tile requests, fail only area data, lose WebGL context, and provide no coordinates. The user retains a route to the list and can retry without losing filters. Overlay failure does not remove the basemap.

Focus a pin using keyboard, open/close its preview, and select for comparison. Test identical-coordinate pins through the count/chooser. For distinct overlapping coordinates, test focused-pin stacking, zoom, and the list fallback; do not claim automatic collision avoidance. Phone preview, controls, and attribution stay above the bottom safe area.

### V21 — Simple discussion and reply context

A comments; B replies. A removes the root: B's reply remains below a tombstone. B cannot edit A's content. Legacy event snapshots cannot reveal removed text. Replies remain one level deep.

Reply to A's review with an explicit author reference. Cross-property references fail. Ask a question through an ordinary comment and answer through a reply. No assignment, resolution state, inferred answer, or question counter appears.

### V22 — Shared stage safety

A publishes `No me encaja`: shared stage remains unchanged. B changes stage; A's stale stage submission is rejected. A can reload and explicitly choose another stage. No timed Undo is required.

A source refresh does not advance stage_version or erase a stage decision. `Visita prevista` does not imply a stored appointment. Scheduled visits/tasks require a separate PIP-12 specification after its trigger.

### V23 — Authorization and output safety

Verify authentication remains required on properties, private photos, imports, private editor loading/saving, and public mutation actions. Health output contains no private data. Production rejects the development bypass regardless of client-supplied headers.

Try another user's IDs, malformed record IDs, cross-property references, HTML/script-like comment text, unauthorized draft access, and forged expected versions. Render user text safely, validate references, and perform identity checks server-side. Capture tokens and private drafts never enter event payloads or URLs.

Submit `/api/import` from a foreign/null origin with an otherwise valid session: reject it. Submit `/api/capture` with a valid owned token and null Origin: accept that deliberate capture path. Invalid tokens remain rejected.

### V24 — Migration and recovery

Run each migration from its actual predecessor on fixtures with ratings, comments, existing unavailable stages, legacy event bodies, and missing photo URLs. Verify repeat startup is idempotent. Inject a failure before commit; version and data remain at the previous valid state.

Legacy scores remain published without invented stance/text. Restore a backup into a separate directory and run integrity checks. Record whether photos were included; a database-only restore must not be presented as complete photo recovery.

### V25 — Explicit activity reads

Prefetch or open activity: no read records change. Click the explicit button for loaded unread IDs: only those events become read. Older unloaded pages and a new event inserted after rendering remain unread.

Draft saves and no-op publications create no public events. Own events do not increment the owner's badge. Repeated mark-read requests are idempotent through the composite key.

Click `Actualizar` to load new events. Verify no interval, focus polling, visibility timer, or updates endpoint was added. Event links open the correct property/opinion/comment. Refresh does not delete a saved draft.

### V26 — Onboarding and person identity

Rename A's display name: ID, review ownership, and history remain intact. B cannot edit A's name. Opinion counts refer to actual published authors; no unconfigured family-size denominator appears.

Test desktop and iPhone Safari bookmarklet instructions on actual devices before claiming support. Copy failure exposes manual selection. Help describes all six portals' supported paths and never equates copying with successful installation.

### V27 — Effective facts and overrides · Deferred

Run only after PIP-15 is approved and its specification is completed. Do not create override code or fixtures for the core release.

Set a typed override with a reason. Every list/filter/map/compare/detail consumer uses that effective value. Refresh the source with another value: source baseline changes, override remains, and the user can see both.

Set a null override, remove it, and restore the source value. Null override is distinct from no override. Price and coordinates are not editable through the override endpoint. Every change has actor/version evidence.

## 3. Visual and device matrix

| Surface | Required widths / conditions |
|---|---|
| List, detail, opinion editor, help, activity | 320, 375, 414, 768, 1024, 1280, 1440 CSS px; both themes |
| Full map / map preview | 375×812, 414×896, 768×1024, 1280×800, 1440×900; both themes |
| Comparison | Two and four selected properties at 320, 375, 768, 1280 px |
| Inputs and dialogs | Phone keyboard open; 200% text/zoom; long validation messages |
| Theme/motion | System/day/night; reduced motion; no View Transition API; storage denied |
| Accessibility | Keyboard-only desktop; VoiceOver on iPhone Safari; focus at sticky boundaries |
| Browser engines | Current installed Safari and Chromium; record actual versions rather than assuming parity |

Use stable fixture IDs, times, image assets, and map camera for repeatable visual checks. Keep dynamic live-tile checks separate from deterministic fixture comparisons. Mask names/addresses if screenshots of real data are ever shared outside the private workspace.

## 4. Performance and recovery evidence

Record warm and cold list/detail loads separately. Record a local interaction trace separately from a portal import trace. Include network conditions and device. Check image requests, layout shifts, long tasks, map construction count, listener cleanup, and query count.

Do not add broad caches before measuring. Private data must not enter a cross-user cache. Avoid prefetching every full image or every detail page merely to improve a synthetic timing.

For release verification, record these outcomes without invented numbers:

| Check | Evidence required |
|---|---|
| Core queries | Query plan and result parity on the 23/100-property fixtures |
| Import | Actual elapsed time, deadline behavior, photo successes/failures |
| Map update | Instance count, camera before/after, theme/filter recording |
| Local interaction | Input-to-render trace on the reference phone |
| Images | Stable dimensions; only needed viewer images loaded |
| Recovery | Restored database integrity, counts, photo-recovery scope |
| Deployment | Actual build, container health, authentication, and phone access; not a copied status paragraph |

## 5. Release gates

Release A requires PIP-01–06 and PIP-08. Run its applicable scenarios, including dark-map visuals and authentication regressions. Release B adds PIP-07, PIP-09–11, PIP-13, and PIP-14. Run all core scenarios V01–V26 across the two releases. PIP-16 supplies verification for both, not another feature release. PIP-12, PIP-15, and V27 remain deferred; they cannot block or silently enter the core.

No release passes with:

- Private drafts exposed to another member.
- An unknown check rendered as confirmed removal.
- Personal opinion changing shared stage without an explicit action.
- Lost text after a failed save.
- Different score/filter semantics across screens.
- An inaccessible comparison flow that requires typed IDs.
- A map that resets on every theme change.
- A migration that discards existing reviews/comments or resets production data.

## 6. Short family validation session

After technical checks, ask consenting family members to perform these tasks using fictional properties: add a listing; find a home within a stated range; compare two; publish a stance with reasoning; find another person's reason; ask and answer through comments; return to the previous search. Observe whether any real need for structured questions or scheduling emerges; do not assume it.

Observe without coaching first. Record whether the task finishes, labels that caused confusion, unexpected navigation, and whether the person can distinguish their own opinion from the family's stage. Ask what information is missing before proposing more features.

Use those observations to revise copy and hierarchy. They validate the proposed product model; this source review cannot substitute for them.
