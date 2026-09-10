/**
 * The family's conversation: writing in it, correcting yourself, and taking something back.
 * `docs/product-improvement/05-implementation.md` § PIP-11 is the contract.
 *
 * Four rules shape everything below.
 *
 * 1. **One level.** A reply hangs off a root comment and nothing hangs off a reply. Four people
 *    talking about a flat do not need a tree.
 * 2. **The server decides who wrote it.** Every write takes the authenticated id from its caller
 *    and matches it against the row. A form can ask for anything; it cannot answer this.
 * 3. **Sending twice writes once.** The composer carries the identifier. The same identifier twice
 *    is the same comment, and neither a changed body nor another author can reuse it.
 * 4. **No words in the history.** Events carry the identifier of a comment, never its text — or a
 *    comment somebody removed would stay readable in the activity feed for good (V21).
 */
import { randomUUID } from "node:crypto";
import { BODY_MAX, normalise, type CommentResult, type Fail, type Reason } from "./comment-shape";
import { db } from "./db";

export * from "./comment-shape";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const no = (reason: Reason): Fail => ({ ok: false, reason });

/** Everything a reader is shown, in one statement: the author's name, and the name it answers. */
export const COMMENTS_SQL = `
  SELECT c.id, c.user_id, c.body, c.created_at, c.updated_at, c.deleted_at, c.version,
         c.parent_id, c.opinion_user_id, u.name, o.name AS opinion_name
  FROM comments c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN users o ON o.id = c.opinion_user_id
  WHERE c.property_id = ? ORDER BY c.created_at`;

const words = (body: string): { text: string } | Fail => {
  const text = normalise(body);
  if (!text) return no("empty");
  if (text.length > BODY_MAX) return no("too_long");
  return { text };
};

export type NewComment = {
  /** Written by the composer so a resend is recognised. Blank means «no browser», see below. */
  id: string;
  body: string;
  parentId?: string | null;
  /** The person whose published opinion this answers. */
  opinionUserId?: string | null;
};

/**
 * Write a comment, or recognise one already written.
 *
 * The identifier comes from the composer, which keeps it across a failed send. A blank one is
 * accepted and replaced: without JavaScript there is nothing to generate it, and the only thing
 * lost is the resend check. A malformed one is refused — that is a hand-edited form, not a browser.
 */
export async function post(propertyId: string, userId: string, input: NewComment, now: string): Promise<CommentResult> {
  const said = words(input.body);
  if ("ok" in said) return said;
  if (input.id && !UUID.test(input.id)) return no("bad_id");
  const id = input.id || randomUUID();

  const tx = await db.transaction("write");
  try {
    const again = await tx.execute({ sql: "SELECT 1 FROM comments WHERE id = ?", args: [id] });
    // The same send arriving twice. Nothing is written and nothing is overwritten: whatever that
    // identifier already says is what it says.
    if (again.rows.length) return { ok: true };

    let parentId: string | null = null;
    if (input.parentId) {
      const p = await tx.execute({
        sql: "SELECT property_id, parent_id, deleted_at FROM comments WHERE id = ?",
        args: [input.parentId],
      });
      const r = p.rows[0];
      // A parent from another home, a parent that is itself a reply, or a parent somebody has
      // taken back. None of the three can hold an answer.
      if (!r || r.property_id !== propertyId || r.parent_id !== null || r.deleted_at !== null) return no("bad_parent");
      parentId = input.parentId;
    }

    let about: string | null = null;
    if (input.opinionUserId) {
      // Published, not withdrawn, and **on this home**. That last condition is the whole
      // cross-property check: there is no other way to name an opinion (V23).
      const o = await tx.execute({
        sql: "SELECT 1 FROM opinions WHERE property_id = ? AND user_id = ? AND withdrawn = 0",
        args: [propertyId, input.opinionUserId],
      });
      if (!o.rows.length) return no("bad_reference");
      about = input.opinionUserId;
    }

    await tx.execute({
      sql: `INSERT INTO comments (id, property_id, user_id, body, created_at, parent_id, opinion_user_id, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [id, propertyId, userId, said.text, now, parentId, about],
    });
    await tx.execute({
      // The identifier and whether it was an answer. Never the words.
      sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, 'comment', ?, ?, ?)",
      args: [randomUUID(), propertyId, JSON.stringify({ comment_id: id, reply: parentId !== null }), userId, now],
    });
    await tx.commit();
    return { ok: true };
  } finally {
    if (!tx.closed) tx.rollback();
  }
}

/**
 * Why a write that matched no row did not match it. Read only when something has already gone
 * wrong, so the ordinary path stays one statement.
 */
async function why(id: string, userId: string, version: number): Promise<Fail> {
  const r = await db.execute({ sql: "SELECT user_id, version, deleted_at FROM comments WHERE id = ?", args: [id] });
  const row = r.rows[0];
  if (!row || row.deleted_at !== null) return no("gone");
  if (row.user_id !== userId) return no("not_yours");
  if (Number(row.version) !== version) return no("conflict");
  return no("gone");
}

/**
 * Correct what you wrote. The author check and the version check are both in the `WHERE`, so a
 * request that is neither yours nor current matches nothing and writes nothing.
 *
 * No event: the feed already says this person commented here, and «X editó un comentario» tells
 * the family nothing they can act on. Doc 05 § 6 forbids grouping edits; this writes none to group.
 */
export async function edit(id: string, userId: string, body: string, version: number, now: string): Promise<CommentResult> {
  const said = words(body);
  if ("ok" in said) return said;
  const r = await db.execute({
    sql: `UPDATE comments SET body = ?, updated_at = ?, version = version + 1
          WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL`,
    args: [said.text, now, id, userId, version],
  });
  return r.rowsAffected === 1 ? { ok: true } : why(id, userId, version);
}

/**
 * Take it back. The row stays — its replies hang off it and still have to read as answers to
 * something — but the words go, from here and from everywhere: the events never held them.
 */
export async function remove(id: string, userId: string, version: number, now: string): Promise<CommentResult> {
  const r = await db.execute({
    sql: `UPDATE comments SET body = '', deleted_at = ?, version = version + 1
          WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL`,
    args: [now, id, userId, version],
  });
  return r.rowsAffected === 1 ? { ok: true } : why(id, userId, version);
}
