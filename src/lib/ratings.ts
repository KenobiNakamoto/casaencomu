/** Pure helpers over `ratings` rows. No DB import: vitest loads this without a data dir. */

export type RatingRow = { user_id: string; dimension: string; score: number };

/** One score per member per dimension: the PK makes a second vote replace the first. */
export const UPSERT_RATING_SQL =
  "INSERT INTO ratings (property_id, user_id, dimension, score, updated_at) VALUES (?, ?, ?, ?, ?) " +
  "ON CONFLICT(property_id, user_id, dimension) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at";

/**
 * The family number for a page that reads many properties at once, in SQL. Same definition as
 * `familyAverage()` below: the inner query is one row per person, so somebody who scored six
 * aspects does not weigh six times somebody who scored one (#130).
 *
 * It reads `p.id`, so the properties table has to be aliased `p` — both call sites do that.
 * It does not round: the pages print with one Spanish decimal, and rounding twice moves the number.
 */
export const FAMILY_AVG_SQL =
  "(SELECT AVG(person_mean) FROM (SELECT AVG(score) AS person_mean FROM ratings WHERE property_id = p.id GROUP BY user_id))";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const printed = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

const byPerson = (rows: RatingRow[]) => {
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const scores = out.get(r.user_id);
    if (scores) scores.push(r.score);
    else out.set(r.user_id, [r.score]);
  }
  return out;
};

/**
 * Each person weighs the same, whatever number of aspects they filled (#130). Averaging the rows
 * instead would let the person who answered most decide the number: six 5s and one 1 read 4,4 by
 * rows, 3,0 by people.
 *
 * Person means are averaged unrounded; only the number that comes back is rounded.
 */
export function familyAverage(rows: RatingRow[]): number | null {
  return printed(mean([...byPerson(rows).values()].map((scores) => mean(scores)!)));
}

/**
 * One aspect, across the family. The primary key gives each person at most one score per aspect,
 * so a plain mean over these rows is already one vote per person.
 */
export function dimensionAverage(rows: RatingRow[]): number | null {
  return printed(mean(rows.map((r) => r.score)));
}

export function memberAverage(rows: RatingRow[], userId: string): number | null {
  return printed(mean(rows.filter((r) => r.user_id === userId).map((r) => r.score)));
}

/** How many people the family number came from. It is never the size of the family. */
export function contributors(rows: RatingRow[]): number {
  return byPerson(rows).size;
}

/** Somebody who answered left an aspect empty, so the family number rests on less than it looks. */
export function isPartial(rows: RatingRow[], dimensions: number): boolean {
  return [...byPerson(rows).values()].some((scores) => scores.length < dimensions);
}

/** `matrix(rows, members, dims)[memberId][dim]` → score or null. */
export function matrix<M extends string, D extends string>(
  rows: RatingRow[],
  members: readonly M[],
  dims: readonly D[],
): Record<M, Record<D, number | null>> {
  const out = {} as Record<M, Record<D, number | null>>;
  for (const m of members) {
    out[m] = {} as Record<D, number | null>;
    for (const d of dims) out[m][d] = null;
  }
  for (const r of rows) {
    const row = out[r.user_id as M];
    if (row && r.dimension in row) row[r.dimension as D] = r.score;
  }
  return out;
}

/**
 * The aspects whose score is new or different. The opinion form always submits all six radios,
 * so without this every save would write six rows and one «Valoración guardada» event, even when
 * the person only typed a sentence.
 */
export function changedScores<D extends string>(
  current: Record<string, number | null | undefined>,
  next: Partial<Record<D, number>>,
): [D, number][] {
  return (Object.entries(next) as [D, number][]).filter(([dim, score]) => current[dim] !== score);
}
