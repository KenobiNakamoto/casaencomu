import { mkdtempSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * V23 and PIP-16. It is the only route the proxy lets through unauthenticated, so what it says is
 * said to anybody who can reach the port.
 */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-health-"));
const { GET } = await import("./route");
const { control, createProject, projectDir } = await import("@/lib/control");

describe("the health check", () => {
  it("answers ok, and says the database answered too", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe("ok");
    expect(typeof body.ms).toBe("number");
  });

  it("carries nothing private: no path, no name, no count of anything the family wrote", async () => {
    const body = JSON.stringify(await (await GET()).json());
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(["db", "ms", "ok", "time"]);
    for (const leak of ["/data", "/Volumes", "@", "project", "propert", "email"]) {
      expect(body.toLowerCase(), leak).not.toContain(leak.toLowerCase());
    }
  });

  /**
   * The disk the data lives on is external and removable. A check that answers «ok» from a server
   * that has lost it is worse than no check, because the container keeps being restarted into it.
   */
  it("detects a missing project file without silently creating an empty replacement", async () => {
    const id = await createProject("Health fixture", "fixture@example.com");
    const file = join(projectDir(id), "casa.db");
    renameSync(file, file + ".moved");
    try { expect((await GET()).status).toBe(503); }
    finally { renameSync(file + ".moved", file); }
    expect((await GET()).status).toBe(200);
  });

  it("answers 503 when the database cannot be read", async () => {
    control.close();
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.db).toBe("unreachable");
    // Not even here: the reason would carry a filesystem path.
    expect(JSON.stringify(body)).not.toContain("/");
  });
});

afterAll(() => rmSync(process.env.DATA_DIR!, { recursive: true, force: true }));
