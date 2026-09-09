import { createClient } from "@libsql/client";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The one-time move of the pre-project database into the first project. It runs on the family's
 * real data exactly once, so it gets its own data directory and its own test.
 */
const DATA_DIR = mkdtempSync(join(tmpdir(), "casa-adopt-"));
process.env.DATA_DIR = DATA_DIR;

// The state before projects existed: a database at the root, photographs beside it.
const legacy = createClient({ url: "file:" + join(DATA_DIR, "casa.db") });
await legacy.executeMultiple(readFileSync("src/lib/schema.sql", "utf8"));
await legacy.execute(
  `INSERT INTO users (id, email, name, capture_token, created_at)
   VALUES ('u1', 'ana@example.com', 'ana', 'token-ana-0123456789012', '2026-01-01T00:00:00.000Z'),
          ('u2', 'bruno@example.com', 'bruno', 'token-bruno-012345678', '2026-01-02T00:00:00.000Z')`,
);
await legacy.execute(
  `INSERT INTO properties (id, title, stage, created_at, updated_at)
   VALUES ('p1', 'Piso de antes', 'preseleccionada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
);
legacy.close();
mkdirSync(join(DATA_DIR, "photos", "p1"), { recursive: true });
writeFileSync(join(DATA_DIR, "photos", "p1", "abc.jpg"), "not really a jpeg");

const { bootstrap, listProjects, projectDir, projectForCaptureToken, projectsOf, roleOf } =
  await import("./control");
const { db, inProject } = await import("./db");

describe("adopting the database from before projects existed", () => {
  it("moves it, keeps every row, and makes its users the members", async () => {
    await bootstrap();

    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    const id = projects[0].id;
    expect(projects[0].name).toBe("Casa");

    // Moved, not copied: nothing is left at the old path, so there is no stale second copy.
    expect(existsSync(join(DATA_DIR, "casa.db"))).toBe(false);
    expect(existsSync(join(DATA_DIR, "photos"))).toBe(false);
    expect(existsSync(join(projectDir(id), "casa.db"))).toBe(true);
    expect(readFileSync(join(projectDir(id), "photos", "p1", "abc.jpg"), "utf8")).toBe("not really a jpeg");

    // The decision the family had already made survives the move.
    const rows = await inProject(id, async () => (await db.execute("SELECT stage FROM properties")).rows);
    expect(rows.map((r) => r.stage)).toEqual(["preseleccionada"]);

    // Everyone who had used it is a member of it. Nobody else is.
    expect((await projectsOf("ana@example.com")).map((p) => p.id)).toEqual([id]);
    expect((await projectsOf("bruno@example.com")).map((p) => p.id)).toEqual([id]);
    expect(await projectsOf("carla@example.com")).toEqual([]);

    // Somebody has to be able to invite and remove afterwards. The oldest account set the app up.
    expect(await roleOf("ana@example.com", id)).toBe("owner");
    expect(await roleOf("bruno@example.com", id)).toBe("member");

    // The bookmarklets they already installed still open the right project.
    expect(await projectForCaptureToken("token-ana-0123456789012")).toBe(id);
    expect(await projectForCaptureToken("token-bruno-012345678")).toBe(id);
  });

  it("runs once: a second boot adopts nothing and creates no second project", async () => {
    await bootstrap();
    expect(await listProjects()).toHaveLength(1);
  });
});
