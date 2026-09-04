import Link from "next/link";
import { PropertyCard, type Listed } from "@/components/propiedades/card";
import { FilterBar, type FilterValues } from "@/components/propiedades/filter-bar";
import { fmtEur } from "@/components/propiedades/format";
import { RowsTable } from "@/components/propiedades/rows";
import { db } from "@/lib/db";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/listing";
import { getBudget } from "@/lib/settings";
import { setBudgetAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

const ORDER: Record<string, string> = {
  fecha: "created_at DESC",
  precio: "price_eur IS NULL, price_eur ASC",
  puntuacion: "family_avg IS NULL, family_avg DESC",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const posInt = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);

const field = "h-10 w-28 rounded-md border border-zinc-300 px-2 text-sm";
const button = "h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white";
const chipLink = (active: boolean) =>
  `rounded-full border px-3 py-1 text-sm ${active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700"}`;

export default async function PropiedadesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // Filters come only from the URL: no default price range, ever.
  const precio = first(sp.precio).match(/^(\d*)-(\d*)$/);
  const etapa = first(sp.etapa);
  const puntuacion = first(sp.puntuacion);
  const v: FilterValues = {
    precioMin: precio?.[1] ?? "",
    precioMax: precio?.[2] ?? "",
    hab: posInt(first(sp.hab)) === null ? "" : first(sp.hab),
    m2: posInt(first(sp.m2)) === null ? "" : first(sp.m2),
    etapa: STAGES.includes(etapa as Stage) ? etapa : "",
    barrio: first(sp.barrio),
    puntuacion: /^[1-5]$/.test(puntuacion) ? puntuacion : "",
    orden: first(sp.orden) in ORDER ? first(sp.orden) : "fecha",
    vista: first(sp.vista) === "filas" ? "filas" : "galeria",
  };

  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (cond: string, val: string | number | null) => {
    if (val !== null && val !== "") {
      where.push(cond);
      args.push(val);
    }
  };
  add("p.price_eur >= ?", posInt(v.precioMin));
  add("p.price_eur <= ?", posInt(v.precioMax));
  add("p.rooms >= ?", posInt(v.hab));
  add("p.area_m2 >= ?", posInt(v.m2));
  add("p.stage = ?", v.etapa);
  add("p.neighborhood = ?", v.barrio);
  if (v.puntuacion) args.push(Number(v.puntuacion));

  const sql = `SELECT * FROM (
      SELECT p.id, p.title, p.price_eur, p.area_m2, p.rooms, p.stage, p.neighborhood, p.created_at,
        (SELECT id FROM photos WHERE property_id = p.id ORDER BY position LIMIT 1) AS cover_id,
        (SELECT ROUND(AVG(score), 1) FROM ratings WHERE property_id = p.id) AS family_avg
      FROM properties p ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ) ${v.puntuacion ? "WHERE family_avg >= ?" : ""} ORDER BY ${ORDER[v.orden]}`;

  const [list, counts, barrios] = await db.batch(
    [
      { sql, args },
      "SELECT stage, COUNT(*) AS n FROM properties GROUP BY stage",
      "SELECT DISTINCT neighborhood FROM properties WHERE neighborhood IS NOT NULL ORDER BY neighborhood",
    ],
    "read",
  );
  const budget = await getBudget();

  const items = list.rows as unknown as Listed[];
  const countByStage = Object.fromEntries(counts.rows.map((r) => [String(r.stage), Number(r.n)]));
  const total = Object.values(countByStage).reduce((a, b) => a + b, 0);
  const neighborhoods = barrios.rows.map((r) => String(r.neighborhood));

  // Links that keep the live filters and change one key.
  const current: Record<string, string> = {
    precio: precio ? `${v.precioMin}-${v.precioMax}` : "",
    hab: v.hab,
    m2: v.m2,
    etapa: v.etapa,
    barrio: v.barrio,
    puntuacion: v.puntuacion,
    orden: v.orden === "fecha" ? "" : v.orden,
    vista: v.vista === "filas" ? "filas" : "",
  };
  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries({ ...current, ...patch })) if (val) q.set(k, val);
    const s = q.toString();
    return s ? `/propiedades?${s}` : "/propiedades";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Propiedades</h1>

      {first(sp.dup) === "1" && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Ya estaba guardada.</p>
      )}
      {first(sp.error) && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{first(sp.error)}</p>}

      <div className="flex flex-wrap gap-6">
        <form method="post" action="/api/import" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Añadir enlace
            <input
              type="url"
              name="url"
              required
              placeholder="https://www.idealista.com/inmueble/…"
              className="h-10 w-72 rounded-md border border-zinc-300 px-2 text-sm"
            />
          </label>
          <button type="submit" className={button}>
            Añadir
          </button>
        </form>

        <form action={setBudgetAction} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Presupuesto mín.
            <input type="number" name="min" min={0} step={1000} inputMode="numeric" required defaultValue={budget?.min} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Presupuesto máx.
            <input type="number" name="max" min={0} step={1000} inputMode="numeric" required defaultValue={budget?.max} className={field} />
          </label>
          <button type="submit" className={button}>
            Guardar
          </button>
          <span className="h-10 leading-10 text-sm text-zinc-600">
            {budget ? `${fmtEur(budget.min)} – ${fmtEur(budget.max)}` : "Sin presupuesto"}
          </span>
        </form>
      </div>

      <FilterBar values={v} neighborhoods={neighborhoods} stages={STAGES.map((s) => [s, STAGE_LABELS[s]])} />

      <nav className="flex flex-wrap items-center gap-2" aria-label="Etapas">
        <Link href={href({ etapa: "" })} className={chipLink(v.etapa === "")}>
          Todas ({total})
        </Link>
        {STAGES.map((s) => (
          <Link key={s} href={href({ etapa: s })} className={chipLink(v.etapa === s)}>
            {STAGE_LABELS[s]} ({countByStage[s] ?? 0})
          </Link>
        ))}
        <span className="ml-auto flex gap-1 text-sm">
          <Link href={href({ vista: "" })} className={chipLink(v.vista === "galeria")}>
            Galería
          </Link>
          <Link href={href({ vista: "filas" })} className={chipLink(v.vista === "filas")}>
            Filas
          </Link>
        </span>
      </nav>

      {items.length === 0 ? (
        <p className="py-12 text-center text-zinc-600">
          {total === 0 ? "Todavía no hay propiedades. Añade un enlace o usa el marcador." : "Ninguna propiedad coincide con los filtros."}
        </p>
      ) : v.vista === "filas" ? (
        <RowsTable items={items} budget={budget} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <PropertyCard key={p.id} p={p} budget={budget} />
          ))}
        </ul>
      )}
    </div>
  );
}
