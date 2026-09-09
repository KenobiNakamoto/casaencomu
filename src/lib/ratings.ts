/** Pure helpers over `ratings` rows. No DB import: vitest loads this without a data dir. */

export type RatingRow = { user_id: string; dimension: string; score: number };

/** One score per member per dimension: the PK makes a second vote replace the first. */
export const UPSERT_RATING_SQL =
  "INSERT INTO ratings (property_id, user_id, dimension, score, updated_at) VALUES (?, ?, ?, ?, ?) " +
  "ON CONFLICT(property_id, user_id, dimension) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at";

const mean = (scores: number[]) =>
  scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

/** Mean over every present score (missing dimensions and members are simply absent), 1 decimal. */
export function familyAverage(rows: RatingRow[]): number | null {
  return mean(rows.map((r) => r.score));
}

export function memberAverage(rows: RatingRow[], userId: string): number | null {
  return mean(rows.filter((r) => r.user_id === userId).map((r) => r.score));
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
