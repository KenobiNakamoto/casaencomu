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
    expect(toggle).toContain("return setPreference(next)");
  });
});
