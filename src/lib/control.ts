import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * The control database: which projects exist, and who belongs to each one.
 *
 * Everything else lives in one SQLite file **per project**, so the connection is the tenant and a
 * query cannot forget its `WHERE`. This file is the only shared state, and it holds no listing,
 * no photograph and no opinion — only the membership list. `docs/SCALE.md` § 4.
 */
const DATA_DIR = process.env.DATA_DIR ?? "./data";
mkdirSync(DATA_DIR, { recursive: true });

/** Where one project keeps its database and its photographs. */
export const projectDir = (id: string) => join(DATA_DIR, "p", id);

export const control = createClient({ url: "file:" + join(DATA_DIR, "control.db") });
const ready = control.executeMultiple(
  `PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS projects (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS memberships (
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     email TEXT NOT NULL, created_at TEXT NOT NULL,
     PRIMARY KEY (project_id, email));
   CREATE TABLE IF NOT EXISTS capture_tokens (
     token TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     email TEXT NOT NULL);`,
);

export type Project = { id: string; name: string; created_at: string };

const rowsOf = async (sql: string, args: unknown[] = []) => {
  await ready;
  return (await control.execute({ sql, args: args as never })).rows;
};

/** Every project on this server, oldest first. The two background loops walk this list. */
export async function listProjects(): Promise<Project[]> {
  return (await rowsOf("SELECT id, name, created_at FROM projects ORDER BY created_at, id")).map(
    (r) => ({ id: String(r.id), name: String(r.name), created_at: String(r.created_at) }),
  );
}

/** The projects this person belongs to, oldest first. Their whole view of the app. */
export async function projectsOf(email: string): Promise<Project[]> {
  return (
    await rowsOf(
      `SELECT p.id, p.name, p.created_at FROM projects p
       JOIN memberships m ON m.project_id = p.id
       WHERE m.email = ? ORDER BY p.created_at, p.id`,
      [email],
    )
  ).map((r) => ({ id: String(r.id), name: String(r.name), created_at: String(r.created_at) }));
}

/**
 * **The whole authorisation rule.** A person may open a project's database only if this answers
 * true. It is checked in `db.ts`, at the one function that hands out a connection, so no page can
 * skip it and no query can forget it.
 */
export async function isMember(email: string, projectId: string): Promise<boolean> {
  if (!email || !projectId) return false;
  return (
    (await rowsOf("SELECT 1 FROM memberships WHERE email = ? AND project_id = ?", [email, projectId]))
      .length > 0
  );
}

/** Creates the project, its directory and its eight tables, and makes `email` the first member. */
export async function createProject(name: string, email: string): Promise<string> {
  await ready;
  const id = randomUUID();
  const at = new Date().toISOString();
  mkdirSync(projectDir(id), { recursive: true });
  await control.batch(
    [
      { sql: "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)", args: [id, name, at] },
      {
        sql: "INSERT INTO memberships (project_id, email, created_at) VALUES (?, ?, ?)",
        args: [id, email, at],
      },
    ],
    "write",
  );
  const { applySchema, inProject } = await import("./db");
  await inProject(id, applySchema);
  return id;
}

export async function addMember(projectId: string, email: string) {
  await ready;
  await control.execute({
    sql: "INSERT OR IGNORE INTO memberships (project_id, email, created_at) VALUES (?, ?, ?)",
    args: [projectId, email, new Date().toISOString()],
  });
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
    args: [token, projectId, email],
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
    await moved.execute("SELECT email, capture_token FROM users").catch(() => ({ rows: [] }))
  ).rows;
  moved.close();

  const at = new Date().toISOString();
  await control.batch(
    [
      { sql: "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)", args: [id, "Casa", at] },
      ...members.flatMap((r) => [
        {
          sql: "INSERT OR IGNORE INTO memberships (project_id, email, created_at) VALUES (?, ?, ?)",
          args: [id, String(r.email), at],
        },
        // The bookmarklets they already installed keep working: the token is the same, and this
        // is the row that now says which project it opens.
        {
          sql: "INSERT OR REPLACE INTO capture_tokens (token, project_id, email) VALUES (?, ?, ?)",
          args: [String(r.capture_token), id, String(r.email)],
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
