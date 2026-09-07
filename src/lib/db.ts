import { createClient } from "@libsql/client";
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
const MIGRATIONS: { version: number; owner: string; sql: string[] }[] = [
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
];

/** Version 1 is `schema.sql`, all of it `IF NOT EXISTS`; `MIGRATIONS` carries every change after it. */
export async function applySchema() {
  // ponytail: cwd-relative read; Next's file tracing copies schema.sql into .next/standalone
  await db.executeMultiple(readFileSync(join(process.cwd(), "src/lib/schema.sql"), "utf8"));
  const at = async () => Number((await db.execute("PRAGMA user_version")).rows[0][0]);
  if ((await at()) === 0) await db.execute("PRAGMA user_version = 1");

  for (const m of MIGRATIONS) {
    if ((await at()) >= m.version) continue;
    // A failure here throws and start-up stops: serving on a half-migrated database is worse.
    await db.batch([...m.sql, `PRAGMA user_version = ${m.version}`], "write");
    console.log(`[db] migrated to version ${m.version} (${m.owner})`);
  }
}
