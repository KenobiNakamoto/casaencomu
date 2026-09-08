/** Pure helpers for the map's price pins. `Mapa.tsx` owns the DOM; this owns the decisions. */

export type Pinnable = {
  id: string;
  lng: number;
  lat: number;
  precision: "exact" | "approx";
  price_eur: number | null;
  title: string;
  neighborhood: string | null;
};

export type PinGroup<T extends Pinnable> = { key: string; lng: number; lat: number; items: T[] };

/**
 * Groups pins that share an *exact* stored coordinate. Portals publish one centroid per
 * building, and sometimes per barrio, so several homes land on the same point and the top
 * one hides the rest.
 *
 * Coordinates that merely look close are left apart: rounding them together would claim a
 * precision the data does not have, and would move a pin off the address it came from.
 *
 * ponytail: exact-coordinate grouping covers shared centroids. Add screen-space grouping
 * only if overlapping distinct locations actually block selection in use.
 */
export function groupByCoord<T extends Pinnable>(items: T[]): PinGroup<T>[] {
  const byKey = new Map<string, PinGroup<T>>();
  for (const item of items) {
    const key = `${item.lng},${item.lat}`;
    const group = byKey.get(key);
    if (group) group.items.push(item);
    else byKey.set(key, { key, lng: item.lng, lat: item.lat, items: [item] });
  }
  // Stable order inside a group, so the chooser does not reshuffle between renders.
  for (const group of byKey.values()) group.items.sort((a, b) => a.id.localeCompare(b.id));
  return [...byKey.values()];
}

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const price = (v: number | null) => (v == null ? "Sin precio" : eur.format(v));

/** What the pin shows. `≈` marks a portal centroid rather than a street address. */
export const pinText = (m: Pinnable) => `${m.precision === "approx" ? "≈ " : ""}${price(m.price_eur)}`;

/**
 * What a screen reader says. The `≈` carries the same meaning for a sighted reader, so it
 * is spelled out here rather than left to the symbol.
 */
export function pinLabel(m: Pinnable): string {
  const where = m.neighborhood ?? m.title;
  const how = m.precision === "approx" ? "ubicación aproximada" : "ubicación exacta";
  return `${price(m.price_eur)}, ${where}, ${how}`;
}

/** A group pin says how many share the point, and opens a chooser instead of one preview. */
export function groupLabel<T extends Pinnable>(group: PinGroup<T>): string {
  return `${group.items.length} viviendas en el mismo punto. Abre la lista para elegir una.`;
}
