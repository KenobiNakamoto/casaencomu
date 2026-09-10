import Link from "next/link";
import ActivityFeed from "./activity-feed";
import { currentUser } from "@/lib/auth";
import { bellFor, DIGEST_DAYS } from "@/lib/notifications";
import NavLinks, { type NavItem } from "./nav-links";
import NotificationsMenu from "./notifications-menu";
import ThemeToggle from "./theme-toggle";

/**
 * Header + nav. Bottom bar on phones, 80 px top bar with centred tabs on md+.
 *
 * The fourth tab is «Revisar» — the homes this person has not opened yet — and its badge is that
 * count. What used to be there, «Actividad», is now a tab inside the bell menu, because activity
 * is something you glance at and reviewing is something you sit down to do.
 */
export default async function Nav() {
  const user = await currentUser();
  const bell = await bellFor(user);

  const items: NavItem[] = [
    { href: "/propiedades", label: "Propiedades", icon: "home" },
    { href: "/mapa", label: "Mapa", icon: "map" },
    { href: "/comparar", label: "Comparar", icon: "compare", count: user.id },
    { href: "/revisar", label: "Revisar", icon: "review", badge: bell.waiting },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-raised">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-14">
        <Link href="/propiedades" className="flex shrink-0 items-center gap-2 text-xl font-bold tracking-tight text-accent">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11l9-8 9 8" />
            <path d="M5 10v10h5v-6h4v6h5V10" />
          </svg>
          CasaEnComú
        </Link>
        <NavLinks items={items} />
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          {/* the greeting is the first thing to go: it is the least useful of the six items in this row */}
          <span className="hidden max-w-[14ch] truncate text-sm text-body lg:inline">Hola {user.name}</span>
          <NotificationsMenu
            unseen={bell.unseen}
            digest={bell.digest}
            days={DIGEST_DAYS}
            items={bell.items}
            activity={<ActivityFeed userId={user.id} since={user.last_seen_at} limit={12} />}
          />
          <ThemeToggle />
          {/* The way to the people in this project, and to your other projects. */}
          <Link
            href="/proyectos"
            aria-label="Proyectos y personas"
            title="Proyectos y personas"
            className="touch-target flex h-11 w-11 items-center justify-center rounded-full border border-control-border text-ink transition hover:shadow-tier"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M16 19v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 9a3 3 0 100-6 3 3 0 000 6M22 19v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </Link>
          <Link
            href="/ayuda"
            aria-label="Ayuda"
            title="Ayuda"
            className="touch-target flex h-11 w-11 items-center justify-center rounded-full border border-control-border text-sm font-semibold text-ink transition hover:shadow-tier"
          >
            ?
          </Link>
        </div>
      </div>
    </header>
  );
}
