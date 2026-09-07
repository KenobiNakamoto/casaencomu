"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  compare: "M4 5h6v14H4zM14 5h6v14h-6z",
  bell: "M6 8a6 6 0 0112 0v5l2 3H4l2-3zM10 20a2 2 0 004 0",
};

/** Client only for the active highlight; the items (and the badge count) come from the server. */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-hairline bg-white pb-[env(safe-area-inset-bottom)] md:static md:inset-auto md:mx-auto md:h-full md:border-0 md:pb-0"
    >
      {items.map(({ href, label, icon, badge }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] font-medium transition md:h-full md:min-h-0 md:flex-none md:flex-row md:gap-0 md:border-b-2 md:px-4 md:text-base ${
              active
                ? "text-rausch md:border-ink md:font-semibold md:text-ink"
                : "text-muted md:border-transparent md:hover:text-ink"
            }`}
          >
            <span className="relative md:hidden">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={ICONS[icon]} />
              </svg>
              {badge ? (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rausch px-1 text-[10px] font-semibold leading-none text-white">
                  {badge}
                </span>
              ) : null}
            </span>
            <span>{label}</span>
            {badge ? (
              <span className="ml-1.5 hidden rounded-full bg-rausch px-1.5 py-0.5 text-xs font-semibold leading-none text-white md:inline">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
