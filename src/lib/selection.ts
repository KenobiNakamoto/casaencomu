/**
 * Which homes a person has picked to compare. Pure functions only: the storage wrapper and the
 * React binding live in `components/comparar/`, so this file stays testable and importable from
 * anywhere.
 *
 * Finding F15: `/comparar` accepted two to four identifiers and nothing in the application ever
 * selected them, so the empty page asked a family member to compose a URL by hand.
 */

/** Two is the fewest that is a comparison; four is the most that fits a phone's pair switcher. */
export const MIN = 2;
export const MAX = 4;

/**
 * Session storage, per person and per tab (document 02 § 6). The key carries the user id, which
 * is a generated identifier — never the email, never the capture token.
 */
export const storageKey = (userId: string) => `casa.comparar.${userId}`;

/** Identifiers are UUIDs. Anything else came from a hand-edited URL and is dropped. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `a,b,c` to a clean list: known shape, no repeats, at most four. Order is kept, because a shared
 * link must restore the columns in the order the sender saw them.
 */
export function parseIds(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim().toLowerCase();
    if (ID.test(id)) seen.add(id);
    if (seen.size === MAX) break;
  }
  return [...seen];
}

export const serialiseIds = (ids: string[]) => ids.join(",");

export type ToggleResult = { ids: string[]; full: boolean };

/**
 * Adding a fifth changes nothing and reports `full`, so the caller can say why. Silently dropping
 * the oldest would take away a home the person had chosen, without telling them.
 */
export function toggle(ids: string[], id: string): ToggleResult {
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), full: false };
  if (ids.length >= MAX) return { ids, full: true };
  return { ids: [...ids, id], full: false };
}

/** The tray's own sentence. It states the count, never a bare number. */
export function trayLabel(count: number, outside: number): string {
  const homes = `${count} ${count === 1 ? "propiedad seleccionada" : "propiedades seleccionadas"}`;
  if (outside <= 0) return homes;
  return `${homes} · ${outside} fuera de estos resultados`;
}

/** Why comparing is not available yet, or null when it is. */
export const blockedReason = (count: number) =>
  count === 0 ? "Elige dos propiedades" : count < MIN ? "Elige otra propiedad" : null;

export const FULL_MESSAGE = `Puedes comparar hasta ${MAX} propiedades`;
