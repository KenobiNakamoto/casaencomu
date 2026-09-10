/**
 * What a person thinks about a home, and the private half they have not shared yet.
 * `docs/product-improvement/04-family-reviews.md` is the contract; this is its data layer.
 *
 * Three rules shape everything below.
 *
 * 1. **A stance alone is a whole opinion.** Reasoning, the blocker, the basis and the six scores
 *    are all optional. Nobody has to fill a form to say «no me encaja».
 * 2. **Nothing is shared until it is published.** A draft is the author's, and no query here ever
 *    returns one without being handed the author's own id by the caller.
 * 3. **Two devices cannot silently overwrite each other.** Every write carries the version it
 *    expects and is refused if that has moved. The refusal keeps the caller's text.
 */
import { type InStatement, type Transaction } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { DIMENSIONS, type Dimension } from "./listing";

export const STANCES = ["me_interesa", "dudas", "no_me_encaja"] as const;
export type Stance = (typeof STANCES)[number];

export const BASES = ["listing", "visit"] as const;
export type Basis = (typeof BASES)[number];

export const REASONING_MAX = 1500;

/** The whole opinion, every time. The editor never sends a patch: absent is a value here. */
export type OpinionInput = {
  stance: Stance | null;
  reasoning: string;
  blocker: boolean;
  basis: Basis | null;
  /** 1–5, or null for «No lo sé», which removes a score that was published before. */
  scores: Partial<Record<Dimension, number | null>>;
};

export type Published = {
  stance: Stance | null;
  reasoning: string;
  blocker: boolean;
  basis: Basis | null;
  withdrawn: boolean;
  version: number;
  published_at: string;
  updated_at: string;
  scores: Partial<Record<Dimension, number>>;
};

export type Mine = {
  published: Published | null;
  /** The author's own unsent text. `null` once it has been published or discarded. */
  draft: OpinionInput | null;
  /** 0 when this person has never published here. */
  version: number;
  /** 0 when no draft row exists. Monotonic: it is what rejects a save that arrives late. */
  revision: number;
  /** The publication the draft was written against, so a stale draft can be recognised. */
  base_version: number;
};

export type Ok = { ok: true; version: number; revision: number; changed: boolean };
export type Fail = { ok: false; reason: "conflict" | "invalid"; detail?: string };
export type Result = Ok | Fail;

const conflict: Fail = { ok: false, reason: "conflict" };

export const EMPTY: OpinionInput = { stance: null, reasoning: "", blocker: false, basis: null, scores: {} };

/**
 * What may be published. A draft is not checked: half a thought is the point of a draft.
 * The blocker is the one field that requires another — «hay un impedimento» with no word about
 * what it is gives the family nothing to answer.
 */
export function validate(input: OpinionInput): Fail | null {
  const bad = (detail: string): Fail => ({ ok: false, reason: "invalid", detail });
  if (input.stance === null) return bad("stance");
  if (!STANCES.includes(input.stance)) return bad("stance");
  if (input.reasoning.length > REASONING_MAX) return bad("reasoning_too_long");
  if (input.blocker && input.reasoning.trim() === "") return bad("blocker_needs_reasoning");
  if (input.basis !== null && !BASES.includes(input.basis)) return bad("basis");
  for (const [dim, score] of Object.entries(input.scores)) {
    if (!DIMENSIONS.includes(dim as Dimension)) return bad("dimension");
    if (score === null) continue;
    if (!Number.isInteger(score) || score < 1 || score > 5) return bad("score");
  }
  return null;
}

/** Two opinions are the same opinion when nothing a reader would see is different. */
export function same(a: Published, b: OpinionInput): boolean {
  const scores = (s: Partial<Record<Dimension, number | null>>) =>
    DIMENSIONS.map((d) => s[d] ?? null).join(",");
  return (
    a.stance === b.stance &&
    a.reasoning === b.reasoning &&
    a.blocker === b.blocker &&
    a.basis === b.basis &&
    !a.withdrawn &&
    scores(a.scores) === scores(b.scores)
  );
}

const parse = (json: unknown): OpinionInput | null => {
  if (typeof json !== "string") return null;
  try {
    return { ...EMPTY, ...(JSON.parse(json) as OpinionInput) };
  } catch {
    return null;
  }
};

const row = <T,>(rows: T[]): T | null => rows[0] ?? null;

/**
 * The author's own view: what the family can see, and what only they can. The caller passes the
 * authenticated id — never one that arrived in a form, or this is where a draft leaks.
 */
