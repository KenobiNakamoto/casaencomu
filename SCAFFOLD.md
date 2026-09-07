# CasaEnComú — Scaffolding plan v3 (ponytail)

From an empty folder to v1 on the Air. Steps in order; each ends with a check. Companion to
`PLAN.md`. 2026-09-04.

## Conventions

- **Dev:** the Pro. **Runtime:** the Air (`ssh air`). Read `00_docs/AIR-SERVER.md` first.
  Non-interactive SSH sources only `~/.zshenv`; `sudo` needs `ssh -t`; launchd cannot read
  `/Volumes/*`.
- **Repo:** private `KenobiNakamoto/casaencomu`; Next.js root = this folder. `node_modules` →
  `node_modules.nosync` + symlink. Init, commit, push only when Kenobi says.
- **No PII in the repo.** `memory/` gitignored. `.env.example` has placeholders only.
- **Spanish UI, hardcoded.** No i18n library.
- **Stack:** Next.js 16.2, React 19, `@libsql/client` (raw SQL, no ORM), Tailwind 4 (two themes
  over `@theme inline` + `data-theme`, see `DESIGN.md`), zod 4,
  vitest, `jose`, `maplibre-gl`, `sharp`. Nothing else until a trigger in `PLAN.md` fires.

## 0. Prerequisites — Kenobi's hand

| # | What | Where |
|---|---|---|
| P1 | A domain on Cloudflare DNS (register at cost, or move a zone) | dash.cloudflare.com |
| P2 | Zero Trust account, free plan; note the team name | one.dash.cloudflare.com |
| P3 | `limactl` Full Disk Access on the Air, then enable `com.kenobi.umbrel` | VNC → System Settings; steps in `AIR-SERVER.md` "Reboot survival" |
| P4 | Mount `TimeMachine` into Colima (§ 8.0) | `ssh air` — ~5 min node downtime |
| P5 | Confirm area, member email list (budget is set in the app later, never seeded) | — |

Check: `ssh air 'colima status'` after an `authrestart` shows the VM running and
`ssh air 'docker run --rm -v /Volumes/TimeMachine:/tm alpine ls /tm'` lists the volume.

## 0b. Spike — half a day

```sh
mkdir -p spike && cd spike
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36'
for u in "$IDEALISTA_URL" "$FOTOCASA_URL" "$HABITACLIA_URL"; do
  n=$(echo "$u" | md5); curl -sSL -A "$UA" -o "$n.html" -w "$n %{http_code} %{url_effective}\n" "$u"
done
grep -l 'application/ld+json' *.html; grep -l '__NEXT_DATA__' *.html
grep -o 'property="og:[a-z:]*" content="[^"]*"' *.html | head -20
```

Run from the Pro **and** the Air. Open each page in Safari → Web Inspector too. Record in
`spike/RESULTS.md`:

| portal | fetch Pro | fetch Air | JSON-LD | other blob | photo host + pattern | hotlink? | lat/lng precision | removed marker |
|---|---|---|---|---|---|---|---|---|

Outputs of the spike that go straight into code: `ALLOWED_HOSTS`, `ALLOWED_IMAGE_HOSTS`, the
per-portal ref regex, the removed-marker strings. Saved pages become
`src/lib/__fixtures__/<portal>.html`.

## 1. Bootstrap (Pro)

```sh
cd "$WS/04_Apps/CasaEnComú"
pnpm create next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-pnpm
#   refuses a non-empty dir? scaffold into ./tmp, then `rsync -a tmp/ . && rm -rf tmp`
mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules
pnpm add @libsql/client zod jose maplibre-gl@5 sharp
pnpm add -D vitest tsx
```

`.gitignore` add: `.env`, `.env.*.local`, `node_modules`, `node_modules.nosync`, `.next`,
`data/`, `spike/*.html`, `memory/`. `.dockerignore`: `node_modules*`, `.next`, `.git`,
`memory`, `spike`, `data`.

`next.config.ts`: `output: 'standalone'`, `serverExternalPackages: ['@libsql/client', 'sharp']`.

Tree (v1):

