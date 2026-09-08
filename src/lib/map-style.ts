/**
 * Builds the basemap style from the vendored Positron snapshot and the theme's map tokens.
 *
 * The point is coverage: every layer in the snapshot is given a role, so none can keep a
 * light default on a dark map (F09). `map-style.test.ts` fails when a layer has no role —
 * fix `ROLES`, never widen the test. Provenance and licence: `map-style-base.README.md`.
 */
import raw from "./map-style-base.json";

/**
 * The JSON import types itself as the exact literal it happens to contain, which makes every
 * layer a different shape. One loose structural type at the boundary keeps the rest readable;
 * `map-style.test.ts` is what actually holds the file's contents to account.
 */
export type Layer = {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
};
export type BaseStyle = {
  version: 8;
  sources: Record<string, unknown>;
  sprite: string;
  glyphs: string;
  layers: Layer[];
};

const base = raw as unknown as BaseStyle;

export const MAP_TOKENS = [
  "--map-bg",
  "--map-building",
  "--map-water",
  "--map-park",
  "--map-wood",
  "--map-road-minor",
  "--map-road-major",
  "--map-road-casing",
  "--map-path",
  "--map-rail",
  "--map-boundary",
  "--map-label",
  "--map-label-secondary",
  "--map-water-label",
  "--map-halo",
] as const;

export type MapToken = (typeof MAP_TOKENS)[number];
export type MapTokens = Record<MapToken, string>;

type Role =
  | "bg"
  | "building"
  | "water"
  | "park"
  | "wood"
  | "path"
  | "road-minor"
  | "road-major"
  | "road-casing"
  | "rail"
  | "rail-dash"
  | "boundary"
  | "label-water"
  | "label-street"
  | "label-place"
  | "hidden";

/** Every layer of the snapshot, from `03-design-motion-map.md` § 7. */
export const ROLES: Record<string, Role> = {
  background: "bg",
  landuse_residential: "bg",
  road_area_pier: "bg",
  park: "park",
  landcover_wood: "wood",
  water: "water",
  waterway: "water",
  building: "building",
  "aeroway-area": "building",
  // Not in Barcelona, but a missing role is a light default waiting to happen.
  landcover_ice_shelf: "bg",
  landcover_glacier: "bg",
  road_pier: "path",
  highway_path: "path",
  "aeroway-taxiway": "path",
  highway_minor: "road-minor",
  highway_major_subtle: "road-minor",
  highway_motorway_subtle: "road-minor",
  highway_major_casing: "road-casing",
  highway_motorway_casing: "road-casing",
  highway_motorway_bridge_casing: "road-casing",
  tunnel_motorway_casing: "road-casing",
  "aeroway-runway-casing": "road-casing",
  highway_major_inner: "road-major",
  highway_motorway_inner: "road-major",
  highway_motorway_bridge_inner: "road-major",
  tunnel_motorway_inner: "road-major",
  "aeroway-runway": "road-major",
  railway: "rail",
  railway_service: "rail",
  railway_transit: "rail",
  // The dashes are drawn in the background colour, on top of the rail line: they are the gaps.
  railway_dashline: "rail-dash",
  railway_service_dashline: "rail-dash",
  railway_transit_dashline: "rail-dash",
  boundary_2: "boundary",
  boundary_3: "boundary",
  boundary_disputed: "boundary",
  waterway_line_label: "label-water",
  water_name_point_label: "label-water",
  water_name_line_label: "label-water",
  "highway-name-path": "label-street",
  "highway-name-minor": "label-street",
  "highway-name-major": "label-street",
  airport: "label-place",
  label_village: "label-place",
  label_town: "label-place",
  label_state: "label-place",
  label_city: "label-place",
  label_city_capital: "label-place",
  label_country_1: "label-place",
  label_country_2: "label-place",
  label_country_3: "label-place",
  // Our own district and barrio labels stand in these places; two sets would collide.
  label_other: "hidden",
  // US and European route shields ship as untinted sprites. A Barcelona home search needs none.
  "highway-shield-non-us": "hidden",
  "highway-shield-us-interstate": "hidden",
  road_shield_us: "hidden",
};

