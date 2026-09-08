"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { STAGE_LABELS, type Stage } from "@/lib/listing";

export type Prop = {
  id: string;
  title: string;
  stage: Stage;
  price_eur: number | null;
  area_m2: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  lift: number | null;
  outdoor: string | null;
  parking: number | null;
  condition: string | null;
  energy_rating: string | null;
  neighborhood: string | null;
  cover: string | null;
  rating: number | null;
  /** null when every advertisement for it is still up. */
  gone: boolean;
};

type Cell = string | number | boolean | null;

const eur = (n: number) => `${n.toLocaleString("es-ES")} €`;
const bool = (v: number | null) => (v == null ? null : v !== 0);
const show = (v: Cell) => (v == null ? "Sin datos" : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v));

/**
 * Each row gives the raw typed value and, separately, how to show it. The difference is decided
 * on the raw value: two prices that round to the same €/m² still differ, and two absent facts do
 * not differ just because both print as `Sin datos` (F15).
 */
const ROWS: { label: string; raw: (p: Prop) => Cell; show?: (v: Cell) => string }[] = [
  { label: "Precio", raw: (p) => p.price_eur, show: (v) => (v == null ? "Sin datos" : eur(v as number)) },
  {
    label: "€/m²",
    raw: (p) => (p.price_eur == null || !p.area_m2 ? null : Math.round(p.price_eur / p.area_m2)),
    show: (v) => (v == null ? "Sin datos" : `${eur(v as number)}/m²`),
  },
  { label: "m²", raw: (p) => p.area_m2 },
  { label: "Habitaciones", raw: (p) => p.rooms },
  { label: "Baños", raw: (p) => p.bathrooms },
  { label: "Planta", raw: (p) => p.floor },
  { label: "Ascensor", raw: (p) => bool(p.lift) },
  { label: "Exterior", raw: (p) => p.outdoor },
  { label: "Parking", raw: (p) => bool(p.parking) },
  { label: "Estado", raw: (p) => p.condition },
  { label: "Certificado energético", raw: (p) => p.energy_rating },
  { label: "Barrio", raw: (p) => p.neighborhood },
  { label: "Etapa", raw: (p) => p.stage, show: (v) => STAGE_LABELS[v as Stage] ?? String(v) },
  {
    label: "Anuncio",
    raw: (p) => p.gone,
    show: (v) => (v ? "Retirado del portal" : "En el portal"),
  },
  {
    label: "Nota familiar",
    raw: (p) => p.rating,
    show: (v) => (v == null ? "Sin datos" : (v as number).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })),
  },
];

/**
 * Whether the screen is wide enough for every column at once. A store rather than an effect, so
 * the server renders the wide layout and a phone corrects it on hydration without a flash.
 */
const QUERY = "(min-width: 768px)";
function subscribeWide(onChange: () => void) {
  const mq = matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => matchMedia(QUERY).matches,
    () => true,
  );

export function CompareTable({ props }: { props: Prop[] }) {
  const wide = useWide();
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [second, setSecond] = useState(1);

  // On a phone the first column is fixed and one other is chosen. Every selection is kept; only
  // the visible pair changes, so switching never costs a home.
  const pair = Math.min(second, props.length - 1);
  const shown = wide || props.length < 3 ? props : [props[0], props[pair]];

  const rows = ROWS.map((r) => {
    const values = shown.map(r.raw);
    return { ...r, values, differ: values.some((v) => v !== values[0]) };
  });
  const visible = onlyDiff ? rows.filter((r) => r.differ) : rows;

  const th = "sticky left-0 z-10 whitespace-nowrap px-3 py-3 text-left text-sm font-medium text-muted";
  const td = "min-w-44 px-3 py-3 align-top text-sm";

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          Solo diferencias
        </label>
        {!wide && props.length > 2 && (
          <label className="flex items-center gap-2 text-sm text-body">
            Comparar con
            <select
              value={pair}
              onChange={(e) => setSecond(Number(e.target.value))}
              className="h-11 rounded-lg border border-control-border bg-raised px-2 text-ink"
            >
              {props.slice(1).map((p, i) => (
                <option key={p.id} value={i + 1}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {onlyDiff && visible.length === 0 && (
        <p className="mt-6 rounded-card border border-hairline px-6 py-10 text-center text-sm text-muted">
          Estas propiedades coinciden en todo lo que comparamos.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-card border border-hairline">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} bg-raised`} />
              {shown.map((p) => (
                <td key={p.id} className={td}>
                  {p.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ponytail: local photo route, no optimizer
                    <img src={`/api/photos/${p.cover}`} alt="" className="aspect-[4/3] w-52 rounded-card object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] w-52 items-center justify-center rounded-card bg-surface-strong text-sm text-muted">
                      Sin foto
                    </div>
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b border-hairline">
              <th className={`${th} bg-raised`}>Título</th>
              {shown.map((p) => (
                <td key={p.id} className={`${td} font-medium`}>
                  <Link href={`/propiedades/${encodeURIComponent(p.id)}`} className="hover:underline">
                    {p.title}
                  </Link>
                </td>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {visible.map((r) => {
              const bg = r.differ ? " bg-accent-tint" : " bg-raised";
              return (
                <tr key={r.label} className={bg}>
                  <th className={th + bg}>{r.label}</th>
                  {r.values.map((v, i) => (
                    <td key={shown[i].id} className={td + (r.differ ? " font-medium text-ink" : " text-body")}>
                      {(r.show ?? show)(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
