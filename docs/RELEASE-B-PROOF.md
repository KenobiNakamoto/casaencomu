# Release B — the proof

PIP-16, run on **2026-09-10** against the deployment on the Air (image built `2026-09-10T13:57Z`,
`main` at `e56f743`) and against a production build on the development Mac.

**This document exists so one question has an answer: what has actually been checked, and by
what.** Everything below is either an automated test that runs on every pull request, a number
measured on a real machine, or — and there are eight of these — **not verified**, said plainly.

Read § 5 first if you only read one part. It is the list of things nobody has looked at.

---

## 1. What is running

| | |
|---|---|
| Image | `casaencomu-web:latest`, built `2026-09-10T13:57:42Z` |
| `main` | `e56f743` |
| Tests on that commit | **660 passed, 3 skipped**, 48 files. Lint, types and `next build` clean |
| Schema version, family database | **9** |
| Authentication in force on the Air | `PREVIEW_OPEN_AS` — **no password at all**. See § 5.1 |
| Backup | installed, fired, restored. `air/README.md` |

## 2. The health check now reads the database

Before this it returned `{ok:true}` without touching anything: a check that answers «ok» from a
server that has lost its data disk, and the disk is external and removable, so that is precisely
the failure it exists to catch. It runs `SELECT 1` against the control database, answers **503**
when that fails, and carries nothing private — it is the one route outside the proxy.

```
$ curl http://127.0.0.1:3100/api/health
{"ok":true,"db":"ok","ms":0.1,"time":"2026-09-10T14:00:35.977Z"}
```

Three tests hold it there: it says the database answered; its keys are exactly `db, ms, ok, time`
and contain no path, address or count; and a closed client produces a 503 whose body has no `/`
in it.

## 3. Measured, not estimated

### 3.1 Every page, on the Air

`curl` from the Air itself, three runs each, seconds:

| route | first (cold) | warm | warm |
|---|---|---|---|
| `/propiedades` | 0.208 | 0.022 | 0.020 |
| `/mapa` | 0.014 | 0.010 | 0.010 |
| `/comparar` | 0.008 | 0.007 | 0.008 |
| `/revisar` | 0.018 | 0.012 | 0.015 |
| `/actividad` | 0.019 | 0.011 | 0.010 |
| `/ajustes` | 0.011 | 0.008 | 0.010 |
| `/proyectos` | 0.009 | 0.008 | 0.007 |
| `/api/health` | 0.0022 | 0.0018 | 0.0017 |

The 208 ms on the first `/propiedades` is the route being compiled once. Everything after is
**under 25 ms**, with 24 properties and 621 photographs in the database.

### 3.2 Import

`scripts/ingest.mts` over the 25 real captures in `_local/captures` — the same `extract()` and
`save()` the API routes call, so this is the whole pipeline except the network fetch:

```
23 imported, 0 already known, 2 with no listing
ELAPSED: 11s        →  478 ms per listing, its photographs included
23 properties · 621 photographs · 37 MB
```

The two that produced no listing are correct refusals: one is a withdrawn Vivalta advertisement
whose page never names the reference, which is the soft-404 check working.

**Not measured:** the network half. A pasted link is bounded at `PAGE_FETCH_MS` = 12 s for the
page and `IMPORT_DEADLINE_MS` = 25 s for the whole import; those are configured, not observed.

### 3.3 The map

Headless Chrome, `--enable-unsafe-swiftshader`, on the development Mac, the route warmed first,
three navigations, time from navigation start to 19 pins on a drawn canvas:

```
513 ms · 512 ms · 356 ms
```

**This is the Pro, not the Air**, and it is software rendering. The Air is an M2 Air with a real
GPU; nobody has measured it there.

## 4. The check matrix

`docs/product-improvement/06-validation.md` defines 27 checks. V27 is deferred with PIP-15 and is
not in scope.

Legend: **auto** — an automated test, run on every pull request · **live** — exercised on a
running instance today · **no** — not verified.

