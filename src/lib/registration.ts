import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { accountProblem, hashPassword, MAX_ACCOUNTS, type Refusal } from "./accounts";
import { control, controlReady, inviteByToken, inviteProblem, joinInvite, type Problem } from "./control";

type Registered = { ok: true; email: string; projectId: string };
type Refused = { ok: false; reason: Refusal | Problem | "setup" | "claimed" };
const norm = (email: string) => email.trim().toLowerCase();
const digest = (value: string) => createHash("sha256").update(value).digest();

/** The install key is configured by the operator, never generated or disclosed by a public page. */
export function validSetupToken(value: string): boolean {
  const expected = process.env.CASA_SETUP_TOKEN ?? "";
  return expected.length >= 32 && timingSafeEqual(digest(value), digest(expected));
}

/** The only anonymous registration on an empty server. Claim and adoption commit together. */
export async function createFirstAccount(
  email: string, name: string, password: string, setupToken: string,
): Promise<Registered | Refused> {
  if (!validSetupToken(setupToken)) return { ok: false, reason: "setup" };
  const problem = accountProblem(email, name, password);
  if (problem) return { ok: false, reason: problem };
  const hash = await hashPassword(password);
  await controlReady;
  const tx = await control.transaction("write");
  try {
    if (Number((await tx.execute("SELECT COUNT(*) AS n FROM accounts")).rows[0].n) || (await tx.execute("SELECT 1 FROM installation")).rows.length) {
      return { ok: false, reason: "claimed" };
    }
    const at = new Date().toISOString();
    const who = norm(email);
    await tx.execute({
      sql: "INSERT INTO accounts (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
      args: [who, name.trim(), hash, at],
    });
    const { rows } = await tx.execute("SELECT id FROM projects ORDER BY created_at, id");
    const projectId = rows.length ? String(rows[0].id) : randomUUID();
    if (!rows.length) {
      await tx.execute({ sql: "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)", args: [projectId, "Nuestra búsqueda", at] });
    }
    await tx.execute("DELETE FROM memberships WHERE email NOT LIKE '%@%'");
    await tx.execute({
      sql: `INSERT INTO memberships (project_id, email, created_at, role)
            SELECT id, ?, ?, 'owner' FROM projects WHERE true
            ON CONFLICT (project_id, email) DO UPDATE SET role = 'owner'`,
      args: [who, at],
    });
    await tx.execute({ sql: "INSERT INTO installation (id, claimed_at) VALUES (1, ?)", args: [at] });
    if (!rows.length) {
      const { applySchema, inProject } = await import("./db");
      await inProject(projectId, applySchema);
    }
    await tx.commit();
    return { ok: true, email: who, projectId };
  } finally {
    tx.close();
  }
}

/** An invitation creates only a NEW account. It can never change an existing credential. */
export async function createInvitedAccount(token: string, name: string, password: string): Promise<Registered | Refused> {
  const invite = await inviteByToken(token);
  const problem = inviteProblem(invite, invite?.email ?? "");
  if (problem || !invite) return { ok: false, reason: problem ?? "unknown" };
  const invalid = accountProblem(invite.email, name, password);
  if (invalid) return { ok: false, reason: invalid };
  const hash = await hashPassword(password);
  const tx = await control.transaction("write");
  try {
    // Check again after hashing, under the same write lock as the account insert.
    const joined = await joinInvite(tx, token, invite.email);
    if (!joined.ok) return joined;
    const exists = await tx.execute({ sql: "SELECT 1 FROM accounts WHERE email = ?", args: [invite.email] });
    if (exists.rows.length) return { ok: false, reason: "taken" };
    if (Number((await tx.execute("SELECT COUNT(*) AS n FROM accounts")).rows[0].n) >= MAX_ACCOUNTS) {
      return { ok: false, reason: "full" };
    }
    await tx.execute({
      sql: "INSERT INTO accounts (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
      args: [invite.email, name.trim(), hash, new Date().toISOString()],
    });
    await tx.commit();
    return { ok: true, email: invite.email, projectId: joined.projectId };
  } finally {
    tx.close();
  }
}
