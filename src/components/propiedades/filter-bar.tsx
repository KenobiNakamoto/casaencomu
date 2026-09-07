"use client";

import Link from "next/link";

// ponytail: the only client component on the list page. Its single job is to fold the two price
// inputs into `precio=<min>-<max>` and drop empty fields, so the URL carries only live filters.

export type FilterValues = {
  q: string;
  precioMin: string;
  precioMax: string;
  hab: string;
  banos: string;
  m2: string;
  estado: string;
  etapa: string;
  barrio: string;
  zona: string;
  puntuacion: string;
  orden: string;
  vista: string;
};

type Props = {
  values: FilterValues;
  neighborhoods: string[];
  stages: [value: string, label: string][];
};

const label = "flex flex-col gap-1.5 text-xs font-semibold text-muted";
export const input = "h-12 w-full rounded-lg border border-hairline bg-white px-3 text-sm text-ink transition focus:border-ink focus:outline-none";

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
    <form method="get" action="/propiedades" onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="precio" id="precio" />
      <input type="hidden" name="q" value={v.q} readOnly />
      <input type="hidden" name="estado" value={v.estado} readOnly />
      <input type="hidden" name="zona" value={v.zona} readOnly />
      <input type="hidden" name="vista" value={v.vista === "filas" ? "filas" : ""} readOnly />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={label}>
          Precio mín.
          <input id="precio-min" type="number" min={0} step={1000} inputMode="numeric" defaultValue={v.precioMin} placeholder="€" className={input} />
        </label>
        <label className={label}>
          Precio máx.
          <input id="precio-max" type="number" min={0} step={1000} inputMode="numeric" defaultValue={v.precioMax} placeholder="€" className={input} />
        </label>
        <label className={label}>
          Hab. mín.
          <input name="hab" type="number" min={0} inputMode="numeric" defaultValue={v.hab} className={input} />
        </label>
        <label className={label}>
          Baños mín.
          <input name="banos" type="number" min={0} inputMode="numeric" defaultValue={v.banos} className={input} />
        </label>
        <label className={label}>
          m² mín.
          <input name="m2" type="number" min={0} inputMode="numeric" defaultValue={v.m2} className={input} />
        </label>
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
        <button type="submit" className="h-12 rounded-lg bg-ink px-6 text-base font-medium text-white transition hover:bg-black">
          Mostrar resultados
        </button>
      </div>
    </form>
  );
}
