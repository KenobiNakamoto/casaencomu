import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countByArea, inArea, type AreaFeature, type Areas } from "./geo";

const square = (rings: number[][][]): AreaFeature => ({
  type: "Feature",
  properties: { id: "t", name: "Test", level: "barrio", district: "01" },
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

describe("the shipped Barcelona boundaries", () => {
  const areas = JSON.parse(readFileSync("public/areas.geojson", "utf8")) as Areas;

  it("carries both levels with unique ids", () => {
    const ids = new Set(areas.features.map((f) => f.properties.id));
    expect(ids.size).toBe(areas.features.length);
    expect(areas.features.filter((f) => f.properties.level === "distrito")).toHaveLength(10);
    expect(areas.features.filter((f) => f.properties.level === "barrio")).toHaveLength(73);
  });

  it("puts the Sagrada Família in its own barri and in Eixample", () => {
    const [lng, lat] = [2.1744, 41.4036];
    const hits = areas.features.filter((f) => inArea(lng, lat, f)).map((f) => f.properties.name);
    expect(hits).toContain("la Sagrada Família");
    expect(hits).toContain("Eixample");
  });

  it("counts a point once per level", () => {
    const counts = countByArea(areas.features, [{ lat: 41.4036, lng: 2.1744 }]);
    expect(Object.values(counts).filter((n) => n > 0)).toHaveLength(2);
  });
});
