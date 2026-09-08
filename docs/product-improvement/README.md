# CasaEnComú — product improvement proposal

Version 1.1 · 2026-09-07 · Baseline commit `3002a67`

This is a proposed product specification. It describes a future release, not the current application. The application code was not changed for this proposal. Implementation starts when the owner requests it. Version 1.1 incorporates the requested Ponytail and Design Lego re-review. The revised core replaces the earlier autosave/session protocol and required task/visit workflows. Do not treat deferred ideas as release requirements.

## Product direction

CasaEnComú should help the family answer four questions about each home:

1. What do we know about this home, and how current is that information?
2. What does each person think, and why?
3. Where do we agree, disagree, or need more information?
4. What is the next action, and who will do it?

The application already stores listings effectively. The proposed release makes assessment and shared decisions equally clear. It retains the Spanish interface, property photography, warm light theme, dark theme, red/yellow identity, and simple self-hosted architecture.

## Read this package in order

Start with [07 — Ponytail and Design Lego re-review](07-skill-review.md) for the changes and tradeoffs. Documents 02–06 now contain the revised contracts; there is no separate override layer to reconcile.

| Document | Purpose |
|---|---|
| [01 — Audit](01-audit.md) | Evidence, current defects, product gaps, and limits of the review |
| [02 — Experience](02-experience.md) | Navigation, screen layouts, content order, and complete user flows |
| [03 — Design, motion, and map](03-design-motion-map.md) | Exact visual tokens, responsive rules, interaction timing, and map behavior |
| [04 — Family reviews](04-family-reviews.md) | Personal opinions, private drafts, shared reviews, scoring, and discussion rules |
| [05 — Implementation](05-implementation.md) | Data changes, module contracts, ordered work packages, and acceptance criteria |
| [06 — Validation](06-validation.md) | Core acceptance scenarios, one deferred outline, and release checks |
| [07 — Skill re-review](07-skill-review.md) | Scope cuts, component reuse, skill decisions, and implementation guardrails |

Paths in these documents are relative to the repository root unless they are Markdown links. `PIP-xx` identifiers are proposal tasks, not existing issue numbers. `Fxx` identifiers refer to findings in the audit. `Vxx` identifiers refer to validation scenarios.

Check this package with `node docs/product-improvement/verify-proposal.mjs`. The [read-only checker](verify-proposal.mjs) verifies local links, identifiers, task dependency cycles and deferred-work gates, 56 solid foreground/background pairs, and the layer manifest when the locally cached public map style exists. It does not test the application or certify accessibility.

## Evidence and confidence

The review inspected application routes, components, SQL, authentication, extraction, background checks, deployment scripts, project decisions, and the local development database. The current public map style and relevant official accessibility guidance were also inspected.

The existing development checkout had 23 properties, 621 photos, 19 properties with coordinates, 22 descriptions, five user rows, and no ratings or comments. User rows do not establish the complete family membership. Names, emails, property addresses, and private captures are not reproduced here.

Verification on the baseline: 60 tests passed, three tests skipped, lint passed, and TypeScript passed. The production build was not repeated. The three skipped tests require uncommitted raw portal fixtures.

**Rendered visual review remains incomplete.** The in-app browser runtime failed during setup because its module import was rejected. There are no fresh screenshots, browser timings, touch-device results, or accessibility-tree observations in this proposal. Layout and interaction findings identify code behavior or risks; they do not claim observed frame rates or measured user frustration. The visual and device checks in document 06 are mandatory implementation gates.

## Decisions specified for the proposed release

| ID | Decision | Reason |
|---|---|---|
| D01 | Preserve Plus Jakarta Sans and the red/yellow identity; refine semantic roles and contrast. | The existing design is a useful starting point. |
| D02 | Keep Next.js, SQLite, server rendering, and MapLibre 5. | The requested improvements do not require a platform rewrite. |
| D03 | A personal review has private drafts and an explicit `Publicar opinión` action. | People can form and edit their thoughts before sharing them. |
| D04 | Published reviews are visible to all authenticated family members. | This is a shared assessment tool. No hidden voting round is proposed. |
| D05 | A family score gives equal weight to each person with published scores. | Filling more dimensions must not grant a person more influence. |
| D06 | A personal stance and a shared property stage are separate. | One person's concern must not silently change the family decision. |
| D07 | Availability belongs to listing sources; the family controls workflow stages. | A removed advertisement must not erase the family's decision history. |
| D08 | Filters, selection, and return navigation retain their context. | Moving between list, map, detail, and comparison should preserve the task. |
| D09 | Keep the map instance alive during theme and filter changes. | Preserve the camera, selection, loaded tiles, and interaction continuity. |
| D10 | Show uncertainty explicitly. | Missing facts, incomplete opinions, and failed checks must not appear as negative facts. |
| D11 | Reuse existing components and native controls before registry components. | The app already has a coherent identity and working controls. |
| D12 | Keep private drafts with explicit saving; defer speculative workflow systems. | Preserve the requested outcomes with fewer states and tables. |

