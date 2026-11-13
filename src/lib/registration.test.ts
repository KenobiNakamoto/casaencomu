import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-registration-"));
const KEY = "test-only-installation-key-32-characters";
process.env.CASA_SETUP_TOKEN = KEY;
const jar = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
const c = await import("./control");
const a = await import("./accounts");
const { createFirstAccount, createInvitedAccount } = await import("./registration");
const { crearCuentaAction } = await import("@/app/invitacion/[token]/actions");
const { primeraCuentaAction } = await import("@/app/entrar/actions");
const PASSWORD = "original account password";
beforeEach(async () => {
  await c.controlReady;
  await c.control.executeMultiple("DELETE FROM invites; DELETE FROM memberships; DELETE FROM sessions; DELETE FROM accounts; DELETE FROM installation; DELETE FROM projects;");
  jar.set.mockClear();
});
const invitation = async (to = "new@example.com") => {
  const p = await c.createProject("Sender project", "sender@example.com");
  const issued = await c.createInvite(p, "sender@example.com", to);
  if (!("token" in issued)) throw new Error("invitation refused");
  return { ...issued, p };
};

it("an invitation issuer cannot reset a global account, revoke its sessions, or join on its behalf", async () => {
  await a.createAccount("victim@example.com", "Victim", PASSWORD);
  const session = await a.startSession("victim@example.com");
  const own = await c.createProject("Private search", "victim@example.com");
  const { p, token } = await invitation("victim@example.com");
  const data = new FormData();
  data.set("token", token); data.set("nombre", "Victim"); data.set("clave", "issuer chosen password");
  expect(await crearCuentaAction(null, data)).toMatchObject({ msg: expect.stringContaining("Entra con tu clave") });
  expect((await a.checkPassword("victim@example.com", PASSWORD)).ok).toBe(true);
  expect((await a.checkPassword("victim@example.com", "issuer chosen password")).ok).toBe(false);
  expect(await a.sessionEmail(session)).toBe("victim@example.com");
  expect(await c.isMember("victim@example.com", p)).toBe(false);
  expect(await c.isMember("sender@example.com", own)).toBe(false);
  expect((await c.inviteByToken(token))?.accepted_at).toBeNull();
  expect(jar.set).not.toHaveBeenCalled();
  expect(await c.acceptInvite(token, "sender@example.com")).toMatchObject({ ok: false, reason: "other" });
  expect((await c.acceptInvite(token, "victim@example.com")).ok).toBe(true);
});

it("redeems a new invitation once even when two registrations arrive together", async () => {
  const { p, token } = await invitation();
  const results = await Promise.all([
    createInvitedAccount(token, "New", PASSWORD), createInvitedAccount(token, "New", "another long password"),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(await a.accountCount()).toBe(1);
  expect(await c.roleOf("new@example.com", p)).toBe("member");
  expect((await c.inviteByToken(token))?.accepted_at).toBeTruthy();
});

it.each(["revoked", "expired", "used"])("does not create an account from a %s invitation", async (kind) => {
  const { p, token } = await invitation();
  if (kind === "revoked") await c.revokeInvite(p, "sender@example.com", token);
  else await c.control.execute({ sql: `UPDATE invites SET ${kind === "expired" ? "expires_at" : "accepted_at"} = ? WHERE token = ?`, args: ["2000-01-01", token] });
  expect((await createInvitedAccount(token, "New", PASSWORD)).ok).toBe(false);
  expect(await a.accountCount()).toBe(0);
  expect(await c.isMember("new@example.com", p)).toBe(false);
});

it("refuses setup without the configured operator credential", async () => {
  const f = new FormData(); f.set("correo", "first@example.com"); f.set("nombre", "First"); f.set("clave", PASSWORD);
  expect(await primeraCuentaAction(null, f)).toMatchObject({ msg: expect.stringContaining("instalación") });
  expect(await createFirstAccount("first@example.com", "First", PASSWORD, "wrong key")).toMatchObject({ ok: false, reason: "setup" });
  expect(await a.accountCount()).toBe(0);
});

it("allows exactly one concurrent setup request to adopt the legacy project", async () => {
  const p = await c.createProject("Legacy project", "legacy@example.com");
  const signup = async (email: string) => {
    const f = new FormData(); f.set("correo", email); f.set("nombre", "First"); f.set("clave", PASSWORD); f.set("instalacion", KEY);
    return primeraCuentaAction(null, f).catch((e) => { if (!String(e).includes("REDIRECT")) throw e; });
  };
  await Promise.all([signup("first@example.com"), signup("second@example.com")]);
  expect(await a.accountCount()).toBe(1);
  const roles = await Promise.all([c.roleOf("first@example.com", p), c.roleOf("second@example.com", p)]);
  expect(roles.filter((r) => r === "owner")).toHaveLength(1);
  expect(roles.filter((r) => r === null)).toHaveLength(1);
});

it("creates a usable empty project and cannot reuse setup after account removal", async () => {
  const r = await createFirstAccount("first@example.com", "First", PASSWORD, KEY);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const { db, inProject } = await import("./db");
  expect((await inProject(r.projectId, () => db.execute("SELECT COUNT(*) AS n FROM properties"))).rows[0].n).toBe(0);
  await c.control.execute("DELETE FROM accounts");
  expect(await createFirstAccount("second@example.com", "Second", PASSWORD, KEY)).toMatchObject({ ok: false, reason: "claimed" });
});

it("rechecks invitation revocation after password hashing, before creating anything", async () => {
  const { p, token } = await invitation();
  const hash = await a.hashPassword(PASSWORD);
  let release!: (hash: string) => void;
  let started!: () => void;
  const hashing = new Promise<void>((r) => { started = r; });
  const spy = vi.spyOn(a, "hashPassword").mockImplementationOnce(() => { started(); return new Promise((r) => { release = r; }); });
  try {
    const pending = createInvitedAccount(token, "New", PASSWORD);
    await hashing;
    await c.revokeInvite(p, "sender@example.com", token);
    release(hash);
    expect(await pending).toMatchObject({ ok: false, reason: "unknown" });
    expect(await a.accountCount()).toBe(0);
    expect(await c.isMember("new@example.com", p)).toBe(false);
  } finally { spy.mockRestore(); }
});

it("does not consume an invitation or add membership when the account capacity is exhausted", async () => {
  for (let i = 0; i < a.MAX_ACCOUNTS; i++) await a.createAccount(`member${i}@example.com`, `Member ${i}`, PASSWORD);
  const { p, token } = await invitation();
  expect(await createInvitedAccount(token, "New", PASSWORD)).toMatchObject({ ok: false, reason: "full" });
  expect((await c.inviteByToken(token))?.accepted_at).toBeNull();
  expect(await c.isMember("new@example.com", p)).toBe(false);
});
