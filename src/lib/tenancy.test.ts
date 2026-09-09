import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// control.ts and db.ts both read DATA_DIR at import; point it somewhere empty first.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-tenancy-"));

const { createProject, isMember, listProjects, projectsOf, projectForCaptureToken, rememberCaptureToken } =
  await import("./control");
const { applySchema, db, inProject } = await import("./db");

const rows = (p: string, sql: string) => inProject(p, async () => (await db.execute(sql)).rows);

/** One property, saved directly. `save()` is covered by its own test; this is about isolation. */
const addProperty = (project: string, title: string) =>
  inProject(project, () =>
    db.execute({
      sql: `INSERT INTO properties (id, title, stage, created_at, updated_at)
            VALUES (?, ?, 'nueva', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      args: [title.toLowerCase(), title],
    }),
  );

/** The same advertisement, saved in both projects. A shared table would refuse the second. */
const addSource = (project: string, propertyId: string) =>
  inProject(project, () =>
    db.execute({
      sql: `INSERT INTO sources (id, property_id, portal, portal_ref, url_normalized, url_original,
                                 via, facts_json, facts_hash, first_seen_at)
            VALUES (?, ?, 'idealista', '12345', 'idealista.com/inmueble/12345/',
                    'https://www.idealista.com/inmueble/12345/', 'paste', '{}', 'h',
                    '2026-01-01T00:00:00.000Z')`,
      args: [propertyId + "-src", propertyId],
    }),
  );

let a = "";
let b = "";

beforeAll(async () => {
  a = await createProject("Casa A", "ana@example.com");
  b = await createProject("Casa B", "bruno@example.com");
});

describe("one database per project", () => {
  it("creates a project with its own schema and its first member", async () => {
    expect(await isMember("ana@example.com", a)).toBe(true);
    expect(await isMember("ana@example.com", b)).toBe(false);
    expect((await projectsOf("ana@example.com")).map((p) => p.id)).toEqual([a]);
    expect((await listProjects()).map((p) => p.id).sort()).toEqual([a, b].sort());
    // applySchema ran inside the new project, so its eight tables are there
    expect(await rows(a, "SELECT name FROM sqlite_master WHERE type='table' AND name='properties'")).toHaveLength(1);
  });

  it("keeps each project's rows to itself", async () => {
    await addProperty(a, "Piso en Gràcia");
    await addProperty(b, "Ático en Sants");
    expect((await rows(a, "SELECT title FROM properties")).map((r) => r.title)).toEqual(["Piso en Gràcia"]);
    expect((await rows(b, "SELECT title FROM properties")).map((r) => r.title)).toEqual(["Ático en Sants"]);
  });

  it("lets two projects hold the same advertisement", async () => {
    // `sources.url_normalized` is UNIQUE. With one shared table the second insert would throw,
    // which is the reason this design has no project_id column.
    await addSource(a, "piso en gràcia");
    await addSource(b, "ático en sants");
    expect(await rows(a, "SELECT id FROM sources")).toHaveLength(1);
    expect(await rows(b, "SELECT id FROM sources")).toHaveLength(1);
  });

  it("finds the project a capture token belongs to, and only that one", async () => {
    await rememberCaptureToken("token-of-ana-0123456789", a, "ana@example.com");
    expect(await projectForCaptureToken("token-of-ana-0123456789")).toBe(a);
    expect(await projectForCaptureToken("never-issued-0123456789")).toBeNull();
    // too short to be a real token: refused before it reaches the database
    expect(await projectForCaptureToken("short")).toBeNull();
  });

  it("refuses a project the person does not belong to", async () => {
    expect(await isMember("bruno@example.com", a)).toBe(false);
    expect(await isMember("", a)).toBe(false);
    expect(await isMember("ana@example.com", "")).toBe(false);
  });

  it("migrates every project, and twice is the same as once", async () => {
    await inProject(a, applySchema);
    await inProject(a, applySchema);
    const v = await rows(a, "PRAGMA user_version");
    expect(Number(v[0][0])).toBeGreaterThanOrEqual(4);
  });

  it("falls back to one project outside a request, never to somebody else's", async () => {
    // No `inProject`, no request: a script or a test. CASA_PROJECT names the project, and with
    // no membership to check there is no request to leak into.
    process.env.CASA_PROJECT = b;
    await applySchema();
    await db.execute("INSERT INTO settings (key, value) VALUES ('probe', 'b')");
    expect(await rows(b, "SELECT value FROM settings WHERE key = 'probe'")).toHaveLength(1);
    expect(await rows(a, "SELECT value FROM settings WHERE key = 'probe'")).toHaveLength(0);
    delete process.env.CASA_PROJECT;
  });
});
