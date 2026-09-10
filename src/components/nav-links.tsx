"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompareCount } from "./comparar/controls";

/** `count` carries the user id: the comparison count lives in the browser, not the database. */
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; count?: string };

const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  compare: "M4 5h6v14H4zM14 5h6v14h-6z",
  review: "M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9",
};

/** Client only for the active highlight; the items (and the badge count) come from the server. */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-hairline bg-raised pb-[env(safe-area-inset-bottom)] lg:static lg:inset-auto lg:mx-auto lg:h-full lg:border-0 lg:pb-0"
    >
      {items.map(({ href, label, icon, badge, count }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] font-medium transition lg:h-full lg:min-h-0 lg:flex-none lg:flex-row lg:gap-0 lg:border-b-2 lg:px-4 lg:text-base ${
              active
                ? "text-accent lg:border-ink lg:font-semibold lg:text-ink"
                : "text-muted lg:border-transparent lg:hover:text-ink"
            }`}
          >
            <span className="relative lg:hidden">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={ICONS[icon]} />
              </svg>
              {badge ? (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 text-[10px] font-semibold leading-none text-on-action">
                  {badge}
                </span>
              ) : null}
            </span>
            <span>
              {label}
              {count ? <CompareCount userId={count} /> : null}
            </span>
            {badge ? (
              <span className="ml-1.5 hidden rounded-full bg-action px-1.5 py-0.5 text-xs font-semibold leading-none text-on-action lg:inline">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
