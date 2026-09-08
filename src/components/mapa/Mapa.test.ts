import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A source guard, not a render test. F10 and F11 were both silent: the map looked right and
 * rebuilt itself on every render, and the selected pin was red for the same reason a delete
 * button is. Neither shows up in a screenshot, and neither has a cheap runtime check.
 */
const src = readFileSync(fileURLToPath(new URL("./Mapa.tsx", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

/** The dependency list of the effect that constructs the map. */
function mountDeps(): string {
  const at = src.indexOf("// ---- 1. mount:");
  expect(at, "the mount effect lost its marker comment").toBeGreaterThan(-1);
  const end = src.indexOf("// ---- 2.", at);
  const deps = [...src.slice(at, end).matchAll(/^ {2}\}, \[([^\]]*)\]\);$/gm)];
  expect(deps, "no dependency list found in the mount effect").toHaveLength(1);
  return deps[0][1];
}

describe("F10 — the map is built once", () => {
  it("keeps the props that change out of the mount effect's dependencies", () => {
    const deps = mountDeps();
    for (const prop of ["markers", "zona", "params", "theme", "pathname", "router"]) {
      expect(deps, `${prop} in the mount deps rebuilds the map when it changes`).not.toMatch(
        new RegExp(`\\b${prop}\\b`),
      );
    }
  });

  it("does not silence the dependency rule instead of fixing it", () => {
    expect(src).not.toMatch(/eslint-disable.*exhaustive-deps/);
  });

  it("re-paints on a theme change rather than rebuilding", () => {
    const at = src.indexOf("// ---- 2. theme:");
    const body = src.slice(at, src.indexOf("// ---- 3.", at));
    expect(body).toContain("repaint(");
    expect(body).not.toMatch(/new ml\.Map|setStyle\(/);
  });

  it("reads live props through a ref, so a handler cannot close over a stale filter", () => {
    expect(src).toMatch(/now\.current = \{ markers, zona, params, pathname, router \}/);
    expect(src).toContain("now.current.params");
  });
});

describe("F11 — one colour, one meaning", () => {
  const rule = (selector: string) => {
    const at = css.indexOf(selector);
    expect(at, `no rule: ${selector}`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("paints the selected pin with the pin tokens, never the action colour", () => {
    const pin = rule(".pin:hover,");
    expect(pin).toContain("var(--pin-selected-bg)");
    expect(pin).toContain("var(--pin-selected-ink)");
    expect(pin).not.toContain("--action-bg");
    expect(pin).not.toContain("--on-action");
  });

  it("rests an area outline on a neutral token, and keeps red out of it", () => {
    const at = src.indexOf("function areaPaint");
    const body = src.slice(at, src.indexOf("\n}", at));
    // The resting outline is `--map-area-line`, which is near-black by day and near-white by
    // night; the selection colour reaches the map only through `--map-area-active`. What F11 asks
    // is that the resting colour be neutral and that the accent never appear here.
    expect(body).toContain('css("--map-area-line")');
    expect(body).toContain('css("--map-area-active")');
    expect(body).not.toContain("--accent");
  });

  it("draws the illustrative circle in a label grey, dashed, not in the accent", () => {
    const at = src.indexOf("function approxPaint");
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain('css("--map-label-secondary")');
    expect(body).toContain("line-dasharray");
    expect(body).not.toContain("--accent");
  });
});

describe("F12 — a pin is a control", () => {
  it("creates a button, not a div", () => {
    const at = src.indexOf("const syncPins = useCallback");
    const body = src.slice(at, src.indexOf("\n  }, [", at));
    expect(body).toMatch(/const el = document\.createElement\("button"\)/);
    expect(body).not.toMatch(/createElement\("div"\)/);
    expect(body).toContain('el.type = "button"');
  });

  it("gives every pin an accessible name", () => {
    expect(src).toMatch(/setAttribute\("aria-label", label\)/);
  });

  it("listens inside the results container, not on the document", () => {
    expect(src).toContain('closest("[data-results]")');
    expect(src).not.toMatch(/document\.addEventListener/);
  });

  it("closes the preview with Escape", () => {
    expect(src).toMatch(/e\.key !== "Escape"/);
  });
});

describe("controls", () => {
  it("beats MapLibre's own 29px rule with a second class, not with source order", () => {
    // globals.css is imported by the layout; maplibre-gl.css is imported by this component, so
    // it lands after. One extra class is what makes the 44px target actually apply.
    expect(css).toContain(".maplibregl-ctrl.maplibregl-ctrl-group button {");
    const rule = css.slice(css.indexOf(".maplibregl-ctrl.maplibregl-ctrl-group button {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/width: 44px;\s*\n\s*height: 44px;/);
  });

  it("names every control in Spanish", () => {
    expect(src).toContain('"NavigationControl.ZoomIn": "Acercar"');
    expect(src).toContain('"NavigationControl.ZoomOut": "Alejar"');
    expect(src).toContain('"Ver todas las viviendas"');
  });
});

describe("failure leaves something to use", () => {
  it("offers the list when the map cannot start", () => {
    expect(src).toContain("No se puede dibujar el mapa aquí.");
    expect(src).toMatch(/href="\/propiedades"/);
  });

  it("logs a missing tile instead of replacing the whole map", () => {
    const handler = src.split("\n").find((l) => l.includes('m.on("error"'));
    expect(handler, "no error handler").toBeTruthy();
    expect(handler).toContain("console.warn");
    expect(handler).not.toContain("setFailed");
  });
});

describe("#80 — a popup keeps the list it was opened from", () => {
  it("builds both popup links through the shared helper, not by hand", () => {
    expect(src).toContain("detailHrefFrom(");
    // A bare detail path in the popup HTML is the defect: it discards the filters and the anchor.
    expect(src).not.toContain('href="/propiedades/${encodeURIComponent(m.id)}"');
    expect(src).not.toContain("`/propiedades/${encodeURIComponent(m.id)}`");
  });

  it("takes the query from the live params, not from a stale closure", () => {
    expect(src).toContain("popupFor(group, now.current.params)");
  });
});

/**
 * The areas were invisible until the cursor was on them: `fill-opacity` rested at 0 behind a
 * hairline in the grey the basemap draws streets in. A dashed boundary fixed the confusion with
 * streets but read as provisional, so it is now what a portal map does — a continuous, thick
 * outline at rest, and a wash in the selection colour under the cursor (Kenobi, 2026-09-08).
 */
describe("every zone shows its own edges", () => {
  // The line and fill only. The `label` block below them paints the area's name, which is text
  // and takes the text tokens.
  const whole = src.slice(src.indexOf("function areaPaint("), src.indexOf("function approxPaint("));
  const paint = whole.slice(0, whole.indexOf("label: {"));

  it("draws a continuous outline, never a dashed one", () => {
    expect(paint).not.toContain("line-dasharray");
  });

  it("rests on an outline thick enough to be a boundary", () => {
    const rest = paint.match(/"line-width": \["case", selected\(zona\), [\d.]+ \+ bump, hovered, [\d.]+ \+ bump, ([\d.]+) \+ bump\]/);
    expect(rest, "the resting line width is no longer declared here").toBeTruthy();
    expect(Number(rest![1])).toBeGreaterThanOrEqual(2);
  });

  it("washes the one zone under the cursor, and no other", () => {
    const from = paint.indexOf('"fill-opacity"');
    const fill = paint.slice(from, paint.indexOf("ExpressionSpecification,", from)).replace(/\s+/g, " ");
    expect(fill).toContain("night ? 0.22 : 0.18");
    // The last branch of a `case` is the resting one, and it is the only one allowed to be 0.
    expect(fill).toMatch(/, 0, \] as $/);
  });

  /**
   * The point of the tokens: "replace this by whatever colour we like" has to be an edit in
   * `globals.css` alone. A raw hex or a `--secondary` read in this file would break that.
   */
  it("takes every colour from a --map-area-* token", () => {
    const colours = [...paint.matchAll(/css\("(--[a-z-]+)"\)/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) expect(c).toMatch(/^--map-area-/);
    expect(paint).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("defines those tokens in both themes", () => {
    for (const token of ["--map-area-line", "--map-area-active", "--map-area-fill-active"]) {
      // once for the day palette, once for the night one, once for the system-dark mirror
      expect(css.match(new RegExp(`${token}:`, "g")) ?? [], token).toHaveLength(3);
    }
  });
});
