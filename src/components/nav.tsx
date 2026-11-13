import Link from "next/link";
import AccountMenu from "./account-menu";
import ActivityFeed from "./activity-feed";
import DraftBoundary from "./draft-boundary";
import Marca from "./marca";
import { feed } from "@/lib/activity";
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
  // The login page and an invitation are rendered by people who are nobody yet. There is no bell,
  // no «Revisar» count and no account for them, so the header is not drawn at all.
  const { headers } = await import("next/headers");
  const accountId = (await headers()).get("x-user-email");
  if (!accountId) return <DraftBoundary accountId={null} />;

  const user = await currentUser();
  const [bell, recent] = await Promise.all([bellFor(user), feed(user.id, undefined, 12)]);

  const items: NavItem[] = [
    { href: "/propiedades", label: "Propiedades", icon: "home" },
    { href: "/mapa", label: "Mapa", icon: "map" },
    { href: "/comparar", label: "Comparar", icon: "compare", count: user.id },
    { href: "/revisar", label: "Revisar", icon: "review", badge: bell.waiting },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-raised">
      <DraftBoundary accountId={accountId} />
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-14">
        <Link href="/propiedades" className="shrink-0">
          <Marca className="text-xl" nameClass="max-[359px]:hidden" />
        </Link>
        <NavLinks items={items} />
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <NotificationsMenu
            unseen={bell.unseen}
            digest={bell.digest}
            days={DIGEST_DAYS}
            items={bell.items}
            activity={<ActivityFeed rows={recent.rows} read={recent.read} userId={user.id} />}
            unread={recent.unread}
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
