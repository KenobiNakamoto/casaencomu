# CasaEnComú — Workplan (epics · issues · milestones)

_2026-09-04. The unit of work is one GitHub issue = one agent = one branch = one PR. Each issue
owns a file set; two open issues never share a file. `SCAFFOLD.md` § numbers hold the how;
this file holds the who, the order, and the done-when. Load into GitHub with § 5 below._

## 0. Status — moved

**`docs/STATUS.md` is now the state of the project: what is done, what is not, what is blocked
and on whom. Read that first.** This file keeps the plan, the file ownership and the order.

What follows is the status as it stood on 2026-09-07, kept for the lessons at the end, which are
still true and still cost time. Anything here that disagrees with `STATUS.md` is out of date.

**The list of owner-only items below is one of those things: it is out of date.** #1 is done (the
domain is bought and its zone is on Cloudflare), #2 is not needed any more (the app has its own
login since 2026-09-12, so Zero Trust is optional), and #5 is not needed either (members arrive by
invitation from inside the app). One owner-only item is left — make the first account — and
`STATUS.md` § 6 is where it lives.

### Done

- **#6–#17 merged** to `main` in order (PRs #28–#39); waves B and C complete. On top of the plan:
  two themes and the day/night toggle (#53), the generic-portal extractor and four bugs it exposed
  (#57), three more photo hosts (#59), the repository layout (#62) and the cold-start fix (#64).
- **The database is real.** 23 of the family's 25 links are imported, every field taken from the
  advertisement by the extractor. The two that fail are genuinely withdrawn. Repeat it with
  `pnpm tsx scripts/ingest.mts --reset`.
- **#3 and #4 are closed** (2026-09-06). On the Air, both manual commands are also done:
  `docker compose` answers (5.5.0) and `cloudflared` is installed. `/Volumes/TimeMachine` is
  mounted into the Colima VM and already holds `casaencomu`. `~/srv/casaencomu` is empty.

### Open, and only Kenobi can do them — **superseded, see `STATUS.md` § 6**

| # | What | Where |
|---|---|---|
| 1 | A domain on Cloudflare DNS | dash.cloudflare.com |
| 2 | A Zero Trust account; note the team name | one.dash.cloudflare.com |
| 5 | Confirm the area and the member email list | never in the repo |

**Nothing else is blocked by these three, and they block everything on the server.** #18 needs the
domain, the team domain, the Access AUD and the member emails. #19, #21 and #20 wait behind #18.

### Two tracks from here

- **Server track (blocked):** #18 Air setup → #19 M1 integration → #21 backup drill → #20 phone
  checklists. It starts the day #1, #2 and #5 are done.
- **Product track (open now):** `docs/product-improvement/`, Release A then Release B. It needs no
  domain and no server. Package PIP-01 is issue #65.

### Lesson from the merges

Branches stacked on an unmerged sibling carry that sibling's files at an old commit; when the
sibling gets a fixup later, GitHub reports a conflict on the stacked PR. Fix: `git merge
origin/main` into the stacked branch, push, then merge the PR. Merge in dependency order. Next
time: no stacking — merge each PR as soon as it is reviewed.

### A worktree needs its own `node_modules`

Turbopack refuses a `node_modules` symlink that points outside the worktree
(`Symlink [project]/node_modules is invalid`). `pnpm install` inside the worktree takes about
three seconds and hard-links from the store, so run that instead of linking to another checkout.

## 1. Milestones (= phases; done-when from `SCAFFOLD.md` § 10)

| M | Name | Done when |
|---|---|---|
| M0 | Prerequisites + spike | `PORTALS.md` filled; #1–#5 closed; VM up after `authrestart`; `TimeMachine` visible in the VM |
| M1 | Walking skeleton | phone on 4G → PIN → `Hola <name>`; virtiofs test passes (or the DB fallback is in); `compose down && up` keeps a row; a backup restores on the Pro |
| M2 | Intake | three real listings imported with photos (bookmarklet where blocked); repeat → "Ya estaba guardada" |
| M3 | Workspace | two members rate from phones; `/comparar` shows both; map shows all; filters survive reload; budget typed → `Fuera de presupuesto` chip, none before |
| M4 | Rechecks + Actividad | fixture price edit → one `price_change`; removed source → `No disponible`; badge clears on view |

## 2. Waves (what runs at the same time)

```
Wave A  (now, parallel)      #1 #2 #3 #5 Kenobi · #4 agent+Air · #6 agent spike
Wave B  (one agent, serial)  #7 → #8 → #9        · #17 ops after #7 · #18 Air after #1 #2 #4
M1 gate                      #19 integration (needs #8 #9 #17 #18)
Wave C  (up to 8 agents)     #10 #11 #12 · #13 #14 · #15 #16 #21   ← disjoint file sets
M2–M4 gate                   #20 checklists on two phones
```

Wave C does not wait for Kenobi's Cloudflare items: agents run locally with `AUTH_DEV_EMAIL`
(`SCAFFOLD.md` § 3). Only #18 and #19 need the tunnel.

## 3. Epics and issues

On GitHub (2026-09-04): epics are issues #22 E0, #23 E1, #24 E2, #25 E3, #26 E4, #27 E5, label
`epic`, each with its issues attached as sub-issues (progress bar) and listed as a task list.
Every issue carries a `## Steps` checklist. A Projects board was not created: the `gh` token lacks
the `project` scope (`gh auth refresh -s project,read:project` would add it); milestones + epics
show progress without it.

Columns: **owner** (K = Kenobi's hand, A = agent, A+Air = agent over `ssh air`), **files owned**
(the only files the branch may touch), **depends on**, **size** (S ≤ 2 h, M ≤ half day, L ≤ day),
**check** (the acceptance test; SCAFFOLD § holds the detail).

### E0 · Prerequisites — M0

| # | Title | Owner | Files owned | Depends | Size | Check |
|---|---|---|---|---|---|---|
| 1 | Domain on Cloudflare DNS | K | — | — | S | zone active in dash.cloudflare.com |
| 2 | Zero Trust account, note team name | K | — | — | S | `https://<team>.cloudflareaccess.com` resolves |
| 3 | `limactl` Full Disk Access on the Air, enable `com.kenobi.umbrel` | K (VNC) | — | — | S | `ssh air 'colima status'` after `authrestart` = Running |
| 4 | Mount `TimeMachine` into Colima (§ 8.0) | A+Air, K approves ~5 min node downtime | `~/.local/bin/umbrel-up.sh` on the Air; then run `00_docs/refresh-from-air.sh` | #3 | S | `docker run --rm -v /Volumes/TimeMachine:/tm alpine ls /tm` lists the volume |
| 5 | Confirm area and member email list | K | — | — | S | emails in the Access policy (#18); never in the repo |
| 6 | Portal spike (§ 0b) from Pro and Air | A (+Air) | `PORTALS.md`, `src/lib/__fixtures__/*.html` | — | M | RESULTS table complete for the 3 portals; fixtures trimmed to JSON-LD / `og:*` / blob / `<img>` tags — no agent contact blocks |

### E1 · Foundation — M1 (serial: #7 → #8 → #9)

| # | Title | Owner | Files owned | Depends | Size | Check |
|---|---|---|---|---|---|---|
| 7 | Bootstrap (§ 1) | A | `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.dockerignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts` | — | S | `pnpm dev` serves; `pnpm test` green on zero tests; all deps present — later issues add none |
| 8 | Schema, db, shared types (§ 2) | A | `src/lib/schema.sql`, `src/lib/db.ts`, `src/lib/listing.ts` (zod `Listing`, `STAGES`, `DIMENSIONS`, `EVENT_KINDS`), `src/instrumentation.ts` (schema apply only) | #7 | S | `.tables` lists eight tables; `PRAGMA user_version` = 1 |
| 9 | Auth (§ 3) | A | `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/auth.test.ts` | #8 | M | vitest: wrong `aud` / `iss` / expired rejected, valid → email; dev bypass only with `NODE_ENV=development` + `AUTH_DEV_EMAIL` |
| 17 | Ops: image, compose, deploy, backup (§ 7, § 8.4) | A | `Dockerfile`, `compose.yaml`, `deploy.sh`, `air/casaencomu-backup.sh`, `air/com.kenobi.casaencomu-backup.plist` | #7 | M | `docker build` succeeds on the Pro; `docker save \| ssh air docker load` works; backup script dry-runs with `-n` |
| 18 | Air setup: cloudflared, Access app, `.env` (§ 8.1–8.3) | A+Air, K for the dashboard | on the Air only: `~/srv/casaencomu/.env`, cloudflared service | #1 #2 #4 #5 | M | `curl -I https://<domain>` → Access login page; `.env` holds `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `PUBLIC_URL`, `DATA_DIR` |
| 19 | M1 integration | A+Air | none new; may edit any file to fix, one PR | #8 #9 #17 #18 | M | the M1 done-when, all four items, written into the PR |

### E2 · Intake — M2

| # | Title | Owner | Files owned | Depends | Size | Check |
|---|---|---|---|---|---|---|
| 10 | `normalizeUrl` + `extract` + fixtures tests (§ 4) | A | `src/lib/url.ts`, `src/lib/extract.ts`, `src/lib/url.test.ts`, `src/lib/extract.test.ts` | #6 #8 | M | vitest: 3 portal URLs + `utm_` → same ref; unknown host → `generic`; each fixture → price, area, rooms, photo count; removed fixture → `null` |
| 11 | `save()`, photos, API routes (§ 4) | A | `src/lib/save.ts`, `src/lib/photos.ts`, `src/app/api/import/route.ts`, `src/app/api/capture/route.ts`, `src/app/api/photos/[id]/route.ts` | #8 #9; merges after #10 | M | paste a Habitaclia URL → property with photos < 60 s; paste again → 303 to the same id + `events.duplicate`; non-portal host → 400 |
| 12 | Bookmarklet + `/ayuda` (§ 4, § 5) | A | `src/lib/bookmarklet.ts`, `src/app/ayuda/page.tsx` | #8 #9 | S | bookmarklet on Idealista in iPhone Safari → property page; wrong `capture_token` → 403 |

### E3 · Workspace — M3

| # | Title | Owner | Files owned | Depends | Size | Check |
|---|---|---|---|---|---|---|
| 13 | `/propiedades` list, filters, budget, detail, ratings, comments, stages (§ 5) | A | `src/app/propiedades/**`, `src/components/propiedades/**`, `src/lib/ratings.ts`, `src/lib/ratings.test.ts`, `src/lib/settings.ts` | #8 #9 | L | vitest: average ignores missing dims, one score per member per dim; manual: budget typed → chip appears, none before; stage change writes `events` |
| 15 | `/mapa` + `/comparar` (§ 5) | A | `src/app/mapa/**`, `src/app/comparar/**`, `src/app/api/markers/route.ts`, `src/components/mapa/**` | #8 #9 | M | all properties with lat/lng on the map, exact solid / approx ring; `/comparar?ids=a,b,c` highlights differing rows, `Sin datos` for nulls |
| 16 | `/actividad`, bottom nav, mobile pass (§ 5) | A | `src/app/actividad/**`, `src/components/nav.tsx` (layout imports it — one-line change in `layout.tsx` allowed) | #8 #9 | S | events newest first; `last_seen_at` set on view; nav 4 items; rating targets ≥ 44 px |

### E4 · Rechecks — M4

| # | Title | Owner | Files owned | Depends | Size | Check |
|---|---|---|---|---|---|---|
| 14 | `classifyChanges`, `runRechecks`, hourly loop (§ 6) | A | `src/lib/changes.ts`, `src/lib/recheck.ts`, `src/lib/changes.test.ts`, the `setInterval` block in `src/instrumentation.ts` | #8; merges after #10 | M | vitest: price-only → one `price_change`; identical → none; removed → `availability_change`; manual: `last_checked_at` set 3 days back → rechecked within the hour |

### E5 · Release

| # | Title | Owner | Files owned | Depends | Size | Check |
|---|---|---|---|---|---|---|
| 21 | Backup restore drill + LaunchAgent install on the Air (§ 8.4) | A+Air | Air only | #17 #19 | S | a `.db.enc` from iCloud decrypts and opens on the Pro; `launchctl list` shows the job |
| 20 | M2–M4 checklists on two phones | A + K's phones | none; bug-fix PRs reference this issue | all above | M | the three done-when rows, ticked, in the issue |

## 4. The agent contract (paste into every issue, or link here)

1. Read `CLAUDE.md`, `PLAN.md`, the `SCAFFOLD.md` § named in the issue, and this issue. Nothing else is needed.
2. Touch only the files the issue owns. Need another file? Comment on the issue and stop.
3. Branch `issue-<n>-<slug>` from `main`, in a worktree **outside iCloud** (`~/worktrees/casaencomu-<n>`).
4. No new dependencies. All of them arrive in #7.
5. `pnpm test` and `pnpm build` green before the PR. PR title `#<n> <title>`; body: what, the check's output, `Closes #<n>`.
6. Ponytail is on: shortest working diff; mark shortcuts `// ponytail: …`. No abstractions the issue did not ask for.
7. Never: `.env`, real emails or names, agent contact data in fixtures, anti-bot bypass, a push to `main`.
8. UI copy in Spanish. Prose to Kenobi in ASD-STE100.

## 5. Load into GitHub (done 2026-09-04; kept for a rebuild)

```sh
gh repo create KenobiNakamoto/casaencomu --private --source . --push
for m in "M0 Prerequisites + spike" "M1 Walking skeleton" "M2 Intake" "M3 Workspace" "M4 Rechecks + Actividad"; do
  gh api repos/KenobiNakamoto/casaencomu/milestones -f title="$m" >/dev/null; done
for l in kenobi air agent wave-a wave-b wave-c; do gh label create "$l" -R KenobiNakamoto/casaencomu; done
# one `gh issue create --title "#n title" --milestone "Mx …" --label … --body-file issues/n.md` per row above
gh api -X PUT repos/KenobiNakamoto/casaencomu/branches/main/protection \
  -F required_pull_request_reviews[required_approving_review_count]=0 -F enforce_admins=false \
  -F required_status_checks=null -F restrictions=null      # PRs only, no direct pushes
```

Branch protection and rulesets returned 403 on 2026-09-04: a private repo needs GitHub Pro for
them. Not applied. The guard is contract rule 7 (no push to `main`) and review before merge.

Issue bodies were generated from the tables above by a one-off script (not committed);
regenerate from the tables if the repo is ever rebuilt. Issue numbers on GitHub equal the # column. Wave labels drive the board: a GitHub Project with columns
`wave-a` … `wave-c`, `review`, `done` is optional — milestones alone show progress.
