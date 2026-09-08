import { describe, expect, it } from "vitest";
import { KEY, readTheme, resolve, writeTheme } from "./theme";

/** A `localStorage` stand-in, plus one that throws the way a private window can. */
const fake = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const hostile = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
};

describe("theme choice", () => {
  it("reports no choice when nothing is stored", () => {
    expect(readTheme(fake())).toBe(null);
  });

  it("reads the two values it writes", () => {
    expect(readTheme(fake({ [KEY]: "dark" }))).toBe("dark");
    expect(readTheme(fake({ [KEY]: "light" }))).toBe("light");
  });

  it("treats anything else, including an older sistema, as no choice", () => {
    expect(readTheme(fake({ [KEY]: "noche" }))).toBe(null);
    expect(readTheme(fake({ [KEY]: "sistema" }))).toBe(null);
  });

  it("round-trips a choice", () => {
    const s = fake();
    writeTheme("dark", s);
    expect(readTheme(s)).toBe("dark");
  });

  it("never throws when storage is denied", () => {
    expect(readTheme(hostile)).toBe(null);
    expect(() => writeTheme("dark", hostile)).not.toThrow();
  });

  it("falls back to the system only until a choice exists", () => {
    expect(resolve(null, true)).toBe("dark");
    expect(resolve(null, false)).toBe("light");
    expect(resolve("light", true)).toBe("light");
    expect(resolve("dark", false)).toBe("dark");
  });
});
