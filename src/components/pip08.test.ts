import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Source guards for the states that are hard to reach and easy to lose in a refactor. */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const add = read("./propiedades/add-dialog.tsx");
const dialog = read("./ui/dialog.tsx");
const comment = read("./propiedades/comment-form.tsx");
const stage = read("./propiedades/stage-form.tsx");
const search = read("./propiedades/search-bar.tsx");
const actions = read("../app/propiedades/actions.ts");
const css = read("../app/globals.css");

describe("the add dialog keeps what was typed (F16)", () => {
  it("holds the URL in state, so a failure cannot clear the field", () => {
    expect(add).toContain("value={url}");
    expect(add).toContain("setUrl(e.target.value)");
    // Only a success empties it.
    expect(add.match(/setUrl\(""\)/g) ?? []).toHaveLength(1);
  });

  it("refuses a second submission without disabling the field", () => {
    expect(add).toContain("if (busy) return;");
    expect(add).toContain("aria-disabled={busy}");
    // Nothing is truly disabled: a disabled control loses focus, and the page must stay readable.
    expect(add.match(/(?<!aria-)disabled/g) ?? []).toHaveLength(0);
  });

  it("names one honest pending state and no invented progress", () => {
    expect(add).toContain("Guardando propiedad…");
    expect(add).not.toMatch(/\d+%/);
    expect(add).toContain("SLOW_MS");
  });

  it("still works before it has hydrated, instead of navigating to a query string", () => {
    expect(add).toContain('method="post" action="/api/import"');
  });

  it("classifies the link before sending it", () => {
    const classify = add.indexOf("routeFor(value)");
    const send = add.indexOf('fetch("/api/import"');
    expect(classify).toBeGreaterThan(-1);
    expect(classify).toBeLessThan(send);
  });
});

describe("the dialog is the platform's (F17)", () => {
  it("uses the native element and its own modal behaviour", () => {
    expect(dialog).toContain("showModal()");
    expect(dialog).toContain("<dialog");
    expect(dialog).not.toContain("keydown");
  });

  it("returns focus to whatever opened it", () => {
    expect(dialog).toContain("opener.current = document.activeElement");
    expect(dialog).toContain("?.focus?.()");
  });

  it("the trigger no longer takes the search field's width", () => {
    expect(search).not.toContain("duration-300");
    expect(search).not.toContain("hidden sm:flex");
    expect(css).toContain("flex-shrink: 0");
  });
});

describe("a refused save keeps the words (F25)", () => {
  it("the comment comes back with its text", () => {
    expect(actions).toContain("text?: string");
    expect(actions).toContain("text: raw");
    expect(comment).toContain("defaultValue={failed?.text ?? \"\"}");
  });

  it("a stage change is conditional on the version it was drawn from", () => {
    expect(actions).toContain("WHERE id = ? AND stage_version = ?");
    expect(actions).toContain("Number(rows[0].stage_version) !== seen");
    expect(stage).toContain('name="version"');
  });

  it("neither form returns nothing at all any more", () => {
    for (const fn of ["commentAction", "setStageAction"]) {
      const at = actions.indexOf(`export async function ${fn}`);
      const body = actions.slice(at, actions.indexOf("\n}\n", at));
      expect(body, `${fn} still has a bare return`).not.toMatch(/^\s*(if \(.*\) )?return;\s*$/m);
    }
  });
});
