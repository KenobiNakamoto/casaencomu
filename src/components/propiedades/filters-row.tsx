import Link from "next/link";
import { STAGE_LABELS, type Stage } from "@/lib/listing";
import { CONDITIONS } from "@/lib/search";
import type { FilterValues } from "./filter-bar";
import { fmtEur } from "./format";

type Href = (patch: Record<string, string>) => string;
type Param = "hab" | "banos" | "m2" | "estado";

/** One click each. Clicking an active one takes it off again. */
const PRESETS: { label: string; param: Param; value: string }[] = [
  { label: "2 baños", param: "banos", value: "2" },
  { label: "3 hab", param: "hab", value: "3" },
  { label: "4 hab", param: "hab", value: "4" },
  { label: "80 m²+", param: "m2", value: "80" },
  { label: "100 m²+", param: "m2", value: "100" },
  ...Object.entries(CONDITIONS).map(([value, c]) => ({ label: c.label, param: "estado" as const, value })),
];

/** Every filter that gets a bubble, in the order they read best. */
const CLEARABLE = ["q", "precio", "hab", "banos", "m2", "barrio", "puntuacion", "estado", "etapa"] as const;

export function QuickFilters({ v, href }: { v: FilterValues; href: Href }) {
  return (
    <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" aria-label="Filtros rápidos">
      {PRESETS.map(({ label, param, value }) => {
        const active = v[param] === value;
        return (
          <Link
            key={`${param}-${value}`}
            href={href({ [param]: active ? "" : value })}
            aria-pressed={active}
            className={`flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-sm transition ${
              active ? "border-emerald-300 bg-emerald-50 font-medium text-emerald-800" : "border-hairline text-body hover:border-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function priceLabel(v: FilterValues) {
  const min = Number(v.precioMin);
  const max = Number(v.precioMax);
  if (v.precioMin && v.precioMax) return `${fmtEur(min)} – ${fmtEur(max)}`;
  return v.precioMin ? `Desde ${fmtEur(min)}` : `Hasta ${fmtEur(max)}`;
}

export function ActiveFilters({ v, href }: { v: FilterValues; href: Href }) {
  const items: { label: string; patch: Record<string, string> }[] = [];
  if (v.q) items.push({ label: `“${v.q}”`, patch: { q: "" } });
  if (v.precioMin || v.precioMax) items.push({ label: priceLabel(v), patch: { precio: "" } });
  if (v.hab) items.push({ label: `${v.hab}+ hab`, patch: { hab: "" } });
  if (v.banos) items.push({ label: `${v.banos}+ baños`, patch: { banos: "" } });
  if (v.m2) items.push({ label: `${v.m2}+ m²`, patch: { m2: "" } });
  if (v.barrio) items.push({ label: v.barrio, patch: { barrio: "" } });
  if (v.puntuacion) items.push({ label: `Nota ${v.puntuacion}+`, patch: { puntuacion: "" } });
  if (v.etapa) items.push({ label: STAGE_LABELS[v.etapa as Stage] ?? v.etapa, patch: { etapa: "" } });
  if (v.estado in CONDITIONS) items.push({ label: CONDITIONS[v.estado as keyof typeof CONDITIONS].label, patch: { estado: "" } });
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3">
      {items.map(({ label, patch }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-1 text-sm font-medium text-emerald-800"
        >
          {label}
          <Link
            href={href(patch)}
            aria-label={`Quitar ${label}`}
            className="grid h-6 w-6 place-items-center rounded-full text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-900"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        </span>
      ))}
      {items.length > 1 && (
        <Link
          href={href(Object.fromEntries(CLEARABLE.map((k) => [k, ""])))}
          className="ml-1 text-sm font-medium text-ink underline underline-offset-4 hover:text-muted"
        >
          Quitar todo
        </Link>
      )}
    </div>
  );
}
