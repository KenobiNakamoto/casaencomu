# CasaEnComú

A private web app for one family's home search in Barcelona. A member adds a listing from
Idealista, Fotocasa, Habitaclia and three smaller portals; the app keeps the facts and the
photos, removes duplicates, maps them, compares them, lets every member rate and comment, and
rechecks price and availability every 48 hours. The interface is Spanish.

It runs on one Mac at home, behind its own login. There is no public sign-up, no multi-tenancy
and no cloud database. One family, one container, one SQLite file per project.

**Status (2026-09-12).** The app has its own accounts, and it is deployed. A person signs in at
`/entrar`; the first account on an empty server claims what is already there and invites everyone
else; ten accounts is the ceiling, enforced by a database trigger. `main` is green at 714 tests
(3 skipped), with lint, types and build clean. The server runs on the Air, reachable over the
tailnet. The domain is bought and the tunnel is healthy; the one DNS record that makes it public
is held back until the first account exists. (The address itself is in `memory/`, not here.) The
development database holds 23 real listings, every field extracted from the advertisement itself.
What is true right now, with what is not done, is `docs/STATUS.md`.

## Start here

| You are | Read |
|---|---|
| a person, first time | this file, then `docs/PLAN.md` |
| an agent picking up work | `CLAUDE.md`, then `docs/WORKPLAN.md` |
| changing how a page looks | `DESIGN.md` — never write a raw hex in a component |
| changing the extractor | `docs/PORTALS.md` |
| deploying or touching the server | `docs/SCAFFOLD.md` § 7–8 |

## Run it

Nothing that makes the application *run* is in git, and that is deliberate: the dependencies are
regenerable, the saved pages belong to the portals, and the photo store is 300 MB that rebuilds in
about a minute. Four commands take a fresh copy to the state the last session left it in:

```sh
pnpm install
echo 'AUTH_DEV_EMAIL=you@example.com' > .env.local   # dev only: skips the login, including ours
pnpm tsx scripts/ingest.mts --reset                  # 23 listings with photos, from _local/captures
pnpm dev                                             # http://localhost:3000
```

```sh
pnpm test && pnpm lint && pnpm build                 # what must stay green
```

The database and the photo store are created under `./data` on first use. `src/lib/schema.sql` is
applied at start-up, so there is no migration step.

`_local/captures` holds the saved advertisements, one JSON file each, collected in a real browser.
With them the database is rebuilt exactly, because every field is read by the application's own
extractor. Without them the application still runs, with nothing in it, and a listing is added
with the bookmarklet on `/ayuda`.

Inside iCloud, rename `node_modules` to `node_modules.nosync` and symlink it, as
`docs/SCAFFOLD.md` § 1 shows. Otherwise iCloud tries to synchronise a hundred thousand files.

**What to do next** is `docs/WORKPLAN.md` § 0: what is done, what waits on the owner, and the
order the remaining issues run in.

## Map

| Path | What it is |
|---|---|
| `README.md` | this file |
| `CLAUDE.md` | the brief an agent loads automatically: rules, stack, reading order |
| `DESIGN.md` | the two palettes, type, motion. Every colour token comes from here |
| `docs/` | plan, build steps, workplan, portal measurements, prior art. Index: `docs/README.md` |
| `src/` | the application. Code map: `src/README.md` |
| `scripts/` | two things run by hand, never by the app. See `scripts/README.md` |
| `air/` | the backup script and its LaunchAgent, installed on the server. See `air/README.md` |
| `public/areas.geojson` | The map's zones, at six administrative levels. OpenStreetMap (ODbL), rebuilt by `scripts/build-areas.mts` — one config file per country, see `scripts/areas/README.md` |
| `compose.yaml` `Dockerfile` `deploy.sh` | one image, one container, one bind mount |
| `.env.example` | every variable the app reads. Placeholders only |
| `_local/` | working material that is never committed. See `_local/README.md` |
| `memory/` | session notes for agents: identity, journal, decisions. Never committed |
| `_archive/` | superseded versions of the plan. Never committed |
| `data/` | the SQLite file and the photo store in development. Never committed |

Everything at the top level is committed except the last four rows. That is the whole rule.

## How it works

```
phone / laptop ──HTTPS──▶ Cloudflare Tunnel ──▶ cloudflared on the Mac ──▶ 127.0.0.1:3100
                                                                  │
                                        one container: Next.js + SQLite + the hourly recheck loop
                                        data on an external volume, bind-mounted as /data
```

- **Authentication is the app's own.** An address and a clave, hashed with scrypt; the session is
  an opaque 256-bit id and a row in `control.db`, so deleting the row ends the session on the next
  request. Next 16 runs `src/proxy.ts` on Node, which is what lets the door be a database lookup
  instead of a signed token. Ten accounts is the ceiling. There is no open sign-up: after the
  first account, every account arrives through an invitation, and the same link sets a new clave
  for somebody who has forgotten theirs. Cloudflare Access still works if `CF_ACCESS_*` is set —
  it becomes an outer gate in front of this login, not a replacement for it.
- **Intake has two paths.** A pasted URL is fetched by the server, but only for hosts in
  `ALLOWED_HOSTS` — that allowlist is the guard against server-side request forgery. Everything
  else arrives through the bookmarklet, which reads the page in the member's own browser and
  posts what it found.
- **One extractor, not one adapter per portal.** `src/lib/extract.ts` tries JSON-LD, then
  OpenGraph, then the portal's own script blob. What each portal actually serves is measured in
  `docs/PORTALS.md`.
- **The recheck loop lives in the web process.** No queue, no worker, no scheduler.

## Rules

These are not style preferences. Breaking one of them causes a real problem.

1. **No personal data in the repository.** No family names, no email addresses, no server
   hostname or user name, in code, fixtures, documents or commit messages. `example.com` is the
   placeholder. `memory/` and `_local/` are ignored by git for this reason.
2. **Never work around an anti-bot block or a CAPTCHA.** A page a portal refuses to a server is
   collected in a real browser or not at all.
3. **Never write a raw colour into a component.** Both themes switch at runtime through CSS
   variables; a hard-coded hex breaks one of them.
4. **The nightly encrypted dump is the only backup.** Its passphrase lives in a password manager.
   Without the passphrase the backups are noise.
5. **Deploy with `./deploy.sh`.** The image is built on the development Mac and loaded on the
   server over ssh. The server holds no checkout and no source.

## Working on it

One issue, one branch, one pull request; the branch is named `issue-<n>-<slug>` and lives in a
git worktree outside the synchronised folder. Two open issues never own the same file. The issue
list, who owns which files, and the order they must run in are all in `docs/WORKPLAN.md`.

Private repository. The interface language is Spanish and is hard-coded; there is no translation
layer, and listing text stays in whatever language the advertisement used.
