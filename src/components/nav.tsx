import Link from "next/link";
import AccountMenu from "./account-menu";
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
 *
 * The right-hand end is three controls, not five: the bell, the theme, and you. The greeting went
 * into the account menu, where the name sits over the address it belongs to.
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
          <NotificationsMenu
            unseen={bell.unseen}
            digest={bell.digest}
            days={DIGEST_DAYS}
            items={bell.items}
            activity={<ActivityFeed userId={user.id} since={user.last_seen_at} limit={12} />}
          />
          <ThemeToggle />
          {/* You: your settings, your projects, and the way out. The `?` that used to sit beside
              this is gone, and its page is the first section of «Ajustes» (#148). */}
          <AccountMenu name={user.name} email={user.email} />
        </div>
      </div>
    </header>
  );
}