const TOKEN_FOR: Record<Exclude<Role, "hidden">, MapToken> = {
  bg: "--map-bg",
  building: "--map-building",
  water: "--map-water",
  park: "--map-park",
  wood: "--map-wood",
  path: "--map-path",
  "road-minor": "--map-road-minor",
  "road-major": "--map-road-major",
  "road-casing": "--map-road-casing",
  rail: "--map-rail",
  "rail-dash": "--map-bg",
  boundary: "--map-boundary",
  "label-water": "--map-water-label",
  "label-street": "--map-label-secondary",
  "label-place": "--map-label",
};

/** § 7: 1 px on street names, 1.25 px on place names. Water names read as place names. */
const HALO_WIDTH: Record<"label-water" | "label-street" | "label-place", number> = {
  "label-water": 1.25,
  "label-street": 1,
  "label-place": 1.25,
};

/** Positron prefers `name_en` ("OLD TOWN"); the family reads the local names. */
export const LOCAL_NAME = ["coalesce", ["get", "name:latin"], ["get", "name"]];

/** `hsla()`/`rgba()` alpha, else 1. The subtle road layers encode their weight in the colour. */
const alphaOf = (colour: unknown) => {
  const m = typeof colour === "string" && /^(?:rgba|hsla)\([^)]*,\s*([\d.]+)\s*\)$/.exec(colour);
  return m ? Number(m[1]) : 1;
};

export type Overrides = { paint: Record<string, unknown>; layout: Record<string, unknown> };

/**
 * What one layer becomes under `t`. The same result builds the initial style and re-paints
 * on a theme change, so the two can never drift apart.
 */
export function overridesFor(layer: Layer, t: MapTokens): Overrides {
  const role = ROLES[layer.id];
  if (!role) throw new Error(`map-style: layer "${layer.id}" has no role. Add it to ROLES.`);
  if (role === "hidden") return { paint: {}, layout: { visibility: "none" } };

  const colour = t[TOKEN_FOR[role]];
  const was = layer.paint ?? {};

  switch (layer.type) {
    case "background":
      return { paint: { "background-color": colour }, layout: {} };

    case "fill": {
      const paint: Record<string, unknown> = { "fill-color": colour };
      // Positron gives buildings a darker edge. Keep one, from the neutral casing token —
      // visible by day, and all but gone at night, which is what a dark map wants.
      if ("fill-outline-color" in was) paint["fill-outline-color"] = t["--map-road-casing"];
      return { paint, layout: {} };
    }

    case "line": {
      const paint: Record<string, unknown> = { "line-color": colour };
      // A token is opaque, so an alpha hidden in the original colour would be lost.
      const a = alphaOf(was["line-color"]);
      if (a < 1 && !("line-opacity" in was)) paint["line-opacity"] = a;
      return { paint, layout: {} };
    }

    case "symbol":
      return {
        paint: {
          "text-color": colour,
          // Set on every enabled text layer, including the ones that never declared a halo.
          "text-halo-color": t["--map-halo"],
          "text-halo-width": HALO_WIDTH[role as keyof typeof HALO_WIDTH],
        },
        layout: { "text-field": LOCAL_NAME },
      };

    default:
      return { paint: {}, layout: {} };
  }
}

/** The snapshot's layers, for callers that re-paint an already-loaded map. */
export const baseLayers: Layer[] = base.layers;

/** A fresh style object. Sources, sprite, glyphs, filters, zoom bounds and widths are untouched. */
export function buildStyle(t: MapTokens) {
  const style: BaseStyle = structuredClone(base);
  for (const layer of style.layers) {
    const { paint, layout } = overridesFor(layer, t);
    Object.assign((layer.paint ??= {}), paint);
    Object.assign((layer.layout ??= {}), layout);
  }
  return style;
}

type Paintable = {
  getLayer(id: string): unknown;
  setPaintProperty(id: string, name: string, value: unknown): unknown;
  setLayoutProperty(id: string, name: string, value: unknown): unknown;
};

/**
 * Re-paints a live map in place. This is why a theme change does not rebuild the map:
 * paint updates keep the camera, the markers, the sources and the selection (§ 8.3).
 */
export function repaint(map: Paintable, t: MapTokens) {
  for (const layer of baseLayers) {
    if (!map.getLayer(layer.id)) continue;
    const { paint, layout } = overridesFor(layer, t);
    for (const [k, v] of Object.entries(paint)) map.setPaintProperty(layer.id, k, v);
    for (const [k, v] of Object.entries(layout)) map.setLayoutProperty(layer.id, k, v);
  }
}
