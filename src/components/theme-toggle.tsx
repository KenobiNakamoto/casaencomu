"use client";

import { useRef } from "react";
import type { Theme } from "@/lib/theme";
import { setTheme, useTheme } from "./use-theme";

const LABEL: Record<Theme, string> = { light: "Cambiar al tema noche", dark: "Cambiar al tema día" };

/**
 * Day/night switch. The interaction is beui.dev's `theme-toggle` — the new theme is revealed with
 * a circular wipe out of the button through the View Transition API — rebuilt here without its
 * five dependencies (`next-themes`, `motion`, `lucide-react`, `clsx`, `tailwind-merge`): the theme
 * is one `data-theme` attribute, the icon swap is CSS, and the icons are inline SVG.
 *
 * The first paint is decided by the inline script in `layout.tsx`; this hook only reads what is
 * already on <html>, so the server render and the stored choice never disagree on screen.
 */
export default function ThemeToggle() {
  const theme = useTheme();
  // While a wipe runs, a second click must not start another one. The latest request is kept and
  // applied when the running transition settles, so no click is silently dropped (doc 03 § 5).
  const busy = useRef(false);
  const queued = useRef<Theme | null>(null);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    if (busy.current) {
      queued.current = next;
      return;
    }

    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("startViewTransition" in document)) {
      return setTheme(next);
    }

    // wipe out of the button itself, so the change reads as coming from the control you pressed
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const root = document.documentElement;
    root.style.setProperty("--wipe-x", `${x}px`);
    root.style.setProperty("--wipe-y", `${y}px`);
    root.style.setProperty("--wipe-r", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    root.dataset.wipe = "";
    busy.current = true;

    // `finished` rejects when the browser skips the transition (a backgrounded tab). The theme is
    // already applied by then, so swallow it. `finally` always clears the flag: a rejected
    // transition must never leave the button dead.
    const vt = document.startViewTransition(() => setTheme(next));
    vt.finished
      .catch(() => {})
      .finally(() => {
        delete root.dataset.wipe;
        busy.current = false;
        const q = queued.current;
        queued.current = null;
        if (q) setTheme(q);
      });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      className="touch-target grid h-11 w-11 shrink-0 place-items-center rounded-full border border-control-border text-ink transition hover:border-ink hover:shadow-tier"
    >
      {/* both icons are mounted; CSS shows the one the current theme calls for */}
      <span className="theme-icon grid h-[18px] w-[18px] place-items-center" data-theme-now={theme}>
        <svg data-icon="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.4v2.2M12 19.4v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.4 12h2.2M19.4 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
        <svg data-icon="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.8 6.8 0 0 0 11 11Z" />
        </svg>
      </span>
    </button>
  );
}
