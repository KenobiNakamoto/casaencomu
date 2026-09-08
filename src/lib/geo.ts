import { norm } from "./search";

/**
 * Point in polygon for the map's area overlays. The server uses it to filter by `?zona=`, the map
 * uses it to count properties per area. No dependency: it is twenty lines and never changes.
 */

export type AreaLevel = "distrito" | "barrio";
export type AreaProps = { id: string; name: string; level: AreaLevel; district: string; count?: number };
export type AreaFeature = {
  type: "Feature";
  properties: AreaProps;
  geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
};
export type Areas = { type: "FeatureCollection"; features: AreaFeature[] };

/** Ray casting: a ray east from the point crosses the ring an odd number of times when inside. */
function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
const inPolygon = (lng: number, lat: number, rings: number[][][]) =>
  inRing(lng, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lng, lat, hole));

export function inArea(lng: number, lat: number, area: AreaFeature): boolean {
  const g = area.geometry;
  return g.type === "Polygon" ? inPolygon(lng, lat, g.coordinates) : g.coordinates.some((p) => inPolygon(lng, lat, p));
}

/** Every corner of an area, for fitting the map to it. */
export const areaCoords = (area: AreaFeature): [number, number][] =>
  (area.geometry.type === "Polygon" ? area.geometry.coordinates.flat() : area.geometry.coordinates.flat(2)) as [number, number][];

/** How many of the points fall inside each area, keyed by area id. */
export function countByArea(areas: AreaFeature[], points: { lat: number; lng: number }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const area of areas) {
    let n = 0;
    for (const p of points) if (inArea(p.lng, p.lat, area)) n++;
    counts[area.properties.id] = n;
  }
  return counts;
}

/**
 * Geometry decides. A property the portal gave no coordinates for falls back to its neighbourhood
 * text, which is the only handle it has. It lives here, not in `areas.ts`, because `areas.ts`
 * reads the file system and the filter contract must stay importable from anywhere.
 */
export function isIn(area: AreaFeature, p: { lat: number | null; lng: number | null; neighborhood: string | null }) {
  if (p.lat != null && p.lng != null) return inArea(p.lng, p.lat, area);
  return !!p.neighborhood && norm(p.neighborhood) === norm(area.properties.name);
}
