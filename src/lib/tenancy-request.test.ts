import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The trust boundary: which project a **request** may open. Everything below goes through the
 * real `currentProjectId()`, with only `next/headers` replaced, because that is the one thing a
 * test cannot provide.
 */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-request-"));

const req = vi.hoisted(() => ({ email: null as string | null, cookie: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(req.email ? { "x-user-email": req.email } : {}),
  cookies: async () => ({
    get: (name: string) => (name === "casa_p" && req.cookie ? { value: req.cookie } : undefined),
  }),
}));

const { createProject, listProjects, projectsOf } = await import("./control");
const { currentProjectId, resolveProject } = await import("./db");

let ana = "";
let bruno = "";

beforeAll(async () => {
  ana = await createProject("Casa de Ana", "ana@example.com");
  bruno = await createProject("Casa de Bruno", "bruno@example.com");
});

describe("which project a request may open", () => {
  it("uses the cookie when the person is a member of it", async () => {
    req.email = "ana@example.com";
    req.cookie = ana;
    expect(await currentProjectId()).toBe(ana);
  });

  it("ignores a cookie for a project the person does not belong to", async () => {
    // The whole attack: set the cookie to somebody else's project id and reload.
    req.email = "ana@example.com";
    req.cookie = bruno;
    expect(await currentProjectId()).toBe(ana);
  });

  it("ignores a cookie naming a project that does not exist", async () => {
    req.email = "ana@example.com";
    req.cookie = "00000000-0000-0000-0000-000000000000";
    expect(await currentProjectId()).toBe(ana);
  });

  it("refuses a request with no identity", async () => {
    req.email = null;
    req.cookie = ana;
    await expect(currentProjectId()).rejects.toThrow("unauthorized");
  });

  it("never falls back to another project when the request has no membership", async () => {
    // CASA_PROJECT is the fallback for a script or a loop. Inside a request it must not apply,
    // or a stray environment variable would hand every visitor one family's data.
    process.env.CASA_PROJECT = bruno;
    req.email = "carla@example.com";
    req.cookie = undefined;
    const got = await currentProjectId();
    expect(got).not.toBe(bruno);
    expect(got).not.toBe(ana);
    expect((await projectsOf("carla@example.com")).map((p) => p.id)).toEqual([got]);
    delete process.env.CASA_PROJECT;
  });

  it("creates exactly one project for a newcomer, however many queries a page runs", async () => {
    // Straight at the resolver: one render runs several queries at once, and a second lookup
    // issued before the first insert still reads the old, empty answer when it returns.
    const before = (await listProjects()).length;
    const ids = await Promise.all([
      resolveProject("diego@example.com", undefined),
      resolveProject("diego@example.com", undefined),
      resolveProject("diego@example.com", undefined),
    ]);
    expect(new Set(ids).size).toBe(1);
    expect((await listProjects()).length).toBe(before + 1);
    expect((await projectsOf("diego@example.com")).map((p) => p.id)).toEqual([ids[0]]);
  });
});
