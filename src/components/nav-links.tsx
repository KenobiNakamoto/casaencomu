"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number };

/** Client only for the active highlight; the items (and the badge count) come from the server. */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:static md:inset-auto md:border-0 md:pb-0"
    >
      {items.map(({ href, label, badge }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 flex-1 items-center justify-center gap-1.5 px-2 text-sm md:min-h-11 md:flex-none md:px-3 ${
              active ? "font-semibold text-zinc-900" : "text-zinc-500"
            }`}
          >
            {label}
            {badge ? (
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
