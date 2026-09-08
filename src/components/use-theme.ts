"use client";

import { useSyncExternalStore } from "react";
import { KEY, readTheme, writeTheme, type Theme } from "@/lib/theme";

/**
 * The theme now on screen, read from `data-theme` on <html> — the attribute the inline no-flash
 * script in `layout.tsx` writes before the first paint. `useSyncExternalStore` is what keeps this
 * legal: the server snapshot is "light", the client snapshot is whatever the script decided, and
 * React reconciles once on hydration instead of a setState-in-effect flash.
 *
 * A change in another tab arrives as a `storage` event; applying it here moves the attribute,
 * which the observer then reports like any other change. One path, two sources.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      const o = new MutationObserver(onChange);
      o.observe(document.documentElement, { attributeFilter: ["data-theme"] });
      const onStorage = (e: StorageEvent) => {
        if (e.key !== KEY && e.key !== null) return;
        const stored = readTheme();
        if (stored) document.documentElement.dataset.theme = stored;
      };
      addEventListener("storage", onStorage);
      return () => {
        o.disconnect();
        removeEventListener("storage", onStorage);
      };
    },
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light" as const,
  );
}

/** Store the choice and paint it. The only way the toggle changes the theme. */
export function setTheme(t: Theme) {
  writeTheme(t);
  document.documentElement.dataset.theme = t;
}
