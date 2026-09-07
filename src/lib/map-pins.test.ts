import { describe, expect, it } from "vitest";
import { groupByCoord, groupLabel, pinLabel, pinText, type Pinnable } from "./map-pins";

/** Intl puts a non-breaking space before the €. Compare on the visible text, not the byte. */
const plain = (s: string) => s.replace(/\u00a0/g, " ");

const pin = (p: Partial<Pinnable> & { id: string }): Pinnable => ({
  lng: 2.1686,
  lat: 41.3874,
  precision: "exact",
  price_eur: 400_000,
  title: "Piso",
  neighborhood: "Gràcia",
  ...p,
});

describe("groupByCoord", () => {
  it("puts homes that share an exact coordinate in one group", () => {
    const groups = groupByCoord([pin({ id: "b" }), pin({ id: "a" }), pin({ id: "c", lng: 2.2 })]);
    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("orders a group by property id, so the chooser does not reshuffle", () => {
    const ids = groupByCoord([pin({ id: "z" }), pin({ id: "m" }), pin({ id: "a" })])[0].items.map((i) => i.id);
    expect(ids).toEqual(["a", "m", "z"]);
  });

  it("keeps groups in the order the markers arrived", () => {
    const groups = groupByCoord([pin({ id: "a", lng: 3 }), pin({ id: "b", lng: 1 }), pin({ id: "c", lng: 2 })]);
    expect(groups.map((g) => g.lng)).toEqual([3, 1, 2]);
  });

  it("leaves coordinates that are merely close apart", () => {
    // 0.00001° is about 1 m. Rounding these together would move a pin off its address.
    const groups = groupByCoord([pin({ id: "a", lat: 41.38740 }), pin({ id: "b", lat: 41.38741 })]);
    expect(groups).toHaveLength(2);
  });

  it("does not confuse a swapped pair of coordinates", () => {
    const groups = groupByCoord([pin({ id: "a", lng: 2, lat: 41 }), pin({ id: "b", lng: 41, lat: 2 })]);
    expect(groups).toHaveLength(2);
  });

  it("returns nothing for no markers", () => {
    expect(groupByCoord([])).toEqual([]);
  });
});

describe("what a pin says", () => {
  it("marks an approximate position, on screen and to a screen reader", () => {
    const p = pin({ id: "a", precision: "approx", price_eur: 499_000 });
    expect(plain(pinText(p))).toBe("≈ 499.000 €");
    expect(plain(pinLabel(p))).toBe("499.000 €, Gràcia, ubicación aproximada");
  });

  it("says so when there is no price", () => {
    expect(plain(pinText(pin({ id: "a", price_eur: null })))).toBe("Sin precio");
    expect(plain(pinLabel(pin({ id: "a", price_eur: null })))).toBe("Sin precio, Gràcia, ubicación exacta");
  });

  it("falls back to the title when the neighbourhood is unknown", () => {
    expect(plain(pinLabel(pin({ id: "a", neighborhood: null, title: "Ático en Sants" })))).toContain("Ático en Sants");
  });

  it("counts a group", () => {
    expect(groupLabel(groupByCoord([pin({ id: "a" }), pin({ id: "b" })])[0])).toMatch(/^2 viviendas/);
  });
});
