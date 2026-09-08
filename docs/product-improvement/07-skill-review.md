# 07 — Ponytail and Design Lego re-review

2026-09-07 · Proposal version 1.1 · Source baseline `3002a67`

This is a review of the improvement proposal, not a new rendered audit of the application. The proposal files were revised. Application code and dependencies were not changed.

## Verdict

Keep the product direction. Reduce the machinery.

Version 1.0 correctly identified import defects, incomplete map theming, confusing comparison entry, weak information hierarchy, and incomplete personal assessment. Its implementation scope was too large for the evidence available.

The inspected development data contained 23 properties and no ratings or comments. That supports testing a simple opinion flow. It does not establish a need for task management, visit scheduling, formal questions, participant administration, or continuous synchronization.

Ponytail was applied at its default **full** level. Design Lego was applied to identity, reusable parts, component selection, and motion restraint. Its build/install steps were not executed because this is a proposal review.

## What the two skills changed

| Review finding | Version 1.0 | Revised decision | Where |
|---|---|---|---|
| Speculative workflow expansion | Tasks, visits, assignments, questions, and overrides became required work | Defer them behind observed-use triggers; keep comments and shared stages | PIP-11, PIP-12, PIP-15 |
| Too much initial opinion structure | Strength/concern arrays, per-dimension explanations, visit references | Stance, one reasoning field, optional personal blocker, optional existing scores | PIP-09, PIP-10 |
| Draft protocol was too complex | Autosave, session IDs, begin/close operations, recovery races | Explicit private Save draft, one monotonic draft revision, atomic publication | PIP-09 |
| Generic infrastructure before need | Global mutation receipts and response-replay contracts | Record versions, native uniqueness, transactions, clear stale-retry behavior | PIP-01, PIP-08, PIP-09 |
| Read attention was guessed | Visibility thresholds, timers, edit grouping, polling | Explicit read action for loaded IDs and manual refresh | PIP-13 |
| Existing components lacked an assembly plan | New primitive/module families were prescribed | Reuse named source components; add one shared native dialog | PIP-03, PIP-08 |
| Identity changes lacked evidence | Remove the gradient; add another radius and extra motion variants | Keep the identity, fix semantic color roles, reduce motion variants | PIP-03 |
| A simple map problem acquired a collision system | Group all intersecting screen-space pin rectangles | Group identical coordinates; keep keyboard, zoom, and list access | PIP-04 |
| Dependencies delayed useful fixes | Activity waited for visits; help waited for new family workflows | Make those tasks depend only on their actual technical prerequisites | PIP-13, PIP-14 |
| Family membership was assumed | Participation flags and a complete-looking denominator | Count actual published authors; do not claim a complete household roster | PIP-10 |

The initial plan proposed nine new tables. The revised core needs three: reviews, private drafts, and explicit event reads. Record versions remain because they protect user data. This is a scope reduction, not permission to remove validation or safety.

## Keep these improvements

The skills do not justify cutting requested outcomes:

- Complete dark-map styling, including roads, labels, halos, and controls.
- A stable map instance during theme/filter changes.
- Readable colors, visible focus, comfortable targets, and reduced-motion support.
- Clear listing/detail hierarchy and responsive comparison.
- Consistent filters and return context.
- Each person's stance and reasoning beside their name.
- Private drafts, explicit publication, and author-controlled withdrawal.
- Equal-person scores, missing-value handling, and visible disagreement.
- Useful error states and preservation of input after failure.
- Safe imports, truthful availability, authentication, and non-destructive migration.

The full 55-layer map manifest stays. This is justified by the user's explicit dark-map request and measured incomplete coverage. Replacing it with a general “make the map darker” instruction would not be precise enough.

## Design Lego: identity and component decisions

### Identity

Keep the existing root DESIGN.md as the identity source. Update it when visual implementation begins, not during this proposal review.

Preserve Plus Jakarta Sans, warm light surfaces, dark surfaces, subtle background gradients, the 14 px identity radius, red actions, and yellow selection. Do not import another brand's DESIGN.md or add a second font.

Separate ornamental red from filled-action red to correct contrast. Keep the theme wipe as the existing distinctive animation. Skip it when reduced motion or map rendering requires the defined fallback. Do not add a different showpiece to each screen.

There is no unresolved visual direction that requires gallery browsing. This is an existing application, not a greenfield landing page.

### Component bill of materials

| Need | First choice | Reuse / implementation instruction | Registry decision |
|---|---|---|---|
| Status and stage | Existing Chip, StageBadge, BudgetChip | Replace hard-coded semantic colors in `chip.tsx`; keep one implementation | No registry badge |
| Rating and stance | Native fieldset/radio controls | Extend RatingForm; add labeled null choice; preserve keyboard semantics | No custom radio package |
| Reasoning and comments | Native textarea | Visible label, limits, errors, authored line breaks | No rich-text editor |
| Add/filter/opinion modal | Native dialog | One wrapper with responsive CSS, cancellation guard, focus restoration | One registry Dialog only if target-browser tests expose a native gap |
| Phone sheet | The same dialog | Full-height CSS presentation and safe-area footer; no drag gesture | No separate Sheet/Drawer package |
| Optional score details | Native details/summary | Progressive disclosure, no height animation | No Accordion package |
| Comparison | Existing route plus native table/paired rows | Add selection and accessible headers; no table framework | No Data Table package |
| Gallery | Native dialog plus existing photo route | Index, keyboard controls, current/neighbor loading | No carousel dependency |
| Navigation | Existing nav components and links | Fix breakpoints, active state, targets, and labels | No replacement navbar |
| Map | Installed MapLibre and existing component | Stable lifecycle, complete paint mapping, exact-coordinate chooser | No map-provider migration |
| Icons and feedback | Existing inline SVG and status text | Reuse style and accessible names | No new icon/animation pack |