export async function readMine(propertyId: string, userId: string): Promise<Mine> {
  const [pub, draft, scores] = await db.batch(
    [
      {
        sql: `SELECT stance, reasoning, blocker, basis, withdrawn, version, published_at, updated_at
              FROM opinions WHERE property_id = ? AND user_id = ?`,
        args: [propertyId, userId],
      },
      {
        sql: "SELECT payload_json, revision, base_version FROM opinion_drafts WHERE property_id = ? AND user_id = ?",
        args: [propertyId, userId],
      },
      {
        sql: "SELECT dimension, score FROM ratings WHERE property_id = ? AND user_id = ?",
        args: [propertyId, userId],
      },
    ],
    "read",
  );

  const p = row(pub.rows) as Record<string, unknown> | null;
  const d = row(draft.rows) as Record<string, unknown> | null;

  return {
    published: p
      ? {
          stance: (p.stance as Stance) ?? null,
          reasoning: String(p.reasoning ?? ""),
          blocker: Number(p.blocker) === 1,
          basis: (p.basis as Basis) ?? null,
          withdrawn: Number(p.withdrawn) === 1,
          version: Number(p.version),
          published_at: String(p.published_at),
          updated_at: String(p.updated_at),
          scores: Object.fromEntries(scores.rows.map((r) => [String(r.dimension), Number(r.score)])),
        }
      : null,
    draft: d ? parse(d.payload_json) : null,
    version: p ? Number(p.version) : 0,
    revision: d ? Number(d.revision) : 0,
    base_version: d ? Number(d.base_version) : 0,
  };
}

/** The statements that put this person's scores in the database, replacing what was there. */
function scoreWrites(propertyId: string, userId: string, input: OpinionInput, now: string) {
  const stmts: InStatement[] = [
    { sql: "DELETE FROM ratings WHERE property_id = ? AND user_id = ?", args: [propertyId, userId] },
  ];
  for (const dim of DIMENSIONS) {
    const score = input.scores[dim];
    // ponytail: null is «No lo sé», and it is stored as the absence of a row, not as a zero.
    if (typeof score === "number") {
      stmts.push({
        sql: "INSERT INTO ratings (property_id, user_id, dimension, score, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [propertyId, userId, dim, score, now],
      });
    }
  }
  return stmts;
}

const event = (propertyId: string, kind: string, userId: string, now: string) => ({
  // Content-free on purpose: the activity feed says somebody published an opinion, never what it
  // said. Whoever wants to read it opens the home and reads the opinion itself.
  sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
  args: [randomUUID(), propertyId, kind, userId, now],
});

/**
 * The same read as `readMine`, but on the open write transaction. Publishing must decide from
 * what the transaction sees, not from a second connection that could answer from before it.
 */
async function readInTx(tx: Transaction, propertyId: string, userId: string) {
  const [pub, draft, scores] = await Promise.all([
    tx.execute({
      sql: "SELECT stance, reasoning, blocker, basis, withdrawn, version, published_at FROM opinions WHERE property_id = ? AND user_id = ?",
      args: [propertyId, userId],
    }),
    tx.execute({
      sql: "SELECT payload_json, revision FROM opinion_drafts WHERE property_id = ? AND user_id = ?",
      args: [propertyId, userId],
    }),
    tx.execute({ sql: "SELECT dimension, score FROM ratings WHERE property_id = ? AND user_id = ?", args: [propertyId, userId] }),
  ]);
  const p = row(pub.rows) as Record<string, unknown> | null;
  const d = row(draft.rows) as Record<string, unknown> | null;
  return {
    version: p ? Number(p.version) : 0,
    revision: d ? Number(d.revision) : 0,
    published: p
      ? {
          stance: (p.stance as Stance) ?? null,
          reasoning: String(p.reasoning ?? ""),
          blocker: Number(p.blocker) === 1,
          basis: (p.basis as Basis) ?? null,
          withdrawn: Number(p.withdrawn) === 1,
          version: Number(p.version),
          published_at: String(p.published_at),
          updated_at: String(p.published_at),
          scores: Object.fromEntries(scores.rows.map((r) => [String(r.dimension), Number(r.score)])) as Partial<Record<Dimension, number>>,
        }
      : null,
    draft: d ? parse(d.payload_json) : null,
  };
}

const DRAFT_UPSERT =
  `INSERT INTO opinion_drafts (property_id, user_id, payload_json, revision, base_version, updated_at)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(property_id, user_id) DO UPDATE SET
     payload_json = excluded.payload_json, revision = excluded.revision,
     base_version = excluded.base_version, updated_at = excluded.updated_at`;

/**
 * «Guardar borrador». Explicit, and only explicit: there is no autosave, no debounce and no
 * save on blur, so the person decides when a thought is worth keeping.
 */
