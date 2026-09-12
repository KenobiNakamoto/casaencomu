import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The front door. Everything here runs against a real control database in a temporary directory,
 * because the rules that matter — ten accounts and no more, one answer for two kinds of failure,
 * a session that dies when its row does — are rules about rows, not about functions.
 */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-accounts-"));

const {
  MAX_ACCOUNTS,
  accountBy,
  accountCount,
  checkPassword,
  createAccount,
  endAllSessions,
  endSession,
  hashPassword,
  samePassword,
  sessionEmail,
  setPassword,
  startSession,
} = await import("./accounts");

const CLAVE = "una clave larga";

describe("keeping a password", () => {
  it("never stores the password itself, and only matches the right one", async () => {
    const stored = await hashPassword(CLAVE);
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]+$/);
    expect(stored).not.toContain(CLAVE);
    expect(await samePassword(CLAVE, stored)).toBe(true);
    expect(await samePassword(CLAVE + " ", stored)).toBe(false);
  });

  it("gives two people with the same password different rows", async () => {
    // The salt. Without it, equal hashes would say «these two chose the same clave».
    expect(await hashPassword(CLAVE)).not.toBe(await hashPassword(CLAVE));
  });

  it("refuses anything that is not one of our hashes", async () => {
    expect(await samePassword(CLAVE, "")).toBe(false);
    expect(await samePassword(CLAVE, "bcrypt$aa$bb")).toBe(false);
  });
});

describe("making an account", () => {
  it("makes one, and refuses the same address twice", async () => {
    expect(await createAccount("ana@example.com", "Ana", CLAVE)).toEqual({ ok: true });
    expect(await accountBy("ANA@example.com")).toMatchObject({ email: "ana@example.com", name: "Ana" });
    expect(await createAccount("ana@example.com", "Ana", CLAVE)).toEqual({
      ok: false,
      reason: "taken",
    });
  });

  it("refuses a short clave, a bad address and no name", async () => {
    expect(await createAccount("bruno@example.com", "Bruno", "corta")).toEqual({
      ok: false,
      reason: "weak",
    });
    expect(await createAccount("bruno", "Bruno", CLAVE)).toEqual({ ok: false, reason: "invalid" });
    expect(await createAccount("bruno@example.com", "  ", CLAVE)).toEqual({
      ok: false,
      reason: "nameless",
    });
  });

  it("stops at ten, and the eleventh is told the house is full", async () => {
    while ((await accountCount()) < MAX_ACCOUNTS) {
      const n = await accountCount();
      expect(await createAccount(`p${n}@example.com`, `P${n}`, CLAVE)).toEqual({ ok: true });
    }
    expect(await accountCount()).toBe(MAX_ACCOUNTS);
    expect(await createAccount("tarde@example.com", "Tarde", CLAVE)).toEqual({
      ok: false,
      reason: "full",
    });
    expect(await accountBy("tarde@example.com")).toBeNull();
    // Full is about room, not about this person: somebody who is already in still hears «taken».
    expect(await createAccount("ana@example.com", "Ana", CLAVE)).toEqual({
      ok: false,
      reason: "taken",
    });
  });
});

describe("signing in", () => {
  it("accepts the right clave and rejects the wrong one", async () => {
    expect(await checkPassword("ana@example.com", CLAVE)).toEqual({ ok: true, email: "ana@example.com" });
    expect(await checkPassword("ana@example.com", "otra clave larga")).toEqual({
      ok: false,
      reason: "no",
    });
  });

  it("answers the same for an address nobody owns", async () => {
    // Anything else turns this form into a list of who is in the family, one address at a time.
    expect(await checkPassword("nadie@example.com", CLAVE)).toEqual({ ok: false, reason: "no" });
  });

  it("stops after five wrong tries, even when the sixth is right", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await checkPassword("p9@example.com", "no es esta!!")).toEqual({ ok: false, reason: "no" });
    }
    expect(await checkPassword("p9@example.com", CLAVE)).toEqual({ ok: false, reason: "locked" });
  });

  it("forgets the failures as soon as the right clave arrives", async () => {
    await checkPassword("p1@example.com", "no es esta!!");
    expect(await checkPassword("p1@example.com", CLAVE)).toEqual({ ok: true, email: "p1@example.com" });
    await checkPassword("p1@example.com", "no es esta!!");
    expect(await checkPassword("p1@example.com", CLAVE)).toMatchObject({ ok: true });
  });
});

describe("a session", () => {
  it("opens, is read back, and is gone when it ends", async () => {
    const id = await startSession("ana@example.com");
    expect(id.length).toBeGreaterThanOrEqual(40);
    expect(await sessionEmail(id)).toBe("ana@example.com");
    await endSession(id);
    expect(await sessionEmail(id)).toBeNull();
  });

  it("says no to a cookie that names nothing, and to no cookie at all", async () => {
    expect(await sessionEmail(undefined)).toBeNull();
    expect(await sessionEmail("")).toBeNull();
    expect(await sessionEmail("corto")).toBeNull();
    expect(await sessionEmail("x".repeat(43))).toBeNull();
  });

  it("ends every session of one person when their clave changes", async () => {
    const [a, b] = [await startSession("p2@example.com"), await startSession("p2@example.com")];
    const other = await startSession("ana@example.com");
    expect(await setPassword("p2@example.com", "otra clave larga")).toBe(true);
    await endAllSessions("p2@example.com");
    expect(await sessionEmail(a)).toBeNull();
    expect(await sessionEmail(b)).toBeNull();
    // Somebody else's session is untouched.
    expect(await sessionEmail(other)).toBe("ana@example.com");
    expect(await checkPassword("p2@example.com", "otra clave larga")).toMatchObject({ ok: true });
  });

  it("refuses to set a clave that is too short", async () => {
    expect(await setPassword("p2@example.com", "corta")).toBe(false);
    expect(await checkPassword("p2@example.com", "otra clave larga")).toMatchObject({ ok: true });
  });
});

describe("the first account on a server that ran before accounts existed", () => {
  it("is given no new project when the address already belongs to one", async () => {
    // The Air's own case: Cloudflare Access or the preview password wrote the memberships, and
    // the flats are already there. A second, empty project would hide all of them.
    const { createProject, projectsOf } = await import("./control");
    const before = await createProject("Nuestra casa", "vieja@example.com");
    expect((await projectsOf("vieja@example.com")).map((p) => p.id)).toEqual([before]);
    // primeraCuentaAction asks exactly this before it makes anything.
    expect((await projectsOf("vieja@example.com")).length === 0).toBe(false);
    expect((await projectsOf("nadie-nuevo@example.com")).length === 0).toBe(true);
  });
});
