import { createClient, type InStatement } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
mkdirSync(DATA_DIR, { recursive: true });

export const db = createClient({ url: "file:" + DATA_DIR + "/casa.db" });
// ponytail: one connection per process, so the pragmas are set once here, synchronously
db.executeMultiple(
  "PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000",
);

/**
 * Every migration after the version-1 bootstrap, in order. A fresh database and an existing one
 * run the same chain. Each one commits with its own `user_version` in a single write transaction,
 * so a half-applied step cannot exist. Never edit an applied entry; append a new one.
 */
type Migration = {
  version: number;
  owner: string;
  /** Plain statements, or a function that may read the database first to build them. */
  sql: InStatement[] | (() => Promise<InStatement[]>);
};

const MIGRATIONS: Migration[] = [
  {
    version: 2,
    owner: "PIP-01 — import observations",
    sql: [
      // what the last observation returned: 'listing' | 'removed' | 'blocked' | 'unreadable'
      "ALTER TABLE sources ADD COLUMN last_check_outcome TEXT",
      // which fields that observation carried, so a refresh does not erase what it did not see
      "ALTER TABLE sources ADD COLUMN field_presence_json TEXT NOT NULL DEFAULT '{}'",
      // the photo URLs the listing offered, so a later refresh can fetch the ones that failed
      "ALTER TABLE sources ADD COLUMN photo_urls_json TEXT NOT NULL DEFAULT '[]'",
      // NULL on every row imported before this migration. Legacy URLs are never guessed.
      "ALTER TABLE photos ADD COLUMN source_url TEXT",
    ],
  },
  {
    version: 3,
    owner: "PIP-02 — availability is not a stage",
    sql: async () => [
      // Its own streak. Sharing `consecutive_failures` with blocked pages is finding F05.
      "ALTER TABLE sources ADD COLUMN consecutive_gone INTEGER NOT NULL DEFAULT 0",
      // Advances only when a member changes the stage, never when a source is refreshed.
      "ALTER TABLE properties ADD COLUMN stage_version INTEGER NOT NULL DEFAULT 1",
      ...(await stageRepairStatements()),
    ],
  },
];

/**
 * `no_disponible` was a stage until this migration, so a recheck wrote it over whatever the
 * family had decided and their decision was gone. It is still in `events`: only a member ever
 * wrote a `stage_change`, because the recheck changed the column directly without one. Take the
 * last one they wrote; if there is none we genuinely do not know what they wanted, so it goes
 * back into the queue as `revisando` rather than being guessed into a decision.
 *
 * Exported so it can be tested against a database that actually has such rows — the migration
 * itself can only run once, on a database this repair has never touched.
 */
export async function stageRepairStatements(): Promise<InStatement[]> {
  const { rows } = await db.execute(
    `SELECT p.id, (
       SELECT json_extract(e.payload_json, '$.to') FROM events e
       WHERE e.property_id = p.id AND e.kind = 'stage_change'
         AND json_extract(e.payload_json, '$.to') IN
             ('nueva', 'revisando', 'preseleccionada', 'visita_prevista', 'descartada')
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1
     ) AS restored
     FROM properties p WHERE p.stage = 'no_disponible'`,
  );

  const at = new Date().toISOString();
  const stmts: InStatement[] = [];
  for (const r of rows) {
    const id = String(r.id);
    const restored = typeof r.restored === "string" ? r.restored : "revisando";
    stmts.push(
      { sql: "UPDATE properties SET stage = ? WHERE id = ?", args: [restored, id] },
      {
        sql: `INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at)
              VALUES (?, ?, 'stage_change', ?, NULL, ?)`,
        args: [
          randomUUID(),
          id,
          JSON.stringify({
            from: "no_disponible",
            to: restored,
            nota: r.restored
              ? "Etapa restaurada: la disponibilidad ya no cambia la etapa"
              : "Etapa restaurada a Revisando: no había ninguna etapa anterior guardada",
          }),
          at,
        ],
      },
    );
  }
  if (rows.length) console.log(`[db] restored ${rows.length} stage(s) overwritten by a recheck`);
  return stmts;
}

/** Version 1 is `schema.sql`, all of it `IF NOT EXISTS`; `MIGRATIONS` carries every change after it. */
export async function applySchema() {
  // ponytail: cwd-relative read; Next's file tracing copies schema.sql into .next/standalone
  await db.executeMultiple(readFileSync(join(process.cwd(), "src/lib/schema.sql"), "utf8"));
  const at = async () => Number((await db.execute("PRAGMA user_version")).rows[0][0]);
  if ((await at()) === 0) await db.execute("PRAGMA user_version = 1");

  for (const m of MIGRATIONS) {
    if ((await at()) >= m.version) continue;
    // A failure here throws and start-up stops: serving on a half-migrated database is worse.
    const stmts = typeof m.sql === "function" ? await m.sql() : m.sql;
    await db.batch([...stmts, `PRAGMA user_version = ${m.version}`], "write");
    console.log(`[db] migrated to version ${m.version} (${m.owner})`);
  }
}
