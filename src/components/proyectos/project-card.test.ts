import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const card = read("./project-card.tsx");
const page = read("../../app/proyectos/page.tsx");
const actions = read("../../app/proyectos/actions.ts");

describe("the projects page (#148)", () => {
  it("is a grid of cards, three across on a wide screen", () => {
    expect(page).toContain("sm:grid-cols-2 lg:grid-cols-3");
  });

  it("carries the people and the invitations of every card, not only of the open project", () => {
    expect(page).toContain("mine.map(async (p) =>");
    expect(page).toContain("membersOf(p.id)");
    expect(page).toContain("pendingInvites(p.id)");
  });
});

/**
 * The cards show every project at once, so a form has to say which one it means. Leaving the id
 * out is the regression that matters: the action would reach `mustOwn("")` and answer a 403 to
 * the person who owns the thing.
 */
describe("every form says which project it is about", () => {
  it("puts the id in the form rather than reading the cookie", () => {
    expect(card).toContain('<input type="hidden" name="proyecto" value={p.id} readOnly />');
    expect(actions).toContain('const which = (formData: FormData) => String(formData.get("proyecto") ?? "")');
    for (const fn of ["cambiarProyectoAction", "guardarProyectoAction", "invitarAction", "revocarAction", "expulsarAction"]) {
      const body = actions.slice(actions.indexOf(`function ${fn}`), actions.indexOf("}\n", actions.indexOf(`function ${fn}`)));
      expect(body, fn).toContain("which(formData)");
    }
  });

  it("gives every form in the card the hidden field", () => {
    // `{id}` is that field. One per <form>, or the count is wrong somewhere.
    expect(card.match(/<form action=/g)).toHaveLength(card.match(/\{id\}/g)!.length);
  });
});

describe("the panel over one card", () => {
  it("holds the three things you open it for", () => {
    expect(card).toContain("Nombre y descripción");
    expect(card).toContain(">Gente<");
    expect(card).toContain(">Invitaciones<");
  });

  it("shows the writing controls to the owner and the list to everybody", () => {
    expect(card).toContain('const owner = p.role === "owner"');
    // The people list sits outside any owner test; the two forms that change the project do not.
    expect(card).toContain("Solo el propietario puede invitar o quitar a alguien.");
    expect(card.indexOf("{owner ? (")).toBeLessThan(card.indexOf("Nombre y descripción"));
  });

  it("stays open while the server answers: nothing in it navigates", () => {
    expect(card).toContain("useActionState(guardarProyectoAction, null)");
    expect(card).toContain("useActionState(invitarAction, null)");
    expect(actions).not.toContain("redirect(`${PAGE}?nuevo=");
  });
});
