import { db } from "./db";
import { SETTINGS_KEYS, type Budget } from "./listing";

const [MIN_KEY, MAX_KEY] = SETTINGS_KEYS;

export type { Budget } from "./listing";

/** null until the family has typed at least one bound. Either one alone is enough (F30). */
export async function getBudget(): Promise<Budget | null> {
  const { rows } = await db.execute({
    sql: "SELECT key, value FROM settings WHERE key IN (?, ?)",
    args: [MIN_KEY, MAX_KEY],
  });
  const found = Object.fromEntries(rows.map((r) => [String(r.key), Number(r.value)]));
  const min = MIN_KEY in found ? found[MIN_KEY] : null;
  const max = MAX_KEY in found ? found[MAX_KEY] : null;
  return min === null && max === null ? null : { min, max };
}

/** A bound given as null is deleted, which is how the family clears the budget again. */
export async function setBudget(min: number | null, max: number | null) {
  const upsert = "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  const write = (key: string, value: number | null) =>
    value === null
      ? { sql: "DELETE FROM settings WHERE key = ?", args: [key] }
      : { sql: upsert, args: [key, String(value)] };
  await db.batch([write(MIN_KEY, min), write(MAX_KEY, max)], "write");
}
