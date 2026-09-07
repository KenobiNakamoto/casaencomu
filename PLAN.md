# CasaEnComú — Plan v3 (ponytail)

_2026-09-04. v3 = v2 under ponytail: same product, half the machinery. Earlier versions in
`_archive/`. Why each cut: `memory/decisions.md`. How to build: `SCAFFOLD.md`._

## Summary

A private, Spanish-first web app for one family's home search in Barcelona. Members add listings
from Idealista, Fotocasa or Habitaclia; the app keeps facts and photos, deduplicates, maps,
compares, lets each member rate and comment, and rechecks price and availability every 48 h.
Runs on the MacBook Air, reached through Cloudflare Access.

## v1 ships

- Add a listing with the **bookmarklet** (primary) or by **pasting a URL** (portal hosts only).
- Facts + photos, exact duplicate detection, list with filters, map, compare 2–4, six rating
  dimensions, comments, stages, `Actividad` feed, 48 h rechecks, nightly encrypted backup.

## Cut from v1 — and the trigger that brings each back

| Cut | Add it when |
|---|---|
| Server-side fetch of blocked portals; headless or real Chrome | a removed listing cannot be detected any other way |
| Job queue, retries, `needs_review` | an import takes > 20 s, or silent failures happen weekly |
| Per-portal adapter files | the one generic extractor misses a field the family cares about |
| Page-HTML snapshots | someone asks "what did the ad say before" |
| Roles, invitations, admin page | one Cloudflare Access email list stops being enough |
| Fuzzy duplicates, image hashes | the same flat on two portals slips through twice |
| LLM enrichment (Anthropic API, `claude-opus-5`, structured output) | the family wants summaries or inferred fields |
| Postgres/PostGIS, worker container, Drizzle | > 5k properties or a second writer process |
| Neighbourhood and due-diligence add-ons | v1 is in daily use |

## Architecture

```
phones / laptops ──HTTPS──▶ Cloudflare Access (email PIN, allowlist) ── Tunnel ──▶ cloudflared on the Air ──▶ 127.0.0.1:3100
Air ── Colima VM ── container casaencomu-web:  Next.js 16 + SQLite (@libsql/client, raw SQL) + hourly recheck loop
data root:  /Volumes/TimeMachine/casaencomu   ← bind-mounted as /data
```

- **One process.** Web and the recheck loop live in `next start` (`instrumentation.ts`).
- **Auth = Cloudflare Access.** The Access policy's email list *is* the allowlist. The app
  verifies the Access JWT (`jose`) and auto-creates a `users` row from the email. No roles, no
  invitations, no admin page. Adding a family member = adding an email in the Access policy.
- **Data on the `TimeMachine` volume.** Kenobi's decision, 2026-09-04: that volume is
  general-purpose storage; its name is historical. It is mounted into the Colima VM (virtiofs)
  and bind-mounted as `/data`. SQLite runs in `journal_mode=DELETE` (no WAL shared memory over
  virtiofs). Phase 1 runs a 30-second write-and-lock test; if it fails, only the `.db` file
  moves to a Docker named volume and photos stay on `TimeMachine`.
- **Reboot survival is Colima's.** `restart: unless-stopped`. The only dependency is Colima at
  boot, still pending the `limactl` Full Disk Access grant (`00_docs/AIR-SERVER.md`).
- **Backups.** Nightly `VACUUM INTO` → `openssl enc` → iCloud Drive on the Air; 31 dailies plus
  first-of-month. Launched by a LaunchAgent through `ssh localhost`, because launchd cannot read
  `/Volumes`. Restore is tested in Phase 1. Photos are not backed up (re-downloadable while the
  ad lives). Passphrase in 1Password or the backups are noise.
- **Secrets and PII.** `.env` on the Air only. Family emails live in Cloudflare Access and in
  `users`, never in the repo.
- **The JWT check is load-bearing.** The port is published on `127.0.0.1`, but Colima port
  forwards can bind `*`; the JWT is what makes a direct request fail.

## Product

