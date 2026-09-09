import { describe, expect, it } from "vitest";
import { buckets, niceStep } from "./buckets";

describe("buckets", () => {
  it("counts every value once, and puts the highest inside the last bar", () => {
    const b = buckets([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)!;
    expect(b.bars.reduce((a, c) => a + c, 0)).toBe(11);
    expect(b.min).toBe(0);
    expect(b.max).toBe(10);
    expect(b.bars.at(-1)).toBeGreaterThan(0);
  });

  it("ignores what is not a number, rather than counting it as zero", () => {
    const b = buckets([100, null, 200, undefined, Number.NaN], 4)!;
    expect(b.bars.reduce((a, c) => a + c, 0)).toBe(2);
  });

  it("has no bars to draw when every home is the same, or there is one home", () => {
    expect(buckets([300, 300, 300])).toBeNull();
    expect(buckets([300])).toBeNull();
    expect(buckets([])).toBeNull();
  });
});

describe("niceStep", () => {
  it("is a round number, and small enough to reach both ends", () => {
    for (const [min, max] of [[74, 125], [338_000, 750_000], [0, 9]] as const) {
      const s = niceStep(min, max);
      expect(String(s)).toMatch(/^[125]0*$/);
      expect((max - min) / s).toBeLessThanOrEqual(60);
    }
  });
});
