import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/** F34: every user flow had the framework's own screens behind it and nothing of ours. */
describe("route boundaries exist and speak Spanish", () => {
  it("an error has a way out that is not the back button", () => {
    const e = read("./error.tsx");
    expect(e).toContain('"use client"');
    expect(e).toContain("onClick={reset}");
    expect(e).toContain("Reintentar");
    expect(e).toContain("error.digest");
  });

  it("a missing page says which one and where to go", () => {
    const n = read("./not-found.tsx");
    expect(n).toContain("Esta página no existe");
    expect(n).toContain("/propiedades");
  });

  it("loading announces itself politely", () => {
    const l = read("./loading.tsx");
    expect(l).toContain('role="status"');
    expect(l).toContain("Cargando…");
  });
});

describe("reduced motion removes the movement, not only its transition (F18)", () => {
  const css = read("./globals.css");
  const at = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const block = css.slice(at, css.indexOf("\n}\n", css.indexOf(".card-photo", at)));

  it("stops the pin scale and the card zoom outright", () => {
    expect(block).toContain(".pin:hover");
    expect(block).toContain(".card-photo");
    expect(block).toContain("transform: none");
  });

  it("the theme wipe is skipped rather than shortened", () => {
    const toggle = read("../components/theme-toggle.tsx");
    expect(toggle).toContain('matchMedia("(prefers-reduced-motion: reduce)").matches');
    expect(toggle).toContain("return setTheme(next)");
  });

  // A map on screen used to skip the wipe, and a map is on screen on both pages that have one,
  // so the animation almost never ran (Kenobi, 2026-09-08).
  it("runs the wipe even when a map is on screen", () => {
    const toggle = read("../components/theme-toggle.tsx");
    expect(toggle).not.toContain("maplibregl-map");
  });
});

/**
 * A 27-inch screen used to leave about 555 px of empty page on each side, and the gallery answered
 * the extra width with a third column of small cards (Kenobi, 2026-09-08). The page is wider, the
 * map takes more of it, and two columns is the most the gallery ever shows.
 */
describe("the results page uses the width it is given", () => {
  const page = read("./propiedades/page.tsx");

  it("lets the container grow well past 1440", () => {
    const max = page.match(/mx-auto max-w-\[(\d+)px\]/);
    expect(max).toBeTruthy();
    expect(Number(max![1])).toBeGreaterThan(1440);
  });

  it("never shows a third column of cards", () => {
    const ul = page.slice(page.indexOf('<ul className="grid'), page.indexOf('">', page.indexOf('<ul className="grid')));
    expect(ul).toContain("lg:grid-cols-2");
    expect(ul).not.toMatch(/grid-cols-[3-9]/);
  });

  it("gives the map more than the 42% it had", () => {
    const col = page.match(/split:grid-cols-\[minmax\(0,1fr\)_minmax\((\d+)px,(\d+)%\)\]/);
    expect(col).toBeTruthy();
    expect(Number(col![2])).toBeGreaterThan(42);
  });
});
