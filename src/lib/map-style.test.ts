import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { baseLayers, buildStyle, MAP_TOKENS, overridesFor, repaint, ROLES, type MapTokens } from "./map-style";
import base from "./map-style-base.json";

/**
 * The palette is read out of the stylesheet that ships, never copied here. This is the
 * test that F09 needed: a layer nobody themed kept a light default and nothing failed.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
function palette(header: string): MapTokens {
  const at = css.indexOf(header);
  expect(at, `no block: ${header}`).toBeGreaterThan(-1);
  const body = css.slice(at + header.length, css.indexOf("\n}", at));
  const all = Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{3,8});/gi)].map((m) => [m[1], m[2]]));
  const found = Object.fromEntries(MAP_TOKENS.map((t) => [t, all[t]]));
  for (const t of MAP_TOKENS) expect(found[t], `${header} has no ${t}`).toBeTruthy();
  return found as MapTokens;
}

const day = palette(":root {");
const night = palette('[data-theme="dark"] {');
const layers = baseLayers;

describe("layer coverage", () => {
  it("gives every layer in the snapshot a role", () => {
    const unmapped = layers.filter((l) => !ROLES[l.id]).map((l) => l.id);
    expect(unmapped, "add these to ROLES; do not widen this test").toEqual([]);
  });

  it("has no role for a layer the snapshot dropped", () => {
    const ids = new Set(layers.map((l) => l.id));
    expect(Object.keys(ROLES).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("accounts for all 55 layers of the snapshot", () => {
    expect(layers).toHaveLength(55);
    expect(new Set(layers.map((l) => l.id)).size).toBe(55);
  });

  it("refuses to theme a layer it does not know", () => {
    expect(() => overridesFor({ id: "brand_new_layer", type: "line" }, day)).toThrow(/no role/);
  });
});

/** Every colour a themed layer paints with, flattened. */
function coloursOf(style: ReturnType<typeof buildStyle>) {
  const out: { layer: string; property: string; value: string }[] = [];
  for (const l of style.layers) {
    if (l.layout?.visibility === "none") continue;
    for (const [k, v] of Object.entries(l.paint ?? {})) {
      if (k.includes("color") && typeof v === "string") out.push({ layer: l.id, property: k, value: v });
    }
  }
  return out;
}

describe.each([
  ["day", day],
  ["night", night],
])("the %s style", (name, tokens) => {
  const style = buildStyle(tokens);
  const values = new Set(Object.values(tokens));

  it("paints every colour from a token — no basemap default survives", () => {
    const strays = coloursOf(style).filter((c) => !values.has(c.value));
    expect(strays, `${name}: not from the palette`).toEqual([]);
  });

  it("gives every visible text layer a halo in the map background colour", () => {
    const text = style.layers.filter((l) => l.type === "symbol" && l.layout?.visibility !== "none");
    expect(text.length).toBeGreaterThan(0);
    for (const l of text) {
      expect(l.paint?.["text-halo-color"], `${l.id} has no halo colour`).toBe(tokens["--map-halo"]);
      expect(l.paint?.["text-halo-width"]).toBeGreaterThan(0);
    }
  });

  it("hides the route shields and the basemap's own neighbourhood labels", () => {
    for (const id of ["highway-shield-non-us", "highway-shield-us-interstate", "road_shield_us", "label_other"]) {
      expect(style.layers.find((l) => l.id === id)?.layout?.visibility, id).toBe("none");
    }
  });

  it("keeps sources, sprite, glyphs and attribution", () => {
    expect(style.sources).toEqual(base.sources);
    expect(style.sprite).toBe(base.sprite);
    expect(style.glyphs).toBe(base.glyphs);
  });

  it("keeps zoom bounds, filters and widths", () => {
    for (const original of layers) {
      const built = style.layers.find((l) => l.id === original.id)!;
      for (const key of ["minzoom", "maxzoom", "filter", "source", "source-layer"] as const) {
        expect(built[key as keyof typeof built], `${original.id}.${key}`).toEqual(original[key as keyof typeof original]);
      }
      for (const key of ["line-width", "fill-opacity", "line-dasharray", "text-size"]) {
        if (key in (original.paint ?? {})) expect(built.paint?.[key], `${original.id}.${key}`).toEqual(original.paint?.[key]);
      }
    }
  });

  it("does not leave the map background transparent", () => {
    expect(style.layers[0].id).toBe("background");
    expect(style.layers[0].paint?.["background-color"]).toBe(tokens["--map-bg"]);
  });
});

describe("the night style differs from the day style", () => {
  it("changes every layer that carries a colour", () => {
    const d = buildStyle(day);
    const n = buildStyle(night);
    // Roads are the F09 symptom: white by day, and white at night until this shipped.
    const road = (s: typeof d) => s.layers.find((l) => l.id === "highway_minor")!.paint?.["line-color"];
    expect(road(d)).toBe(day["--map-road-minor"]);
    expect(road(n)).toBe(night["--map-road-minor"]);
    expect(road(d)).not.toBe(road(n));
    const halo = (s: typeof d) => s.layers.find((l) => l.id === "label_city")!.paint?.["text-halo-color"];
    expect(halo(d)).not.toBe(halo(n));
  });
});

describe("weight the basemap encoded in an alpha channel", () => {
  it("carries it over as an opacity, because a token is opaque", () => {
    for (const id of ["highway_major_subtle", "highway_motorway_subtle"]) {
      const original = layers.find((l) => l.id === id)!;
      const alpha = Number(/,\s*([\d.]+)\)$/.exec(String(original.paint?.["line-color"]))![1]);
      expect(alpha).toBeLessThan(1);
      expect(overridesFor(original, night).paint["line-opacity"]).toBe(alpha);
    }
  });

  it("leaves a layer that already declares its own opacity alone", () => {
    const original = layers.find((l) => l.id === "highway_minor")!;
    expect(original.paint).toHaveProperty("line-opacity");
    expect(overridesFor(original, night).paint).not.toHaveProperty("line-opacity");
  });
});

describe("repaint", () => {
  it("sets exactly what buildStyle would have set, so the two cannot drift", () => {
    const built = buildStyle(night);
    const seen: Record<string, Record<string, unknown>> = {};
    repaint(
      {
        getLayer: () => true,
        setPaintProperty: (id, k, v) => ((seen[id] ??= {})[k] = v),
        setLayoutProperty: (id, k, v) => ((seen[id] ??= {})[k] = v),
      },
      night,
    );
    for (const [id, props] of Object.entries(seen)) {
      const layer = built.layers.find((l) => l.id === id)!;
      for (const [k, v] of Object.entries(props)) {
        expect(layer.paint?.[k] ?? layer.layout?.[k], `${id}.${k}`).toEqual(v);
      }
    }
    expect(Object.keys(seen)).toHaveLength(layers.length);
  });

  it("skips a layer the live map does not have", () => {
    let touched = 0;
    repaint({ getLayer: () => undefined, setPaintProperty: () => touched++, setLayoutProperty: () => touched++ }, night);
    expect(touched).toBe(0);
  });
});
