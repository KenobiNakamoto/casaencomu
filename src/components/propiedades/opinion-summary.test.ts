import { describe, expect, it } from "vitest";
import { summaryLine, type Opinions } from "./opinion-summary";

const row = (over: Partial<Opinions>): Opinions => ({
  family_avg: null,
  voices: 0,
  scorers: 0,
  partial: 0,
  my_stance: null,
  ...over,
});

describe("the one line a card shows about opinions", () => {
  it("never shows the number alone: it says what it rests on", () => {
    expect(summaryLine(row({ family_avg: 3.7, scorers: 3, voices: 3, partial: 1 }))).toBe("3,7/5 · 3 personas · Parcial");
    expect(summaryLine(row({ family_avg: 4, scorers: 1, voices: 1 }))).toBe("4,0/5 · 1 persona");
  });

  it("counts a stance with no scores as an opinion, and shows no number for it", () => {
    expect(summaryLine(row({ voices: 2 }))).toBe("2 personas han opinado");
  });

  it("offers the way in when there is nothing", () => {
    expect(summaryLine(row({}))).toBe("Sin opiniones · Añade la tuya");
  });
});
