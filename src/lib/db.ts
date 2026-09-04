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

/** Idempotent: every statement is IF NOT EXISTS; user_version gates later ALTERs. */
export async function applySchema() {
  // ponytail: cwd-relative read; Next's file tracing copies schema.sql into .next/standalone
  await db.executeMultiple(readFileSync(join(process.cwd(), "src/lib/schema.sql"), "utf8"));
  const [row] = (await db.execute("PRAGMA user_version")).rows;
  if (Number(row[0]) === 0) await db.execute("PRAGMA user_version = 1");
}