| | Check | How | Evidence |
|---|---|---|---|
| V01 | Capture title and friendly outcomes | auto | `intake`, `save`, `extract` tests |
| V02 | Refresh preserves family work | auto | `opinion.test.ts`, `conversation.test.ts` — the draft, the version input and the kept text |
| V03 | Import failure and bounded photos | auto | `fetching.test.ts`, `save.test.ts` |
| V04 | Redirect and URL boundaries | auto | `url.test.ts`, `url.route.test.ts` |
| V05 | Availability streaks | auto | `availability.test.ts`, `recheck` |
| V06 | Source aggregation and event wording | auto | `availability.test.ts` — «no se pudo comprobar» ≠ «ya no está publicado» |
| V07 | Filter parity and truthful controls | auto | `filters.test.ts`, `search.test.ts` |
| V08 | Return state and shared budget | auto + live | `settings.test.ts`; and set live to 480.000 € → «Es el de todos… Lo puso you ahora mismo» |
| V09 | Comparison without identifiers | auto | `comparar.test.ts` |
| V10 | Detail reading and gallery | auto | `gallery.test.ts`, `opinion.test.ts` — one photo surface, keyboard, counter |
| V11 | Mutation feedback and recovery | auto | `pip08.test.ts`, `comments.test.ts` |
| V12 | Private drafts and publication | auto | `opinions.test.ts` — a draft writes no event |
| V13 | Scoring and honest disagreement | auto | `ratings.test.ts`, `opinion-summary.test.ts` |
| V14 | Concurrent explicit saves and reviews | auto + live | `comments.test.ts`; and a two-device conflict driven in a browser during #146 |
| V15 | Stable map lifecycle | auto | `map-style.test.ts`, `map-pins.test.ts` |
| V16 | Token and contrast checks | auto | `theme.test.ts`, `globals.test.ts` (tokens only — see § 5.4) |
| V17 | Responsive and keyboard checks | **partly** | phone width and overflow measured in headless Chrome; keyboard paths by source. **Not on a real phone** — § 5.3 |
| V18 | Dark-map visual checks | **no** | § 5.4 |
| V19 | Motion and theme resilience | auto | `routes.test.ts` — reduced motion removes the movement, not only its duration |
| V20 | Map failure and accessibility | auto | `map-style.test.ts` |
| V21 | Simple discussion and reply context | auto + live | `comments.test.ts`, `conversation.test.ts`; written, replied, edited and removed in a browser during #146 |
| V22 | Shared stage safety | auto | `pip08.test.ts` — the version is in the `WHERE` |
| V23 | Authorization and output safety | **live** | § 4.1 |
| V24 | Migration and recovery | auto + live | § 4.2 |
| V25 | Explicit activity reads | auto + live | § 4.3 |
| V26 | Onboarding and person identity | auto + **partly** | `ajustes.test.ts`, `settings.test.ts`; the iPhone steps are **not tested on an iPhone** — § 5.3 |

### 4.1 V23 — authorization, on a production build

`next build` + `node .next/standalone/server.js`, `NODE_ENV=production`, no `.env.local`, a
preview password set:

| request | answer |
|---|---|
| `/propiedades`, no credentials | **401** |
| `/propiedades`, forged `x-user-email: attacker@example.com` | **401** |
| `/propiedades`, forged `cf-access-jwt-assertion` | **401** |
| `/propiedades`, wrong password | **401** |
| `/propiedades`, right password | 200 |
| `/api/photos/…`, no credentials | **401** |
| `/api/import`, no credentials | **401** |
| `/api/health` | 200, and it is meant to be |

**The forged header does not change who you are.** A request carrying a valid password for `ana`
*and* `x-user-email: attacker@example.com` created the user `ana@casa.local`. There is no
`attacker@example.com` anywhere in the resulting databases. The proxy overwrites the header before
the application sees it.

**The development bypass is not in the production build.** `grep -rl AUTH_DEV_EMAIL .next/` inside
the running container finds nothing: `process.env.NODE_ENV` is inlined at build time, so that
branch is eliminated. `NODE_ENV` in the container is `production`.

Origins and tokens:

| request | answer |
|---|---|
| `/api/import`, valid session, `Origin: https://evil.example` | refused, `?error=Petición no permitida`, **no fetch made** |
| `/api/import`, valid session, no `Origin` | refused, same |
| `/api/capture`, `Origin: null`, invalid token | **403** |
| `/api/capture`, `Origin: null`, no token | **403** |

`/api/capture` accepting `Origin: null` is deliberate: the bookmarklet posts from a portal's own
page, and the capture token is both the guard and the identity.

### 4.2 V24 — migration and recovery

**From nothing.** A production server started against an empty `DATA_DIR` built the control
database and three project databases, each at **`user_version` 9** with 12 tables. No step was
skipped and none was applied twice.

**From the family's real data.** The deploy of `e56f743` migrated the live database in place:

