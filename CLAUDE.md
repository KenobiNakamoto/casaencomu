# CasaEnComú

## Communication — ASD-STE100

Write to Kenobi in **ASD-STE100 Simplified Technical English**: one idea per sentence, active
voice, each approved word in its approved meaning only, no synonyms for the same thing, no idioms
or metaphors, procedural sentences of 20 words or fewer and descriptive sentences of 25 or fewer.

This applies to prose addressed to Kenobi. It does not apply to code, to commit messages, or to
UI copy (which is Spanish).

## What this is

A private, Spanish-first web app for one family's home search in Barcelona. Members add listings
(Idealista, Fotocasa, Habitaclia and three smaller portals) with a bookmarklet or a pasted URL;
the app keeps facts and photos, deduplicates, maps, compares, lets each member rate and comment,
and rechecks price and availability every 48 h. It runs on the MacBook Air inside the Colima VM
that already hosts umbrelOS, and is reached through Cloudflare Tunnel + Access.

**State (2026-09-08): Release A is complete, Kenobi's first feedback round is merged, and the map's geography is no longer Barcelona-only.** `main` is green — 356 tests (3 skipped), lint, types and build clean. All seven Release A packages are merged (PIP-01 to PIP-06 and PIP-08), plus the preview authentication, four follow-up fixes, issue #88 (the add control back as a field growing out of the `+`, a two-state theme with the circular reveal running again, a 2040 px page with two cards beside a wider map), issue #90 (map areas drawn the way a portal draws them) and issue #92 — **zones at six administrative ranks, built for any country from one config file** (`scripts/areas/`, and `scripts/areas/README.md` is the procedure for adding a country). Release B — six packages — has not been started; the largest gap it closes is the family score, which today averages rating rows rather than people (F21). The dev database holds 23 real listings, ingested from the ads themselves with `scripts/ingest.mts`; nothing is hand-written. Nothing is deployed to a domain — M1 waits on Kenobi's #1, #2 and #5, then #18 → #19 → #21 → #20 — and the Tailscale preview on the Air is redeployed with `./deploy.sh` after each round. Full state, with what is not done: `docs/STATUS.md`.

## Read in this order

1. `README.md` — what the repo holds and where everything is. One page.
2. `docs/PLAN.md` — plan v3 (ponytail): what is built and what is deliberately cut.
3. `docs/STATUS.md` — **what is actually done, what is not, and what is blocked. Read before you plan anything.**
4. `docs/WORKPLAN.md` — epics, issues with file ownership, waves, milestones. **Agents start here.**
5. `docs/SCAFFOLD.md` — build and deploy steps, each with its check.
6. `DESIGN.md` — colour, type and motion. Read it before touching any style.
7. `src/README.md` — the code map: the two paths through the code, one line per module.
8. `docs/PORTALS.md` — what each listing site actually serves. Before touching the extractor.
9. `memory/decisions.md` — why v3 differs from v2 and v1.
10. `docs/PRIOR-ART.md` — what already exists and why v1 is still built (2026-09-04).
11. `00_docs/AIR-SERVER.md` (workspace root) — **before any command on the Air.**

`_archive/` holds v1 and v2 of the plan and the scaffold, superseded and not committed.

## Stack

Next.js 16 (App Router, standalone) · React 19 · SQLite via `@libsql/client` with raw SQL and a
`schema.sql` · Tailwind 4 · zod 4 · vitest · `jose` · MapLibre GL (OpenFreeMap tiles) · `sharp`. One container, one bind
mount. **Ponytail is on**: nothing is added until a trigger in `docs/PLAN.md` fires.

## Rules

- **No PII in the repo.** Family names and emails, and the Air's hostname or username, never
  appear in code, fixtures, `.env.example`, or docs. `memory/` is gitignored.
- **Spanish UI, hardcoded.** Listing text stays in its source language.
- **Never bypass anti-bot or CAPTCHA.** Blocked pages get the bookmarklet hint.
- **Deploy = `./deploy.sh`** (build on the Pro, `docker load` on the Air). No git clone on the
  Air; `~/srv/casaencomu` holds only `compose.yaml` and `.env`.
- **Data root is `/Volumes/TimeMachine/casaencomu` on the Air**, bind-mounted as `/data`. Never
  run the app from an iCloud folder. Never let a host launchd job touch that path directly; go
  through `ssh localhost` (launchd cannot read `/Volumes`).
- **The nightly encrypted dump is the only backup.** Passphrase in 1Password.
- Repo: private, `KenobiNakamoto/casaencomu` (created 2026-09-04). Work flows issue → branch
  `issue-<n>-<slug>` in a worktree outside iCloud → PR → merge. Commit and push only when asked.
- **Anything not committed lives in `_local/`, `memory/`, `_archive/` or `data/`.** Page captures,
  the family's chat export and the untrimmed spike pages are all under `_local/` — one
  `.gitignore` line, one place to look before sharing anything.

## The Air's `TimeMachine` volume — decision 2026-09-04 (Kenobi)

The external SSD volume named `TimeMachine` on the Air is general-purpose storage, like `Agents`
and `Bitcoin`. The name is historical; Time Machine has never used it. Use it for new data — this
app is its first tenant. Do not reserve it and do not push back on using it. If Time Machine is
ever configured it may share the volume, but nothing waits for that. Authoritative note:
`00_docs/AIR-SERVER.md`.

## Memory protocol

Session start: read `memory/identity.md` and the tail of `memory/journal.md`. Session close:
append a dated entry to `memory/journal.md`. Durable decisions go in `memory/decisions.md`.
