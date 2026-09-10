import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source guards for issues #127, #128 and #129 — the four bands of the detail page. Every defect
 * here is structural: a second composer still posts comments, a save that writes half an opinion
 * still writes, and a form whose columns drifted still renders. None of it shows in a type check.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("../../app/propiedades/[id]/page.tsx");
const form = read("./opinion-form.tsx");
const actions = read("../../app/propiedades/actions.ts");

const at = (marker: string) => {
  const i = page.indexOf(marker);
  expect(i, `no marker: ${marker}`).toBeGreaterThan(-1);
  return i;
};

describe("the page reads as four bands and then its record", () => {
  it("in that order: the home, your opinion, the family, the map, the record", () => {
    const order = ["{/* ---- band 1", "{/* ---- band 2", "{/* ---- band 3", "{/* ---- band 4", "{/* ---- the record"].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("the description takes the width and the facts stand beside it, narrow", () => {
    expect(page).toContain("lg:grid-cols-[minmax(0,1fr)_340px]");
    expect(at("<h2 className={h2}>Descripción</h2>")).toBeLessThan(at('<h2 className="mb-2 text-sm font-semibold text-ink">Datos</h2>'));
    // A deduced value still says so: layer 3 is not a fact the advertisement states.
    expect(page).toContain("deduced(key) &&");
  });

  it("the price is with the title, not in a card halfway down the page", () => {
    expect(at("<h1")).toBeLessThan(at('{fmtEur(p.price_eur, "Sin precio")}'));
    expect(at('{fmtEur(p.price_eur, "Sin precio")}')).toBeLessThan(at("{/* ---- band 1"));
    // The sticky side card it came from is gone, with the two forms that were under it.
    expect(page).not.toContain("lg:sticky");
    expect(page).not.toContain("<aside className=\"lg:col-start-2 lg:row-start-1 lg:self-start");
  });

  it("the advertisement's own record reads after the map, not inside the reading column", () => {
    for (const heading of ["Fuentes", "Historial de precio", "Actividad"]) {
      expect(at(`<h2 className={h2}>${heading}</h2>`)).toBeGreaterThan(at("{/* ---- band 4"));
    }
  });
});

describe("one box, one button", () => {
  it("is one form with one submit", () => {
    expect(form.match(/<form\b/g) ?? []).toHaveLength(1);
    expect(form.match(/type="submit"/g) ?? []).toHaveLength(1);
    // The page has no second composer: the only way into the conversation is this box.
    expect(page).not.toContain("<textarea");
    expect(page).not.toContain("CommentForm");
  });

  it("is a quarter, a half and a quarter", () => {
    expect(form).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]");
  });

  it("carries the questions, the comment and the state, in that order", () => {
    const q = form.indexOf("<Questions ");
    const c = form.indexOf('name="body"');
    const s = form.indexOf('name="etapa"');
    expect(q).toBeGreaterThan(-1);
    expect(q).toBeLessThan(c);
    expect(c).toBeLessThan(s);
  });

  it("puts the button in the space the short column leaves, at the foot of the box", () => {
    const tail = form.slice(form.indexOf('name="etapa"'));
    expect(tail).toContain('<div className="mt-auto space-y-2">');
    expect(tail.indexOf('className="mt-auto')).toBeLessThan(tail.indexOf('type="submit"'));
  });

  it("keeps a 44 px target on every choice and on the button", () => {
    expect(form).toContain("h-11 w-full"); // the five choices
    expect(form).toContain("h-12 w-full"); // the stage control and the button
  });

  it("says how much of the questionnaire is answered, and counts it live", () => {
    expect(form).toContain("const rated = DIMENSIONS.filter((d) => scores[d] != null).length;");
    expect(form).toContain("{rated} de {DIMENSIONS.length} aspectos valorados");
  });

  it("re-draws the answers after every save, because React empties the form", () => {
    // Without the re-mount the radios go blank on screen while React still believes they are
    // chosen: React resets the fields when the action returns, and a `checked` prop that did not
    // change is not written to the DOM again.
    expect(form).toContain("if (seen !== state) {");
    expect(form).toContain("<Questions key={generation} answers={{ ...current, ...(failed?.scores ?? {}) }} />");
  });

  it("writes no colour of its own", () => {
    expect(form.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
    expect(form.match(/\brgba?\(/g) ?? []).toEqual([]);
  });
});

describe("the save is one write, and writes only what changed", () => {
  it("the three old actions and their three forms are gone", () => {
    for (const fn of ["rateAction", "commentAction", "setStageAction"]) expect(actions).not.toContain(fn);
    for (const f of ["./rating-form.tsx", "./comment-form.tsx", "./stage-form.tsx"]) expect(() => read(f)).toThrow();
  });

  it("everything lands in one transaction", () => {
    const body = actions.slice(actions.indexOf("export async function opinionAction"));
    expect(body.match(/db\.batch\([^)]*"write"\)/g) ?? []).toHaveLength(1);
    expect(body).toContain('await db.batch(writes, "write");');
  });

  it("an unchanged score writes no row and no event", () => {
    expect(actions).toContain("const changed = changedScores(current, scores);");
    expect(actions).toContain("if (changed.length > 0) {");
  });

  it("an empty box writes no comment, and the stage it is already in writes nothing", () => {
    expect(actions).toContain("if (body) {");
    expect(actions).toContain("if (from !== to) {");
  });

  it("nothing at all is said, not silently accepted", () => {
    expect(actions).toContain('if (writes.length === 0) return { ok: false, message: "No has cambiado nada todavía."');
  });

  it("the receipt names what was written, because three things went in at once", () => {
    expect(actions).toContain("return { ok: true, saved: listOf(done) };");
    expect(form).toContain("Guardado: {state.saved}.");
  });
});

describe("what the family thinks", () => {
  it("the table has a column and a row of averages, and a corner", () => {
    const table = page.slice(at("{/* ---- band 3"), at("{/* ---- band 4"));
    // One aspect and one person use their own helpers: each is already one score per person,
    // while the corner has to average people rather than rows (#130).
    expect(table).toContain("dimensionAverage(dimRows)");
    expect(table).toContain("memberAverage(ratingRows, u.id)");
    expect(table).toContain("{fmtScore(family)}");
    expect(table).toContain("Parcial");
    // A person who did not score reads as a dash. Zero is a score; missing is not.
    expect(table).toContain('{m[u.id][dim] ?? "—"}');
  });

  it("the conversation scrolls on its own, newest at the foot", () => {
    const chat = page.slice(at("{/* ---- band 3"), at("{/* ---- band 4"));
    expect(chat).toContain("flex-col-reverse");
    expect(chat).toContain("overflow-y-auto");
    expect(chat).toContain("[...commentRows].reverse().map(");
    expect(chat).toContain("max-h-[520px]");
    // Not stretched: a stretched column-reverse list packs a short conversation against the floor.
    expect(chat).not.toContain("flex-1 flex-col-reverse");
  });

  it("an empty conversation says where to write one", () => {
    expect(page).toContain("El tuyo se escribe arriba, junto a tus respuestas.");
  });
});
