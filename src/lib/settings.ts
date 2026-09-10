import { db } from "./db";
import { SETTINGS_KEYS, type Budget } from "./listing";

const [MIN_KEY, MAX_KEY, BY_KEY, AT_KEY] = SETTINGS_KEYS;

export type { Budget } from "./listing";

/** Who last changed the budget, and when. It belongs to the whole family, so it says whose hand
 *  it was — a number that appears from nowhere reads as a rule rather than as somebody's decision. */
export type BudgetSet = { budget: Budget | null; by: string | null; at: string | null };

export async function getBudget(): Promise<BudgetSet> {
  const { rows } = await db.execute({
    sql: `SELECT s.key, s.value, u.name FROM settings s
          LEFT JOIN users u ON u.id = s.value AND s.key = ?
          WHERE s.key IN (?, ?, ?, ?)`,
    args: [BY_KEY, MIN_KEY, MAX_KEY, BY_KEY, AT_KEY],
  });
  const found = new Map(rows.map((r) => [String(r.key), r]));
  const num = (key: string) => (found.has(key) ? Number(found.get(key)!.value) : null);
  const min = num(MIN_KEY);
  const max = num(MAX_KEY);
  return {
    budget: min === null && max === null ? null : { min, max },
    // The name as it is now, not as it was typed: somebody who renames themselves on /ajustes
    // should not still be the old name here.
    by: found.get(BY_KEY)?.name == null ? null : String(found.get(BY_KEY)!.name),
    at: found.has(AT_KEY) ? String(found.get(AT_KEY)!.value) : null,
  };
}

/**
 * A bound given as null is deleted, which is how the family clears the budget again. The author
 * and the moment are written with it, and cleared with it: «puesto por nadie» is not a thing.
 *
 * ponytail: no version guard. Two people setting it in the same minute is a real race, and what
 * it needs is for the loser to see it happened — which the line under the form says — not for the
 * app to refuse a two-number form. Add a guard when somebody reports losing a change.
 */
export async function setBudget(min: number | null, max: number | null, userId: string) {
  const cleared = min === null && max === null;
  const upsert = "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  const write = (key: string, value: string | null) =>
    value === null
      ? { sql: "DELETE FROM settings WHERE key = ?", args: [key] }
      : { sql: upsert, args: [key, value] };
  await db.batch(
    [
      write(MIN_KEY, min === null ? null : String(min)),
      write(MAX_KEY, max === null ? null : String(max)),
      write(BY_KEY, cleared ? null : userId),
      write(AT_KEY, cleared ? null : new Date().toISOString()),
    ],
    "write",
  );
}
