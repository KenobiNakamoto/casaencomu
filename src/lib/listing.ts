import { z } from "zod";

const int = z.number().int().nullish();
const str = z.string().nullish();
const bool = z.boolean().nullish();

/** Output of the extractor; only `title` is required. Description verbatim. */
export const Listing = z.object({
  title: z.string().min(1),
  price_eur: int,
  fees_eur: int,
  area_m2: int,
  rooms: int,
  bathrooms: int,
  floor: str,
  outdoor: str,
  condition: str,
  energy_rating: str,
  description: str,
  address_text: str,
  neighborhood: str,
  agency: str,
  lift: bool,
  parking: bool,
  address_precision: z.enum(["exact", "approx", "none"]).default("none"),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  photos: z.array(z.url()).default([]),
});
export type Listing = z.infer<typeof Listing>;

/**
 * What the family decided. Availability is deliberately not in this list (decision D07): whether
 * the advertisement is still up belongs to the source, and a portal delisting a home must not
 * overwrite `preseleccionada`. `no_disponible` was a stage until migration 3 retired it.
 */
export const STAGES = ["nueva", "revisando", "preseleccionada", "visita_prevista", "descartada"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  nueva: "Nueva",
  revisando: "Revisando",
  preseleccionada: "Preseleccionada",
  visita_prevista: "Visita prevista",
  descartada: "Descartada",
};

export const DIMENSIONS = [
  "ubicacion",
  "distribucion",
  "luz_vistas",
  "estado",
  "calidad_precio",
  "encaje_familiar",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const DIMENSION_LABELS: Record<Dimension, string> = {
  ubicacion: "Ubicación",
  distribucion: "Distribución",
  luz_vistas: "Luz y vistas",
  estado: "Estado",
  calidad_precio: "Relación calidad-precio",
  encaje_familiar: "Encaje familiar",
};

export const EVENT_KINDS = [
  "import",
  "duplicate",
  "price_change",
  "availability_change",
  "facts_change",
  "stage_change",
  "comment",
  "rating",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const SETTINGS_KEYS = ["presupuesto_min", "presupuesto_max"] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];
