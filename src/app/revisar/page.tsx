import Link from "next/link";
import { PropertyCard, type Listed } from "@/components/propiedades/card";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listSql, parseFilters } from "@/lib/filters";
import { unreviewed } from "@/lib/notifications";
import { getBudget } from "@/lib/settings";

export const dynamic = "force-dynamic";

// The same columns the list page reads, so one card component serves both.
const COLUMNS = `p.title, p.area_m2, p.rooms, p.stage, p.neighborhood, p.filled,
  p.lat, p.lng, p.address_precision AS precision`;

/**
 * The homes this person has not looked at yet. Opening one takes it off the list — there is no
 * button to press and none to forget, and the list empties itself as they work through it.
 *
 * Homes they added themselves are never here. They have seen them: they are the ones who saved
 * the link.
 */
export default async function RevisarPage() {
  const user = await currentUser();
  const { sql, args } = listSql(parseFilters({}), COLUMNS);
  const [list, budget, waiting] = await Promise.all([
    db.execute({ sql, args }),
    getBudget(),
    unreviewed(user.id),
  ]);
  // ponytail: filtered here rather than joined into `listSql`, which builds the shared list query
  // for three pages. A family's list is tens of rows, not thousands.
  const items = (list.rows as unknown as Listed[]).filter((p) => waiting.has(p.id));

  return (
    <section className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-14">
      <h1 className="text-[22px] font-medium">Por revisar</h1>
      <p className="mt-1 text-body">
        {items.length === 0
          ? "Estás al día. Aquí aparecen los pisos que ha añadido otra persona y todavía no has abierto."
          : `${items.length} piso${items.length === 1 ? "" : "s"} que todavía no has abierto. Se quita de la lista en cuanto lo abres.`}
      </p>

      {items.length === 0 ? (
        <Link
          href="/propiedades"
          className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4"
        >
          Ver todos los pisos
        </Link>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id}>
              <PropertyCard p={p} budget={budget} href={`/propiedades/${p.id}`} userId={user.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
