"use client";

import Link from "next/link";
import type { Bars } from "@/lib/buckets";
import type { Filters } from "@/lib/filters";
import { FLOORS } from "@/lib/search";
import { input } from "./format";
import { RangeField } from "./range-field";

// ponytail: this and `range-field.tsx` are the only client components on the list page. The form
// is still a plain GET: the only JavaScript is dropping the empty fields, so one set of filters
// keeps producing one URL.

type Props = {
  values: Filters;
  neighborhoods: string[];
  stages: [value: string, label: string][];
  /** The distribution of what is saved, for the bars over each slider. */
  prices: Bars | null;
  areas: Bars | null;
};

const label = "flex flex-col gap-1.5 text-xs font-semibold text-muted";
const legend = "mb-1 text-sm font-semibold text-ink";
const caption = "mb-2.5 text-xs text-muted";

function onSubmit(e: React.FormEvent<HTMLFormElement>) {
  const form = e.currentTarget;
  const blanks = Array.from(form.elements).filter(
    (el): el is HTMLInputElement | HTMLSelectElement =>
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.value === "",
  );
  for (const el of blanks) el.disabled = true;
  // Re-enable after the browser has serialised the form, for bfcache restores.
  setTimeout(() => {
    for (const el of blanks) el.disabled = false;
  }, 0);
}

/** One row of chips that is one radio group. `Cualquiera` is how a chip group is unset again. */
function Chips({ name, title, caption: cap, options, value }: { name: string; title: string; caption?: string; options: [string, string][]; value: string }) {
  return (
    <fieldset>
      <legend className={legend}>{title}</legend>
      {cap && <p className={caption}>{cap}</p>}
      <div className="flex flex-wrap gap-1.5">
        {[["", "Cualquiera"] as [string, string], ...options].map(([v, text]) => (
          <label key={v || "any"} className="chip-radio">
            <input type="radio" name={name} value={v} defaultChecked={value === v} />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FilterBar({ values: v, neighborhoods, stages, prices, areas }: Props) {
  return (
    <form method="get" action="/propiedades" onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="q" value={v.q} readOnly />
      <input type="hidden" name="estado" value={v.estado} readOnly />
      <input type="hidden" name="zona" value={v.zona} readOnly />
      <input type="hidden" name="vista" value={v.vista === "filas" ? "filas" : ""} readOnly />
      <input type="hidden" name="archivadas" value={v.archivadas} readOnly />

      {/* Three topics, three grounds. Rooms are counted, the other two are measured. */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="bento space-y-5">
          <Chips
            name="hab"
            title="Habitaciones"
            caption="Desde"
            value={v.hab}
            options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5+"]]}
          />
          <Chips
            name="banos"
            title="Baños"
            caption="Desde"
            value={v.banos}
            options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4+"]]}
          />
          <Chips
            name="planta"
            title="Planta"
            value={v.planta}
            options={Object.entries(FLOORS).map(([k, f]) => [k, f.label])}
          />
        </div>

        <RangeField name="m2" title="Superficie" unit="m²" bars={areas} step={5} defMin={v.m2Min} defMax={v.m2Max} />
        <RangeField name="precio" title="Precio" unit="€" bars={prices} step={5000} defMin={v.precioMin} defMax={v.precioMax} />
      </div>

      <div className="bento grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={label}>
          Barrio
          <select name="barrio" defaultValue={v.barrio} className={input}>
            <option value="">Todos</option>
            {neighborhoods.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Etapa
          <select name="etapa" defaultValue={v.etapa} className={input}>
            <option value="">Todas</option>
            {stages.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Nota mín.
          <select name="puntuacion" defaultValue={v.puntuacion} className={input}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Orden
          <select name="orden" defaultValue={v.orden} className={input}>
            <option value="">Más recientes</option>
            <option value="precio">Precio</option>
            <option value="puntuacion">Nota</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link href={v.vista === "filas" ? "/propiedades?vista=filas" : "/propiedades"} className="text-sm font-medium text-ink underline underline-offset-4">
          Quitar filtros
        </Link>
        <button type="submit" className="h-12 rounded-lg bg-ink px-6 text-base font-medium text-canvas transition hover:opacity-90">
          Mostrar resultados
        </button>
      </div>
    </form>
  );
}
