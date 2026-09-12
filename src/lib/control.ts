import { createClient } from "@libsql/client";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  PURPOSE_MAX,
  type Invite,
  type Member,
  type Mine,
  type Project,
  type Role,
} from "./project-shape";

/**
 * The control database: which projects exist, who belongs to each one, and who has been invited.
 *
 * Everything else lives in one SQLite file **per project**, so the connection is the tenant and a
 * query cannot forget its `WHERE`. This file is the only shared state, and it holds no listing,
 * no photograph and no opinion — only the membership list. `docs/SCALE.md` § 4 and § 6.
 */
const DATA_DIR = process.env.DATA_DIR ?? "./data";
mkdirSync(DATA_DIR, { recursive: true });

/** Where one project keeps its database and its photographs. */
export const projectDir = (id: string) => join(DATA_DIR, "p", id);

export const control = createClient({ url: "file:" + join(DATA_DIR, "control.db") });
const ready = control
  .executeMultiple(
    `PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
     CREATE TABLE IF NOT EXISTS projects (
       id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS memberships (
       project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
       email TEXT NOT NULL, created_at TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT 'member',
       PRIMARY KEY (project_id, email));
     CREATE TABLE IF NOT EXISTS capture_tokens (
       token TEXT PRIMARY KEY,
       project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
       email TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS invites (
       token TEXT PRIMARY KEY,
       project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
       email TEXT NOT NULL, invited_by TEXT NOT NULL,
       created_at TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT);
     CREATE INDEX IF NOT EXISTS invites_project ON invites(project_id);
     CREATE TABLE IF NOT EXISTS accounts (
       email TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL,
       created_at TEXT NOT NULL,
       failed_count INTEGER NOT NULL DEFAULT 0, failed_at TEXT);
     CREATE TABLE IF NOT EXISTS sessions (
       id TEXT PRIMARY KEY, email TEXT NOT NULL,
       created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
     CREATE INDEX IF NOT EXISTS sessions_email ON sessions(email);
     -- The account limit, where it is actually true. accounts.ts counts before it inserts, but
     -- counting and inserting are two statements, and two invitations accepted in the same moment
     -- would both pass. The number here is MAX_ACCOUNTS in accounts.ts: change both or neither.
     CREATE TRIGGER IF NOT EXISTS accounts_limit BEFORE INSERT ON accounts
       WHEN (SELECT COUNT(*) FROM accounts) >= 10
       BEGIN SELECT RAISE(ABORT, 'accounts: full'); END;`,
  )
  // A control database written before roles or descriptions existed. Each of these succeeds once
  // and fails every time after, which is the whole migration: every column is nullable or has a
  // default, so there is nothing to fill in and nothing to order.
  .then(() =>
    Promise.all(
      [
        "ALTER TABLE memberships ADD COLUMN role TEXT NOT NULL DEFAULT 'member'",
        "ALTER TABLE projects ADD COLUMN purpose TEXT",
        "ALTER TABLE projects ADD COLUMN description TEXT",
      ].map((sql) => control.execute(sql).then(() => {}, () => {})),
    ).then(() => {}),
  );

/** The shapes and the limits, in a file a `"use client"` component can import. */
export * from "./project-shape";

/** Every table in this file is made once, here. `accounts.ts` writes to two of them. */
export const controlReady = ready;

/**
 * One spelling of an address, everywhere in this file. A membership written as `Ana@…` and looked
 * up as `ana@…` is a person locked out of their own project, so the comparison never sees a case.
 */
const norm = (email: string) => email.trim().toLowerCase();

const rowsOf = async (sql: string, args: unknown[] = []) => {
  await ready;
  return (await control.execute({ sql, args: args as never })).rows;
};

const project = (r: Record<string, unknown>): Project => ({
  id: String(r.id),
  name: String(r.name),
  created_at: String(r.created_at),
  purpose: String(r.purpose ?? ""),
  description: String(r.description ?? ""),
});

/** Every project on this server, oldest first. The two background loops walk this list. */
export async function listProjects(): Promise<Project[]> {
  return (
    await rowsOf("SELECT id, name, created_at, purpose, description FROM projects ORDER BY created_at, id")
  ).map(project);
}

/**
 * The projects this person belongs to, oldest first. Their whole view of the app.
 *
 * The owner comes with it, because two projects can carry the same name — everybody who starts
 * alone gets one called «Mi búsqueda» — and «de ana@example.com» is what tells them apart.
 */
