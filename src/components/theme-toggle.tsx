"use client";

import { useEffect, useRef } from "react";
import type { Preference } from "@/lib/theme";
import { applyPreference, DARK, setPreference, usePreference, useTheme } from "./use-theme";

const NEXT: Record<Preference, Preference> = { sistema: "light", light: "dark", dark: "sistema" };
const LABEL: Record<Preference, string> = {
  sistema: "Tema: el del sistema",
  light: "Tema: día",
  dark: "Tema: noche",
};

/**
 * Day/night/system switch. The interaction is beui.dev's `theme-toggle` — the new theme is
 * revealed with a circular wipe out of the button through the View Transition API — rebuilt here
 * without its five dependencies (`next-themes`, `motion`, `lucide-react`, `clsx`,
 * `tailwind-merge`): the theme is one `data-theme` attribute, the icon swap is CSS, and the icons
 * are inline SVG.
 *
 * The first paint is decided by the inline script in `layout.tsx`; the hooks only read what is
 * already on <html>, so the server render and the stored choice never disagree on screen.
 */
export default function ThemeToggle() {
  const theme = useTheme();
  const preference = usePreference();
  // While a wipe runs, a second click must not start another one. The latest request is kept and
  // applied when the running transition settles, so no click is silently dropped (doc 03 § 5).
  const busy = useRef(false);
  const queued = useRef<Preference | null>(null);

  // `sistema` means "keep following", so the system switching at dusk has to move the page too.
  // An explicit choice ignores it. Another tab's change arrives through `usePreference`.
  useEffect(() => {
    applyPreference(preference);
    if (preference !== "sistema") return;
    const mq = matchMedia(DARK);
    const onChange = () => applyPreference("sistema");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = NEXT[preference];
    if (busy.current) {
      queued.current = next;
      return;
    }

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A visible map cannot be snapshot by the browser, so the wipe would flash a blank rectangle.
    // Skipping it there is the specified behaviour, not a cosmetic failure (doc 03 § 5).
    const mapOnScreen = !!document.querySelector(".maplibregl-map");
    if (reduce || mapOnScreen || !("startViewTransition" in document)) return setPreference(next);

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
    const vt = document.startViewTransition(() => setPreference(next));
    vt.finished
      .catch(() => {})
      .finally(() => {
        delete root.dataset.wipe;
        busy.current = false;
        const q = queued.current;
        queued.current = null;
        if (q) setPreference(q);
      });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={LABEL[preference]}
      title={LABEL[preference]}
      className="touch-target grid h-11 w-11 shrink-0 place-items-center rounded-full border border-control-border text-ink transition hover:border-ink hover:shadow-tier"
    >
      {/* all three icons are mounted; CSS shows the one the state calls for */}
      <span className="theme-icon grid h-[18px] w-[18px] place-items-center" data-preference={preference} data-theme-now={theme}>
        <svg data-icon="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.4v2.2M12 19.4v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.4 12h2.2M19.4 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
        <svg data-icon="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.8 6.8 0 0 0 11 11Z" />
        </svg>
        <svg data-icon="system" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4.5" width="18" height="12" rx="1.6" />
          <path d="M8.5 20h7" />
        </svg>
      </span>
    </button>
  );
}
