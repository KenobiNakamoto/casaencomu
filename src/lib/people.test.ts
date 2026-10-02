import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { callThem, hasSpoken, latest, said, type Entry } from "./people";

/**
 * The project page and one person's ledger (2026-09-29).
 *
 * The pure helpers are tested directly. The two statements that matter — that looking at a
 * project never enrols anybody in it, and that a project you do not belong to is not readable —
 * are structural, so they are read out of the source like the rest of the page guards.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const people = read("./people.ts");
const overview = read("../app/proyectos/[id]/page.tsx");
const persona = read("../app/proyectos/[id]/persona/[personaId]/page.tsx");

const entry = (over: Partial<Entry> = {}): Entry => ({
  propertyId: "p1",
  title: "Piso",
  price_eur: null,
  area_m2: null,
  rooms: null,
  stage: "nueva",
  neighborhood: null,
  cover_id: null,
  filled: 1,
  opinion: null,
  scores: {},
  comments: [],
  avg: null,
  ...over,
});

describe("what to call somebody", () => {
  it("uses their name, and the address's first part until they have one", () => {
    expect(callThem("Ana", "ana@example.com")).toBe("Ana");
    // Exactly what `currentUser()` would name them, so the page does not change when they arrive.
    expect(callThem(null, "ana@example.com")).toBe("ana");
  });
});

describe("the last thing somebody did", () => {
  it("is the latest of the times there are, and null when there are none", () => {
    expect(latest("2026-09-01", null, "2026-09-09")).toBe("2026-09-09");
    expect(latest(null, null)).toBeNull();
    expect(latest()).toBeNull();
  });
});

describe("whether a person has said anything", () => {
  const zero = { opinions: 0, scored: 0, comments: 0, added: 0 };
  it("counts every kind of trace, not opinions alone", () => {
    expect(hasSpoken(zero)).toBe(false);
    // Saving a link is taking part. So is a comment with no opinion behind it.
    expect(hasSpoken({ ...zero, added: 1 })).toBe(true);
    expect(hasSpoken({ ...zero, comments: 1 })).toBe(true);
    expect(hasSpoken({ ...zero, scored: 1 })).toBe(true);
  });
});

describe("whether a person said anything about one home", () => {
  it("is true for an opinion, a score or a comment, and false for silence", () => {
    expect(said(entry())).toBe(false);
    expect(said(entry({ scores: { ubicacion: 4 } }))).toBe(true);
    expect(said(entry({ comments: [{ id: "c", body: "hola", created_at: "x", updated_at: null, opinion_name: null, parent_id: null }] }))).toBe(true);
    // A stance with no words and no scores is still an opinion.
    expect(said(entry({ opinion: { stance: "dudas", reasoning: "", blocker: 0, basis: null, updated_at: "x" } }))).toBe(true);
  });
});

describe("reading a project never changes it", () => {
  it("never creates a users row while looking at somebody else's project", () => {
    // `currentUser()` inserts on first sight. Inside `inProject` that would enrol the reader in
    // whichever project the URL names, which is how a page view becomes a membership.
    const scoped = people.slice(people.indexOf("export async function peopleOf"));
    expect(scoped).not.toContain("currentUser");
    expect(people).toContain("SELECT id, email, name FROM users WHERE id = ?");
  });

  it("reads the project in the URL, not the one the cookie points at", () => {
    // Every read is scoped by the id the caller passed — four of them, and no bare `db.` outside.
    expect(people.match(/inProject\(projectId/g) ?? []).toHaveLength(4);
  });

  it("uses the one cover statement the list already uses", () => {
    // Two spellings of «the first photo» disagreed once before (F39).
    expect(people).toContain("${COVER_SQL} AS cover_id");
  });
});

describe("both pages refuse a project you are not in", () => {
  it("checks membership before anything else is read", () => {
    for (const src of [overview, persona]) {
      expect(src).toContain("if (!(await isIn(me.email, id))) notFound();");
      // The check has to come before the reads, or a refusal still costs the queries.
      expect(src.indexOf("isIn(me.email, id)")).toBeLessThan(src.indexOf("notFound();\n\n  const project"));
    }
  });
});

describe("the ledger keeps every home but does not drown in them", () => {
  it("splits what they said from what they did not", () => {
    expect(persona).toContain("const spoke = entries.filter(said)");
    expect(persona).toContain("const quiet = entries.filter((e) => !said(e))");
    // The silent ones stay on the page, behind a fold the browser opens itself.
    expect(persona).toContain("<details");
    expect(persona).toContain("pisos de los que no ha dicho nada");
  });

  it("says how many of the homes they actually reached", () => {
    expect(persona).toContain("Ha dejado algo en ${spoke.length} de ${entries.length}");
  });
});

describe("the project page is a way into people", () => {
  it("opens each person who has a row, and says so when they have none", () => {
    const row = read("../components/proyectos/person-row.tsx");
    expect(row).toContain("/proyectos/${projectId}/persona/${p.id}");
    // Invited and never arrived: there is no page to open.
    expect(row).toContain("Sin entrar todavía");
    expect(row).toContain("{p.id ? (");
  });

  it("separates the people who have spoken from the ones who have not", () => {
    expect(overview).toContain("people.filter(hasSpoken)");
    expect(overview).toContain("Todavía no han dicho nada");
  });
});
