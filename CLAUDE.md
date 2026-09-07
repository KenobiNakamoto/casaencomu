# CasaEnComú

## Communication — ASD-STE100

Write to Kenobi in **ASD-STE100 Simplified Technical English**: one idea per sentence, active
voice, each approved word in its approved meaning only, no synonyms for the same thing, no idioms
or metaphors, procedural sentences of 20 words or fewer and descriptive sentences of 25 or fewer.

This applies to prose addressed to Kenobi. It does not apply to code, to commit messages, or to
UI copy (which is Spanish).

## What this is

A private, Spanish-first web app for one family's home search in Barcelona. Members add listings
(Idealista, Fotocasa, Habitaclia) with a bookmarklet or a pasted URL; the app keeps facts and
photos, deduplicates, maps, compares, lets each member rate and comment, and rechecks price and
availability every 48 h. It runs on the MacBook Air inside the Colima VM that already hosts
umbrelOS, and is reached through Cloudflare Tunnel + Access.

**State (2026-09-04, evening): code complete on `main` — 12 PRs (#28–#39) merged, 46 tests, build green, issues #6–#17 closed. Nothing deployed: M1 waits on Kenobi's #1–#5, the Air's compose plugin and cloudflared, then #18 → #19 → #21 → #20. Status block: `WORKPLAN.md` § 0.**

## Read in this order

1. `PLAN.md` — plan v3 (ponytail). Start here.
2. `SCAFFOLD.md` — build and deploy steps with checks.
2a. `DESIGN.md` — colour, type and motion. Read it before touching any style.
2b. `WORKPLAN.md` — epics, issues with file ownership, waves, milestones. Agents start here.
3. `memory/decisions.md` — why v3 differs from v2 and v1.
4. `PRIOR-ART.md` — what already exists and why v1 is still built (2026-09-04).
5. `00_docs/AIR-SERVER.md` (workspace root) — **before any command on the Air.**
6. `_archive/` — v1 and v2 of both documents, superseded.

## Stack

Next.js 16 (App Router, standalone) · React 19 · SQLite via `@libsql/client` with raw SQL and a
`schema.sql` · Tailwind 4 · zod 4 · vitest · `jose` · MapLibre GL (OpenFreeMap tiles) · `sharp`. One container, one bind
mount. **Ponytail is on**: nothing is added until a trigger in `PLAN.md` fires.

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

## The Air's `TimeMachine` volume — decision 2026-09-04 (Kenobi)

The external SSD volume named `TimeMachine` on the Air is general-purpose storage, like `Agents`
and `Bitcoin`. The name is historical; Time Machine has never used it. Use it for new data — this
app is its first tenant. Do not reserve it and do not push back on using it. If Time Machine is
ever configured it may share the volume, but nothing waits for that. Authoritative note:
`00_docs/AIR-SERVER.md`.

## Memory protocol

Session start: read `memory/identity.md` and the tail of `memory/journal.md`. Session close:
append a dated entry to `memory/journal.md`. Durable decisions go in `memory/decisions.md`.