```
[db] decoding the entities in 19 listing(s)
[db] migrated to version 8 (issue #143 — the words a portal wrote, not the entities…)
[db] migrated to version 9 (issue #151 — activity that stays unread until you have read it)
```

Afterwards: schema 9, **0** descriptions still holding an entity, **103** read marks seeded from
the old timestamp so nobody met a wall of «nuevo».

**Idempotence** is asserted by `migrate.test.ts`, which runs the chain, runs it again, and checks
the version has not moved. Migration 7 and migration 8 are both written as functions that read the
database first, precisely so a rewind and a replay are safe.

**Restore**, run 2026-09-10 (#21): a 680 KB archive decrypted and unpacked; `PRAGMA
integrity_check` **ok** on both files; every count identical to the live database — 24 properties,
3 opinions, 3 comments, 18 ratings, 57 events, 7 users, 7 memberships, 1 project.

**Photographs are not in the backup.** A database-only restore is not complete recovery, and
`air/README.md` says so where somebody restoring would read it. A photograph can be fetched again
while the advertisement is alive, and not once it is gone.

**Not injected:** a failure part-way through a migration. Each step commits with its own
`PRAGMA user_version` in one write transaction, so a half-applied step cannot exist — but nobody
has killed the process mid-chain to watch it.

### 4.3 V25 — explicit activity reads

Measured on a copy of the family's database seeded to 95 events, 70 of them unread:

| | |
|---|---|
| three renders of `/actividad` (a prefetch renders) | read rows unchanged, 25 → 25 |
| «Marcar esta página como visto» | read rows 25 → **75** — exactly the 50 drawn |
| unread after | 70 → **20** |
| page two | still 20 lines, every one «nuevo» |
| paging the whole history at 7 per page | every row exactly once, none repeated |

No interval, focus poll, visibility timer or updates endpoint was added; a test asserts each of
those words is absent from the page and its refresh control.

---

## 5. What has **not** been verified

This is the honest part, and the reason the document exists.

### 5.1 The Air is open to anyone who can reach the port

`PREVIEW_OPEN_AS` is set, so there is no password and no prompt: everyone who reaches the app is
one identity. It is deliberate and it is only safe because the tailnet is the perimeter — but it
is **not** the deployment. `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are unset, so Cloudflare
Access is not in force. The domain and the Zero Trust account are #1 and #2, and both are
Kenobi's.

Until then: **nothing on that machine should be treated as private from anyone on the tailnet.**

### 5.2 It is not on a domain

There is no DNS, no tunnel, no certificate. `/salir` redirects to Cloudflare's logout only when
Access is configured, so the logout path in force today is the Basic-auth challenge — and with
`PREVIEW_OPEN_AS` set there is no session to end at all.

### 5.3 No real phone has opened it

Every mobile claim in this repository comes from headless Chrome at 390×844 with a device-metrics
override. That proves the CSS branch. It does not prove a tap target, a soft keyboard, Safari's
address bar, or the bookmarklet install (V26 asks for exactly that, on the device). **Issue #20.**

### 5.4 No colour or dark-map check was made by eye

V16's tokens are asserted as values and V18's dark map has never been looked at. There is no
contrast measurement anywhere in this repository. Treat every visual claim as untested.

### 5.5 The reader has never been watched end to end on the Air

`com.kenobi.casaencomu-reader` is loaded and polling every 30 s, and its log shows only its
startup line. Nobody has pasted an Idealista link into the deployed app and watched it fill.

### 5.6 The map's group chooser has never fired on real data

All 19 mappable properties have distinct coordinates. It is unit-tested and it was exercised by
forcing three onto one point in a throwaway copy.

### 5.7 No migration has been interrupted on purpose

See § 4.2.

### 5.8 The map has not been timed on the Air

See § 3.3.

---

## 6. Code-ready, or deployed-and-verified?

| | |
|---|---|
| **Code-ready** | Release A and Release B, all of it. 660 tests, lint, types, build. |
| **Deployed** | Yes, on the Air, at `e56f743`, migrated in place, backed up nightly. |
| **Verified** | The server side, by § 3 and § 4. |
| **Not verified** | Everything in § 5 — and the two largest are that a real phone has never opened it, and that the Air currently asks for no password. |

The app is finished and it is running. It is not yet a deployment anyone should put a domain in
front of: § 5.1 and § 5.2 come first, and both need Kenobi.
