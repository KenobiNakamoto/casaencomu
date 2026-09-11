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
  it("card: the toggle is outside every anchor", () => {
    // Both links close before the control opens, so it can never be inside one.
    const toggle = card.indexOf("<CompareToggle");
    expect(toggle).toBeGreaterThan(-1);
    const before = card.slice(0, toggle);
    expect(before.match(/<Link /g) ?? []).toHaveLength(before.match(/<\/Link>/g)?.length ?? -1);
  });

  it("card: a wrapper positions it, because .compare-toggle sets its own position", () => {
    expect(card).toMatch(/<div className="absolute bottom-3 right-3 z-10">\s*<CompareToggle/);
    expect(card).not.toMatch(/<CompareToggle[^>]*className="absolute/);
  });

  it("rows: the toggle is outside every anchor", () => {
    // Same rule as the card, now that a row is a photograph and a title rather than table cells.
    const toggle = rows.indexOf("<CompareToggle");
    expect(toggle).toBeGreaterThan(-1);
    const before = rows.slice(0, toggle);
    expect(before.match(/<Link /g) ?? []).toHaveLength(before.match(/<\/Link>/g)?.length ?? -1);
  });
});

describe("differences are decided on raw values (F15)", () => {
  it("each row separates the value from how it is shown", () => {
    expect(table).toContain("raw:");
    expect(table).toContain("show?:");
  });

  it("the comparison runs on the raw values, not on the rendered text", () => {
    expect(table).toContain("const values = shown.map((p) => r.raw(p, ctx))");
    expect(table).toContain("values.some((v) => v !== values[0])");
    // The old code compared `show(...)` output, so a rounded €/m² hid a real difference.
    expect(table).not.toMatch(/const cells = props\.map\(get\)/);
  });

  it("a row that renders its own cell still decides the highlight on `raw`", () => {
    // `cell` draws; `raw` compares. A row that returned JSX from `raw` would compare two
    // React elements, which are never equal, so every such row would always look different.
    expect(table).toContain("cell?: (p: Prop, c: Ctx) => React.ReactNode");
    expect(table).toContain("{r.cell ? r.cell(p, ctx) : (r.show ?? show)(r.values[j])}");
  });
});

describe("the comparison shows what the family thinks (issue #161)", () => {
  it("has the four sections document 02 § 6 asks for", () => {
    for (const section of ["Datos", "La familia", "Aspectos", "Origen"]) {
      expect(table).toContain(`= "${section}"`);
    }
  });

  it("carries stances, blockers, reasoning and the six aspects", () => {
    for (const label of ["Postura", "Han opinado", "Impedimentos", "Lo que dice cada uno", "Portal"]) {
      expect(table).toContain(`label: "${label}"`);
    }
    // The aspects are generated from the shared list, so a seventh dimension appears by itself.
    expect(table).toContain("...DIMENSIONS.map(");
    expect(table).toContain("DIMENSION_LABELS[d]");
  });

  it("derives every number from the same per-person helpers as the rest of the app", () => {
    expect(table).toContain("overall(p.scores, c.who)");
    expect(table).toContain("aspect(p.scores, d, c.who)");
    // Not a mean of its own, and not a second definition fetched from SQL.
    expect(table).not.toContain("reduce((a, b) => a + b");
    expect(page).not.toContain("FAMILY_AVG_SQL");
  });

  it("only ever reads published, un-withdrawn opinions", () => {
    expect(page).toContain("o.withdrawn = 0");
    expect(page).not.toContain("drafts");
  });

  it("never puts an email address on the page", () => {
    // The person selector and every name come from `users.name`; the query does not select email.
    expect(page).not.toMatch(/\bemail\b/);
    expect(table).not.toMatch(/\bemail\b/);
  });
});

describe("two defects the browser found, not the source", () => {
  it("keys a row by its section as well as its label", () => {
    // «Estado» is a row twice: the flat's condition, and the family's score for it. With a bare
    // label as the key, hiding rows between them made React reconcile one onto the other, and
    // «Solo diferencias» showed a row that did not differ.
    expect(table).toContain("<Fragment key={`${r.section} ${label}`}>");
    expect(table).not.toContain("<Fragment key={label}>");
  });

  it("keeps a select from widening the page on a phone", () => {
    // A select is as wide as its longest option, and a property title is long enough to push the
    // page sideways. Measured at a 500 px layout viewport: scrollWidth 500, innerWidth 500.
    expect(table).toContain("min-w-0 max-w-full rounded-lg");
    expect(table).toContain('const control = "flex min-w-0 max-w-full items-center gap-2');
    expect(table).not.toMatch(/<select[^>]*className="h-11 rounded-lg/);
  });

  it("copies every row out of libSQL by name before it crosses to the client", () => {
    // A libSQL row is not a plain object. React refuses to pass one to a client component —
    // silently in production, and as a console error per row in development.
    expect(page).toContain("user_id: s.user_id, dimension: s.dimension, score: s.score");
    expect(page).toContain("user_id: v.user_id, name: v.name");
    expect(page).toContain("people.rows.map((u) => ({ id: String(u.id), name: String(u.name) }))");
    expect(page).not.toContain("scores: scoreRows.filter((s) => s.property_id === id),");
    expect(page).not.toContain("people.rows as unknown as");
  });
});

describe("Ver como (the person lens)", () => {
  it("defaults to the whole family and offers every account", () => {
    expect(table).toContain('<option value="">Toda la familia</option>');
    expect(table).toContain("useState<Lens>(null)");
  });

  it("says so when the chosen person has said nothing about any of these", () => {
    expect(table).toContain("const absent = who !== null && !props.some((p) => p.voices.some((v) => v.user_id === who))");
    expect(table).toContain("no ha opinado");
  });

  it("changes the label of the number with the lens, so a personal score never reads as the family's", () => {
    expect(table).toContain('c.who === null ? "Nota familiar"');
    expect(table).toContain('c.who === c.readerId ? "Tu nota"');
    expect(table).toContain("`Nota de ${naming(c, c.who)}`");
  });

  it("leaves the facts alone: only rows that take the context can change", () => {
    // Every `Datos` row ignores `c`, which is what makes the lens safe to switch.
    const from = table.indexOf("{ section: FACTS");
    const to = table.indexOf("section: FAMILY");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const facts = table.slice(from, to);
    expect(facts).toContain("Certificado energético");
    expect(facts).not.toContain("c.who");
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
