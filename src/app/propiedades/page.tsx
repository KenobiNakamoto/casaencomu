import Link from "next/link";
import Mapa, { type MapMarker } from "@/components/mapa/Mapa";
import { PropertyCard, type Listed } from "@/components/propiedades/card";
import { FilterBar } from "@/components/propiedades/filter-bar";
import { ActiveFilters, QuickFilters } from "@/components/propiedades/filters-row";
import { fmtEur, input } from "@/components/propiedades/format";
import { RowsTable } from "@/components/propiedades/rows";
import { SearchBar } from "@/components/propiedades/search-bar";
import { CompareTray } from "@/components/comparar/controls";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/listing";
import { findArea } from "@/lib/areas";
import {
  ARCHIVED_COUNT_SQL,
  CLEARABLE,
  countFilters,
  detailHref,
  listHref,
  listSql,
  mapHref,
  parseFilters,
  qualifies,
  toQuery,
  withArea,
  type SearchParams,
} from "@/lib/filters";
import { getBudget } from "@/lib/settings";
import { setBudgetAction } from "./actions";

// `id`, `created_at` and `price_eur` come from the contract; see ALWAYS in lib/filters.ts.
const COLUMNS = `p.title, p.area_m2, p.rooms, p.stage, p.neighborhood,
  p.lat, p.lng, p.address_precision AS precision`;

export default async function PropiedadesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // Filters come only from the URL: no default price range, ever. `src/lib/filters.ts` owns what
  // they mean, so this page and /mapa cannot drift apart again.
  const parsed = parseFilters(sp);
  const area = await findArea(parsed.zona);
  const v = withArea(parsed, area);
  const { sql, args } = listSql(v, COLUMNS);

  const [list, counts, barrios, archived] = await db.batch(
    [
      { sql, args },
      "SELECT COUNT(*) AS n FROM properties",
      "SELECT DISTINCT neighborhood FROM properties WHERE neighborhood IS NOT NULL ORDER BY neighborhood",
      ARCHIVED_COUNT_SQL,
    ],
    "read",
  );
  const [budget, user] = await Promise.all([getBudget(), currentUser()]);

  const rows = list.rows as unknown as (Listed & { haystack: string })[];
  const items = rows.filter((p) => qualifies(v, area, p));
  const total = Number(counts.rows[0].n);
  const archivedCount = Number(archived.rows[0].n);
  const neighborhoods = barrios.rows.map((r) => String(r.neighborhood));

  const mappable = items.filter((p) => p.lat !== null && p.lng !== null && p.precision !== "none");
  const markers: MapMarker[] = mappable.map((p) => ({
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
  // Homes the portal never gave coordinates for are in this list and can never be on the map.
  // Saying how many stops the two counts looking like a bug (F13).
  const unmapped = items.length - mappable.length;
  const activeFilters = countFilters(v);
  const href = (patch: Record<string, string> = {}) => listHref(v, patch);

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
      {typeof sp.error === "string" && sp.error && (
        <p className="mt-4 rounded-lg bg-accent-tint px-4 py-3 text-sm text-error">{sp.error}</p>
      )}

      {/* Toolbar: the pill searches, the + opens the add-a-link field, filters sit behind one pill. */}
      <div className="flex flex-wrap items-center gap-3 py-4 md:py-6">
        <SearchBar
          q={v.q}
          hidden={Object.fromEntries(new URLSearchParams(toQuery(v, { q: "" })))}
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
              <p className="text-sm font-semibold text-ink">Presupuesto familiar</p>
              <p className="mb-3 text-xs text-muted">Deja un campo vacío para no poner ese límite. Vacíos los dos, se quita el presupuesto.</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
                  Mínimo
                  <input type="number" name="min" min={0} step={1000} inputMode="numeric" defaultValue={budget?.min ?? ""} placeholder="Sin mínimo" className={`${input} w-36`} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
                  Máximo
                  <input type="number" name="max" min={0} step={1000} inputMode="numeric" defaultValue={budget?.max ?? ""} placeholder="Sin máximo" className={`${input} w-36`} />
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
      <ActiveFilters v={v} href={href} zonaLabel={area?.properties.name} clearAllHref={href(CLEARABLE)} />

      {/* Result line + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{items.length}</span> {items.length === 1 ? "propiedad" : "propiedades"}
          {unmapped > 0 && ` · ${unmapped} sin ubicación`}
          {budgetLine(budget)}
          {archivedCount > 0 && (
            <>
              {" · "}
              <Link href={href({ archivadas: v.archivadas ? "" : "1" })} className="font-medium text-ink underline underline-offset-4">
                {v.archivadas ? "Ocultar archivadas" : `Ver ${archivedCount} archivadas`}
              </Link>
            </>
          )}
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
      {/* `data-results` scopes the map's hover and focus sync to the cards, not the whole document. */}
      <div
        data-results
        className="pb-10 split:grid split:grid-cols-[minmax(0,1fr)_minmax(380px,42%)] split:gap-8"
      >
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
            <RowsTable items={items} budget={budget} href={(p) => detailHref(p, v)} userId={user.id} />
          ) : (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 split:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
              {items.map((p) => (
                <PropertyCard key={p.id} p={p} budget={budget} href={detailHref(p.id, v)} userId={user.id} />
              ))}
            </ul>
          )}
        </section>
        <aside className="hidden split:block">
          <div className="sticky top-[calc(var(--header-h)+24px)] h-[calc(100dvh-var(--header-h)-48px)] overflow-hidden rounded-card border border-hairline">
            <Mapa markers={markers} embedded zona={v.zona} params={Object.fromEntries(new URLSearchParams(toQuery(v)))} />
          </div>
        </aside>
      </div>

      <CompareTray userId={user.id} visible={items.map((p) => p.id)} />

      <Link
        href={mapHref(v)}
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

/** Says which bounds actually exist, rather than implying a range that was never set (F30). */
function budgetLine(budget: { min: number | null; max: number | null } | null) {
  if (!budget) return " · Sin presupuesto";
  if (budget.min !== null && budget.max !== null) return ` · Presupuesto ${fmtEur(budget.min)} – ${fmtEur(budget.max)}`;
  return budget.max !== null ? ` · Hasta ${fmtEur(budget.max)}` : ` · Desde ${fmtEur(budget.min)}`;
}