export async function saveDraft(
  propertyId: string,
  userId: string,
  input: OpinionInput,
  expected: { revision: number },
  now = new Date().toISOString(),
): Promise<Result> {
  const tx = await db.transaction("write");
  try {
    const at = await readInTx(tx, propertyId, userId);
    // A save typed before a publication and delivered after it would resurrect discarded work.
    if (at.revision !== expected.revision) return conflict;
    if (input.reasoning.length > REASONING_MAX) return { ok: false, reason: "invalid", detail: "reasoning_too_long" };

    const revision = at.revision + 1;
    await tx.execute({
      sql: DRAFT_UPSERT,
      args: [propertyId, userId, JSON.stringify(input), revision, at.version, now],
    });
    await tx.commit();
    return { ok: true, version: at.version, revision, changed: true };
  } finally {
    await tx.close();
  }
}

/**
 * «Publicar opinión». One step: it does not need a draft first, and it never needs two requests.
 *
 * Publishing the same thing twice is not an error and not an event — the second one only clears
 * the draft. That is what keeps a double-tap from filling the family's activity with noise.
 */
export async function publish(
  propertyId: string,
  userId: string,
  input: OpinionInput,
  expected: { version: number; revision: number },
  now = new Date().toISOString(),
): Promise<Result> {
  const invalid = validate(input);
  if (invalid) return invalid;

  const tx = await db.transaction("write");
  try {
    const at = await readInTx(tx, propertyId, userId);
    if (at.version !== expected.version || at.revision !== expected.revision) return conflict;

    const changed = !(at.published && same(at.published, input));
    const version = changed ? at.version + 1 : at.version;
    const revision = at.revision + 1;

    if (changed) {
      await tx.execute({
        sql: `INSERT INTO opinions (property_id, user_id, stance, reasoning, blocker, basis, withdrawn, version, published_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
              ON CONFLICT(property_id, user_id) DO UPDATE SET
                stance = excluded.stance, reasoning = excluded.reasoning, blocker = excluded.blocker,
                basis = excluded.basis, withdrawn = 0, version = excluded.version, updated_at = excluded.updated_at`,
        args: [propertyId, userId, input.stance, input.reasoning, input.blocker ? 1 : 0, input.basis, version, at.published?.published_at ?? now, now],
      });
      for (const stmt of scoreWrites(propertyId, userId, input, now)) await tx.execute(stmt);
      await tx.execute(event(propertyId, "opinion", userId, now));
    }

    // Published or unchanged, the private copy is spent: it is now in the open, or it never differed.
    await tx.execute({ sql: DRAFT_UPSERT, args: [propertyId, userId, null, revision, version, now] });
    await tx.commit();
    return { ok: true, version, revision, changed };
  } finally {
    await tx.close();
  }
}

/**
 * «Retirar mi opinión». The family stops seeing it and it leaves every average, but the person
 * keeps their own words: if they have no draft, the withdrawn opinion becomes one.
 */
export async function withdraw(
  propertyId: string,
  userId: string,
  expected: { version: number; revision: number },
  now = new Date().toISOString(),
): Promise<Result> {
  const tx = await db.transaction("write");
  try {
    const at = await readInTx(tx, propertyId, userId);
    if (at.version === 0) return conflict;
    if (at.version !== expected.version || at.revision !== expected.revision) return conflict;

    const version = at.version + 1;
    const revision = at.revision + 1;
    // Their own text, kept privately. An existing draft is newer, so it wins.
    const keep: OpinionInput | null =
      at.draft ??
      (at.published
        ? {
            stance: at.published.stance,
            reasoning: at.published.reasoning,
            blocker: at.published.blocker,
            basis: at.published.basis,
            scores: at.published.scores,
          }
        : null);

    await tx.execute({
      sql: `UPDATE opinions SET stance = NULL, reasoning = '', blocker = 0, basis = NULL,
              withdrawn = 1, version = ?, updated_at = ? WHERE property_id = ? AND user_id = ?`,
      args: [version, now, propertyId, userId],
    });
    // Out of every aggregate, because the aggregates are built from these rows.
    await tx.execute({ sql: "DELETE FROM ratings WHERE property_id = ? AND user_id = ?", args: [propertyId, userId] });
    // Before this table existed, saving scores wrote them into the event payload. Withdrawing has
    // to take those back too, or the family reads in the activity what it can no longer read in
    // the opinion. The event itself stays: who acted, and when, is the record (§ 4).
    await tx.execute({
      sql: "UPDATE events SET payload_json = NULL WHERE property_id = ? AND actor_id = ? AND kind = 'rating'",
      args: [propertyId, userId],
    });
    await tx.execute(event(propertyId, "opinion_withdrawn", userId, now));
    await tx.execute({
      sql: DRAFT_UPSERT,
      args: [propertyId, userId, keep ? JSON.stringify(keep) : null, revision, version, now],
    });
    await tx.commit();
    return { ok: true, version, revision, changed: true };
  } finally {
    await tx.close();
  }
}
