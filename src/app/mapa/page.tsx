import { currentUser } from "@/lib/auth";
import Link from "next/link";
import Mapa, { type MapMarker } from "@/components/mapa/Mapa";
import { findArea } from "@/lib/areas";
import { db } from "@/lib/db";
import { listHref, listSql, parseFilters, qualifies, toQuery, withArea, type SearchParams } from "@/lib/filters";

// `id`, `created_at` and `price_eur` come from the contract; see ALWAYS in lib/filters.ts.
const COLUMNS = `p.lat, p.lng, p.address_precision AS precision, p.title,
  p.rooms, p.area_m2, p.neighborhood, p.stage`;

/**
 * Full-screen map. It reads the same filters as the list, through the same module, so a link from
 * one to the other shows the same homes. It used to honour only `?etapa=` and `?zona=` (F13).
 */
export default async function MapaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const parsed = parseFilters(sp);
  const area = await findArea(parsed.zona);
  const v = withArea(parsed, area);
  const { sql, args } = listSql(v, COLUMNS, (await currentUser()).id);

  type Row = Omit<MapMarker, "precision" | "cover" | "lat" | "lng"> & {
    lat: number | null;
    lng: number | null;
    precision: "exact" | "approx" | "none";
    haystack: string;
    floor: string | null;
    cover_id: string | null;
  };
  const { rows } = await db.execute({ sql, args });
  const markers: MapMarker[] = (rows as unknown as Row[])
    .filter((p) => qualifies(v, area, p))
    .filter((p) => p.lat !== null && p.lng !== null && p.precision !== "none")
    // Built field by field, not spread: the row also carries the search haystack, which is every
    // description in the database and has no business crossing to the browser.
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
      stage: p.stage,
      cover: p.cover_id ? `/api/photos/${p.cover_id}` : null,
    }));

  return (
    <div className="-mb-[var(--nav-bottom-h)]">
      <Mapa markers={markers} zona={v.zona} params={Object.fromEntries(new URLSearchParams(toQuery(v)))} />
      <Link
        href={listHref(v)}
        className="fixed bottom-[calc(var(--nav-bottom-h)+16px)] left-1/2 z-[1001] flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-canvas shadow-tier transition hover:opacity-90"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Lista
      </Link>
    </div>
  );
}
