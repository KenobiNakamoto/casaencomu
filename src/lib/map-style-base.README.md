# `map-style-base.json`

A snapshot of the OpenFreeMap **Positron** vector style.

| | |
|---|---|
| Source | `https://tiles.openfreemap.org/styles/positron` |
| Retrieved | 2026-09-07 |
| Layers | 55 |
| Style spec version | 8 |

## Why a snapshot

`map-style.ts` recolours every layer from the theme tokens. That only works if the
layer list is known: an unmapped layer keeps its light default, which is exactly the
night-map defect this replaces (F09). Fetching the style at runtime would let the
provider add a layer and silently reintroduce a pale road on a dark map. The snapshot
pins the input, and `map-style.test.ts` fails when a layer has no role.

This pins **visual inputs only**. Tiles, fonts and sprites are still fetched from
OpenFreeMap at runtime through the `sources`, `glyphs` and `sprite` URLs kept in the
file. No tile data and no credentials are vendored.

## Licence and attribution

- Style: Positron, by CARTO, BSD-3-Clause. Adapted here — recoloured, some layers hidden.
- Tiles: OpenFreeMap, from OpenStreetMap data, ODbL.
- Data: © OpenStreetMap contributors.
- Shaded relief: Natural Earth II, public domain.

`Mapa.tsx` keeps MapLibre's `AttributionControl`, so the runtime credit stays on the map
in both themes. Do not remove it.

## Refreshing the snapshot

```sh
curl -s https://tiles.openfreemap.org/styles/positron | python3 -m json.tool > src/lib/map-style-base.json
pnpm vitest run src/lib/map-style.test.ts
```

A new layer fails the coverage test. Give it a role in `ROLES` before shipping — do not
widen the test.
