import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import NavLinks, { type NavItem } from "./nav-links";

/** Header + nav. Bottom bar on phones, 80 px top bar with centred tabs on md+. The unread badge counts events since the member last opened Actividad. */
export default async function Nav() {
  const user = await currentUser();
  // `last_seen_at` is written only by /actividad, so this counts events since the member last
  // opened it; a member who never has sees everything. Own events never count.
  // `IS NOT ?` keeps actor-less events (rechecks): a price drop nobody in the family caused is still news.
  const unread = Number(
    (
      await db.execute({
        sql: "SELECT count(*) AS n FROM events WHERE actor_id IS NOT ? AND created_at > ?",
        args: [user.id, user.last_seen_at ?? "1970-01-01T00:00:00.000Z"],
      })
    ).rows[0].n,
  );

  const items: NavItem[] = [
    { href: "/propiedades", label: "Propiedades", icon: "home" },
    { href: "/mapa", label: "Mapa", icon: "map" },
    { href: "/comparar", label: "Comparar", icon: "compare" },
    { href: "/actividad", label: "Actividad", icon: "bell", badge: unread },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-white">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6 md:h-20 lg:px-10">
        <Link href="/propiedades" className="flex shrink-0 items-center gap-2 text-xl font-bold tracking-tight text-rausch">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11l9-8 9 8" />
            <path d="M5 10v10h5v-6h4v6h5V10" />
          </svg>
          CasaEnComú
        </Link>
        <NavLinks items={items} />
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <span className="hidden truncate text-sm text-body sm:inline">Hola {user.name}</span>
          <Link
            href="/ayuda"
            aria-label="Ayuda"
            title="Ayuda"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline text-sm font-semibold text-ink transition hover:shadow-tier"
          >
            ?
          </Link>
        </div>
      </div>
    </header>
  );
}
