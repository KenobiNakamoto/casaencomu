import { describe, expect, it } from "vitest";
import { KEY, readPreference, resolve, writePreference } from "./theme";

/** A `localStorage` stand-in, plus one that throws the way a private window can. */
const fake = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    get size() {
      return m.size;
    },
  };
};
const hostile = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
  removeItem() {
    throw new Error("denied");
  },
};

describe("theme preference", () => {
  it("defaults to following the system", () => {
    expect(readPreference(fake())).toBe("sistema");
  });

  it("reads a value stored by version 1, which only ever wrote light or dark", () => {
    expect(readPreference(fake({ [KEY]: "dark" }))).toBe("dark");
    expect(readPreference(fake({ [KEY]: "light" }))).toBe("light");
  });

  it("treats anything it does not recognise as sistema", () => {
    expect(readPreference(fake({ [KEY]: "noche" }))).toBe("sistema");
  });

  it("stores sistema as the absence of a choice, so a later default change reaches the user", () => {
    const s = fake({ [KEY]: "dark" });
    writePreference("sistema", s);
    expect(s.size).toBe(0);
    expect(readPreference(s)).toBe("sistema");
  });

  it("never throws when storage is denied", () => {
    expect(readPreference(hostile)).toBe("sistema");
    expect(() => writePreference("dark", hostile)).not.toThrow();
  });

  it("resolves sistema against the system, and ignores it for an explicit choice", () => {
    expect(resolve("sistema", true)).toBe("dark");
    expect(resolve("sistema", false)).toBe("light");
    expect(resolve("light", true)).toBe("light");
    expect(resolve("dark", false)).toBe("dark");
  });
});
