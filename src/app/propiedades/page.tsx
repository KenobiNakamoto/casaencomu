import Link from "next/link";
import Mapa, { type MapMarker } from "@/components/mapa/Mapa";
import { PropertyCard, type Listed } from "@/components/propiedades/card";
import { FilterBar, input, type FilterValues } from "@/components/propiedades/filter-bar";
import { ActiveFilters, QuickFilters } from "@/components/propiedades/filters-row";
import { fmtEur } from "@/components/propiedades/format";
import { RowsTable } from "@/components/propiedades/rows";
import { SearchBar } from "@/components/propiedades/search-bar";
import { db } from "@/lib/db";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/listing";
import { findArea, isIn } from "@/lib/areas";
import { HAYSTACK_SQL, isCondition, matchesCondition, matchesQuery } from "@/lib/search";
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

export default async function PropiedadesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // Filters come only from the URL: no default price range, ever.
  const precio = first(sp.precio).match(/^(\d*)-(\d*)$/);
  const etapa = first(sp.etapa);
  const puntuacion = first(sp.puntuacion);
  const estado = first(sp.estado);
  const area = await findArea(first(sp.zona));
  const v: FilterValues = {
    q: first(sp.q).trim(),
    precioMin: precio?.[1] ?? "",
    precioMax: precio?.[2] ?? "",
    hab: posInt(first(sp.hab)) === null ? "" : first(sp.hab),
    banos: posInt(first(sp.banos)) === null ? "" : first(sp.banos),
    m2: posInt(first(sp.m2)) === null ? "" : first(sp.m2),
    estado: isCondition(estado) ? estado : "",
    etapa: STAGES.includes(etapa as Stage) ? etapa : "",
    barrio: first(sp.barrio),
    zona: area?.properties.id ?? "",
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
  add("p.bathrooms >= ?", posInt(v.banos));
  add("p.area_m2 >= ?", posInt(v.m2));
  add("p.stage = ?", v.etapa);
  add("p.neighborhood = ?", v.barrio);
  if (v.puntuacion) args.push(Number(v.puntuacion));

  const sql = `SELECT * FROM (
      SELECT p.id, p.title, p.price_eur, p.area_m2, p.rooms, p.stage, p.neighborhood, p.created_at,
        p.lat, p.lng, p.address_precision AS precision,
        (SELECT id FROM photos WHERE property_id = p.id ORDER BY position LIMIT 1) AS cover_id,
        (SELECT ROUND(AVG(score), 1) FROM ratings WHERE property_id = p.id) AS family_avg,
        ${HAYSTACK_SQL} AS haystack
      FROM properties p ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ) ${v.puntuacion ? "WHERE family_avg >= ?" : ""} ORDER BY ${ORDER[v.orden]}`;

  const [list, counts, barrios] = await db.batch(
    [
      { sql, args },
      "SELECT COUNT(*) AS n FROM properties",
      "SELECT DISTINCT neighborhood FROM properties WHERE neighborhood IS NOT NULL ORDER BY neighborhood",
    ],
    "read",
  );
  const budget = await getBudget();

  // ponytail: the text filters run here, not in SQL, so "gotic" finds "Gòtic". See src/lib/search.ts.
  const rows = list.rows as unknown as (Listed & { haystack: string })[];
  const items = rows.filter(
    (p) =>
      matchesQuery(p.haystack, v.q) &&
      (!v.estado || matchesCondition(p.haystack, v.estado as Parameters<typeof matchesCondition>[1])) &&
      (!area || isIn(area, p)),
  );
  const total = Number(counts.rows[0].n);
  const neighborhoods = barrios.rows.map((r) => String(r.neighborhood));
  const markers: MapMarker[] = items
    .filter((p) => p.lat !== null && p.lng !== null && p.precision !== "none")
    .map((p) => ({
      id: p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      precision: p.precision as "exact" | "approx",
      price_eur: p.price_eur,
      title: p.title,
      rooms: p.rooms,
      area_m2: p.area_m2,
      neighborhood: p.neighborhood,
      stage: p.stage as Stage,
      cover: p.cover_id ? `/api/photos/${p.cover_id}` : null,
    }));
  const activeFilters = [precio && (v.precioMin || v.precioMax), v.hab, v.banos, v.m2, v.barrio, v.zona, v.puntuacion, v.estado, v.q].filter(
    Boolean,
  ).length;

  // Links that keep the live filters and change one key.
  const current: Record<string, string> = {
    q: v.q,
    precio: precio ? `${v.precioMin}-${v.precioMax}` : "",
    hab: v.hab,
    banos: v.banos,
    m2: v.m2,
    estado: v.estado,
    etapa: v.etapa,
    barrio: v.barrio,
    zona: v.zona,
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
  const mapParams = new URLSearchParams(Object.entries({ etapa: v.etapa, zona: v.zona }).filter(([, val]) => val));
  const mapHref = mapParams.size ? `/mapa?${mapParams}` : "/mapa";

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
      {first(sp.dup) === "1" && (
        <p className="mt-4 rounded-lg bg-ok-tint px-4 py-3 text-sm text-ok">Ya estaba guardada.</p>
      )}
      {first(sp.error) && <p className="mt-4 rounded-lg bg-accent-tint px-4 py-3 text-sm text-error">{first(sp.error)}</p>}

      {/* Toolbar: the pill searches, the + opens the add-a-link field, filters sit behind one pill. */}
      <div className="flex flex-wrap items-center gap-3 py-4 md:py-6">
        <SearchBar
          q={v.q}
          hidden={Object.fromEntries(Object.entries(current).filter(([k, val]) => k !== "q" && val))}
          clearHref={href({ q: "" })}
        />

        <details className="group w-full md:w-auto">
          <summary className="flex h-12 w-fit cursor-pointer items-center gap-2 rounded-full border border-hairline px-4 text-sm font-medium text-ink transition hover:border-ink group-open:border-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
            Filtros
            {activeFilters > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-xs font-semibold text-canvas">{activeFilters}</span>
            )}
          </summary>
          <div className="mt-3 w-full space-y-6 rounded-card border border-hairline bg-raised p-5 shadow-tier md:absolute md:left-4 md:right-4 md:z-10 md:mt-2 md:w-auto lg:left-10 lg:right-10">
            <FilterBar values={v} neighborhoods={neighborhoods} stages={STAGES.map((s) => [s, STAGE_LABELS[s]])} />
            <form action={setBudgetAction} className="border-t border-hairline-soft pt-5">
              <p className="mb-3 text-sm font-semibold text-ink">Presupuesto familiar</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
                  Mínimo
                  <input type="number" name="min" min={0} step={1000} inputMode="numeric" required defaultValue={budget?.min} placeholder="€" className={`${input} w-36`} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
                  Máximo
                  <input type="number" name="max" min={0} step={1000} inputMode="numeric" required defaultValue={budget?.max} placeholder="€" className={`${input} w-36`} />
                </label>
                <button type="submit" className="h-12 rounded-lg border border-ink px-5 text-sm font-medium text-ink transition hover:bg-surface-soft">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </details>
      </div>

      <QuickFilters v={v} href={href} />
      <ActiveFilters v={v} href={href} zonaLabel={area?.properties.name} />

      {/* Result line + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{items.length}</span> {items.length === 1 ? "propiedad" : "propiedades"}
          {budget ? ` · Presupuesto ${fmtEur(budget.min)} – ${fmtEur(budget.max)}` : " · Sin presupuesto"}
        </p>
        <div className="flex rounded-full border border-hairline p-0.5 text-sm">
          <Link href={href({ vista: "" })} className={`rounded-full px-3 py-1 ${v.vista === "galeria" ? "bg-ink font-medium text-canvas" : "text-body"}`}>
            Galería
          </Link>
          <Link href={href({ vista: "filas" })} className={`rounded-full px-3 py-1 ${v.vista === "filas" ? "bg-ink font-medium text-canvas" : "text-body"}`}>
            Filas
          </Link>
        </div>
      </div>

      {/* Desktop: cards left, sticky map right. Phone: list, and a floating pill to the map. */}
      <div className="pb-10 split:grid split:grid-cols-[minmax(0,1fr)_minmax(380px,42%)] split:gap-8">
        <section>
          {items.length === 0 ? (
            <div className="rounded-card border border-hairline px-6 py-16 text-center">
              <p className="text-lg font-medium text-ink">
                {total === 0 ? "Todavía no hay propiedades" : "Ninguna propiedad coincide con los filtros"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {total === 0 ? "Pega un enlace arriba o usa el marcador desde Ayuda." : "Prueba a quitar algún filtro."}
              </p>
            </div>
          ) : v.vista === "filas" ? (
            <RowsTable items={items} budget={budget} />
          ) : (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 split:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
              {items.map((p) => (
                <PropertyCard key={p.id} p={p} budget={budget} />
              ))}
            </ul>
          )}
        </section>
        <aside className="hidden split:block">
          <div className="sticky top-[calc(var(--header-h)+24px)] h-[calc(100dvh-var(--header-h)-48px)] overflow-hidden rounded-card border border-hairline">
            <Mapa
              markers={markers}
              embedded
              zona={v.zona}
              params={Object.fromEntries(Object.entries(current).filter(([, val]) => val))}
            />
          </div>
        </aside>
      </div>

      <Link
        href={mapHref}
        className="fixed bottom-[calc(var(--nav-bottom-h)+16px)] left-1/2 z-10 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-canvas shadow-tier transition hover:opacity-90 split:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
        </svg>
        Mapa
      </Link>
    </div>
  );
}