```
CasaEnComú/
  CLAUDE.md PLAN.md SCAFFOLD.md memory/ _archive/ spike/RESULTS.md
  package.json next.config.ts vitest.config.ts compose.yaml Dockerfile deploy.sh .env.example
  air/casaencomu-backup.sh  air/com.kenobi.casaencomu-backup.plist     ← installed by hand on the Air
  src/
    proxy.ts                 ← Access JWT → x-user-email   (Next 16's name for middleware)
    instrumentation.ts       ← schema.sql at boot + hourly recheck loop
    app/
      layout.tsx page.tsx    ← redirect /propiedades
      propiedades/page.tsx propiedades/[id]/page.tsx mapa/page.tsx comparar/page.tsx
      actividad/page.tsx ayuda/page.tsx
      api/capture/route.ts api/import/route.ts api/photos/[id]/route.ts api/health/route.ts
    lib/
      db.ts schema.sql auth.ts url.ts extract.ts photos.ts changes.ts recheck.ts bookmarklet.ts
      __fixtures__/
    components/
```

Check: `pnpm dev` serves; `pnpm test` is green on zero tests.

## 2. Schema — `src/lib/schema.sql`

Applied at boot: `for (stmt of schema.split(';')) await db.execute(stmt)`. IDs are
`crypto.randomUUID()`, times ISO-8601 UTC, money integer euros. Later changes: bump
`PRAGMA user_version` and append guarded `ALTER TABLE`s.

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  capture_token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT);
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'nueva',
  price_eur INTEGER, fees_eur INTEGER, area_m2 INTEGER, rooms INTEGER, bathrooms INTEGER,
  floor TEXT, lift INTEGER, outdoor TEXT, parking INTEGER, condition TEXT, energy_rating TEXT,
  description TEXT, address_text TEXT, address_precision TEXT NOT NULL DEFAULT 'none',
  lat REAL, lng REAL, building_key TEXT, neighborhood TEXT, agency TEXT,
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  portal TEXT NOT NULL, portal_ref TEXT, url_normalized TEXT UNIQUE NOT NULL, url_original TEXT NOT NULL,
  via TEXT NOT NULL, facts_json TEXT NOT NULL, facts_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL, last_checked_at TEXT, last_ok_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0, availability TEXT NOT NULL DEFAULT 'active');
CREATE UNIQUE INDEX IF NOT EXISTS sources_ref ON sources(portal, portal_ref) WHERE portal_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, sha256 TEXT NOT NULL, width INTEGER, height INTEGER,
  UNIQUE (property_id, sha256));
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, payload_json TEXT, actor_id TEXT REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ratings (
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), dimension TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5), updated_at TEXT NOT NULL,
  PRIMARY KEY (property_id, user_id, dimension));
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

`db.ts`: `createClient({ url: 'file:' + DATA_DIR + '/casa.db' })`, then
`PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000`.
Photo file = `DATA_DIR/photos/<property_id>/<sha256>.jpg`; no path column.
Event kinds: `import duplicate price_change availability_change facts_change stage_change comment rating`.
Stages: `nueva revisando preseleccionada visita_prevista descartada no_disponible`.
Dimensions: `ubicacion distribucion luz_vistas estado calidad_precio encaje_familiar`.
Settings keys: `presupuesto_min presupuesto_max` (integer euros). No seed row — the family
types the budget in the app (Kenobi, 2026-09-04). Missing keys = no budget = no out-of-range flag.

Check: `sqlite3 data/casa.db .tables` lists eight tables.

## 3. Auth — `src/proxy.ts`, `src/lib/auth.ts`

- Token from header `cf-access-jwt-assertion` (fallback cookie `CF_Authorization`).
- `jose`: `createRemoteJWKSet(https://<team>.cloudflareaccess.com/cdn-cgi/access/certs)`,
  `jwtVerify(token, jwks, { issuer: 'https://<team>.cloudflareaccess.com', audience: CF_ACCESS_AUD })`.
- Success → **overwrite** request header `x-user-email` with the `email` claim. Failure → 401.
  Exempt: `/api/health`. `// ponytail: jose over hand-rolled RS256 — security path, keep the dep`.
- `currentUser()`: `INSERT OR IGNORE` a `users` row (name = email local part, fresh
  `capture_token`), touch `last_seen_at` at most once a minute, return the row.
- Dev bypass only when `NODE_ENV === 'development'` **and** `AUTH_DEV_EMAIL` is set.

Env: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `PUBLIC_URL`, `DATA_DIR=/data`.

Check (vitest): a locally signed token is rejected for wrong `aud`, wrong `iss`, expired; the right
one passes. Manual: a phone on 4G gets the PIN screen.

## 4. Intake — `url.ts`, `extract.ts`, `photos.ts`, `api/capture`, `api/import`

- **`normalizeUrl(url) → { portal, portalRef, normalized }`.** Lowercase host, drop `www.`, drop
  query and fragment, ref by regex per portal (from the spike). Unknown host → `generic`, ref null.