D03–D04 are the recommended default. The owner was asked about visibility while the proposal was prepared; no answer had arrived at publication. If the owner selects a different model, revise document 04 and its acceptance tests before implementation. There is no unresolved design choice preventing implementation of this default.

## Release scope and sequence

| Release | Required outcome | Work packages |
|---|---|---|
| A — Reliable core | Correct imports/availability, clear error feedback, accessible identity, stable dark map, context preservation, comparison | PIP-01–06 and PIP-08 |
| B — Family assessment | Clear detail, private drafts and published opinions, readable reasoning, simple replies, explicit activity, accurate help | PIP-07, PIP-09–11, PIP-13–14 |
| Verification for each release | Proportionate behavior, privacy, visual, migration, and recovery checks | PIP-16 |
| Deferred | Scheduled visits/tasks and manual overrides only after demonstrated need | PIP-12, PIP-15 |

The 16 stable identifiers comprise 13 core change packages, one verification package, and two deferred packages. Only three new tables are required: reviews, private drafts, and explicit event reads.

Follow the technical dependencies in document 05. A release is complete only when its applicable acceptance checks pass. PIP-16 never waits for deferred work. Do not ship a partially implemented private-public boundary.

## Outcomes to validate

These are proposed acceptance targets, not measured results:

- A person can identify price, location, source freshness, their own stance, and published-opinion count without opening multiple screens.
- A person can select two properties and reach comparison without typing an identifier or URL.
- A person can record an initial stance without completing six scores.
- A person can explain a concern without it disappearing into an average.
- Changing the theme leaves the map camera and selected property unchanged.
- Returning from a property restores the previous results, filters, and scroll position.
- A rejected save preserves the draft and states what to do next.
- A temporary portal failure never appears as a confirmed removal.
- Both themes pass the defined contrast and keyboard checks.

Use moderated checks with consenting family members after implementation. Record task completion, wrong turns, and unclear labels. Do not invent adoption or time-saving metrics.

## Deliberate boundaries

There is no proposed LLM scoring, automatic summary of someone's feelings, inferred listing fact, market-price judgment, mortgage advice, or ranking by opaque criteria. Native apps, push notifications, map-provider migration, realtime infrastructure, queues, and fuzzy deduplication remain optional until a measured need exists. Document 05 records the triggers.

No production records should be reset during implementation. Do not import private conversations as opinions. Use clearly fictional local test cases to exercise family interactions. Keep backups and migration recovery separate from normal product UI.

## Instructions for an implementing AI

1. Read this package, `CLAUDE.md`, `DESIGN.md`, and the latest `docs/WORKPLAN.md`.
2. Check the actual source and migration version. This proposal is anchored to `3002a67`; later code may have resolved findings.
3. Select the next eligible PIP task. Create the normal issue branch/worktree when that workflow is authorized. Do not invent issue numbers.
4. Implement only that core task and its declared prerequisites. PIP-12 and PIP-15 require new evidence and approval. Shared helpers must replace the old paths in every listed consumer.
5. Add meaningful behavior tests for the task. Run the baseline checks and the relevant V scenarios.
6. Record evidence, remaining limitations, and any deviation from this specification. Do not mark visual checks passed from source inspection alone.
7. Update `DESIGN.md` when PIP-03 lands and product documentation when each release lands. This proposal does not silently override existing design rules before that change.

## Proposal review checklist

- [x] Findings distinguish evidence from hypotheses.
- [x] Current and proposed behavior are separated.
- [x] Tokens, layout, motion, scoring, persistence, and ownership rules are explicit.
- [x] Data migration and legacy opinions are addressed.
- [x] Error, empty, partial, concurrency, and reduced-motion states are specified.
- [x] Core tasks have dependencies and acceptance conditions; deferred ideas have explicit triggers.
- [x] Ponytail and Design Lego re-review is integrated into the actual specification.
- [ ] Rendered screenshots and device checks completed after implementation.
