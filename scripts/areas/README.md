# Areas — the map's zones, in any country

`public/areas.geojson` holds every zone the map can draw: the outlines, the names, and which zone
sits inside which. One file, built by `scripts/build-areas.mts`, from OpenStreetMap.

Countries divide themselves differently, so the file does not name the divisions. Every zone
carries a **rank** from 1 to 6, widest first, and the map gives each rank a zoom band. Spain's
comarca and Germany's Amt are both rank 3. A country with fewer divisions leaves a rank empty and
nothing else changes.

| rank | Spain | Germany | Portugal | United Kingdom |
|---|---|---|---|---|
| 1 | comunidad autónoma | Bundesland | distrito | country |
| 2 | provincia | Regierungsbezirk | — | county |
| 3 | comarca | Kreis | — | — |
| 4 | municipio | Gemeinde | município | district |
| 5 | distrito | Stadtbezirk | freguesia | ward |
| 6 | barrio | Ortsteil | — | — |

**Only the Spain column is measured.** The others are what the OSM wiki claims, and the wiki is a
description of practice, not a rule. Measure before you trust: that is what `--probe` is for.

## Add a country

1. **Find the country's OSM relation id.** Search the country on openstreetmap.org and read the id
   out of the URL: `/relation/1311341` is Spain.

2. **Ask what each administrative level actually holds.**

   ```sh
   pnpm tsx scripts/build-areas.mts de --probe                  # needs de.json to exist first
   pnpm tsx scripts/build-areas.mts de --probe --inside 62422   # or inside one city
   ```

   It prints a count and four names per level and nothing else, so a wrong guess costs seconds.
   A level that answers `too many to ask at once` is not broken; ask it inside a smaller area.

3. **Write `scripts/areas/<code>.json`.** One line per rank you want to draw. Skip the levels the
   country does not use — ranks do not have to be contiguous, they only have to be ordered.

   ```json
   { "rank": 3, "level": "comarca", "admin": 7, "tol": 200, "digits": 4, "chunk": 3 }
   ```

   | field | what it is |
   |---|---|
   | `rank` | 1 to 6. Decides the zoom band the map draws it in. |
   | `level` | The local word. For people reading the file; no code branches on it. |
   | `admin` | The OSM `admin_level` this rank comes from, from step 2. |
   | `tol` | Simplification, in metres. About 1 px at the tightest zoom of the band. |
   | `digits` | Decimal places kept. 3 is ~110 m, 4 is ~11 m, 5 is ~1 m. |
   | `chunk` | Which rank to ask inside, when the parent rank is too small a net. Default: one rank up. |

4. **Build one branch first**, so a mistake is cheap:

   ```sh
   pnpm tsx scripts/build-areas.mts de --root Bayern --max-rank 4
   ```

5. **Build it all**, then check the last line: area count, and the size of the file.

   ```sh
   pnpm tsx scripts/build-areas.mts de --root Bayern
   ```

## What it does, and what that costs

Two services, each for the one thing it is good at.

- **Overpass** answers which areas exist, one query per parent area, names and ids only. Asking it
  for every municipality of a region at once answers `504`; asking one comarca at a time answers in
  three seconds. That is why the walk is top down.
- **polygons.openstreetmap.fr** answers the shape of one area, already generalised. Catalonia at
  full resolution is 4 MB and the map draws it 40 px wide.

Every response is cached in `_local/overpass/`, which is not committed. A second run costs nothing,
an interrupted run resumes, and `--fresh` ignores the cache. Both services are free and shared;
the script keeps four requests in flight and no more.

A rank's parent is the smallest area above it that contains it — computed from the geometry, not
from OSM, because OSM does not always say. It is not always one rank up: a barrio in a town with no
districts hangs off the municipality.

## Ceilings

- **One file for the whole world will not work.** Catalonia's six ranks are 2.7 MB, 644 KB over the
  wire, and every visitor downloads all of it. The next step, when it hurts, is one file per rank, and the
  map fetching a rank when its zoom band opens. Nothing else in the app has to change.
- **`tol` is set by eye.** There is no check that a rank's outlines stay separate at the widest
  zoom of its band. What *is* checked is that they stay together where they touch: the whole rank
  is simplified in one pass (`align()`), so a border between two areas is one line rather than two
  a few metres apart, and `src/lib/areas.test.ts` fails if that ever stops being true.
- **Ranks are simplified one at a time, so a border shared by two ranks is not shared geometry.**
  A barrio's outer edge and its district's edge are the same line on the ground, and the map draws
  them a few metres apart when it shows both — which it only does for the zone you selected.
- **Names come out of OSM in the local language** — Catalan in Catalonia. That matches the portals
  and the family. A country where that is wrong needs `name:xx`, which the script does not read.

OpenStreetMap data is ODbL. The map carries the attribution; keep it there.
