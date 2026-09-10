/**
 * One contract for "which homes qualify". The list and the map both read the URL through this
 * module, so one query string always means one set of homes.
 *
 * Finding F13: the list, the map page and the markers route each implemented a different subset
 * of the filters, and only the map hid discarded homes. The map therefore showed pins for homes
 * the list had already filtered away, and `NOT_REMOVED_SQL` documented itself as being used by
 * "the list, the map and the markers" while the list never called it (F29).
 */

import { FAMILY_AVG_SQL } from "@/lib/ratings";
import { NOT_REMOVED_SQL } from "./availability";
import { isIn, type AreaFeature } from "./geo";
import { STAGES, type Stage } from "./listing";
import {
  HAYSTACK_SQL,
  isCondition,
  isFloorBand,
  matchesCondition,
  matchesFloor,
  matchesQuery,
  type ConditionKey,
  type FloorBand,
} from "./search";

export type SearchParams = Record<string, string | string[] | undefined>;

export type Filters = {
  q: string;
  precioMin: string;
  precioMax: string;
  hab: string;
  banos: string;
  m2Min: string;
  m2Max: string;
  planta: string;
  estado: string;
  etapa: string;
  barrio: string;
  zona: string;
  puntuacion: string;
  orden: string;
  vista: string;
  /** "1" also shows discarded homes and advertisements confirmed gone. Off by default. */
  archivadas: string;
};

/** Everything the JavaScript pass needs. Both surfaces select these columns. */
export type Qualifiable = {
  haystack: string;
  lat: number | null;
  lng: number | null;
  neighborhood: string | null;
  /** Free text as the portal wrote it, so the storey bands are decided in JS. See `search.ts`. */
  floor: string | null;
};

export const ORDER: Record<string, string> = {
  fecha: "created_at DESC",
  precio: "price_eur IS NULL, price_eur ASC",
  puntuacion: "family_avg IS NULL, family_avg DESC",
};

/**
 * Columns every caller gets whether it asked or not. `ORDER BY` runs on the outer statement, so a
 * caller that had not selected `created_at` used to fail with "no such column" the moment it took
 * the default ordering. The sort must not depend on which columns a screen happens to want.
 */
const ALWAYS = "p.id, p.created_at, p.price_eur, p.floor";

/**
 * The first photo that exists, not `position = 0`. A failed download leaves a gap, and the two
 * spellings disagreed only for those homes, so a cover was blank on some screens and not on
 * others (F39).
 */
export const COVER_SQL = "(SELECT id FROM photos WHERE property_id = p.id ORDER BY position LIMIT 1)";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const posInt = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
const digits = (s: string) => (posInt(s) === null ? "" : s);

/** `min-max`, or a bare number read as the minimum. Anything else is no filter at all. */
function range(s: string): [string, string] {
  const m = s.match(/^(\d*)-(\d*)$/);
  return m ? [m[1], m[2]] : [digits(s), ""];
}

/** URL to values. Anything unrecognised becomes empty, so a hand-typed query cannot filter oddly. */
export function parseFilters(sp: SearchParams): Filters {
  const precio = range(first(sp.precio));
  // A bare `m2=80` is a minimum, which is what every link written before the maximum existed says.
  const m2 = range(first(sp.m2));
  const estado = first(sp.estado);
  const planta = first(sp.planta);
  const etapa = first(sp.etapa);
  const puntuacion = first(sp.puntuacion);
  const orden = first(sp.orden);
  return {
    q: first(sp.q).trim(),
    precioMin: precio[0],
    precioMax: precio[1],
    hab: digits(first(sp.hab)),
    banos: digits(first(sp.banos)),
    m2Min: m2[0],
    m2Max: m2[1],
    planta: isFloorBand(planta) ? planta : "",
    estado: isCondition(estado) ? estado : "",
    etapa: STAGES.includes(etapa as Stage) ? etapa : "",
    barrio: first(sp.barrio),
    zona: first(sp.zona),
    puntuacion: /^[1-5]$/.test(puntuacion) ? puntuacion : "",
    orden: orden in ORDER ? orden : "fecha",
    vista: first(sp.vista) === "filas" ? "filas" : "galeria",
    archivadas: first(sp.archivadas) === "1" ? "1" : "",
  };
}

/** An area identifier is only real once the area file confirms it. Both surfaces must agree. */
export const withArea = (f: Filters, area: AreaFeature | undefined): Filters => ({
  ...f,
  zona: area?.properties.id ?? "",
});

/**
 * The one statement. A caller chooses its own columns; it does not choose the qualifying set.
 * `cover_id`, `family_avg` and `haystack` are always added because the filters need them.
 */
