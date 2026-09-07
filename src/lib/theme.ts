/**
 * Theme preference. Three states, not two: `sistema` follows the operating system and keeps
 * following it, `light` and `dark` are a deliberate choice that ignores it.
 *
 * The value lives in `localStorage` under `tema`. Version 1 stored only `light` or `dark` there,
 * so those are read unchanged; anything else, including the absent case, means `sistema`.
 */
export type Preference = "sistema" | "light" | "dark";
export type Theme = "light" | "dark";

export const KEY = "tema";

/** Never throws: a private window can make even reading `localStorage` an exception. */
export function readPreference(store?: Pick<Storage, "getItem">): Preference {
  try {
    const v = (store ?? localStorage).getItem(KEY);
    return v === "light" || v === "dark" || v === "sistema" ? v : "sistema";
  } catch {
    return "sistema";
  }
}

export function writePreference(p: Preference, store?: Pick<Storage, "setItem" | "removeItem">) {
  try {
    const s = store ?? localStorage;
    // `sistema` is the default, so it is stored as the absence of a choice
    if (p === "sistema") s.removeItem(KEY);
    else s.setItem(KEY, p);
  } catch {
    // private browsing: the choice just does not survive the tab
  }
}

/** What `data-theme` should say, given the preference and what the system currently reports. */
export const resolve = (p: Preference, systemPrefersDark: boolean): Theme =>
  p === "sistema" ? (systemPrefersDark ? "dark" : "light") : p;