- **`extract(page) → Listing | null`.** `page = { url, finalUrl, html?, ld?, og?, blob?, imgs?, text? }`
  (server fetch fills `html`; the bookmarklet fills the rest). Order: JSON-LD → `og:*` → the
  portal blob, one `switch (portal)` for the blob path. `null` when a removed or blocked marker is
  present. `Listing` = zod object; only `title` required.
- **`api/import` (POST `{ url }`).** `if (!ALLOWED_HOSTS.has(host)) return 400` — that is the
  whole SSRF guard. `fetch` with a realistic UA and a 20 s timeout → `extract` → `save()`.
  `// ponytail: allowlist instead of a DNS-resolving SSRF guard; revisit if non-portal URLs are ever allowed`.
- **`api/capture` (form POST from the bookmarklet).** Verify `capture_token` belongs to the
  `x-user-email` user (CSRF guard), zod-parse the payload, `extract` → `save()`.
- **`save(listing, user, via)`.** Exact duplicate (`url_normalized` or `(portal, portal_ref)`) →
  add nothing, `events.duplicate`, 303 to the existing property. Else insert `properties` +
  `sources` + photos + `events.import`, 303 to the new page. Synchronous; target < 20 s.
  `// ponytail: sync import, no queue; add one when imports exceed 20 s`.
- **`photos.ts`.** For each image URL: host ∈ `ALLOWED_IMAGE_HOSTS`, ≤ 5 MB, sha256, skip
  duplicates, `sharp().resize({ width: 800 }).jpeg()` → file. `api/photos/[id]` checks
  `currentUser()` and streams the file with `Cache-Control: private`.
- **`bookmarklet.ts`.** Builds the `javascript:` URL: `location.href`, `document.title`, all
  `script[type="application/ld+json"]`, `meta[property^="og:"]`, `#__NEXT_DATA__`, up to 60
  `img.currentSrc`, first 20 KB of `body.innerText`; hidden-input form POST, `target=_blank`, to
  `PUBLIC_URL/api/capture` with the token. `/ayuda` renders it plus the iPhone steps (create any
  bookmark, edit its address).

Check (vitest): `normalizeUrl` on the three portals plus a `utm_` URL; `extract` on each fixture
gives price, area, rooms, photo count. Manual: paste a Habitaclia URL → property with photos in
under a minute; paste again → "Ya estaba guardada"; run the bookmarklet on Idealista → same.

## 5. UI (Phase 3)

Server components read the DB; mutations are server actions.

- `/propiedades` — filters in the URL (`?precio=<min>-<max>&hab=3&etapa=revisando`, no default
  `precio`), gallery or rows, sort; cover, price, m², rooms, stage chip, family average. A
  `Presupuesto` min–max form in the filter bar (server action → `settings`); once set, a
  `Fuera de presupuesto` chip on out-of-range cards.
- `/propiedades/[id]` — photos, facts, sources, description, price history (from `events`),
  review matrix (6 × members), comments, timeline, stage select.
- `/mapa` — plain MapLibre GL in a `useEffect` client component (`// ponytail: no react wrapper`);
  markers as price pills, exact = solid, approx = `≈` and a 180 m halo; same URL filters. District
  and barri overlays come from `public/areas.geojson`, rebuilt only by `node scripts/build-areas.mjs`;
  `src/lib/geo.ts` does point-in-polygon for both the counts on the map and the `?zona=` filter.
- `/comparar?ids=a,b,c` — 2–4 columns; differing rows highlighted; `Sin datos`.
- `/actividad` — `events` newest first; sets `last_seen_at`.
- `/ayuda` — bookmarklet, how-to, and a one-line health readout from `/api/health`.
- Mobile: bottom nav with four items; rating targets ≥ 44 px.
- Themes: `src/app/globals.css` holds both palettes as CSS variables behind `@theme inline`, so
  every Tailwind colour utility resolves at runtime. `data-theme` on `<html>` picks one; the
  inline script in `layout.tsx` sets it before the first paint (no flash), `ThemeToggle` writes it
  and mirrors it to `localStorage.tema`, and `useTheme` reads it back through
  `useSyncExternalStore`. Roles and hexes: `DESIGN.md`. Never write a raw hex in a component.


Check (manual, two phones): add → rate → compare → map → stage change shows in the other
member's `Actividad`; both themes survive a reload.

## 6. Rechecks (Phase 4) — `recheck.ts`, `changes.ts`

