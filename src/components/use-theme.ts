"use client";

import { useSyncExternalStore } from "react";
import { KEY, readPreference, resolve, writePreference, type Preference, type Theme } from "@/lib/theme";

const DARK = "(prefers-color-scheme: dark)";

/**
 * `storage` reaches every tab except the one that wrote the value, which is the tab the person is
 * looking at. Without a same-tab signal the toggle writes the preference and then re-reads its own
 * stale copy, so the second press computes the same next state and the control appears dead.
 */
const LOCAL = "casa:tema";

/**
 * The theme now on screen, read from `data-theme` on <html> — the attribute the inline no-flash
 * script in `layout.tsx` writes before the first paint. `useSyncExternalStore` is what keeps this
 * legal: the server snapshot is "light", the client snapshot is whatever the script decided, and
 * React reconciles once on hydration instead of a setState-in-effect flash.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      const o = new MutationObserver(onChange);
      o.observe(document.documentElement, { attributeFilter: ["data-theme"] });
      return () => o.disconnect();
    },
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light" as const,
  );
}

/**
 * The stored preference, which is not the same thing: `sistema` can be showing either theme.
 * Changes made in another tab arrive through the `storage` event, so two open tabs agree.
 */
export function usePreference(): Preference {
  return useSyncExternalStore(
    (onChange) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY || e.key === null) onChange();
      };
      addEventListener("storage", onStorage); // another tab
      addEventListener(LOCAL, onChange); // this tab
      return () => {
        removeEventListener("storage", onStorage);
        removeEventListener(LOCAL, onChange);
      };
    },
    () => readPreference(),
    () => "sistema" as const,
  );
}

/**
 * Writes `data-theme` for the given preference. Exported because three callers need it: the
 * toggle, the `storage` listener when another tab changes it, and the system-change listener.
 */
export const applyPreference = (p: Preference) => {
  document.documentElement.dataset.theme = resolve(p, matchMedia(DARK).matches);
};

/** Store the choice, paint it, and tell this tab. The only way the toggle changes the theme. */
export function setPreference(p: Preference) {
  writePreference(p);
  applyPreference(p);
  dispatchEvent(new Event(LOCAL));
}

export { DARK };
