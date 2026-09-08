# 04 — Personal opinions and family decisions

Version 1.1. Revised with Ponytail and Design Lego. This replaces the earlier autosave/session protocol and multi-field review form.

The goal remains unchanged: show each person's position and reasoning without converting partial scores into false agreement.

## 1. Smallest complete opinion

Each person has one current published review per property. Published reviews are visible to authenticated members. A person can read others' reviews before publishing.

| Field | Values / limit | Required to publish? |
|---|---|---|
| Stance | `me_interesa`, `dudas`, `no_me_encaja` | Yes, except migrated legacy reviews |
| Reasoning | Plain text, maximum 1,500 characters | No |
| Personal blocker | Boolean; label `Hay un impedimento importante para mí` | Defaults to false; requires nonblank reasoning when true |
| Six existing dimension scores | Integer 1–5 or null | No |
| Assessment basis | `listing` or `visit` | Defaults to listing for a new review; legacy basis remains unknown |

A stance alone is valid. Do not add separate strengths arrays, concern arrays, stable concern IDs, or six explanation fields. The reasoning field can contain paragraphs or typed lists. Preserve their line breaks. Its helper reads: `Qué te gusta, qué te preocupa y qué necesitas comprobar.`

For a migrated review, preserve unknown basis until its author selects one, including after editing. Never infer a visit from legacy scores.

A personal blocker does not veto the property or change its shared stage. Its explanation appears beside the author's name. No negative stance requires a justification unless the author also selects the blocker.

<!-- ponytail: one reasoning field covers initial family assessment. Add structured reasons only after real reviews become difficult to compare. -->

## 2. Editor and component reuse

Extend the existing native-radio RatingForm. Use the shared native dialog for add, filters, and opinions. Phone presentation changes through CSS; it is not another drawer implementation.

Editor width: at most 640 px on desktop. On phone, use the available dynamic viewport height with safe-area padding. Keep the title and action footer visible around a scrolling body.

Reading order:

1. `¿Cómo lo ves?`: three labeled native radios, styled as stance controls.
2. `Por qué lo ves así`: one textarea, four rows initially, visible character count.
3. Optional personal-blocker checkbox.
4. `Valorar por aspectos`: native details disclosure containing the existing six score groups.
5. `Me baso en el anuncio / He visitado la propiedad`: native radios.

Footer: primary `Publicar opinión` or `Publicar cambios`; secondary `Guardar borrador`; text action `Cancelar`. Do not require draft saving before publishing.

Each score group has `1 Muy desfavorable`, `2 Desfavorable`, `3 Aceptable`, `4 Favorable`, `5 Muy favorable`, and `No lo sé`. Do not preselect 3. Null removes a previously published score only after publication. Keep 44 px targets; wrap the unknown choice onto another line when needed.

Dimension prompts remain:

| Dimension | Prompt |
|---|---|
| Ubicación | `¿Te encaja esta zona para tu vida diaria?` |
| Distribución | `¿Te sirve la distribución de los espacios?` |
| Luz y vistas | `¿Qué impresión te dan la luz y las vistas?` |
| Estado | `¿Te encaja el estado y el trabajo que parece necesitar?` |
| Relación calidad-precio | `¿Te parece adecuado el precio para lo que ofrece?` |
| Encaje familiar | `¿Te imaginas a la familia viviendo aquí?` |

Show `3 de 6 aspectos valorados`, not a completion bar. Opinion inputs describe the person's judgment, not verified listing facts.

## 3. Private drafts without background synchronization

Keep private server drafts, but save them only through `Guardar borrador`. There is no debounce, blur save, background autosave, or draft-session endpoint.

Opening the editor reads the author's saved draft and current publication. It does not write a database row. Prefer a saved draft over the publication. If its publication base is stale, retain it and require reconciliation before replacing a newer publication.

A draft stores the complete input, draft revision, and publication version it was based on. The private read returns both current versions. No draft means revision 0. New private draft saves may omit stance. Publication validates the required stance.

Maintain a best-effort session-storage recovery copy on input, scoped by authenticated user ID and property ID. It is not a confirmed server save. A recovered copy is offered explicitly and checked against current versions. It must not silently replace a newer saved draft.

| State | Display |
|---|---|
| Local edits | `Cambios sin guardar · solo en esta pestaña` |
| Explicit save pending | `Guardando borrador…` |
| Server save confirmed | `Borrador guardado · solo tú` |
| Save failed | `No se ha guardado. Tus cambios siguen aquí.` |
| Publication pending | `Publicando…` |
| Published | `Opinión publicada` |
| Conflict | `Hay una versión más reciente. Revisa ambas antes de continuar.` |

Guard storage access. If unavailable, warn that unsaved edits can be lost when the tab closes. Clear recovery data on successful publication, explicit discard, and detected account change. Private browser storage is not encrypted storage and does not protect against someone using the same unlocked browser profile.

Closing with unsaved edits offers keep editing, save draft, or discard local changes. Closing after a confirmed draft save needs no warning. Discarding the saved draft is a separate explicit action; it never withdraws a publication.

Server draft reads/writes authorize the current user. Never accept an author ID from the form as authority. Private responses use no-store semantics. Other members must not receive draft text, existence, timestamps, blocker state, or counts. Drafts never enter events, shared caches, URL parameters, or logs.

## 4. Publication, conflicts, and withdrawal

Use one transaction for each write. The complete contract is in [05 — Implementation](05-implementation.md).

A publish request carries complete input, expected published version, and expected draft revision. It does not need a prior draft-save request. Check both versions under the write transaction. A conflict preserves local input and changes nothing.

