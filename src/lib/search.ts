/**
 * Free text search and the condition presets. Both ignore case and accents.
 *
 * ponytail: matching happens in JS over the rows the page already loaded, because SQLite has no
 * unaccent and "gotic" must find "Gòtic". Move to FTS5 over a normalised column if the list ever
 * passes a few thousand properties.
 */

/** Lowercase, accents removed: the form both sides of every comparison are in. */
export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Everything the search looks at, built as one column so the row payload stays flat. */
export const HAYSTACK_SQL = `p.title || ' ' || COALESCE(p.description, '') || ' ' ||
  COALESCE(p.neighborhood, '') || ' ' || COALESCE(p.address_text, '') || ' ' ||
  COALESCE(p.agency, '') || ' ' || COALESCE(p.condition, '') || ' ' || COALESCE(p.floor, '') || ' ' ||
  COALESCE(p.rooms, '') || ' hab ' || COALESCE(p.area_m2, '') || ' m2 ' || COALESCE(p.price_eur, '')`;

/** Every word of the query must appear somewhere in the text. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(haystack);
  return words.every((w) => hay.includes(w));
}

/**
 * `condition` comes from the portal and is empty on most listings, so each preset is a set of
 * words looked up in the whole text instead. "reformad" catches reformado and reformada without
 * catching "a reformar".
 */
export const CONDITIONS = {
  obra_nueva: { label: "Obra nueva", terms: ["obra nueva", "nueva construccion", "a estrenar", "de estreno"] },
  a_reformar: { label: "A reformar", terms: ["a reformar", "para reformar", "necesita reforma", "sin reformar"] },
  reformado: { label: "Reformado", terms: ["reformad", "reforma integral", "recien reformado"] },
  listo: { label: "Listo para entrar", terms: ["listo para entrar", "entrar a vivir", "buen estado", "seminuevo"] },
} as const;

export type ConditionKey = keyof typeof CONDITIONS;
export const isCondition = (s: string): s is ConditionKey => Object.hasOwn(CONDITIONS, s);
export const matchesCondition = (haystack: string, key: ConditionKey) => {
  const hay = norm(haystack);
  return CONDITIONS[key].terms.some((t) => hay.includes(t));
};

/**
 * `floor` is free text as the portal wrote it — «7ª planta», «Bajo», «Ático», «Entresuelo» — so a
 * band is decided here rather than in SQL. Four bands, no overlap, and a floor we cannot read
 * matches none of them: a home is never hidden by a filter nobody set, and never shown by one
 * that was.
 */
export const FLOORS = {
  bajo: { label: "Bajo", holds: (n: number) => n <= 0 },
  "1-4": { label: "1–4", holds: (n: number) => n >= 1 && n <= 4 },
  "5+": { label: "5+", holds: (n: number) => n >= 5 },
  atico: { label: "Ático", holds: () => false },
} as const;

export type FloorBand = keyof typeof FLOORS;
export const isFloorBand = (s: string): s is FloorBand => Object.hasOwn(FLOORS, s);

/** The storey as a number, or null. Ground and below are 0; an attic is its own answer. */
export function floorNumber(floor: string | null | undefined): number | "atico" | null {
  const s = norm(floor ?? "").trim();
  if (!s) return null;
  if (s.includes("atico") || s.includes("sobreatico")) return "atico";
  if (/\b(bajo|baja|entresuelo|principal|semisotano|sotano|planta baja)\b/.test(s)) return 0;
  const m = s.match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

export function matchesFloor(floor: string | null | undefined, band: FloorBand): boolean {
  const n = floorNumber(floor);
  if (n === null) return false;
  if (band === "atico") return n === "atico";
  return n !== "atico" && FLOORS[band].holds(n);
}
