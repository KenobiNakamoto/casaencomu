import { db } from "./db";
import { SETTINGS_KEYS } from "./listing";

const [MIN_KEY, MAX_KEY] = SETTINGS_KEYS;

export type Budget = { min: number; max: number };

/** null until the family has typed both bounds in the app — there is no seed row. */
export async function getBudget(): Promise<Budget | null> {
  const { rows } = await db.execute({
    sql: "SELECT key, value FROM settings WHERE key IN (?, ?)",
    args: [MIN_KEY, MAX_KEY],
  });
  const found = Object.fromEntries(rows.map((r) => [String(r.key), Number(r.value)]));
  if (!(MIN_KEY in found) || !(MAX_KEY in found)) return null;
  return { min: found[MIN_KEY], max: found[MAX_KEY] };
}

export async function setBudget(min: number, max: number) {
  const upsert = "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  await db.batch(
    [
      { sql: upsert, args: [MIN_KEY, String(min)] },
      { sql: upsert, args: [MAX_KEY, String(max)] },
    ],
    "write",
  );
}
