import { db } from "./db";

/**
 * Everything that happened in this project, and who has read which of it.
 *
 * Read state is **one row per person per event**, not a timestamp. A timestamp can only say
 * "everything before this moment", which is the wrong sentence: a person who opens the page after
 * a week away sees the newest fifty, and a high-water mark would call the four hundred behind them
 * read as well. What they read is the fifty they were sent (F27, PIP-13).
 *
 * `users.last_seen_at` still exists and is still the bell's. The two were sharing that column, so
 * opening the bell cleared the marks here and rendering this page cleared the bell.
 */
export const PAGE = 50;

export type Row = {
  id: string;
  property_id: string;
  kind: string;
  payload_json: string | null;
  actor_id: string | null;
  created_at: string;
  title: string | null;
  actor: string | null;
};

export type Page = {
  rows: Row[];
  /** The cursor for the page below this one, or null when this is the end of the history. */
  older: string | null;
  /** Which of `rows` this person has already read. */
  read: Set<string>;
  unread: number;
};

/**
 * What is waiting for this person. Their own actions are never unread — nobody has to be told
 * what they just did.
 */
const UNREAD_SQL = `SELECT COUNT(*) AS n FROM events e
                    WHERE (e.actor_id IS NULL OR e.actor_id <> ?)
                      AND NOT EXISTS (SELECT 1 FROM event_reads r WHERE r.event_id = e.id AND r.user_id = ?)`;

/**
 * `created_at DESC, id DESC` everywhere, and the cursor is that pair. Two events written in the
 * same millisecond — an import and the `completed` that follows it — would otherwise fall on both
 * sides of a page boundary, or on neither.
 */
const CURSOR = "(e.created_at < ? OR (e.created_at = ? AND e.id < ?))";
const SEP = "|";
const cursorOf = (r: Row) => `${r.created_at}${SEP}${r.id}`;

export async function feed(userId: string, cursor?: string, limit = PAGE): Promise<Page> {
  const [at, id] = cursor ? cursor.split(SEP) : [];
  const usable = Boolean(at && id);
  const [page, unread] = await db.batch(
    [
      {
        sql: `SELECT e.id, e.property_id, e.kind, e.payload_json, e.actor_id, e.created_at,
                     p.title, u.name AS actor
                FROM events e
                LEFT JOIN properties p ON p.id = e.property_id
                LEFT JOIN users u ON u.id = e.actor_id
                ${usable ? `WHERE ${CURSOR}` : ""}
               ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
        args: usable ? [at, at, id, limit + 1] : [limit + 1],
      },
      { sql: UNREAD_SQL, args: [userId, userId] },
    ],
    "read",
  );

  // One row more than asked for. Its existence is the answer to "is there another page", and it
  // is dropped rather than shown.
  const rows = page.rows.slice(0, limit) as unknown as Row[];
  const more = page.rows.length > limit;

  const read = new Set<string>();
  if (rows.length) {
    const marks = await db.execute({
      sql: `SELECT event_id FROM event_reads WHERE user_id = ? AND event_id IN (${rows.map(() => "?").join(",")})`,
      args: [userId, ...rows.map((r) => r.id)],
    });
    for (const r of marks.rows) read.add(String(r.event_id));
  }

  return {
    rows,
    older: more && rows.length ? cursorOf(rows[rows.length - 1]) : null,
    read,
    unread: Number(unread.rows[0].n ?? 0),
  };
}

export async function unreadCount(userId: string): Promise<number> {
  return Number((await db.execute({ sql: UNREAD_SQL, args: [userId, userId] })).rows[0].n ?? 0);
}

/** An event id is a UUID. Anything else in the form is not one, and is dropped without comment. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ids that were on screen, and only those. Called by a button a person presses, never while a
 * page renders: Next prefetches a link on hover and in the viewport, and a render that marks
 * things read clears the badge for a page nobody ever looked at (F27).
 *
 * `INSERT OR IGNORE`, so pressing it twice is pressing it once, and a page that overlaps the one
 * before it costs nothing.
 */
export async function markRead(userId: string, ids: string[]): Promise<number> {
  const clean = [...new Set(ids.filter((id) => UUID.test(id)))].slice(0, 4 * PAGE);
  if (!clean.length) return 0;
  const at = new Date().toISOString();
  await db.batch(
    clean.map((id) => ({
      sql: "INSERT OR IGNORE INTO event_reads (user_id, event_id, read_at) VALUES (?, ?, ?)",
      args: [userId, id, at],
    })),
    "write",
  );
  return clean.length;
}