`instrumentation.ts` (guards: `NEXT_RUNTIME === 'nodejs'`, not `NEXT_PHASE ===
'phase-production-build'`): apply `schema.sql`, then `setInterval(runRechecks, 3600_000)` with a
`running` flag. `runRechecks`: up to 10 sources with `last_checked_at` older than 48 h and
`availability != 'removed'`, host ∈ `ALLOWED_HOSTS`, 60 s apart. Per source: fetch → extract →
`classifyChanges(prevFacts, next)` → `events` rows + update `properties` and `sources`.
Removed marker, or 404/410 twice in a row → `availability='removed'`, stage `no_disponible`.
403 or timeout → `unknown`, `consecutive_failures++`; three in a row → one `Actividad` warning.
Bookmarklet-only sources (host not fetchable) are skipped and show "Comprobar" on their page.

Check (vitest): price-only diff → exactly one `price_change`; identical → none; removed →
`availability_change`. Manual: set one `last_checked_at` back three days → it is rechecked
within the hour.

## 7. Image, compose, deploy

`Dockerfile`:

```Dockerfile
FROM node:24-bookworm-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
FROM deps AS build
COPY . .
RUN pnpm build
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

`sqlite3` is in the image for the backup's `VACUUM INTO` (same lock domain as the app).

`compose.yaml` — `name:` is required; Compose cannot derive it from `CasaEnComú`:

```yaml
name: casaencomu
services:
  web:
    image: casaencomu-web:latest
    build: .
    restart: unless-stopped
    ports: ["127.0.0.1:3100:3000"]
    env_file: .env
    volumes: ["/Volumes/TimeMachine/casaencomu:/data"]   # virtiofs; see § 8.0 and the Phase 1 test
    mem_limit: 1g        # ponytail: keeps a runaway import from starving electrs
```

`deploy.sh` (Pro; both Macs are arm64; building here keeps the Air's 8 GB VM out of it):

```sh
#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
colima status >/dev/null 2>&1 || colima start
docker build -t casaencomu-web:latest .
docker save casaencomu-web:latest | gzip | ssh air 'gunzip | docker load'
ssh air 'mkdir -p ~/srv/casaencomu && chmod 700 ~/srv/casaencomu'
scp compose.yaml air:srv/casaencomu/compose.yaml
ssh air 'cd ~/srv/casaencomu && docker compose up -d && docker compose ps'
```

`~/srv/casaencomu` on the Air holds only `compose.yaml` and `.env` (outside iCloud on purpose).

Check: `ssh air 'curl -s localhost:3100/api/health'` → `{"ok":true,…}`;
`ssh air 'lsof -nP -iTCP:3100 -sTCP:LISTEN'` shows `127.0.0.1`.

## 8. Air setup (once)

**8.0 Mount `TimeMachine` into Colima.** The volume is general-purpose storage by Kenobi's
decision (2026-09-04). Colima's mount list is fixed at start, so this costs one VM restart
(node down ~5 min). Edit `~/.local/bin/umbrel-up.sh` on the Air: add `/Volumes/TimeMachine` to the
`mounted` guards and `--mount /Volumes/TimeMachine:w` to `colima start`. Then:

```sh
ssh air 'mkdir -p /Volumes/TimeMachine/casaencomu && colima stop && ~/.local/bin/umbrel-up.sh'
```

Afterwards run `00_docs/refresh-from-air.sh` so the repo copy of `umbrel-up.sh` matches.

**Phase 1 virtiofs test** (SQLite locking over virtiofs is the one unknown):

```sh
ssh air 'docker run --rm -v /Volumes/TimeMachine/casaencomu:/data alpine sh -c "
  apk add -q sqlite &&
  sqlite3 /data/t.db \"pragma journal_mode=delete; create table t(x); insert into t values(1);\" &&
  sqlite3 /data/t.db \"begin immediate; insert into t values(2); commit; pragma integrity_check; select count(*) from t;\" &&
  rm /data/t.db"'
