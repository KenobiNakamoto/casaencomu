import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/**
 * The token values are read out of the stylesheet that actually ships, never copied into this
 * file. A second copy of the palette would let the two drift and still pass.
 */
function block(header: string): Record<string, string> {
  const at = css.indexOf(header);
  expect(at, `no block: ${header}`).toBeGreaterThan(-1);
  const body = css.slice(at + header.length, css.indexOf("\n}", at));
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{3,8});/gi)].map((m) => [m[1], m[2]]));
}

const day = block(":root {");
const night = block('[data-theme="dark"] {');
const nightFallback = block(':root:not([data-theme="light"]):not([data-theme="dark"]) {');

// --- WCAG 2.2 relative luminance and contrast, unrounded ------------------------------------
const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("contrast — the published algorithm on the published values", () => {
  it("agrees with the reference pairs in WCAG 2.2", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 10);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.478, 3);
  });
});

/** Text pairs. 4.5:1 is the target for normal text; nothing here qualifies as large text. */
const TEXT: [string, string][] = [
  ["--on-action", "--action-bg"], // F06: white on the ornamental accent was 3.41:1 at night
  ["--on-action", "--action-hover"],
  ["--on-action", "--action-pressed"],
  ["--placeholder", "--raised"], // F07: was 3.18:1 day, 3.42:1 night
  ["--ink", "--canvas"],
  ["--ink", "--canvas-far"],
  ["--ink", "--raised"],
  ["--ink", "--sunken"],
  ["--ink", "--surface-strong"],
  ["--body", "--canvas"],
  ["--body", "--canvas-far"],
  ["--body", "--raised"],
  ["--body", "--sunken"],
  ["--body", "--surface-strong"], // the neutral chip
  ["--muted", "--canvas"],
  ["--muted", "--canvas-far"],
  ["--muted", "--raised"],
  ["--muted", "--sunken"],
  ["--success-ink", "--success-bg"],
  ["--warning-ink", "--warning-bg"],
  ["--danger-ink", "--danger-bg"],
  ["--info-ink", "--info-bg"],
  ["--visit-ink", "--visit-bg"],
  ["--selection-ink", "--selection-bg"],
  ["--on-secondary", "--secondary"],
  ["--pin-ink", "--pin-bg"],
];

/** Boundaries and focus. 3:1, the target for a non-text element that carries meaning. */
const NON_TEXT: [string, string][] = [
  ["--control-border", "--raised"],
  ["--control-border", "--canvas"],
  ["--control-border", "--canvas-far"],
  ["--focus", "--canvas"],
  ["--focus", "--canvas-far"],
  ["--focus", "--raised"],
  // `--secondary` deliberately is not here. Yellow reaches 3:1 on white only as a dark olive,
  // which is not the brand. The specification never lets selection rest on that colour alone:
  // a selected control carries a check and a label, and its text pair is --selection-ink on
  // --selection-bg, which is asserted above at 4.5:1.
];

for (const [name, theme] of [
  ["day", day],
  ["night", night],
] as const) {
  describe(`${name} palette`, () => {
    it.each(TEXT)("%s on %s reaches 4.5:1", (ink, bg) => {
      expect(theme[ink], `${ink} missing`).toBeDefined();
      expect(theme[bg], `${bg} missing`).toBeDefined();
      expect(contrast(theme[ink], theme[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(NON_TEXT)("%s on %s reaches 3:1", (a, b) => {
      expect(contrast(theme[a], theme[b])).toBeGreaterThanOrEqual(3);
    });
  });
}

describe("the two night blocks", () => {
  // One is for `data-theme="dark"`, the other is the JavaScript-off fallback. CSS cannot express
  // both in one rule, so they are written twice; this is what keeps them from drifting apart.
  it("carry exactly the same values", () => {
    expect(nightFallback).toEqual(night);
  });

  it("override every colour the day block defines", () => {
    expect(Object.keys(night).sort()).toEqual(Object.keys(day).sort());
  });
});

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (e === "__fixtures__") return [];
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(e) ? [p] : [];
  });

// `URL.pathname` is percent-encoded, and the canonical checkout lives under a path with spaces
// and a "ú" in it. `fileURLToPath` is the decode, and it is what `extract.test.ts` already uses.
const SRC = fileURLToPath(new URL("../", import.meta.url));
/** Block comments are prose, not classes — this file's own examples live in one. */
const sources = () =>
  walk(SRC)
    .filter((f) => !f.endsWith(".test.ts"))
    .map((f) => [f.slice(SRC.length), readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")] as const);

const offenders = (re: RegExp) =>
  sources().flatMap(([name, code]) => {
    const hits = code.match(re);
    return hits ? [`${name}: ${[...new Set(hits)].join(", ")}`] : [];
  });

describe("what components are not allowed to write", () => {
  // F08: a palette utility is the same colour in both themes, so it cannot express a status.
  it("no sky/amber/violet/zinc/slate/gray class, and no bare text-white", () => {
    expect(offenders(/\b(?:bg|text|border)-(?:sky|amber|violet|zinc|slate|gray|neutral)-\d{2,3}\b|\btext-white\b/g)).toEqual([]);
  });

  // F32: a border colour change is not a focus indicator for anyone who cannot see the two greys.
  it("no outline-none", () => {
    expect(offenders(/\boutline-none\b/g)).toEqual([]);
  });

  // Doc 03 § 3: one name per fixed obstruction. `bottom-20` was three different numbers.
  it("no hard-coded offset for the bottom navigation", () => {
    expect(offenders(/\b-?(?:bottom|pb|mb)-20\b/g)).toEqual([]);
  });

  /*
   * The filters panel opens over the list. It and the compare toggles on the cards were both
   * `z-10`, and a tie is broken by document order, so the toggles came out through the panel.
   * Cards sit under the panel, and the add-a-link message sits over it.
   */
  it("keeps the toolbar's layers in order", () => {
    const z = (name: string, re: RegExp) => {
      const hit = sources().flatMap(([n, c]) => (n.includes(name) ? [...c.matchAll(re)].map((m) => Number(m[1])) : []));
      expect(hit, `no z-index found in ${name}`).not.toHaveLength(0);
      return Math.max(...hit);
    };
    const card = Math.max(z("propiedades/card.tsx", /\bz-(\d+)\b/g), z("propiedades/rows.tsx", /\bz-(\d+)\b/g));
    const panel = z("propiedades/page.tsx", /\bmd:z-(\d+)\b/g);
    const message = Number(css.match(/\.add-status \{[^}]*z-index: (\d+)/)![1]);
    expect(panel, "the cards come out through the filters panel").toBeGreaterThan(card);
    expect(message, "the filters panel covers the add-a-link message").toBeGreaterThan(panel);
  });

  // F33: the full desktop navigation starts at 1024px, not at 768px.
  it("the navigation and the layout switch at lg, never at md", () => {
    const nav = sources().filter(([n]) => /^components\/nav|^app\/layout/.test(n));
    expect(nav.length).toBeGreaterThan(0);
    expect(nav.flatMap(([n, c]) => (c.match(/\bmd:[a-z-]/g) ? [n] : []))).toEqual([]);
  });
});
