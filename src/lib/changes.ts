import { createHash } from "node:crypto";
import type { Listing } from "./listing";

/** What `sources.facts_json` stores: the listing minus `photos`. */
export type Facts = Omit<Listing, "photos">;

/** Keys sorted (code-unit order) so the JSON is canonical; same form `save.ts` writes. */
export function canonicalFacts(listing: Listing): Facts {
  const entries = Object.entries(listing)
    .filter(([k]) => k !== "photos")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries) as Facts;
}

export function factsHash(facts: Facts): string {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

export type Change =
  | { kind: "price_change"; payload: { from: number | null; to: number | null } }
  | { kind: "facts_change"; payload: { fields: string[] } }
  | { kind: "availability_change"; payload: { to: "removed" } };

// removed markers, as in extract.ts (not exported there): idealista 404, fotocasa ?propertyNotFound, habitaclia ?state=1
const GONE_URL = /[?&](propertyNotFound|state=1)(?:&|$)/;

/** A missing key and `null` are the same fact ("no data"); everything else compares strictly. */
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

/**
 * Pure. `next === null` with a removed signal (404/410, or a gone marker in `finalUrl`) →
 * `availability_change`; `next === null` otherwise (403, challenge, no title) → `[]` — never
 * "gone" on a block. Price differs → exactly one `price_change`; any other fact differs → one
 * `facts_change` naming the fields; identical, or nothing to compare against → `[]`.
 */
export function classifyChanges(
  prev: Facts | null,
  next: Listing | null,
  ctx: { status?: number; finalUrl?: string } = {},
): Change[] {
  if (next === null) {
    const gone = ctx.status === 404 || ctx.status === 410 || GONE_URL.test(ctx.finalUrl ?? "");
    return gone ? [{ kind: "availability_change", payload: { to: "removed" } }] : [];
  }
  if (prev === null) return [];
  const facts = canonicalFacts(next);
  const p = prev as Record<string, unknown>;
  const n = facts as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(p), ...Object.keys(n)])].filter((k) => !same(p[k], n[k])).sort();
  const out: Change[] = [];
  if (fields.includes("price_eur")) {
    out.push({ kind: "price_change", payload: { from: prev.price_eur ?? null, to: facts.price_eur ?? null } });
  }
  const rest = fields.filter((k) => k !== "price_eur");
  if (rest.length) out.push({ kind: "facts_change", payload: { fields: rest } });
  return out;
}
