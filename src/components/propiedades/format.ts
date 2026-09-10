const TZ = "Europe/Madrid";
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("es-ES");

export const SIN_DATOS = "Sin datos";

/**
 * The shared field style. It lives here, not in `filter-bar.tsx`, because that file is a client
 * component: a server component importing a plain value across that boundary receives a client
 * reference, and interpolating it writes the reference's own error text into the attribute.
 */
export const input = "h-12 w-full rounded-lg border border-control-border bg-raised px-3 text-ink transition focus:border-ink";

export const fmtEur = (n: number | null | undefined, fallback = SIN_DATOS) => (n == null ? fallback : eur.format(n));

export const fmtNum = (n: number | null | undefined, unit = "") =>
  n == null ? SIN_DATOS : num.format(n) + (unit ? " " + unit : "");

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : SIN_DATOS;

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });

/** Yes, no, or `null` for «the advertisement does not say» — which is not a value and never
 * becomes words. It used to return «Sin datos», which is how twelve rows of it reached one panel. */
export const yesNo = (v: number | boolean | null | undefined) => (v == null ? null : v ? "Sí" : "No");

/** How long ago, in words. Used by the activity feed and by the notifications menu. */
export function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "ahora mismo";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ayer";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}