The [live shadcn component index](https://ui.shadcn.com/r/index.json) was fetched during this review. It lists Dialog, Sheet, Button, Radio Group, Table, and Textarea candidates with Base, Aria, and Radix documentation routes. Availability is not proof that they are needed or compatible.

No registry component was installed. If native Dialog fails the actual browser/keyboard checks, evaluate a single documented Dialog candidate. Inspect dependencies, license, styles, and accessibility before installation. Do not accept an installer that replaces the identity or adds unrelated components. Record the exact selected version at that time.

No motion gallery or decorative registry is needed for this pass. The component budget is zero new packages by default, not five components to fill.

### Polish checks

Reject a revision that:

- Replaces the identity with default registry colors or a different font.
- Adds decorative cards, large gradients, or promotional copy to a working property tool.
- Adds repeated entrance animations or a second showpiece.
- Makes reasons harder to read while making scores more prominent.
- Adds another label, badge, or action without identifying its user decision.
- Uses a custom interaction where the native control already passes the checks.

These are review constraints. They are not claims about newly observed screenshots.

## Revised delivery sequence

Keep the PIP identifiers so audit references remain stable. There are 13 core change packages, one cross-cutting verification package, and two deferred packages.

| Increment | Outcome | Work |
|---|---|---|
| A — Trust and navigation | Correct intake/availability, clear feedback, accessible identity, stable dark map, filters, comparison | PIP-01–06 and PIP-08 |
| B — Family assessment | Readable detail, personal reasoning, private publication, simple replies, usable activity, accurate help | PIP-07, PIP-09–11, PIP-13, PIP-14 |
| Verification at each increment | Behavior, visuals, migration, privacy, and recovery evidence | PIP-16, scoped to that increment |
| Later only on evidence | Scheduling/tasks and manual overrides | PIP-12, PIP-15 |

This sequence does not prevent early delivery of detail or feedback fixes once their dependencies exist. It prevents optional workflow systems from blocking them.

The implementation task register remains precise for the core. Deferred ideas are not implementation-ready promises. Their trigger must be met and their specification completed before coding.

## Tradeoffs that must remain visible

**Explicit draft saving adds one optional action.** People can publish directly without saving first. Saved drafts work across devices. Unsaved local edits are not promised to survive tab closure. Add background autosave only after explicit saving causes observed loss or abandonment.

**One reasoning field is easier to start.** It does not produce structured pros/cons automatically. Preserve the person's wording. Add structure only if real reviews become difficult to compare.

**Explicit read marking requires a click.** It accurately marks loaded event IDs without guessing attention. The feed is not continuously live. Add freshness automation only after observed need.

**Exact-coordinate grouping does not solve every visual collision.** Keyboard access, zoom, and list access remain available. Escalate only if different-location overlaps repeatedly prevent selection.

**No household denominator means less apparent completeness.** That is intentional. Registered user rows are not proof of the complete family or its active decision group.

## Instructions for the implementing AI

1. Read the revised package index, then documents 02–06 for the selected core task.
2. Verify the current source against baseline findings before editing.
3. Use the named existing component or native platform control first.
4. Do not recreate the removed autosave/session/receipt/question/task systems.
5. Keep draft privacy, transactional writes, and version checks.
6. Run applicable existing tests and the smallest added checks covering changed behavior.
7. Complete visual/device checks before claiming the design or animations are verified.
8. Record any necessary deviation and its evidence.

The scenario list is an acceptance catalog, not a demand for a new testing framework or one fixture file per scenario. Use the installed test tools and share fictional fixtures where practical.

## Review evidence and limits

Read in full: both user-supplied skills, the proposal, root DESIGN.md, package dependencies, and plan v3. Relevant source components, schema, and query/helper locations were checked again. Registry metadata was fetched live into disposable temporary output; no reusable registry/gallery cache was added to the project.

The existing proposal checker is retained. It checks links, identifiers, task dependencies, selected color pairs, and available map-style coverage. It does not prove that the product is usable.

Restoring the gradient exposed a proposed muted-text pair at 4.48:1 against its light-theme endpoint. The revised token is `#68645c`, which gives 5.12:1 there. The checker now covers both gradient endpoints. Pass/fail uses unrounded values.

There are still no new rendered screenshots or measured animation traces. The earlier in-app browser setup limitation remains recorded. This pass reviews specification quality and implementation scope; it does not claim that the UI now passes visual inspection.

**Skill sources:** user-supplied Ponytail 4.7.0, full intensity, and user-supplied design-lego SKILL.md. No other design skill or implementation handoff was required for this review.
