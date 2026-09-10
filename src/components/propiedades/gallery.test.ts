import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source guards for issue #122. Every defect here is structural and silent: a second copy of the
 * gallery still renders, a carousel that closes both layers still closes, and two backdrops the
 * wrong way round still darken the page. None of it shows up in a type or a lint.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const gallery = read("./gallery.tsx");
const locationMap = read("./location-map.tsx");
const page = read("../../app/propiedades/[id]/page.tsx");
const css = read("../../app/globals.css");

describe("the page draws each photograph once", () => {
  it("the detail page owns no photograph markup of its own", () => {
    // A <details> block under the hero grid used to draw every photograph a second time. What
    // matters is not that the tag is absent — the record's fold is one — but that there is
    // exactly one photo surface on the page, and it is this component.
    expect(page.match(/<Gallery\b/g) ?? []).toHaveLength(1);
    expect(page).toContain("<Gallery ids={photoIds}");
    expect(page).not.toMatch(/<Cover\b/);
    expect(page).not.toMatch(/<img\b/);
    expect(page).not.toContain("/api/photos/");
  });

  it("the hero shows at most five, and the mosaic is the only place all of them are", () => {
    // Both heroes, the phone strip and the desktop grid, take the same five.
    expect(gallery.match(/ids\.slice\(0, shown\)\.map\(/g) ?? []).toHaveLength(2);
    // The only unsliced `ids.map` left is the carousel's, which renders three of them at most;
    // the mosaic maps a list that is empty until it has been opened.
    expect(gallery.match(/[^)]ids\.map\(/g) ?? []).toHaveLength(1);
    expect(gallery).toContain("(everOpened ? ids : []).map(");
  });
});

describe("the two layers nest", () => {
  it("opening a photograph leaves the mosaic open behind it", () => {
    // If this ever called mosaic.close(), closing the carousel would land on the page.
    const openZoom = gallery.slice(gallery.indexOf("const openZoom"), gallery.indexOf("const step"));
    expect(openZoom).toContain("zoom.current?.showModal()");
    expect(openZoom).not.toContain("mosaic.current?.close()");
  });

  it("each close control closes its own layer only", () => {
    expect(gallery).toContain('onClick={() => mosaic.current?.close()}');
    expect(gallery).toContain('onClick={() => zoom.current?.close()}');
  });

  it("a click outside closes the layer it landed on, not the one under it", () => {
    // `currentTarget` is the dialog for any click inside it, so only `target` can tell them apart.
    expect(gallery).toContain("if (e.target === e.currentTarget) e.currentTarget.close();");
  });

  it("the arrow keys act on the carousel only, and never while it is shut", () => {
    expect(gallery).toContain("if (!zoom.current?.open) return;");
    expect(gallery).toContain('e.key === "ArrowRight"');
    expect(gallery).toContain('e.key === "ArrowLeft"');
  });

  it("the ends of the carousel are ends", () => {
    expect(gallery).toContain("Math.min(n - 1, Math.max(0, i + d))");
    expect(gallery).toContain("disabled={at === 0}");
    expect(gallery).toContain("disabled={at === n - 1}");
  });

  it("the mosaic mixes cell sizes, because every photograph is the same shape", () => {
    expect(gallery).toContain('i % 5 === 0 ? "col-span-2 row-span-2"');
    // Without a dense flow the big cell leaves a hole in the row it starts.
    expect(gallery).toContain("[grid-auto-flow:dense]");
  });

  it("only the neighbours of the open photograph are in the document", () => {
    expect(gallery).toContain("Math.abs(i - at) > 1 ? null :");
  });
});

describe("the second layer reads as further away", () => {
  const scrim = (selector: string) => {
    const at = css.indexOf(selector);
    expect(at, `no rule: ${selector}`).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    const dark = rule.match(/background: rgb\(0 0 0 \/ ([\d.]+)\)/);
    const blur = rule.match(/backdrop-filter: blur\((\d+)px\)/);
    expect(dark, `no scrim in ${selector}`).not.toBeNull();
    expect(blur, `no blur in ${selector}`).not.toBeNull();
    return { dark: Number(dark![1]), blur: Number(blur![1]) };
  };

  it("the carousel's backdrop is darker and blurrier than the mosaic's", () => {
    const mosaic = scrim(".photo-layer::backdrop {");
    const zoom = scrim(".photo-zoom::backdrop {");
    expect(zoom.dark).toBeGreaterThan(mosaic.dark);
    expect(zoom.blur).toBeGreaterThan(mosaic.blur);
  });

  it("the page under an open layer cannot scroll", () => {
    expect(css).toContain("body:has(dialog.photo-layer[open])");
  });

  it("the fade survives the close, which needs the discrete properties named", () => {
    // Without `display` and `overlay` in the transition the element vanishes on the first frame.
    const rule = css.slice(css.indexOf(".photo-layer {"), css.indexOf("}", css.indexOf(".photo-layer {")));
    expect(rule).toContain("display var(--duration-fast) allow-discrete");
    expect(rule).toContain("overlay var(--duration-fast) allow-discrete");
  });
});

describe("the map strip carries this home alone", () => {
  it("it is a sibling of the container, not a viewport-width break-out", () => {
    // `w-screen` counts the vertical scrollbar, so it would scroll the page sideways.
    expect(page).toContain('<div className="location-strip">');
    expect(page).not.toContain("w-screen");
    expect(page.indexOf('className="location-strip"')).toBeGreaterThan(page.indexOf("</div>\n\n    {/* Where it is"));
  });

  it("no coordinates renders no map, and says why", () => {
    expect(page).toContain("p.lat !== null && p.lng !== null && p.address_precision !== \"none\"");
    expect(page).toContain("no se puede situar en el mapa");
  });

  it("it places one marker and reads no filter", () => {
    expect(locationMap.match(/new ml\.Marker\(/g) ?? []).toHaveLength(1);
    // It reads the map style and the theme, and nothing that decides which homes qualify.
    const imports = locationMap.match(/^import .*$/gm) ?? [];
    expect(imports.filter((l) => /lib\/(filters|areas|geo|map-pins)/.test(l))).toEqual([]);
  });

  it("a theme change repaints it instead of rebuilding it, so the camera stays", () => {
    expect(locationMap).toContain("repaint(map.current, readTokens())");
    // `repaint` skips a layer the map has not built yet, so a theme change during the load is a
    // no-op unless something runs it again afterwards.
    expect(locationMap).toContain('m.once("load", () => repaint(m, readTokens()))');
  });

  it("the strip is much wider than it is tall", () => {
    const rule = css.slice(css.indexOf(".location-strip {"), css.indexOf("}", css.indexOf(".location-strip {")));
    const max = Number(rule.match(/height: clamp\([^,]+,[^,]+,\s*(\d+)px\)/)![1]);
    expect(max).toBeLessThanOrEqual(320);
  });
});

describe("both themes", () => {
  it("neither new component writes a colour", () => {
    // The scrim over a photograph is the one exception, and it lives in globals.css.
    for (const [name, code] of [
      ["gallery.tsx", gallery],
      ["location-map.tsx", locationMap],
    ] as const) {
      expect(code.match(/#[0-9a-f]{3,8}\b/gi) ?? [], name).toEqual([]);
      expect(code.match(/\brgba?\(/g) ?? [], name).toEqual([]);
    }
  });
});
