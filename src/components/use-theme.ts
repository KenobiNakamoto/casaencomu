"use client";

import { useSyncExternalStore } from "react";

/**
 * The active theme, read from `data-theme` on <html> — the attribute the inline no-flash script
 * in `layout.tsx` sets before the first paint. `useSyncExternalStore` is what keeps this legal:
 * the server snapshot is "light", the client snapshot is whatever the script decided, and React
 * reconciles once on hydration instead of a setState-in-effect flash.
 */
export function useTheme(): "light" | "dark" {
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
