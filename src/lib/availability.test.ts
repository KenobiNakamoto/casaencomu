import { describe, expect, it } from "vitest";
import {
  availabilityLine,
  isStale,
  nextSourceState,
  propertyAvailability,
  type Outcome,
  type SourceState,
} from "./availability";

const fresh: SourceState = { availability: "active", consecutive_gone: 0, consecutive_failures: 0 };
const run = (outcomes: [Outcome, boolean][], from: SourceState = fresh) =>
  outcomes.reduce((s, [o, scheduled]) => nextSourceState(s, o, scheduled), from);

describe("a source is removed only on two consecutive scheduled checks", () => {
  it("one scheduled 404 is not enough", () => {
    expect(run([["removed", true]])).toMatchObject({ availability: "unknown", consecutive_gone: 1 });
  });

  it("two in a row confirm it", () => {
    expect(run([["removed", true], ["removed", true]])).toMatchObject({
      availability: "removed",
      consecutive_gone: 2,
    });
  });

  // F05: a 403 and a 404 shared one counter, so this sequence used to remove the property.
  it("a timeout between two removals resets the streak", () => {
    const s = run([["removed", true], ["timeout", true], ["removed", true]]);
    expect(s.availability).toBe("unknown");
    expect(s.consecutive_gone).toBe(1);
  });

  it("a block between two removals resets the streak", () => {
    expect(run([["removed", true], ["blocked", true], ["removed", true]]).availability).toBe("unknown");
  });

  it("a successful read resets everything", () => {
    const s = run([["removed", true], ["listing", true]]);
    expect(s).toEqual({ availability: "active", consecutive_gone: 0, consecutive_failures: 0 });
  });

  it("a manual check never casts the confirming vote", () => {
    const s = run([["removed", true], ["removed", false]]);
    expect(s.availability).toBe("unknown");
    expect(s.consecutive_gone).toBe(1);
  });

  it("counts unreadable checks separately, and they never remove", () => {
    const s = run([["blocked", true], ["unreadable", true], ["timeout", true]]);
    expect(s).toMatchObject({ availability: "unknown", consecutive_gone: 0, consecutive_failures: 3 });
  });
});

describe("a property is as available as its best source", () => {
  const a = (availability: "active" | "unknown" | "removed") => ({ availability });

  it("one live source keeps the home available", () => {
    expect(propertyAvailability([a("removed"), a("active")])).toBe("active");
  });

  it("is unknown when nothing is active but something is uncertain", () => {
    expect(propertyAvailability([a("removed"), a("unknown")])).toBe("unknown");
  });

  it("is removed only when every source is confirmed removed", () => {
    expect(propertyAvailability([a("removed"), a("removed")])).toBe("removed");
  });

  it("treats a property with no sources as unknown, never removed", () => {
    expect(propertyAvailability([])).toBe("unknown");
  });
});

describe("stale", () => {
  const now = new Date("2026-09-07T12:00:00.000Z");
  it("an active reading older than 48 hours is a claim about the past", () => {
    expect(isStale("2026-09-05T11:00:00.000Z", now)).toBe(true);
    expect(isStale("2026-09-06T13:00:00.000Z", now)).toBe(false);
    expect(isStale(null, now)).toBe(true);
  });
});

describe("what the family reads", () => {
  // F04: every availability event, warnings included, used to say "ya no está disponible".
  it("never calls a failed check a removal", () => {
    expect(availabilityLine("unknown", "El piso")).toBe("El piso: no se pudo comprobar el anuncio");
    expect(availabilityLine("removed", "El piso")).toBe("El piso: el anuncio ya no está publicado");
    expect(availabilityLine("active", "El piso")).toContain("vuelve a estar disponible");
  });
});
