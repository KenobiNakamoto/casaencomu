const TZ = "Europe/Madrid";
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("es-ES");

export const SIN_DATOS = "Sin datos";

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

export const siNo = (v: number | boolean | null | undefined) => (v == null ? SIN_DATOS : v ? "Sí" : "No");