```

Expected: `ok` and `2`. Any `disk I/O error` or `database is locked` → keep photos on
`TimeMachine` and move the `.db` to a named volume (`volumes: [db:/data/db]`, `DATA_DIR`
split into `DB_PATH` + `PHOTOS_DIR`).

**8.1 cloudflared + tunnel** (after P1, P2):

```sh
ssh -t air 'brew install cloudflared'
# Zero Trust → Networks → Tunnels → Create → "casaencomu" → copy the install token
ssh -t air 'sudo cloudflared service install <TOKEN>'     # LaunchDaemon; back after authrestart
# Tunnel → Public Hostname: casa.<domain> → HTTP → localhost:3100
```

**8.2 Access application.** Zero Trust → Access → Applications → Self-hosted: name
`CasaEnComú`, domain `casa.<domain>`, session 1 week; policy Allow → Emails → the family list;
login One-time PIN only; cookie **SameSite = None**, HttpOnly. Copy the **AUD tag**.

**8.3 `.env` on the Air:**

```sh
ssh air 'umask 077; cat > ~/srv/casaencomu/.env' <<'ENV'
CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com
CF_ACCESS_AUD=<aud tag>
PUBLIC_URL=https://casa.<domain>
DATA_DIR=/data
ENV
```

**8.4 Backup.** launchd cannot read `/Volumes` (proven 2026-09-02), so the LaunchAgent runs the
script through `ssh localhost`, which inherits `sshd`'s Full Disk Access. Once:

```sh
ssh air 'test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519; grep -qf ~/.ssh/id_ed25519.pub ~/.ssh/authorized_keys || cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys'
ssh air 'umask 077; mkdir -p ~/.config/casaencomu; openssl rand -base64 32 > ~/.config/casaencomu/backup.pass; cat ~/.config/casaencomu/backup.pass'
# → paste the printed passphrase into 1Password, then clear the terminal. Without it the backups are noise.
```

`air/casaencomu-backup.sh` → `~/.local/bin/` on the Air:

```sh
#!/bin/zsh
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH COLIMA_HOME=/Volumes/Agents/colima
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/casaencomu"; mkdir -p "$DEST"
docker compose -f ~/srv/casaencomu/compose.yaml exec -T web sqlite3 /data/casa.db "VACUUM INTO '/data/latest.db'"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$HOME/.config/casaencomu/backup.pass" \
  -in /Volumes/TimeMachine/casaencomu/latest.db -out "$DEST/casa-$(date +%F).db.enc"
rm -f /Volumes/TimeMachine/casaencomu/latest.db
find "$DEST" -name 'casa-*.db.enc' -mtime +31 ! -name '*-01.db.enc' -delete
print "$(date '+%FT%T') ok"
```

`air/com.kenobi.casaencomu-backup.plist`: `ProgramArguments` = `/usr/bin/ssh -o BatchMode=yes
localhost /Users/AIRUSER/.local/bin/casaencomu-backup.sh`, `StartCalendarInterval` 03:30,
stdout/stderr → `~/Library/Logs/casaencomu-backup.log`. Install with
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kenobi.casaencomu-backup.plist`.

Restore test (Phase 1 exit):

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:~/.config/casaencomu/backup.pass \
  -in "…/casa-YYYY-MM-DD.db.enc" -out /tmp/restore.db
sqlite3 /tmp/restore.db 'pragma integrity_check; select count(*) from users;'
```

## 9. Tests — five files, no more

| file | asserts |
|---|---|
| `url.test.ts` | three portal URLs + one with `utm_*` → same ref; unknown host → `generic` |
| `extract.test.ts` | each fixture → price, area, rooms, photo count; removed-marker fixture → `null` |
| `changes.test.ts` | price-only → one `price_change`; identical → none; removed → `availability_change` |
| `ratings.test.ts` | average ignores missing dims; one score per member per dim |
| `auth.test.ts` | wrong `aud` / `iss` / expired → reject; valid → email |

## 10. Done when

| phase | criterion |
|---|---|
| 0 | `spike/RESULTS.md` filled; P1–P5 done; VM up after `authrestart`; `TimeMachine` visible in the VM |
| 1 | phone on 4G → PIN → `Hola <name>`; virtiofs test passes (or the DB fallback is in place); `docker compose down && up` keeps the row; a backup restores on the Pro |
| 2 | three real listings imported (bookmarklet where blocked) with photos; repeat → "Ya estaba guardada" |
| 3 | two members rate from their phones; `/comparar` shows both; map shows all; filters survive reload; budget typed in the app → `Fuera de presupuesto` chip appears, and none before |
| 4 | a fixture price edit → one `price_change`; a removed source → `No disponible`; badge clears on view |

## 11. Cheat-sheet

```sh
pnpm dev                                          # Pro, AUTH_DEV_EMAIL in .env.local
pnpm test
./deploy.sh
ssh air 'cd ~/srv/casaencomu && docker compose logs -f --tail 100 web'
ssh air 'cd ~/srv/casaencomu && docker compose exec web sqlite3 /data/casa.db .tables'
ssh air '~/.local/bin/casaencomu-backup.sh'; ssh air 'tail -3 ~/Library/Logs/casaencomu-backup.log'
```