A changed publication updates the review, replaces that person's rating rows, increments the published version, clears the saved draft, increments its revision, and appends one content-free event. Null scores delete rows. Unchanged publication creates no public event or published-version change, but still clears the draft and advances its revision.

Keep a nullable-payload draft row after publication/discard. Its monotonic revision rejects delayed saves. This one revision replaces separate session IDs and closed-session records.

Repeated requests cannot duplicate a publication event. A retry with stale versions can return conflict; after reload, show the canonical publication. Do not promise replay of an old response after subsequent edits. No generic receipt ledger is needed.

The author can choose `Retirar mi opinión`. Confirm: `Dejará de mostrarse a la familia. Puedes volver a publicarla más adelante.`

Withdrawal checks both versions atomically. Increment the publication version, mark withdrawn, clear published authored fields and rating rows, and append a content-free event. Preserve an existing private draft; otherwise copy the withdrawn input privately. Advance the draft revision and its publication base. Return the new versions. A concurrent draft change rejects withdrawal instead of overwriting private work.

Redact withdrawn text/score/stance snapshots from legacy event payloads. Keep event ID, author, time, and generic event meaning. Separately published comments remain comments. A withdrawn review is excluded from all current aggregates. Republishing uses the same review identity and next version.

## 5. How each person's thoughts appear

On detail, show one compact card per published reviewer. Put the current person first, then sort by display name and user ID. Never sort people by positivity.

Each card contains name, stance, basis when known, reasoning, personal-blocker label if selected, score coverage, and publication/update time. Show the reasoning before any score matrix. `Responder` opens the discussion composer with an explicit link to that person's review.

Long reasoning collapses after six lines with `Leer opinión completa`. Do not truncate blocker explanations by default. Expanded content stays ordinary selectable text and preserves authored line breaks.

Under `Personas registradas sin opinión`, list known user rows without a publication. This is not the complete family roster. Do not add participation settings or an inactive-member subsystem now.

The current person sees their saved-draft shortcut. Other people never see it. A local unsaved recovery copy is shown only in that person's editor.

On list and map, show current stance and a compact summary: `3,7/5 · 3 personas · Parcial`. When no numeric scores exist, show `2 personas han opinado` or `Sin opiniones · Añade la tuya`. The summary links to the opinion section. Do not stack member avatars on the photo.

Comparison keeps a person selector: `Todas las personas`, then display names. Compare the same person's stance, reasoning, blocker, and optional scores across homes. Missing means `Sin opinión`, never zero. Formal question counters are not included.

## 6. Exact scoring and disagreement

Eligible reviews are published and not withdrawn. Count distinct authors. Do not infer the household size from user rows or a Cloudflare allowlist.

Show `R personas han opinado`. If legacy reviews have no stance, show `S sin postura registrada`. Do not show `R de N familiares` or claim that everyone agrees.

For each author with at least one non-null published score:

```text
personMean = sum(their dimension scores) / count(their dimension scores)
familyMean = sum(personMean) / count(scoring authors)
dimensionMean = sum(scores for that dimension) / count(authors scoring it)
```

Each person has equal weight. Each dimension has equal weight within one person's average. Never round intermediate values. Format the final number to one Spanish decimal. No scores means null.

One helper/query serves list sorting, filters, map previews, detail, and comparison. Remove the old row-weighted AVG from every consumer.

Show `Parcial` if any numeric contributor scored fewer than six dimensions. Always show numeric contributor count beside the number.

A dimension disagreement requires at least two scores and `max - min >= 2`. A stance disagreement requires both interest and no-fit. Show the concrete difference and link to its authors. A blocker count counts distinct authors, not flags or words. Never infer consensus from an average, silence, or a majority.

## 7. Discussion without a task system

Retain shared comments. Add one reply level, author-only editing/removal, and an optional reference to a review author. References must belong to the same property. Replying to a reply attaches to its root and identifies the intended person.

Plain text limit: 4,000 characters. Preserve line breaks. Display author, time, edited marker, and reply target. Deletion leaves `Comentario eliminado` so other replies survive. Also redact legacy event copies of removed text.

A comment composer has private per-tab recovery and explicit `Publicar comentario`. No typing indicators, automatic question detection, assignees, statuses, reactions, or uploads.

People can ask questions in ordinary comments and reply directly. Add structured question tracking only after unresolved questions repeatedly disappear in real use. A later specification must define ownership, resolution, and deletion behavior before implementation.

## 8. Worked cases and migration

| Case | Required result |
|---|---|
| A gives six 5s; B gives one 1 | `3,0`, two numeric contributors, partial coverage; both opinions remain readable |
| A publishes stance only | Opinion count increases; numeric mean does not |
| B selects unknown and publishes | Prior score row disappears; no zero |
| C saves a private blocker draft | Only C receives its content or existence |
| A edits privately | Others retain the current publication |
| A says no; B says interested | Show disagreement; shared stage stays unchanged |
| Another device saves before A publishes | Conflict; preserve A's text |
| A repeats a publish request | No duplicate event; stale retry can require reload |
| Delayed save follows unchanged publish | Draft revision rejects it |
| A withdraws while another device edits | Conflict or one atomic success; no lost private draft |
| A changes display name | Authorship retains its user ID |

Migrate each distinct rating author/property pair into a legacy review. Preserve all ratings. Set stance null, reasoning empty, blocker false, basis null, and publication time from the latest rating. Invent no opinion or visit history.

Existing comments remain roots. Do not infer replies or convert family chat into opinions. Release notes explain: `La media ahora da el mismo peso a cada persona`.

Server autosave, structured reasons, participant exclusion, and formal questions are deferred features, not partially implemented states.
