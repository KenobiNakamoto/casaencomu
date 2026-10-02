/**
 * Who is in a project, and what one of them has said about every home in it.
 *
 * Two readings of the same data. `peopleOf` answers «who is here and how much have they said»;
 * `ledgerOf` answers «what does this one person think of everything», which is the question the
 * detail page cannot answer because it holds one home at a time.
 *
 * Both run inside `inProject`, so they read the project named in the URL rather than the one the
 * cookie happens to point at. They only ever read. `currentUser()` is never called in that scope:
 * it creates a `users` row on first sight, and looking at a project must not enrol anybody in it.
 */
import { db, inProject } from "./db";
import { isMember, membersOf } from "./control";
import { COVER_SQL } from "./filters";
import { DIMENSIONS, type Dimension } from "./listing";
import { type Basis, type Stance } from "./opinion-input";
import { familyAverage, type RatingRow } from "./ratings";
import type { Role } from "./project-shape";

/** One member of a project, with what they have done inside it. */
export type Person = {
  /** Their `users` row in this project, or null when they have never opened it. */
  id: string | null;
  email: string;
  /** What they call themselves here. The address's own first part until they change it. */
  name: string;
  role: Role;
  /** Published and not withdrawn. A stance with no words is still an opinion. */
  opinions: number;
  /** Homes they put at least one score on. Never the number of scores. */
  scored: number;
  /** Comments they wrote and did not take back. */
  comments: number;
  /** Homes they saved the link for. */
  added: number;
  /** Their own average over everything they scored, on the same one-person-one-vote rule. */
  avg: number | null;
  /** The last thing they did here, of any kind. Null when they have done nothing. */
  lastAt: string | null;
};

/** What one person left on one home. Every field may be empty: silence is an answer. */
export type Entry = {
  propertyId: string;
  title: string;
  price_eur: number | null;
  area_m2: number | null;
  rooms: number | null;
  stage: string;
  neighborhood: string | null;
  cover_id: string | null;
  filled: number;
  opinion: {
    stance: Stance | null;
    reasoning: string;
    blocker: number;
    basis: Basis | null;
    updated_at: string;
  } | null;
  scores: Partial<Record<Dimension, number>>;
  /** Their own comments here, oldest first, with the name of whoever each one answers. */
  comments: { id: string; body: string; created_at: string; updated_at: string | null; opinion_name: string | null; parent_id: string | null }[];
  /** Their mean over this home alone, or null when they scored nothing on it. */
  avg: number | null;
};

const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

/**
 * Something to call somebody before they have opened the project. The address's first part is
 * what `currentUser()` would name them anyway, so the page does not change when they arrive.
 */
export const callThem = (name: string | null, email: string) => name ?? email.split("@")[0];

/**
 * The later of two times, either of which may be missing. Used to fold four «last thing you did»
 * columns into one without four null checks at each call site.
 */
export const latest = (...times: (string | null)[]): string | null =>
  times.filter((t): t is string => Boolean(t)).sort().at(-1) ?? null;

/** Whether this person has left any trace at all in the project. */
export const hasSpoken = (p: Pick<Person, "opinions" | "scored" | "comments" | "added">) =>
  p.opinions + p.scored + p.comments + p.added > 0;

/** An entry carries something this person wrote or scored. Used to order the ledger. */
export const said = (e: Pick<Entry, "opinion" | "scores" | "comments">) =>
  Boolean(e.opinion) || Object.keys(e.scores).length > 0 || e.comments.length > 0;

export async function isIn(email: string, projectId: string) {
  return isMember(email, projectId);
}

/** Everyone in one project, and how much each of them has said. One pass over five tables. */
export async function peopleOf(projectId: string): Promise<Person[]> {
  const members = await membersOf(projectId);
  return inProject(projectId, async () => {
    const [users, opinions, scored, comments, added] = await db.batch(
      [
        { sql: "SELECT id, email, name, last_seen_at FROM users", args: [] },
        {
          sql: `SELECT user_id, count(*) AS n, max(updated_at) AS at FROM opinions
                WHERE withdrawn = 0 GROUP BY user_id`,
          args: [],
        },
        {
          sql: `SELECT user_id, count(DISTINCT property_id) AS n, max(updated_at) AS at
                FROM ratings GROUP BY user_id`,
          args: [],
        },
        {
          sql: `SELECT user_id, count(*) AS n, max(created_at) AS at FROM comments
                WHERE deleted_at IS NULL GROUP BY user_id`,
          args: [],
        },
        {
          sql: `SELECT created_by AS user_id, count(*) AS n, max(created_at) AS at FROM properties
                WHERE created_by IS NOT NULL GROUP BY created_by`,
          args: [],
        },
      ],
      "read",
    );
    // Their own average needs the rows, not a count: one person, one vote per aspect.
    const { rows: ratingRows } = await db.execute({ sql: "SELECT user_id, dimension, score FROM ratings", args: [] });
    const mine = (id: string) =>
      familyAverage((ratingRows as unknown as RatingRow[]).filter((r) => r.user_id === id));

    const byEmail = new Map(users.rows.map((r) => [String(r.email), r]));
    const pick = (rows: typeof opinions.rows, id: string | null) =>
      id ? rows.find((r) => String(r.user_id) === id) : undefined;

    return members.map((m) => {
      const u = byEmail.get(m.email);
      const id = u ? String(u.id) : null;
      const o = pick(opinions.rows, id);
      const sc = pick(scored.rows, id);
      const c = pick(comments.rows, id);
      const a = pick(added.rows, id);
      return {
        id,
        email: m.email,
        name: callThem(u ? String(u.name) : null, m.email),
        role: m.role,
        opinions: Number(o?.n ?? 0),
        scored: Number(sc?.n ?? 0),
        comments: Number(c?.n ?? 0),
        added: Number(a?.n ?? 0),
        avg: id ? mine(id) : null,
        lastAt: latest(s(o?.at), s(sc?.at), s(c?.at), s(a?.at)),
      };
    });
  });
}

