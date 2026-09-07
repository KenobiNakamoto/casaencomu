# Scripts

Two things that are run by hand. Neither is part of the application, neither runs in the
container, and neither is on a schedule.

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

## `build-areas.mjs` — rebuild the map overlay

```sh
node scripts/build-areas.mjs        # writes public/areas.geojson
```

Downloads Barcelona's district and barri boundaries, keeps four properties per feature, drops the
other fifty, and simplifies the rings to about five metres. The map shades areas; it does not
survey them.

Source: Ajuntament de Barcelona open data, through `github.com/martgnz/bcn-geodata`, CC BY 4.0.
Run it again only when the boundaries change, which is close to never.
