/**
 * Builds `public/areas.geojson`: Barcelona's 10 districts and 73 barris, simplified for the map.
 *
 * Source: Ajuntament de Barcelona open data, via github.com/martgnz/bcn-geodata (CC BY 4.0).
 * Run it again only when the boundaries change, which is close to never:
 *   node scripts/build-areas.mjs
 *
 * The output keeps four properties per feature (id, name, level, district) and drops the other
 * fifty, then simplifies the rings: the map shades areas, it does not survey them.
 */
import { writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/martgnz/bcn-geodata/master/";
const TOLERANCE = 0.00005; // degrees, about 5 m
const DIGITS = 5; // about 1 m

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Douglas-Peucker. Keeps the first and last point, drops anything within `tol` of the chord. */
function simplify(points, tol) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points.at(-1);
  let far = 0;
  let max = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d > max) {
      max = d;
      far = i;
    }
  }
  if (max <= tol) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, far + 1), tol).slice(0, -1), ...simplify(points.slice(far), tol)];
}

const round = (p) => p.map((n) => Number(n.toFixed(DIGITS)));

/** A ring must stay closed and keep at least a triangle. */
function ring(points) {
  const out = simplify(points, TOLERANCE).map(round);
  if (out.length < 4) return null;
  const [first, last] = [out[0], out.at(-1)];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push(first);
  return out;
}

const shrink = (geometry) => {
  const rings = (polygon) => polygon.map(ring).filter(Boolean);
  if (geometry.type === "Polygon") return { type: "Polygon", coordinates: rings(geometry.coordinates) };
  return { type: "MultiPolygon", coordinates: geometry.coordinates.map(rings).filter((p) => p.length) };
};

const load = async (path) => (await fetch(SRC + path).then((r) => r.json())).features;

const [barris, districtes] = await Promise.all([load("barris/barris.geojson"), load("districtes/districtes.geojson")]);

const features = [
  ...districtes.map((f) => ({ f, level: "distrito" })),
  ...barris.map((f) => ({ f, level: "barrio" })),
].map(({ f, level }) => ({
  type: "Feature",
  properties: {
    id: `${level === "distrito" ? "d" : "b"}-${slug(f.properties.NOM)}`,
    name: f.properties.NOM,
    level,
    district: f.properties.DISTRICTE,
  },
  geometry: shrink(f.geometry),
}));

const out = { type: "FeatureCollection", features };
writeFileSync("public/areas.geojson", JSON.stringify(out));
const ids = new Set(features.map((f) => f.properties.id));
console.log(`${features.length} areas, ${ids.size} unique ids, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
