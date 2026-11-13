import { canonicalFacts, type Facts } from "./changes";
import type { Origin } from "./enrich";
import type { Presence, Raw } from "./extract";
import type { Listing } from "./listing";

/** Every field this observation carried came off the page. The AI layers overwrite their own. */
export const originOf = (prev: Origin, presence: Presence): Origin => {
  const out: Origin = { ...prev };
  for (const [k, seen] of Object.entries(presence)) if (seen === "present" || seen === "explicit_null") out[k] = "portal";
  return out;
};

/**
 * The stored page never grows without bound: the text is what the layers read, and 32 KB is a long
 * advertisement. `MIN_RAW_TEXT` keeps a challenge page out — a DataDome body is 773 bytes of
 * "please enable JS", and storing it would only spend a model call rediscovering that.
 */
const MAX_RAW_TEXT = 32 * 1024;
const MIN_RAW_TEXT = 400;
export const capped = (raw: Raw | null | undefined): string | null =>
  raw && ((raw.text?.length ?? 0) >= MIN_RAW_TEXT || raw.ogDescription)
    ? JSON.stringify({ ...raw, text: raw.text?.slice(0, MAX_RAW_TEXT) })
    : null;

/**
 * A field the new observation did not carry keeps the value already stored. Only an observed
 * field can change one — an extractor that failed to find the price must not erase last week's
 * price (`docs/product-improvement/05-implementation.md` § 5).
 */
export function merge(prev: Facts | null, listing: Listing, presence: Presence): Facts {
  const next = canonicalFacts(listing);
  if (!prev) return next;
  const out = { ...next } as Record<string, unknown>;
  for (const k of new Set([...Object.keys(prev), ...Object.keys(out)])) {
    if ((presence[k] === "absent" || presence[k] === undefined) && k in prev) out[k] = (prev as Record<string, unknown>)[k];
  }
  return out as Facts;
}

