/**
 * The shape of the family's conversation, with nothing in it that touches a database.
 *
 * It is its own file for one reason: the conversation is drawn by a client component, and one
 * runtime value imported from `comments.ts` would drag `node:crypto` into the browser bundle and
 * Turbopack would refuse to build the page. `comments.ts` re-exports all of this, so a server
 * caller still has one import.
 */

/** Long enough for a paragraph about a flat, short enough that nobody pastes a contract into it. */
export const BODY_MAX = 4000;

export type Reason = "empty" | "too_long" | "bad_id" | "gone" | "not_yours" | "conflict" | "bad_parent" | "bad_reference";
export type Fail = { ok: false; reason: Reason };
export type CommentResult = { ok: true } | Fail;

export type CommentRow = {
  id: string;
  user_id: string;
  /** The author's display name, joined in the read. */
  name: string;
  body: string;
  created_at: string;
  /** NULL until somebody edits it, so «editado» never appears on a comment nobody touched. */
  updated_at: string | null;
  /** Set when the author removes it. The row stays; the body is cleared. */
  deleted_at: string | null;
  version: number;
  parent_id: string | null;
  /** The author of the published opinion this comment answers, if it names one. */
  opinion_user_id: string | null;
  opinion_name: string | null;
};

/** A root comment and the answers under it. One level; a reply is never itself replied to. */
export type Node = CommentRow & { replies: CommentRow[] };

/**
 * Outer whitespace and line endings are the writer's accident; the line breaks inside are the
 * writer's meaning. Normalise the first, keep the second (doc 05 § 4).
 */
export const normalise = (body: string) => body.replace(/\r\n/g, "\n").trim();

export const removed = (c: CommentRow) => c.deleted_at !== null;

/**
 * Flat rows, ordered by time, into roots with their replies.
 *
 * A removed comment is dropped unless somebody answered it: then it stays as a tombstone, because
 * an answer to nothing reads as an answer to the comment above it, which is a different comment
 * by a different person (V21).
 */
export function thread(rows: CommentRow[]): Node[] {
  const roots = rows.filter((c) => c.parent_id === null);
  const byRoot = new Set(roots.map((c) => c.id));
  const nodes = roots.map((c) => ({ ...c, replies: [] as CommentRow[] }));
  const at = new Map(nodes.map((n) => [n.id, n]));

  for (const c of rows) {
    // An orphan — a parent from another home, or a row written before this shape existed — is not
    // shown as a root: it would lose the thing it was answering.
    if (c.parent_id === null || !byRoot.has(c.parent_id)) continue;
    if (removed(c)) continue;
    at.get(c.parent_id)!.replies.push(c);
  }
  return nodes.filter((n) => !removed(n) || n.replies.length > 0);
}

/** How many comments a reader can actually see, tombstones excluded. */
export const visible = (nodes: Node[]) =>
  nodes.reduce((n, r) => n + (removed(r) ? 0 : 1) + r.replies.length, 0);