export async function projectsOf(email: string): Promise<Mine[]> {
  return (
    await rowsOf(
      `SELECT p.id, p.name, p.created_at, p.purpose, p.description, m.role,
              (SELECT o.email FROM memberships o
               WHERE o.project_id = p.id AND o.role = 'owner' LIMIT 1) AS owner,
              (SELECT COUNT(*) FROM memberships c WHERE c.project_id = p.id) AS people
       FROM projects p JOIN memberships m ON m.project_id = p.id
       WHERE m.email = ? ORDER BY p.created_at, p.id`,
      [norm(email)],
    )
  ).map((r) => ({
    ...project(r),
    role: String(r.role) as Role,
    owner: String(r.owner ?? ""),
    people: Number(r.people ?? 0),
  }));
}

/**
 * The name, the purpose and the description, all three at once, because they are one form. Owner
 * only. An empty field is stored as an empty string rather than removed: there is nothing to
 * distinguish "never written" from "cleared", and no query asks.
 */
export async function updateProject(
  projectId: string,
  by: string,
  fields: { name: string; purpose: string; description: string },
): Promise<boolean> {
  await mustOwn(by, projectId);
  const name = fields.name.trim().slice(0, NAME_MAX);
  if (!name) return false;
  await control.execute({
    sql: "UPDATE projects SET name = ?, purpose = ?, description = ? WHERE id = ?",
    args: [name, fields.purpose.trim().slice(0, PURPOSE_MAX), fields.description.trim().slice(0, DESCRIPTION_MAX), projectId],
  });
  return true;
}

/**
 * **The whole authorisation rule.** A person may open a project's database only if this answers
 * something. It is checked in `db.ts`, at the one function that hands out a connection, so no page
 * can skip it and no query can forget it. The role says what they may do once they are inside.
 */
export async function roleOf(email: string, projectId: string): Promise<Role | null> {
  if (!email || !projectId) return null;
  const rows = await rowsOf("SELECT role FROM memberships WHERE email = ? AND project_id = ?", [
    norm(email),
    projectId,
  ]);
  return rows.length ? (String(rows[0].role) as Role) : null;
}

export async function isMember(email: string, projectId: string): Promise<boolean> {
  return (await roleOf(email, projectId)) !== null;
}

/** Everyone in the project, the owner first. Every member sees this; only an owner acts on it. */
export async function membersOf(projectId: string): Promise<Member[]> {
  return (
    await rowsOf(
      `SELECT email, role, created_at FROM memberships WHERE project_id = ?
       ORDER BY role = 'owner' DESC, created_at`,
      [projectId],
    )
  ).map((r) => ({ email: String(r.email), role: String(r.role) as Role, created_at: String(r.created_at) }));
}

/**
 * Owner-only, and it throws. Every function below that changes who is in a project calls this
 * first, so the rule is written once and a page cannot forget it. A member who reaches one of
 * them has forged the request, and there is nothing to explain to them.
 */
