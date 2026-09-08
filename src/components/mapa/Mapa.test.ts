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

  it("rests an area outline on the neutral boundary token", () => {
    const at = src.indexOf("function areaPaint");
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain('css("--map-boundary")');
    expect(body).toContain('css("--secondary")');
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
