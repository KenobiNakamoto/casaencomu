"use client";

import Link from "next/link";

// ponytail: the only client component on the list page. Its single job is to fold the two price
// inputs into `precio=<min>-<max>` and drop empty fields, so the URL carries only live filters.

export type FilterValues = {
  precioMin: string;
  precioMax: string;
  hab: string;
  m2: string;
  etapa: string;
  barrio: string;
  puntuacion: string;
  orden: string;
  vista: string;
};

type Props = {
  values: FilterValues;
  neighborhoods: string[];
  stages: [value: string, label: string][];
};

const label = "flex flex-col gap-1 text-xs font-medium text-zinc-600";
const input = "h-10 rounded-md border border-zinc-300 px-2 text-sm text-zinc-900";

function onSubmit(e: React.FormEvent<HTMLFormElement>) {
  const form = e.currentTarget;
  const get = (id: string) => form.querySelector<HTMLInputElement>(`#${id}`)!;
  const min = get("precio-min").value.trim();
  const max = get("precio-max").value.trim();
  get("precio").value = min || max ? `${min}-${max}` : "";
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

export function FilterBar({ values: v, neighborhoods, stages }: Props) {
  return (
    <form method="get" action="/propiedades" onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="precio" id="precio" />
      <input type="hidden" name="vista" value={v.vista === "filas" ? "filas" : ""} readOnly />
      <label className={label}>
        Precio mín.
        <input id="precio-min" type="number" min={0} step={1000} inputMode="numeric" defaultValue={v.precioMin} className={`${input} w-28`} />
      </label>
      <label className={label}>
        Precio máx.
        <input id="precio-max" type="number" min={0} step={1000} inputMode="numeric" defaultValue={v.precioMax} className={`${input} w-28`} />
      </label>
      <label className={label}>
        Hab. mín.
        <input name="hab" type="number" min={0} inputMode="numeric" defaultValue={v.hab} className={`${input} w-20`} />
      </label>
      <label className={label}>
        m² mín.
        <input name="m2" type="number" min={0} inputMode="numeric" defaultValue={v.m2} className={`${input} w-20`} />
      </label>
      <label className={label}>
        Barrio
        <select name="barrio" defaultValue={v.barrio} className={`${input} w-36`}>
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
        <select name="etapa" defaultValue={v.etapa} className={`${input} w-36`}>
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
        <select name="puntuacion" defaultValue={v.puntuacion} className={`${input} w-20`}>
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
        <select name="orden" defaultValue={v.orden} className={`${input} w-32`}>
          <option value="">Más recientes</option>
          <option value="precio">Precio</option>
          <option value="puntuacion">Nota</option>
        </select>
      </label>
      <button type="submit" className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white">
        Filtrar
      </button>
      <Link href={v.vista === "filas" ? "/propiedades?vista=filas" : "/propiedades"} className="h-10 leading-10 text-sm text-zinc-600 underline">
        Quitar filtros
      </Link>
    </form>
  );
}