export function listSql(f: Filters, columns: string): { sql: string; args: (string | number)[] } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (cond: string, val: string | number | null) => {
    if (val !== null && val !== "") {
      where.push(cond);
      args.push(val);
    }
  };
  add("p.price_eur >= ?", posInt(f.precioMin));
  add("p.price_eur <= ?", posInt(f.precioMax));
  add("p.rooms >= ?", posInt(f.hab));
  add("p.bathrooms >= ?", posInt(f.banos));
  add("p.area_m2 >= ?", posInt(f.m2Min));
  add("p.area_m2 <= ?", posInt(f.m2Max));
  add("p.stage = ?", f.etapa);
  add("p.neighborhood = ?", f.barrio);
  // The archive policy, and the only place it lives (F29). Naming a stage is asking to see that
  // stage, so an explicit `etapa` filter opts out of it as plainly as `archivadas=1` does.
  if (!f.archivadas && !f.etapa) where.push(`p.stage != 'descartada' AND ${NOT_REMOVED_SQL}`);
  // Rounded here, and only here: `puntuacion` compares against this column, so the number the
  // filter reads has to be the number the card prints. A card saying 4,0 must not be dropped by
  // «4 o más» because the unrounded mean was 3,96.
  if (f.puntuacion) args.push(Number(f.puntuacion));

  const sql = `SELECT * FROM (
      SELECT ${ALWAYS}${columns ? `, ${columns}` : ""},
        ${COVER_SQL} AS cover_id,
        ROUND(${FAMILY_AVG_SQL}, 1) AS family_avg,
        ${HAYSTACK_SQL} AS haystack
      FROM properties p ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ) ${f.puntuacion ? "WHERE family_avg >= ?" : ""} ORDER BY ${ORDER[f.orden]}`;
  return { sql, args };
}

/**
 * The two numbers the sliders draw bars from, over the homes the default view shows. It ignores
 * the price and surface filters on purpose: the bars have to say what is being excluded, which a
 * distribution of the survivors cannot.
 */
export const SPREAD_SQL = `SELECT p.price_eur, p.area_m2 FROM properties p
  WHERE p.stage != 'descartada' AND ${NOT_REMOVED_SQL}`;

/** How many homes the archive policy is hiding right now, so the count can be said out loud. */
export const ARCHIVED_COUNT_SQL = `SELECT COUNT(*) AS n FROM properties p
  WHERE p.stage = 'descartada' OR NOT ${NOT_REMOVED_SQL}`;

/**
 * Everything SQL cannot do: accent-insensitive text, the condition presets, and area geometry.
 * Runs over the rows the statement above returned. See `src/lib/search.ts` for why.
 */
export function qualifies(f: Filters, area: AreaFeature | undefined, row: Qualifiable): boolean {
  return (
    matchesQuery(row.haystack, f.q) &&
    (!f.estado || matchesCondition(row.haystack, f.estado as ConditionKey)) &&
    (!f.planta || matchesFloor(row.floor, f.planta as FloorBand)) &&
    (!area || isIn(area, row))
  );
}

/**
 * The canonical query string: empty and default values are dropped, so one set of filters has
 * exactly one URL. That is what makes a shared link, a return link and a saved link the same URL.
 */
export function toQuery(f: Filters, patch: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    q: f.q,
    precio: f.precioMin || f.precioMax ? `${f.precioMin}-${f.precioMax}` : "",
    hab: f.hab,
    banos: f.banos,
    m2: f.m2Min || f.m2Max ? `${f.m2Min}-${f.m2Max}` : "",
    planta: f.planta,
    estado: f.estado,
    etapa: f.etapa,
    barrio: f.barrio,
    zona: f.zona,
    puntuacion: f.puntuacion,
    orden: f.orden === "fecha" ? "" : f.orden,
    vista: f.vista === "filas" ? "filas" : "",
    archivadas: f.archivadas,
  };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) q.set(k, v);
  return q.toString();
}

const at = (path: string, query: string) => (query ? `${path}?${query}` : path);

/** The list with these filters, changing whichever keys the patch names. */
export const listHref = (f: Filters, patch: Record<string, string> = {}) => at("/propiedades", toQuery(f, patch));

/** The map with the same filters. It used to receive only `etapa` and `zona` (F13). */
export const mapHref = (f: Filters, patch: Record<string, string> = {}) => at("/mapa", toQuery(f, patch));

/** One home, carrying the list it was opened from so the way back is the way in (F14). */
export const detailHref = (id: string, f: Filters) => detailHrefFrom(id, toQuery(f));

/** The same link from an already-serialised query, for the map, which holds `params` not filters. */
export function detailHrefFrom(id: string, query: string): string {
  return at(`/propiedades/${encodeURIComponent(id)}`, query ? `desde=${encodeURIComponent(query)}` : "");
}

/**
 * Where a detail page's back link goes. Rebuilt from scratch through `parseFilters`, so a
 * hand-edited `desde` can only ever produce a list URL with filters this module recognises.
 */
export function backHref(desde: string, id: string): string {
  const f = parseFilters(Object.fromEntries(new URLSearchParams(desde)));
  return `${listHref(f)}#p-${encodeURIComponent(id)}`;
}

/**
 * The badge on the Filtros pill. `etapa` was left out of it while its own bubble was shown (F31).
 * `archivadas` widens the set instead of narrowing it, so it is not counted as a filter.
 */
export function countFilters(f: Filters): number {
  return [
    f.q,
    f.precioMin || f.precioMax,
    f.hab,
    f.banos,
    f.m2Min || f.m2Max,
    f.planta,
    f.barrio,
    f.zona,
    f.puntuacion,
    f.estado,
    f.etapa,
  ].filter(Boolean).length;
}

/** Every key `Quitar todo` empties. `archivadas` included: clearing returns the default view. */
export const CLEARABLE: Record<string, string> = {
  q: "",
  precio: "",
  hab: "",
  banos: "",
  m2: "",
  planta: "",
  barrio: "",
  zona: "",
  puntuacion: "",
  estado: "",
  etapa: "",
  archivadas: "",
};
