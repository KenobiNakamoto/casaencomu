import { NOT_REMOVED_SQL } from "@/lib/availability";
import { db } from "@/lib/db";

/** Markers for `/mapa`: properties with coordinates, filtered by `?etapa=` or `?todas=1`. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const etapa = q.get("etapa");
  let where = "p.lat IS NOT NULL AND p.lng IS NOT NULL";
  const args: string[] = [];
  if (etapa) {
    where += " AND p.stage = ?";
    args.push(etapa);
  } else if (q.get("todas") !== "1") {
    where += ` AND p.stage != 'descartada' AND ${NOT_REMOVED_SQL}`;
  }
  const { rows } = await db.execute({
    sql: `SELECT p.id, p.lat, p.lng, p.address_precision AS precision, p.price_eur, p.title,
            p.rooms, p.area_m2, p.stage,
            (SELECT id FROM photos WHERE property_id = p.id AND position = 0) AS cover
          FROM properties p WHERE ${where}`,
    args,
  });
  // ponytail: only the URL is built here; /api/photos itself is #11's
  return Response.json(
    rows.map((r) => ({ ...r, cover: r.cover ? `/api/photos/${r.cover}` : null })),
  );
}
