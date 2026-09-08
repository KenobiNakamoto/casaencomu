/**
 * Theme choice. Two states: day and night. There is no `sistema` state — the toggle is a switch,
 * not a cycle (Kenobi, 2026-09-08). The operating system is still read once, on a first visit,
 * to decide which of the two to open in; after that the stored choice wins and the app stops
 * following it.
 *
 * The value lives in `localStorage` under `tema`. Anything unrecognised, including the absent
 * case, means "nothing chosen yet" — which is what an older `sistema` install also leaves behind,
 * so those upgrade to the system default with no migration.
 */
export type Theme = "light" | "dark";

export const KEY = "tema";

/** The stored choice, or `null` when there is none. Never throws: a private window can make even
 *  reading `localStorage` an exception. */
export function readTheme(store?: Pick<Storage, "getItem">): Theme | null {
  try {
    const v = (store ?? localStorage).getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function writeTheme(t: Theme, store?: Pick<Storage, "setItem">) {
  try {
    (store ?? localStorage).setItem(KEY, t);
  } catch {
    // private browsing: the choice just does not survive the tab
  }
}

/** What `data-theme` should say: the choice if there is one, the system only until there is. */
export const resolve = (stored: Theme | null, systemPrefersDark: boolean): Theme =>
  stored ?? (systemPrefersDark ? "dark" : "light");
