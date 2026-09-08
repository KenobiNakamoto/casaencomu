import { describe, expect, it } from "vitest";
import { areaChain, loadAreas } from "./areas";

/**
 * `public/areas.geojson` is generated, committed, and read by both the server and the browser, so
 * the file itself is what these check. They are the runnable check on `scripts/build-areas.mts`:
 * the parent of a zone is worked out from geometry, and geometry is easy to get subtly wrong.
 */
const areas = await loadAreas();
const byId = new Map(areas.features.map((f) => [f.properties.id, f]));

describe("the zones the map draws", () => {
  it("has zones at more than one level", () => {
    const ranks = new Set(areas.features.map((f) => f.properties.rank));
    expect(ranks.size).toBeGreaterThan(2);
    expect(Math.min(...ranks)).toBe(1);
  });

  it("gives every zone an id nothing else has", () => {
    expect(byId.size).toBe(areas.features.length);
    for (const f of areas.features) expect(f.properties.id).toMatch(/^\d-[a-z0-9-]+-\d+$/);
  });

  it("puts every zone inside a wider one", () => {
    for (const f of areas.features) {
      if (f.properties.rank === 1) continue;
      const parent = byId.get(f.properties.parent ?? "");
      expect(parent, `${f.properties.name} has no parent`).toBeDefined();
      expect(parent!.properties.rank).toBeLessThan(f.properties.rank);
    }
  });

  it("leaves nothing above rank 1", () => {
    for (const f of areas.features) if (f.properties.rank === 1) expect(f.properties.parent).toBeNull();
  });

  it("keeps every ring closed", () => {
    for (const f of areas.features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const rings of polys)
        for (const ring of rings) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring.at(-1));
        }
    }
  });
});

describe("areaChain", () => {
  it("reads a zone from the widest division down to itself", async () => {
    const deepest = areas.features.reduce((a, b) => (b.properties.rank > a.properties.rank ? b : a));
    const chain = await areaChain(deepest.properties.id);
    expect(chain.at(-1)).toBe(deepest);
    expect(chain[0].properties.rank).toBe(1);
    expect(chain.map((f) => f.properties.rank)).toEqual([...chain.map((f) => f.properties.rank)].sort((a, b) => a - b));
    expect(new Set(chain.map((f) => f.properties.id)).size).toBe(chain.length); // no cycle
  });

  it("is empty for a zone that is not there", async () => {
    expect(await areaChain("nothing")).toEqual([]);
    expect(await areaChain("")).toEqual([]);
  });
});
