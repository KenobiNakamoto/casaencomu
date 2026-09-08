import { describe, expect, it } from "vitest";
import { blockedReason, FULL_MESSAGE, MAX, MIN, parseIds, serialiseIds, storageKey, toggle, trayLabel } from "./selection";

const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i));

describe("parseIds", () => {
  it("keeps the order the sender saw", () => {
    expect(parseIds(`${id(3)},${id(1)},${id(2)}`)).toEqual([id(3), id(1), id(2)]);
  });

  it("drops repeats without dropping the first appearance", () => {
    expect(parseIds(`${id(1)},${id(2)},${id(1)}`)).toEqual([id(1), id(2)]);
  });

  it("stops at four, so a long link cannot widen the table", () => {
    expect(parseIds(ids(9).join(","))).toHaveLength(MAX);
  });

  it("refuses anything that is not an identifier", () => {
    expect(parseIds("../../etc/passwd,<script>,1;DROP TABLE properties")).toEqual([]);
    expect(parseIds("")).toEqual([]);
    expect(parseIds(null)).toEqual([]);
    expect(parseIds(undefined)).toEqual([]);
  });

  it("tolerates spaces and capitals, because links get edited by hand", () => {
    expect(parseIds(` ${id(1).toUpperCase()} , ${id(2)} `)).toEqual([id(1), id(2)]);
  });

  it("survives a round trip", () => {
    const list = ids(3);
    expect(parseIds(serialiseIds(list))).toEqual(list);
  });
});

describe("toggle", () => {
  it("adds at the end, so the columns follow the order of choosing", () => {
    expect(toggle([id(1)], id(2)).ids).toEqual([id(1), id(2)]);
  });

  it("removes one that was already chosen", () => {
    expect(toggle(ids(3), id(1)).ids).toEqual([id(0), id(2)]);
  });

  it("refuses a fifth and keeps all four, rather than evicting one silently", () => {
    const four = ids(MAX);
    const result = toggle(four, id(9));
    expect(result.ids).toEqual(four);
    expect(result.full).toBe(true);
  });

  it("still lets a full selection be reduced", () => {
    expect(toggle(ids(MAX), id(0)).full).toBe(false);
    expect(toggle(ids(MAX), id(0)).ids).toHaveLength(MAX - 1);
  });

  it("never mutates what it was given", () => {
    const before = ids(2);
    toggle(before, id(5));
    expect(before).toEqual(ids(2));
  });
});

describe("what the tray says", () => {
  it("counts in words, singular and plural", () => {
    expect(trayLabel(1, 0)).toBe("1 propiedad seleccionada");
    expect(trayLabel(3, 0)).toBe("3 propiedades seleccionadas");
  });

  it("says how many the filters are hiding, so a selection never seems to vanish", () => {
    expect(trayLabel(3, 1)).toBe("3 propiedades seleccionadas · 1 fuera de estos resultados");
    expect(trayLabel(3, 0)).not.toContain("fuera");
  });

  it("explains why comparing is not available yet", () => {
    expect(blockedReason(0)).toBe("Elige dos propiedades");
    expect(blockedReason(1)).toBe("Elige otra propiedad");
    expect(blockedReason(MIN)).toBeNull();
    expect(blockedReason(MAX)).toBeNull();
  });

  it("names the limit in the refusal", () => {
    expect(FULL_MESSAGE).toContain(String(MAX));
  });
});

describe("storage key", () => {
  it("is scoped to the person, so two members on one browser do not share a selection", () => {
    expect(storageKey("a")).not.toBe(storageKey("b"));
  });

  it("carries the user id and nothing else — no email, no capture token", () => {
    const key = storageKey("11111111-2222-4333-8444-555555555555");
    expect(key).toBe("casa.comparar.11111111-2222-4333-8444-555555555555");
    expect(key).not.toContain("@");
  });
});
