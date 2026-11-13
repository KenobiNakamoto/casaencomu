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

**State (2026-09-15): the app has its own login, and it is deployed.** A person signs in at `/entrar` with an address and a clave; the first account on an empty server adopts what is already there; ten accounts is the ceiling, enforced by a database trigger; every account after the first arrives through an invitation, and the same link resets a forgotten clave. `main` is green — **714 tests (3 skipped)**, lint, types and build clean, and GitHub Actions runs all four on every pull request. The Air runs the merged image behind that login, and `PREVIEW_OPEN_AS` and `PREVIEW_PASSWORD` are both commented out of its `.env`: the app's own door is the only one. The domain is bought and the tunnel is healthy, but **no DNS record is published yet** — the first account claims the house, so the hostname stays private until Kenobi has made it. All sixteen PIP packages that were ever in scope are done (PIP-12 and PIP-15 are deferred by the proposal itself — do not start them). The nightly encrypted backup is installed and a restore has been carried out (#21). Two things nobody has checked are still true: **no real phone has ever opened this app**, and `docs/RELEASE-B-PROOF.md` § 5 lists the rest. The dev database holds 23 real listings ingested from the ads themselves; nothing is hand-written. `origin` holds `main` and nothing else — 43 merged branches were deleted on 2026-09-12, with the restore list in `memory/`. To show the app with no login, `./showcase.sh` serves it at http://127.0.0.1:3010 on this Mac only. Full state, with what is not done: `docs/STATUS.md`.

## Unreleased safety update — 2026-11-12

The local readiness branch supersedes the password-reset and first-account behavior above.
Invitations grant membership only; existing accounts must sign in. Initial setup requires the
operator-held `CASA_SETUP_TOKEN` and an atomic one-time claim. See the dated entry at the top of
`docs/STATUS.md` before deploying or giving setup instructions. The Air was updated by the later release entry in `docs/STATUS.md`. Read that entry for live state.

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

- **This is a personal project, not work.** It uses no employer account, machine, domain,
  password manager, signing key or email address. The Cloudflare account, the domain, the
  password store and the member emails are the family's own. Nothing here is ever discussed in
  a work channel.
- **No PII in the repo.** Family names and emails, and the Air's hostname or username, never
  appear in code, fixtures, `.env.example`, or docs. `memory/` is gitignored.
- **Spanish UI, hardcoded.** Listing text stays in its source language.
- **Never bypass anti-bot or CAPTCHA.** No proxy, no fingerprint, no CAPTCHA solving, ever. A page
  a portal refuses to a server is read in a real browser — the family's, with the bookmarklet, or
  the stock headful Chrome the server runs (`scripts/capture-agent.mjs`, issue #111), which passes
  a JavaScript challenge by running it. Measured in `docs/PORTALS.md` § 4.
- **A pasted link is never lost.** It becomes a record before anything is read, and the record
  says why it is empty. Layers 2 and 3 (`lib/enrich.ts`) fill what layer 1 missed; a field marked
  «deducido» was deduced, never stated, and the two must never look alike. The model is reached
  either with an API key or, on the server, through `scripts/ai-bridge.mjs` — the Claude Code CLI
  behind a Messages-shaped endpoint (issue #113). Neither configured means the two layers are
  skipped and nothing is marked as done.
- **Two host processes, never in the container.** `scripts/capture-agent.mjs` and
  `scripts/ai-bridge.mjs` need a browser and a Keychain, so they run as LaunchAgents beside the
  container. Runbook: `air/README.md`. The app works without either; it just fills less.
- **Deploy = `./deploy.sh`** (build on the Pro, `docker load` on the Air). No git clone on the
  Air; `~/srv/casaencomu` holds only `compose.yaml` and `.env`.
- **Data root is `/Volumes/TimeMachine/casaencomu` on the Air**, bind-mounted as `/data`. Never
  run the app from an iCloud folder. Never let a host launchd job touch that path directly; go
  through `ssh localhost` (launchd cannot read `/Volumes`).
- **The nightly encrypted dump is the only backup.** Passphrase in the family's own password
  store — Apple Passwords is on every device already — and shared with one other member, so it
  does not die with one phone.
- Repo: **public** (MIT) since 2026-11-13, `KenobiNakamoto/casaencomu` (created 2026-09-04). Pseudonymous content only: no real name, family name, email, hostname or username ever goes in — issues and PR bodies included. Work flows issue → branch
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
