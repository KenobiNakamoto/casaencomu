import { describe, expect, it } from "vitest";
import { matchesCondition, matchesQuery } from "./search";

const GOTIC = "Piso en venta en Barri Gòtic 89 hab 2 m2 520000";

describe("matchesQuery", () => {
  it("ignores accents in both directions", () => {
    expect(matchesQuery(GOTIC, "gotic")).toBe(true);
    expect(matchesQuery("Piso en el barrio gotico", "GÓTICO")).toBe(true);
  });
  it("needs every word, in any order", () => {
    expect(matchesQuery(GOTIC, "gotic piso")).toBe(true);
    expect(matchesQuery(GOTIC, "gotic terraza")).toBe(false);
  });
  it("finds the numbers, which the haystack carries as text", () => {
    expect(matchesQuery(GOTIC, "520000")).toBe(true);
  });
  it("matches everything when empty", () => {
    expect(matchesQuery(GOTIC, "   ")).toBe(true);
  });
});

describe("matchesCondition", () => {
  it("keeps reformado and a reformar apart", () => {
    expect(matchesCondition("Totalmente reformado en 2024", "reformado")).toBe(true);
    expect(matchesCondition("Totalmente reformado en 2024", "a_reformar")).toBe(false);
    expect(matchesCondition("Piso a reformar, mucha luz", "a_reformar")).toBe(true);
    expect(matchesCondition("Piso a reformar, mucha luz", "reformado")).toBe(false);
  });
  it("reads the portal's own condition text too", () => {
    expect(matchesCondition("... Obra nueva ...", "obra_nueva")).toBe(true);
  });
});