async function mustOwn(email: string, projectId: string) {
  if ((await roleOf(email, projectId)) !== "owner") {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
}

/**
 * The first account on a server that already holds projects takes them over.
 *
 * Such a server ran before accounts existed: the door was Cloudflare Access or the shared preview
 * password, and it wrote a membership under whatever address it reported — a real address, or a
 * made-up one like `ana@casa.local`, or on one occasion a command-line flag. None of those can
 * ever sign in now, so without this the only person who can own the flats already saved is nobody.
 *
 * It is safe **because there are no accounts yet**, which is the caller's job to be sure of: the
 * first person to reach the login page of a server is the person who put it there. It also drops
 * the memberships that are not addresses at all, since no account can ever be made for them.
 */
export async function adoptProjects(email: string): Promise<number> {
  const at = new Date().toISOString();
  const mine = norm(email);
  const all = await listProjects();
  await control.batch(
    [
      { sql: "DELETE FROM memberships WHERE email NOT LIKE '%@%'", args: [] },
      ...all.map((p) => ({
        sql: `INSERT INTO memberships (project_id, email, created_at, role) VALUES (?, ?, ?, 'owner')
              ON CONFLICT (project_id, email) DO UPDATE SET role = 'owner'`,
        args: [p.id, mine, at] as never,
      })),
    ],
    "write",
  );
  return all.length;
}

/** Creates the project, its directory and its eight tables. Whoever starts it owns it. */
export async function createProject(name: string, email: string): Promise<string> {
  await ready;
  const id = randomUUID();
  const at = new Date().toISOString();
  mkdirSync(projectDir(id), { recursive: true });
  await control.batch(
    [
      { sql: "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)", args: [id, name, at] },
      {
        sql: "INSERT INTO memberships (project_id, email, created_at, role) VALUES (?, ?, ?, 'owner')",
        args: [id, norm(email), at],
      },
    ],
    "write",
  );
  const { applySchema, inProject } = await import("./db");
  await inProject(id, applySchema);
  return id;
}

export async function addMember(projectId: string, email: string, role: Role = "member") {
  await ready;
  await control.execute({
    sql: "INSERT OR IGNORE INTO memberships (project_id, email, created_at, role) VALUES (?, ?, ?, ?)",
    args: [projectId, norm(email), new Date().toISOString(), role],
  });
}

/**
 * Takes somebody out of a project: the membership, and the bookmarklet token that would otherwise
 * keep posting listings into it. Their cookie may still name the project, and it stops working on
 * the next request, because membership is checked every time.
 *
 * An owner is never removed. The project would be left with nobody who can invite or remove.
 */
export async function removeMember(projectId: string, by: string, email: string): Promise<boolean> {
  await mustOwn(by, projectId);
  if ((await roleOf(email, projectId)) !== "member") return false;
  await control.batch(
    [
      { sql: "DELETE FROM memberships WHERE project_id = ? AND email = ?", args: [projectId, norm(email)] },
      { sql: "DELETE FROM capture_tokens WHERE project_id = ? AND email = ?", args: [projectId, norm(email)] },
    ],
    "write",
  );
  return true;
}

/** Fourteen days. The link goes into a chat and stays there; the invitation should not. */
const INVITE_DAYS = 14;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Makes the link the owner sends. Pressing the button twice returns the same link rather than a
 * second one to keep track of.
 *
 * ponytail: no mail server. The app shows the link and the owner sends it (Kenobi, 2026-09-09).
 * Add mail when somebody asks for it; the token and this function do not change.
 */
export async function createInvite(
  projectId: string,
  by: string,
  to: string,
  // The same link, for somebody who is already inside: with no mail server, an invitation is also
  // how a forgotten clave is set again. Only `/proyectos` asks for this, and only the owner can.
  forMember = false,
): Promise<{ token: string } | { refused: "invalid" | "member" }> {
  await mustOwn(by, projectId);
  const email = norm(to);
  if (!EMAIL.test(email)) return { refused: "invalid" };
  if (!forMember && (await roleOf(email, projectId))) return { refused: "member" };
  if (forMember && !(await roleOf(email, projectId))) return { refused: "member" };

  const now = new Date();
  const open = await rowsOf(
    "SELECT token FROM invites WHERE project_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > ?",
    [projectId, email, now.toISOString()],
  );
  if (open.length) return { token: String(open[0].token) };

  const token = randomBytes(24).toString("base64url");
  await control.execute({
    sql: `INSERT INTO invites (token, project_id, email, invited_by, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      token,
      projectId,
      email,
      norm(by),
      now.toISOString(),
      new Date(now.getTime() + INVITE_DAYS * 86400_000).toISOString(),
    ],
  });
  return { token };
}

const invite = (r: Record<string, unknown>): Invite => ({
  token: String(r.token),
  project_id: String(r.project_id),
  project_name: String(r.project_name),
  email: String(r.email),
  invited_by: String(r.invited_by),
  created_at: String(r.created_at),
  expires_at: String(r.expires_at),
  accepted_at: r.accepted_at == null ? null : String(r.accepted_at),
});

const INVITE_SELECT = `SELECT i.token, i.project_id, p.name AS project_name, i.email, i.invited_by,
                              i.created_at, i.expires_at, i.accepted_at
                       FROM invites i JOIN projects p ON p.id = i.project_id`;

/** The invitations still worth sending: not accepted, not out of date. */
export async function pendingInvites(projectId: string): Promise<Invite[]> {
  return (
    await rowsOf(
      `${INVITE_SELECT} WHERE i.project_id = ? AND i.accepted_at IS NULL AND i.expires_at > ?
       ORDER BY i.created_at`,
      [projectId, new Date().toISOString()],
    )
  ).map(invite);
}

export async function inviteByToken(token: string): Promise<Invite | null> {
  if (!token || token.length < 16) return null;
  const rows = await rowsOf(`${INVITE_SELECT} WHERE i.token = ?`, [token]);
  return rows.length ? invite(rows[0]) : null;
}

export async function revokeInvite(projectId: string, by: string, token: string) {
  await mustOwn(by, projectId);
  await control.execute({
    sql: "DELETE FROM invites WHERE token = ? AND project_id = ?",
    args: [token, projectId],
  });
}

export type Problem = "unknown" | "used" | "expired" | "other";
export type Accepted = { ok: true; projectId: string; name: string } | { ok: false; reason: Problem };

/**
 * **The signed-in address is the evidence, never the one in the link.** Anybody who is sent the
 * link can open it, so the check is that the person reading it is the person it names. An
 * invitation is used once, and it stops working after `expires_at`.
 *
 * Written once, and read twice: the page shows why the button is not there, and `acceptInvite`
 * decides. The two can never disagree.
 */
export function inviteProblem(found: Invite | null, email: string): Problem | null {
  if (!found) return "unknown";
  if (found.accepted_at) return "used";
  if (found.expires_at <= new Date().toISOString()) return "expired";
  if (found.email !== norm(email)) return "other";
  return null;
}

export async function acceptInvite(token: string, email: string): Promise<Accepted> {
  const found = await inviteByToken(token);
  const problem = inviteProblem(found, email);
  if (problem || !found) return { ok: false, reason: problem ?? "unknown" };

  const at = new Date().toISOString();
  await control.batch(
    [
      {
        sql: "INSERT OR IGNORE INTO memberships (project_id, email, created_at, role) VALUES (?, ?, ?, 'member')",
        args: [found.project_id, norm(email), at],
      },
      { sql: "UPDATE invites SET accepted_at = ? WHERE token = ?", args: [at, token] },
    ],
    "write",
  );
  return { ok: true, projectId: found.project_id, name: found.project_name };
}

/**
 * The capture token identifies the member on a request that carries no session — the bookmarklet
 * posts from a portal's own page. The project's `users` table is still the authority for the
 * token; this is the index that says which project to look in.
 */
export async function rememberCaptureToken(token: string, projectId: string, email: string) {
  await ready;
  await control.execute({
    sql: "INSERT OR REPLACE INTO capture_tokens (token, project_id, email) VALUES (?, ?, ?)",
    args: [token, projectId, norm(email)],
  });
}

export async function projectForCaptureToken(token: string): Promise<string | null> {
  if (!token || token.length < 16) return null;
  const rows = await rowsOf("SELECT project_id FROM capture_tokens WHERE token = ?", [token]);
  return rows.length ? String(rows[0].project_id) : null;
}

/**
 * One move, once. Before projects existed the database was `<DATA_DIR>/casa.db` and the
 * photographs were `<DATA_DIR>/photos`. Both become the first project, and the people already in
 * its `users` table become its members — they are exactly the people who have used it.
 *
 * A rename inside one directory is instant and atomic, so there is no copy and no window where
 * half the data is in each place.
 */
async function adoptLegacyData() {
  const legacy = join(DATA_DIR, "casa.db");
  if (!existsSync(legacy)) return;
  if ((await rowsOf("SELECT 1 FROM projects LIMIT 1")).length) return;

  const id = randomUUID();
  mkdirSync(projectDir(id), { recursive: true });
  // The rollback journal moves with the database or not at all: a process killed mid-write leaves
  // one, and a database recovered without it is corrupt. journal_mode=DELETE, so there is no -wal.
  // Every path is written out, because Next traces the whole project into the image otherwise.
  const to = projectDir(id);
  renameSync(legacy, join(to, "casa.db"));
  if (existsSync(join(DATA_DIR, "casa.db-journal"))) {
    renameSync(join(DATA_DIR, "casa.db-journal"), join(to, "casa.db-journal"));
  }
  if (existsSync(join(DATA_DIR, "photos"))) {
    renameSync(join(DATA_DIR, "photos"), join(to, "photos"));
  }

  const moved = createClient({ url: "file:" + join(to, "casa.db") });
  const members = (
    await moved
      .execute("SELECT email, capture_token FROM users ORDER BY created_at, rowid")
      .catch(() => ({ rows: [] }))
  ).rows;
  moved.close();

  const at = new Date().toISOString();
  await control.batch(
    [
      { sql: "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)", args: [id, "Casa", at] },
      ...members.flatMap((r, i) => [
        {
          // The oldest account owns it: that is the person who set the app up. Anyone else can be
          // made an owner by hand, and there is nobody else yet.
          sql: "INSERT OR IGNORE INTO memberships (project_id, email, created_at, role) VALUES (?, ?, ?, ?)",
          args: [id, norm(String(r.email)), at, i === 0 ? "owner" : "member"],
        },
        // The bookmarklets they already installed keep working: the token is the same, and this
        // is the row that now says which project it opens.
        {
          sql: "INSERT OR REPLACE INTO capture_tokens (token, project_id, email) VALUES (?, ?, ?)",
          args: [String(r.capture_token), id, norm(String(r.email))],
        },
      ]),
    ],
    "write",
  );
  console.log(`[control] adopted the existing database as project ${id} with ${members.length} member(s)`);
}

/** Called once at start-up: adopt anything left from before, then migrate every project. */
export async function bootstrap() {
  await ready;
  await adoptLegacyData();
  const { applySchema, inProject } = await import("./db");
  // ponytail: every project migrates at boot. At a few thousand projects, migrate on first use.
  for (const p of await listProjects()) await inProject(p.id, applySchema);
}
