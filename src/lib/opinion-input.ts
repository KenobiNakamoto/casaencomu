/**
 * The shape of an opinion, and the rules that do not need a database.
 *
 * It lives apart from `opinions.ts` because the editor is a client component: importing one
 * runtime value out of a module that reaches `node:async_hooks` pulls the whole server into the
 * browser bundle, and Turbopack refuses to build the page at all.
 */
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
