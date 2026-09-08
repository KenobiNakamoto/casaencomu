import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source guards. The defects PIP-06 fixes are structural and silent: a control nested inside an
 * anchor still looks right, and a comparison of formatted strings still renders a table.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const table = read("./table.tsx");
const controls = read("./controls.tsx");
const card = read("../propiedades/card.tsx");
const rows = read("../propiedades/rows.tsx");
const page = read("../../app/comparar/page.tsx");
const css = read("../../app/globals.css");

describe("the control is a sibling of the link, not inside it", () => {
  it("card: the toggle is outside the anchor", () => {
    const toggle = card.indexOf("<CompareToggle");
    const link = card.indexOf("<Link href={href}");
    expect(toggle).toBeGreaterThan(-1);
    expect(toggle).toBeLessThan(link);
  });

  it("rows: the toggle has its own cell", () => {
    expect(rows).toMatch(/<td className=\{td\}>\s*<CompareToggle/);
  });
});

describe("differences are decided on raw values (F15)", () => {
  it("each row separates the value from how it is shown", () => {
    expect(table).toContain("raw:");
    expect(table).toContain("show?:");
  });

  it("the comparison runs on the raw values, not on the rendered text", () => {
    expect(table).toContain("const values = shown.map(r.raw)");
    expect(table).toContain("values.some((v) => v !== values[0])");
    // The old code compared `show(...)` output, so a rounded €/m² hid a real difference.
    expect(table).not.toMatch(/const cells = props\.map\(get\)/);
  });
});

describe("nothing is lost", () => {
  it("the phone pair view narrows what is shown, never what is selected", () => {
    expect(table).toContain("const shown = wide || props.length < 3 ? props : [props[0], props[pair]]");
    expect(table).not.toContain("props.slice(0, 2)");
  });

  it("a refused fifth reports itself instead of evicting", () => {
    expect(controls).toContain("setFull(flip(id).full)");
    expect(controls).toContain("FULL_MESSAGE");
  });

  it("the page says what a link is missing rather than heading a short table", () => {
    expect(page).toContain("ya no existen");
    expect(page).toContain("Comparamos las");
  });
});

describe("reachability", () => {
  it("no interface asks anyone to type an identifier", () => {
    // The empty page used to print `/comparar?ids=a,b,c` and leave the reader to fill it in.
    expect(page).not.toContain("ids=a,b,c");
    expect(page).not.toContain("<code");
    expect(page).toContain("Marca");
  });

  it("every control clears the 44 px target", () => {
    for (const rule of [".compare-box", ".compare-clear,"]) {
      const at = css.indexOf(rule);
      expect(at, `${rule} has no style`).toBeGreaterThan(-1);
      expect(css.slice(at, at + 400)).toContain("min-height: 44px");
    }
  });

  it("the tray states the count in a live region", () => {
    expect(controls).toContain('role="status"');
    expect(controls).toContain("trayLabel(ids.length, outside)");
  });
});