- Nav: `Propiedades`, `Mapa`, `Comparar`, `Actividad`, `Ayuda` (bookmarklet + how-to).
- `Añadir enlace`: paste a URL, or run the bookmarklet on the listing page (iPhone Safari too).
- List: gallery or rows; filters in the URL (price, neighbourhood, rooms, m², stage, family score).
  Budget: empty at first. A member sets `Presupuesto` (min–max) in the app; it is never
  prepopulated (Kenobi, 2026-09-04). Once set, out-of-range is flagged, never blocked.
- Stages: `Nueva`, `Revisando`, `Preseleccionada`, `Visita prevista`, `Descartada`,
  `No disponible`. Anyone can change a stage.
- Map: MapLibre GL + OpenFreeMap Positron (keyless vector tiles, Airbnb palette via paint
  overrides), no clustering; exact vs approximate markers; tap → preview. Barcelona's districts
  and barris are drawn over it (`public/areas.geojson`, Ajuntament open data, CC BY 4.0), districts
  below zoom 13.5 and barris above, each labelled with how many properties it holds; clicking one
  filters the page with `?zona=`.
- Detail: photos, facts, sources, verbatim description, price history, review matrix, comments,
  timeline.
- Ratings: one 1–5 per member per dimension — `Ubicación`, `Distribución`, `Luz y vistas`,
  `Estado`, `Relación calidad-precio`, `Encaje familiar`.
- Compare: 2–4 columns; differing rows highlighted; `Sin datos` for nulls.
- `Actividad`: `events` newest first; unread badge from `users.last_seen_at`.
- Mobile: bottom nav, full-screen map/list switch, ≥ 44 px rating targets.

## Intake

- **Bookmarklet.** Collects JSON-LD, `og:*`, `#__NEXT_DATA__`, image `src`s, and the page text,
  then form-POSTs to `/api/capture` with the member's `capture_token` (CSRF guard). Needs the
  Access cookie set to SameSite=None so the cross-site POST carries the session. Result: property
  created → 303 to its page. Duplicate → 303 to the existing one with "Ya estaba guardada".
- **Paste URL.** `fetch()` only when `hostname ∈ ALLOWED_HOSTS` (the three portals). That
  allowlist *is* the SSRF guard. 403 or CAPTCHA → "Abre el anuncio y pulsa el marcador". Never
  bypass.
- **One extractor** (`extract.ts`): JSON-LD → OpenGraph → the portal's own JSON blob, with a
  small per-portal switch for the listing ref and the blob path. Output is the `Listing` zod
  schema; every field but `title` is nullable. Description verbatim.
- **Photos.** Download only from `ALLOWED_IMAGE_HOSTS` (from the spike), sha256 dedupe, one
  800 px JPEG via `sharp`, served by an authenticated route. Import is synchronous inside the
  request; target < 20 s.
- **Rechecks.** Hourly loop: sources with `last_checked_at` older than 48 h, at most 10 per run,
  60 s apart. Removed marker or two 404s in a row → `No disponible`. Price or facts change →
  `events`. 403 or timeout → `unknown`, never "gone". Bookmarklet-only sources show
  "Comprobar" → re-capture.

## Data — 8 tables

`users`, `properties`, `sources` (carries `facts_json` + `facts_hash` of the last extraction),
`photos`, `events`, `ratings`, `comments`, `settings` (key/value; holds the budget, empty until set). `schema.sql` applied at boot with
`CREATE TABLE IF NOT EXISTS`; `PRAGMA user_version` gates later `ALTER`s.

## Phases

0. Spike + prerequisites: portal results; domain; Zero Trust; `limactl` grant; `TimeMachine`
   mount added to Colima; area, member emails confirmed.
1. Walking skeleton: deploy, tunnel, Access, JWT, users, virtiofs test, backup + restore.
   Done when a phone on 4G sees `Hola <name>` behind the PIN and a backup restores.
2. Intake: bookmarklet, paste, extractor, photos, duplicates.
3. Workspace: list, detail, ratings, comments, compare, map, mobile.
4. Rechecks + `Actividad`.

## Checks

Five vitests — `url`, `extract` on fixtures, `changes`, `ratings`, `auth` — plus the manual
checklist per phase in `SCAFFOLD.md`.

## Open questions

Barcelona? Domain (recommend registering one at Cloudflare; do not reuse
`barcelonabitcoinhub.com`). Member email list.
