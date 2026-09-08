import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countByArea, inArea, type AreaFeature, type Areas } from "./geo";

const square = (rings: number[][][]): AreaFeature => ({
  type: "Feature",
  properties: { id: "t", name: "Test", level: "barrio", rank: 6, parent: null },
  geometry: { type: "Polygon", coordinates: rings },
});
const OUTER = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const HOLE = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];

describe("inArea", () => {
  it("separates inside from outside", () => {
    const s = square([OUTER]);
    expect(inArea(5, 5, s)).toBe(true);
    expect(inArea(15, 5, s)).toBe(false);
    expect(inArea(-1, 5, s)).toBe(false);
  });
  it("treats a hole as outside", () => {
    const s = square([OUTER, HOLE]);
    expect(inArea(5, 5, s)).toBe(false);
    expect(inArea(2, 2, s)).toBe(true);
  });
  it("accepts any ring of a multipolygon", () => {
    const m: AreaFeature = {
      ...square([OUTER]),
      geometry: { type: "MultiPolygon", coordinates: [[OUTER], [[[20, 20], [22, 20], [22, 22], [20, 22], [20, 20]]]] },
    };
    expect(inArea(21, 21, m)).toBe(true);
    expect(inArea(15, 15, m)).toBe(false);
  });
});

describe("the shipped boundaries", () => {
  const areas = JSON.parse(readFileSync("public/areas.geojson", "utf8")) as Areas;
  // By name and rank: "Barcelona" is both a province and the city inside it.
  const named = (name: string, rank: number) => areas.features.find((f) => f.properties.name === name && f.properties.rank === rank)!;

  it("carries Barcelona's ten districts under the city itself", () => {
    const city = named("Barcelona", 4);
    const districts = areas.features.filter((f) => f.properties.parent === city.properties.id);
    expect(districts).toHaveLength(10);
  });

  it("puts the Sagrada Família in its own barri, its district, its city and its region", () => {
    const [lng, lat] = [2.1744, 41.4036];
    const hits = areas.features.filter((f) => inArea(lng, lat, f)).map((f) => f.properties.name);
    expect(hits).toContain("la Sagrada Família");
    expect(hits).toContain("l'Eixample");
    expect(hits).toContain("Barcelona");
    expect(hits).toContain("Catalunya");
  });

  it("counts a point once at each level that contains it", () => {
    const counts = countByArea(areas.features, [{ lat: 41.4036, lng: 2.1744 }]);
    const hit = areas.features.filter((f) => counts[f.properties.id] > 0);
    expect(new Set(hit.map((f) => f.properties.rank)).size).toBe(hit.length);
  });
});
