import { db } from "./db";

/**
 * What the bell shows. Two things reach one person directly:
 *
 * - **a link of theirs was saved, or has now been read.** A link is accepted before it is read
 *   (issue #111), and for Idealista the reading happens minutes later in another process. Nothing
 *   told the person it had finished, which is the hole this fills.
 * - **how many homes are waiting for them.** Not one notification per home somebody else added —
 *   that is what «Actividad» is for — but one line with a number, leading to «Revisar».
 *
 * `users.last_seen_at` splits «Nuevas» from «Antiguas». It is written when the menu is opened.
 */

/** How far back «pisos nuevos» counts. One week is one weekend of looking at flats. */
export const DIGEST_DAYS = 7;

/** More than this and the list is history, not news. The badge says the number it counted. */
const MAX_ITEMS = 30;

export type Item = {
  id: string;
  kind: "import" | "completed";
  propertyId: string;
  title: string;
  at: string;
  seen: boolean;
};

export type Bell = {
  /** Waiting for this person, added in the last `DIGEST_DAYS`. The one line in the menu. */
  digest: number;
  /** Waiting for this person, whenever they were added. The «Revisar» tab counts this. */
  waiting: number;
  items: Item[];
  unseen: number;
};

const EPOCH = "1970-01-01T00:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * A home is **por revisar** when this person has never opened it and did not add it themselves.
 * There is nothing to clear: the absence of a `reviews` row is the state, so it cannot go stale.
 */
const UNREVIEWED = `NOT EXISTS (SELECT 1 FROM reviews r WHERE r.property_id = p.id AND r.user_id = ?)
                    AND (p.created_by IS NULL OR p.created_by <> ?)`;

/** Everything waiting for this person, newest first. The «Revisar» page is exactly this list. */
export async function unreviewed(userId: string): Promise<Set<string>> {
  const { rows } = await db.execute({
    sql: `SELECT p.id FROM properties p WHERE ${UNREVIEWED}`,
    args: [userId, userId],
  });
  return new Set(rows.map((r) => String(r.id)));
}

/** Opening a home is reviewing it. No button to press, and nothing to forget to press. */
export async function markReviewed(userId: string, propertyId: string) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO reviews (property_id, user_id, reviewed_at) VALUES (?, ?, ?)",
    args: [propertyId, userId, new Date().toISOString()],
  });
}

/** The menu was opened, so everything in it has been seen. Written from the menu, nowhere else. */
export async function markSeen(userId: string) {
  await db.execute({
    sql: "UPDATE users SET last_seen_at = ? WHERE id = ?",
    args: [new Date().toISOString(), userId],
  });
}

/**
 * Everything the bell needs, in two queries. `created_by` decides who a `completed` belongs to,
 * not `actor_id`: the browser reader on the host finishes the job, and the person waiting for it
 * is the one who pasted the link.
 */
export async function bellFor(user: { id: string; last_seen_at: string | null }): Promise<Bell> {
  const since = user.last_seen_at ?? EPOCH;
  const [events, waiting] = await db.batch(
    [
      {
        sql: `SELECT e.id, e.kind, e.property_id, e.created_at, p.title
              FROM events e JOIN properties p ON p.id = e.property_id
              WHERE (e.kind = 'import' AND e.actor_id = ?)
                 OR (e.kind = 'completed' AND p.created_by = ?)
              ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
        args: [user.id, user.id, MAX_ITEMS],
      },
      {
        // Both numbers in one pass: the tab counts everything, the menu line counts this week.
        sql: `SELECT COUNT(*) AS waiting, SUM(CASE WHEN p.created_at > ? THEN 1 ELSE 0 END) AS recent,
                     MAX(p.created_at) AS newest
              FROM properties p WHERE ${UNREVIEWED}`,
        args: [daysAgo(DIGEST_DAYS), user.id, user.id],
      },
    ],
    "read",
  );

  const items: Item[] = events.rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind) as Item["kind"],
    propertyId: String(r.property_id),
    title: String(r.title ?? "sin título"),
    at: String(r.created_at),
    seen: String(r.created_at) <= since,
  }));
  const digest = Number(waiting.rows[0].recent ?? 0);
  // The digest adds one to the badge only while something has arrived that this person has not
  // been told about. Counting it whenever the list is not empty would light the bell for as long
  // as they put off reviewing, and a badge that never goes out is a badge nobody reads. How many
  // are waiting is the «Revisar» tab's job, and it says so there.
  const newest = waiting.rows[0].newest == null ? null : String(waiting.rows[0].newest);
  return {
    digest,
    waiting: Number(waiting.rows[0].waiting ?? 0),
    items,
    unseen: items.filter((i) => !i.seen).length + (newest && newest > since ? 1 : 0),
  };
}