/** What the project itself is made of, for the line under its name. */
export type Totals = { properties: number; opinions: number; comments: number; people: number };

export async function totalsOf(projectId: string, people: number): Promise<Totals> {
  return inProject(projectId, async () => {
    const { rows } = await db.execute({
      sql: `SELECT (SELECT count(*) FROM properties) AS properties,
                   (SELECT count(*) FROM opinions WHERE withdrawn = 0) AS opinions,
                   (SELECT count(*) FROM comments WHERE deleted_at IS NULL) AS comments`,
      args: [],
    });
    const r = rows[0];
    return {
      properties: Number(r.properties ?? 0),
      opinions: Number(r.opinions ?? 0),
      comments: Number(r.comments ?? 0),
      people,
    };
  });
}

/** One person's `users` row in one project, without creating it. */
export async function personIn(projectId: string, personId: string) {
  return inProject(projectId, async () => {
    const { rows } = await db.execute({ sql: "SELECT id, email, name FROM users WHERE id = ?", args: [personId] });
    const r = rows[0];
    return r ? { id: String(r.id), email: String(r.email), name: String(r.name) } : null;
  });
}

/**
 * Every home in the project beside what this one person said about it.
 *
 * Four statements and a join in JavaScript, because a family's list is tens of rows. The photo is
 * the same cover the list uses, so the left column of the ledger reads like the main page.
 */
export async function ledgerOf(projectId: string, personId: string): Promise<Entry[]> {
  return inProject(projectId, async () => {
    const [properties, opinions, ratings, comments] = await db.batch(
      [
        {
          sql: `SELECT p.id, p.title, p.price_eur, p.area_m2, p.rooms, p.stage, p.neighborhood, p.filled,
                       ${COVER_SQL} AS cover_id
                FROM properties p ORDER BY p.created_at DESC`,
          args: [],
        },
        {
          sql: `SELECT property_id, stance, reasoning, blocker, basis, updated_at FROM opinions
                WHERE user_id = ? AND withdrawn = 0`,
          args: [personId],
        },
        { sql: "SELECT property_id, dimension, score FROM ratings WHERE user_id = ?", args: [personId] },
        {
          sql: `SELECT c.id, c.property_id, c.body, c.created_at, c.updated_at, c.parent_id, o.name AS opinion_name
                FROM comments c LEFT JOIN users o ON o.id = c.opinion_user_id
                WHERE c.user_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at`,
          args: [personId],
        },
      ],
      "read",
    );

    const opinionOf = new Map(opinions.rows.map((r) => [String(r.property_id), r]));
    const scoresOf = new Map<string, Partial<Record<Dimension, number>>>();
    for (const r of ratings.rows) {
      const key = String(r.property_id);
      const held = scoresOf.get(key) ?? {};
      if (DIMENSIONS.includes(String(r.dimension) as Dimension)) held[String(r.dimension) as Dimension] = Number(r.score);
      scoresOf.set(key, held);
    }
    const commentsOf = new Map<string, Entry["comments"]>();
    for (const r of comments.rows) {
      const key = String(r.property_id);
      const held = commentsOf.get(key) ?? [];
      held.push({
        id: String(r.id),
        body: String(r.body),
        created_at: String(r.created_at),
        updated_at: s(r.updated_at),
        opinion_name: s(r.opinion_name),
        parent_id: s(r.parent_id),
      });
      commentsOf.set(key, held);
    }

    const entries: Entry[] = properties.rows.map((p) => {
      const id = String(p.id);
      const o = opinionOf.get(id);
      const scores = scoresOf.get(id) ?? {};
      const rows: RatingRow[] = Object.entries(scores).map(([dimension, score]) => ({
        user_id: personId,
        dimension,
        score: score as number,
      }));
      return {
        propertyId: id,
        title: String(p.title),
        price_eur: n(p.price_eur),
        area_m2: n(p.area_m2),
        rooms: n(p.rooms),
        stage: String(p.stage),
        neighborhood: s(p.neighborhood),
        cover_id: s(p.cover_id),
        filled: Number(p.filled ?? 0),
        opinion: o
          ? {
              stance: s(o.stance) as Stance | null,
              reasoning: String(o.reasoning ?? ""),
              blocker: Number(o.blocker ?? 0),
              basis: s(o.basis) as Basis | null,
              updated_at: String(o.updated_at),
            }
          : null,
        scores,
        comments: commentsOf.get(id) ?? [],
        avg: familyAverage(rows),
      };
    });
    // Newest first, as the list page orders them. The page itself splits what they said from
    // what they did not: twenty empty rows must not outweigh the one that carries an opinion.
    return entries;
  });
}
