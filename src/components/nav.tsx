import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import NavLinks, { type NavItem } from "./nav-links";

/** Header + nav. Bottom bar on phones, top bar on md+. The unread badge counts events since the previous visit. */
export default async function Nav() {
  const user = await currentUser();
  // `last_seen_at` is pre-touch (see auth.ts), i.e. the previous visit. Own events never count.
  // `IS NOT ?` keeps actor-less events (rechecks): a price drop nobody in the family caused is still news.
  const unread = user.last_seen_at
    ? Number(
        (
          await db.execute({
            sql: "SELECT count(*) AS n FROM events WHERE actor_id IS NOT ? AND created_at > ?",
            args: [user.id, user.last_seen_at],
          })
        ).rows[0].n,
      )
    : 0;

  const items: NavItem[] = [
    { href: "/propiedades", label: "Propiedades" },
    { href: "/mapa", label: "Mapa" },
    { href: "/comparar", label: "Comparar" },
    { href: "/actividad", label: "Actividad", badge: unread },
  ];

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/propiedades" className="text-lg font-semibold tracking-tight">
          CasaEnComú
        </Link>
        <NavLinks items={items} />
        <span className="ml-auto truncate text-sm text-zinc-600">Hola {user.name}</span>
        <Link href="/ayuda" className="text-sm text-zinc-500 underline underline-offset-2">
          Ayuda
        </Link>
      </div>
    </header>
  );
}
