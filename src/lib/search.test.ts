import { describe, expect, it } from "vitest";
import { FLOORS, floorNumber, matchesCondition, matchesFloor, matchesQuery } from "./search";

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

describe("floorNumber", () => {
  it("reads the storey out of the words a portal writes", () => {
    expect(floorNumber("7ª planta")).toBe(7);
    expect(floorNumber("Planta 3")).toBe(3);
    expect(floorNumber("Bajo")).toBe(0);
    expect(floorNumber("Entresuelo")).toBe(0);
    expect(floorNumber("Ático")).toBe("atico");
    expect(floorNumber("atico con terraza")).toBe("atico");
  });

  it("answers null when there is nothing to read", () => {
    expect(floorNumber(null)).toBeNull();
    expect(floorNumber("")).toBeNull();
    expect(floorNumber("consultar")).toBeNull();
  });
});

describe("matchesFloor", () => {
  it("puts every storey in exactly one band", () => {
    const bands = Object.keys(FLOORS) as (keyof typeof FLOORS)[];
    for (const floor of ["Bajo", "1ª planta", "4ª planta", "5ª planta", "9ª planta", "Ático"]) {
      expect(bands.filter((b) => matchesFloor(floor, b))).toHaveLength(1);
    }
  });

  it("never counts an attic as its own number, however high the building", () => {
    expect(matchesFloor("Ático 8", "5+")).toBe(false);
    expect(matchesFloor("Ático 8", "atico")).toBe(true);
  });

  it("matches no band at all when the storey is unknown", () => {
    for (const b of Object.keys(FLOORS) as (keyof typeof FLOORS)[]) expect(matchesFloor(null, b)).toBe(false);
  });
});
