# Scripts

Nothing here runs in the container. `ingest.mts` and `build-areas.mts` are run by hand in
development; `capture-agent.mjs` and `ai-bridge.mjs` run on the server, beside the container,
because a container can drive neither a browser nor a signed-in CLI. Both server scripts are
installed and kept alive by LaunchAgents — **`air/README.md` is their runbook**, this file only
says what they are.

## `capture-agent.mjs` — the browser reader

Asks the app which pasted links are still unread, opens each one in a stock Chrome with an empty
profile, and posts the collected page back to `/api/capture`. It exists because Idealista answers
a server fetch with a DataDome challenge and a real browser with the advertisement. Nothing here
defeats the challenge: the challenge's own JavaScript runs and passes. Details: `docs/PORTALS.md`.

## `ai-bridge.mjs` — the fill layers without an API key

```sh
CASA_AI_TOKEN=… node scripts/ai-bridge.mjs      # then AI_BASE_URL=http://…:8788 in the app's .env
```

Answers `POST /v1/messages` in the Anthropic Messages shape by running `claude -p` in a temporary
directory: fixed instructions in, one JSON object out. Photographs arrive as base64 and are
written to that directory as files the CLI opens with `Read`.

The prompts, the range guards and the provenance marks are **not** here — they stay in
`src/lib/enrich.ts`, so the two ways to reach a model produce the same records and the same
tests cover both. The bridge only carries the request, and an answer it cannot parse becomes an
empty tool call, which every caller already reads as "this layer found nothing".

`CASA_AI_TOKEN` is the shared secret: the app sends it as `x-api-key` and the bridge refuses
everything else, because it listens on every interface so the container can reach it.

## `ingest.mts` — fill a development database from real advertisements

```sh
pnpm tsx scripts/ingest.mts [dir] [--reset] [--user <email>]   # dir defaults to _local/captures
```

It reads saved pages and puts them through `extract()` and `save()` — the same two functions the
API routes call — so nothing in the database is invented. `--reset` empties the tables first.

A capture is one JSON file per page, in either shape the extractor already accepts:

- `{url, status, html}` — a portal that answers a plain server fetch.
- `{url, title, ld, og, blob, imgs, text}` — the bookmarklet shape, for a portal that does not.

Captures are never committed: they are third-party pages, and they hold the pages the family was
actually looking at. They live in `_local/captures`.

Collecting a browser-only page in development is awkward on purpose. A page served over HTTPS
cannot reach `http://localhost`, so neither a `fetch` nor a form POST arrives. Hand the payload
over in a URL fragment instead: navigate the tab to `http://localhost:3000/ayuda#cap=<encoded>`,
then read `location.hash` from that page and post it same-origin. In production none of this
applies — the application is on a public HTTPS origin and the bookmarklet posts to it directly.

## `build-areas.mts` — rebuild the map's zones

```sh
pnpm tsx scripts/build-areas.mts es --root Catalunya    # writes public/areas.geojson
pnpm tsx scripts/build-areas.mts es --probe             # which admin level holds what
```

Builds every administrative level of one country, from OpenStreetMap, into the one file the map
reads. Adding a country is one JSON file in `scripts/areas/`, and no code.

**Read `scripts/areas/README.md` before running it** — the config fields, what the two upstream
services are for, and what the pipeline cannot do yet.
