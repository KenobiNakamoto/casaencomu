import Link from "next/link";
import { CompareTable, type Prop } from "@/components/comparar/table";
import { NOT_REMOVED_SQL } from "@/lib/availability";
import { db } from "@/lib/db";
import { COVER_SQL } from "@/lib/filters";
import { FAMILY_AVG_SQL } from "@/lib/ratings";
import { MAX, MIN, parseIds } from "@/lib/selection";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-[22px] font-medium">Comparar</h1>
      <div className="mt-6 rounded-card border border-hairline px-6 py-16 text-center">{children}</div>
    </div>
  );
}

/** The URL is authoritative when it carries identifiers; the tray is how they get there. */
export default async function CompararPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const wanted = parseIds(typeof sp.ids === "string" ? sp.ids : "");

  if (wanted.length < MIN) {
    return (
      <Empty>
        <p className="text-lg font-medium">Elige entre {MIN} y {MAX} propiedades</p>
        <p className="mt-1 text-sm text-muted">
          Marca <strong>Comparar</strong> en dos propiedades de la lista o del mapa. Aparece una barra
          abajo con lo que llevas elegido.
        </p>
        <Link href="/propiedades" className="mt-5 inline-flex h-12 items-center rounded-full btn-primary px-5 text-sm font-semibold">
          Ir a Propiedades
        </Link>
      </Empty>
    );
  }

  const { rows } = await db.execute({
    sql: `SELECT p.*, ${COVER_SQL} AS cover,
            ${FAMILY_AVG_SQL} AS rating,
            NOT ${NOT_REMOVED_SQL} AS gone
          FROM properties p WHERE p.id IN (${wanted.map(() => "?").join(",")})`,
    args: wanted,
  });
  // The sender's order is the reader's order, so a shared link shows the same columns in the
  // same places.
  const found = (rows as unknown as (Omit<Prop, "gone"> & { gone: number })[])
    .map((p) => ({ ...p, gone: p.gone !== 0 }))
    .sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id));
  const missing = wanted.length - found.length;

  if (found.length < MIN) {
    return (
      <Empty>
        <p className="text-lg font-medium">No encontramos estas propiedades</p>
        <p className="mt-1 text-sm text-muted">
          {missing === wanted.length
            ? "Puede que se hayan borrado, o que el enlace esté incompleto."
            : "Solo queda una, y hacen falta dos para comparar."}
        </p>
        <Link href="/propiedades" className="mt-5 inline-flex h-12 items-center rounded-full btn-primary px-5 text-sm font-semibold">
          Ir a Propiedades
        </Link>
      </Empty>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 pb-32 sm:px-6 lg:px-10">
      <h1 className="text-[22px] font-medium">
        Comparar {found.length} {found.length === 1 ? "propiedad" : "propiedades"}
      </h1>
      <p className="mt-1 text-sm text-muted">Las filas en las que difieren van resaltadas.</p>
      {/* Never a heading that claims four over three columns: say what is missing instead. */}
      {missing > 0 && (
        <p className="mt-4 rounded-lg bg-accent-tint px-4 py-3 text-sm text-error" role="status">
          {missing === 1 ? "Una de las propiedades del enlace ya no existe." : `${missing} propiedades del enlace ya no existen.`}{" "}
          Comparamos las {found.length} que quedan.
        </p>
      )}
      <CompareTable props={found} />
    </div>
  );
}
