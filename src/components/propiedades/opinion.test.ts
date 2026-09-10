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
const editor = read("./opinion-editor.tsx");
const panel = read("../panel.tsx");

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

  it("carries your opinion, the comment and the state, in that order", () => {
    const q = form.indexOf("<OpinionEditor ");
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
    expect(editor).toContain("h-11 w-full"); // the five scores
    expect(editor).toContain("h-12 w-full"); // the stance choices and the publish button
    expect(form).toContain("h-12 w-full"); // the stage control and the save button
  });

  it("writes no colour of its own", () => {
    for (const src of [form, editor, panel]) {
      // «(#141)» is an issue, not a colour.
      expect(src.replace(/\(#\d+\)/g, "").match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
      expect(src.match(/\brgba?\(/g) ?? []).toEqual([]);
    }
  });
});

describe("the opinion editor (#141)", () => {
  it("asks in the order the contract sets", () => {
    const order = ["¿Cómo lo ves?", "Por qué lo ves así", "Hay un impedimento importante para mí", "Valorar por aspectos", "¿En qué te basas?"].map(
      (t) => {
        const i = editor.indexOf(t);
        expect(i, `missing: ${t}`).toBeGreaterThan(-1);
        return i;
      },
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("counts the aspects answered, and does not preselect one", () => {
    expect(editor).toContain('const rated = DIMENSIONS.filter((d) => typeof input.scores[d] === "number").length;');
    expect(editor).toContain("{rated} de {DIMENSIONS.length} aspectos valorados");
    expect(editor).not.toContain("defaultChecked");
  });

  it("offers «No lo sé», which is how a published score is removed", () => {
    expect(editor).toContain("No lo sé");
    expect(editor).toContain("setScore(dim, null)");
  });

  it("saves a draft only when asked: no timer, no blur, no autosave", () => {
    expect(editor).not.toContain("setTimeout");
    expect(editor).not.toContain("onBlur");
    expect(editor).toContain("Guardar borrador");
  });

  it("keeps every word on a refusal, and names the two kinds", () => {
    expect(editor).toContain('result.reason === "conflict"');
    // The refusal path touches no field: `setInput` appears nowhere inside it.
    const refusal = editor.slice(editor.indexOf("if (!result.ok)"), editor.indexOf("setSaved(input);"));
    expect(refusal).not.toContain("setInput");
  });

  it("asks before withdrawing, in the contract's words", () => {
    expect(editor).toContain("Dejará de mostrarse a la familia. Puedes volver a publicarla más adelante.");
    // The call lives inside the branch the question opens, so it cannot be reached in one click.
    expect(editor.indexOf("{confirming ? (")).toBeLessThan(editor.indexOf("withdrawOpinionAction(propertyId"));
  });

  it("offers the three ways out of an unsaved editor", () => {
    for (const t of ["Seguir editando", "Guardar borrador", "Descartar los cambios"]) expect(editor).toContain(t);
    // Never a browser dialog: it cannot be read, styled or undone.
    expect(editor).not.toContain("window.confirm");
    expect(panel).not.toContain("confirm(");
  });

  it("is one native dialog, and lets the browser do what a dialog already does", () => {
    expect(panel).toContain("showModal()");
    expect(panel).toContain("onCancel");
    expect(panel).not.toContain("addEventListener(\"keydown\"");
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

  it("no longer writes a score at all: that only happens through a publication", () => {
    expect(actions).not.toContain("UPSERT_RATING_SQL");
    expect(actions).not.toContain('event(propertyId, "rating"');
    const body = actions.slice(actions.indexOf("export async function opinionAction"));
    expect(body).not.toContain("INSERT INTO ratings");
  });

  it("names the author from the session, never from the request", () => {
    for (const fn of ["publishOpinionAction", "saveDraftAction", "withdrawOpinionAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(body.slice(0, body.indexOf("}"))).toContain("await currentUser()");
    }
    expect(actions).not.toContain("formData.get(\"userId\")");
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
