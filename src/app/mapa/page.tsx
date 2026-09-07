import Link from "next/link";
import Mapa, { type MapMarker } from "@/components/mapa/Mapa";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Full-screen map. Markers come straight from the server; `?etapa=` or `?todas=1` filter them. */
export default async function MapaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const etapa = typeof sp.etapa === "string" ? sp.etapa : "";
  let where = "p.lat IS NOT NULL AND p.lng IS NOT NULL";
  const args: string[] = [];
  if (etapa) {
    where += " AND p.stage = ?";
    args.push(etapa);
  } else if (sp.todas !== "1") {
    where += " AND p.stage NOT IN ('descartada', 'no_disponible')";
  }
  const { rows } = await db.execute({
    sql: `SELECT p.id, p.lat, p.lng, p.address_precision AS precision, p.price_eur, p.title, p.rooms, p.area_m2,
            p.neighborhood, p.stage,
            (SELECT id FROM photos WHERE property_id = p.id ORDER BY position LIMIT 1) AS cover
          FROM properties p WHERE ${where}`,
    args,
  });
  const markers = rows.map((r) => ({ ...r, cover: r.cover ? `/api/photos/${r.cover}` : null })) as unknown as MapMarker[];

  return (
    <div className="-mb-20 md:mb-0">
      <Mapa markers={markers} />
      <Link
        href="/propiedades"
        className="fixed bottom-20 left-1/2 z-[1001] flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white shadow-tier transition hover:bg-black md:bottom-8"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Lista
      </Link>
    </div>
  );
}
