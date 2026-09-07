"use client";

import { useTheme } from "./use-theme";

/**
 * Day/night switch. The interaction is beui.dev's `theme-toggle` — the new theme is revealed
 * with a circular wipe out of the button through the View Transition API — rebuilt here without
 * its five dependencies (`next-themes`, `motion`, `lucide-react`, `clsx`, `tailwind-merge`):
 * the theme is one `data-theme` attribute, the icon swap is CSS, and the icons are inline SVG.
 *
 * The first paint is decided by the inline script in `layout.tsx`; `useTheme` only reads what is
 * already on <html>, so the server render and the stored choice never disagree on screen.
 */
export default function ThemeToggle() {
  const theme = useTheme();

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;

    const apply = () => {
      root.dataset.theme = next;
      try {
        localStorage.setItem("tema", next);
      } catch {
        // private browsing: the choice just does not survive the tab
      }
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("startViewTransition" in document)) return apply();

    // wipe out of the button itself, so the change reads as coming from the control you pressed
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    root.style.setProperty("--wipe-x", `${x}px`);
    root.style.setProperty("--wipe-y", `${y}px`);
    root.style.setProperty(
      "--wipe-r",
      `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`,
    );
    root.dataset.wipe = "";
    // `finished` rejects when the browser skips the transition (a second click mid-wipe, a
    // backgrounded tab). The theme is already applied by then, so swallow it and just clean up.
    const vt = document.startViewTransition(apply);
    vt.finished.catch(() => {}).finally(() => delete root.dataset.wipe);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Modo día" : "Modo noche"}
      title={theme === "dark" ? "Modo día" : "Modo noche"}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline text-ink transition hover:border-ink hover:shadow-tier"
    >
      {/* both icons are always mounted; CSS shows the one the theme calls for */}
      <span className="theme-icon grid h-[18px] w-[18px] place-items-center">
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
