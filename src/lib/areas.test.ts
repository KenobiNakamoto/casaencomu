import { describe, expect, it } from "vitest";
import { areaChain, loadAreas } from "./areas";

/**
 * `public/areas.geojson` is generated, committed, and read by both the server and the browser, so
 * the file itself is what these check. They are the runnable check on `scripts/build-areas.mts`:
 * the parent of a zone is worked out from geometry, and geometry is easy to get subtly wrong.
 */
const areas = await loadAreas();
const byId = new Map(areas.features.map((f) => [f.properties.id, f]));

type Feature = (typeof areas.features)[number];
const rings = (f: Feature) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).flat();
const points = (f: Feature) => rings(f).flat();
const edges = (f: Feature) => rings(f).flatMap((r) => r.slice(1).map((p, i) => [r[i], p] as const));

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

  /**
   * The one thing `align()` in `scripts/build-areas.mts` exists for: two zones that touch have to
   * draw their common border from the same points. When they do not, the map draws that border
   * twice, a few metres apart, and the two lines cross each other down the middle of a street.
   *
   * Simplifying each zone on its own can never satisfy this, so the numbers below are the whole
   * check. One district's worth of barris is enough — the fault was never in one zone.
   *
   * The residue is OpenStreetMap's own: barri boundaries there are not all drawn down the same
   * line, and two of them can genuinely sit a couple of metres apart. Before this was fixed the
   * middle vertex was 6.9 m out and not one of them landed on the neighbour's outline.
   */
  it("draws a border between two zones only once", () => {
    const sagrada = areas.features.find((f) => f.properties.name === "la Sagrada Família" && f.properties.rank === 6)!;
    const block = areas.features.filter((f) => f.properties.rank === 6 && f.properties.parent === sagrada.properties.parent);
    expect(block.length).toBeGreaterThan(3);

    const metres = 111_320;
    const east = metres * Math.cos((41.4 * Math.PI) / 180);
    const border: number[] = [];
    for (const f of block) {
      const others = block.filter((o) => o !== f).flatMap(edges);
      for (const [x, y] of points(f)) {
        const away = Math.min(...others.map(([a, b]) => {
          const [px, py] = [(x - a[0]) * east, (y - a[1]) * metres];
          const [bx, by] = [(b[0] - a[0]) * east, (b[1] - a[1]) * metres];
          const len = bx * bx + by * by;
          const t = len ? Math.max(0, Math.min(1, (px * bx + py * by) / len)) : 0;
          return Math.hypot(px - t * bx, py - t * by);
        }));
        if (away < 20) border.push(away); // past twenty is a different border altogether
      }
    }
    border.sort((a, b) => a - b);
    expect(border.length).toBeGreaterThan(20);
    expect(border.filter((d) => d < 0.01).length, "no vertex is shared with a neighbour").toBeGreaterThan(20);
    expect(border[Math.floor(border.length / 2)], "the middle border vertex is off the neighbour's outline").toBeLessThan(3);
  });

  /**
   * The same rule as above, at every rank rather than inside one district. Two zones that share a
   * border share its points outright, so a vertex of one is a vertex of the other. One pass and a
   * hash, which is why this one can afford to look at the whole file while the check above looks
   * closely at six zones.
   *
   * This is what the old file could not do: at every rank its median was zero, and no zone shared
   * more than two points with anybody.
   *
   * The median, not the minimum: an island, or the only district in a town, touches nothing and
   * rightly shares nothing.
   */
  it("shares its border points at every rank", () => {
    const byRank = new Map<number, Feature[]>();
    for (const f of areas.features) byRank.set(f.properties.rank, [...(byRank.get(f.properties.rank) ?? []), f]);

    for (const [rank, zones] of [...byRank].sort((a, b) => a[0] - b[0])) {
      if (zones.length < 2) continue; // one zone at a rank has nobody to share with
      const owned = zones.map((f) => new Set(points(f).map(([x, y]) => `${x},${y}`)));
      const seen = new Map<string, number>();
      for (const set of owned) for (const key of set) seen.set(key, (seen.get(key) ?? 0) + 1);
      const shared = owned.map((set) => [...set].filter((key) => seen.get(key)! > 1).length).sort((a, b) => a - b);
      expect(shared[shared.length >> 1], `rank ${rank} draws its borders twice`).toBeGreaterThan(10);
    }
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
