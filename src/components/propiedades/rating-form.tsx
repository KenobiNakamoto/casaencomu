import { rateAction } from "@/app/propiedades/actions";
import { DIMENSION_LABELS, DIMENSIONS, type Dimension } from "@/lib/listing";

type Props = { propertyId: string; current: Record<Dimension, number | null> };

/** Six groups of five radios, 44 px targets; pre-checked with the member's saved scores. */
export function RatingForm({ propertyId, current }: Props) {
  return (
    <form action={rateAction.bind(null, propertyId)} className="space-y-3">
      {DIMENSIONS.map((dim) => (
        <fieldset key={dim} className="flex flex-wrap items-center justify-between gap-2">
          <legend className="sr-only">{DIMENSION_LABELS[dim]}</legend>
          <span className="text-sm">{DIMENSION_LABELS[dim]}</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer">
                <input type="radio" name={dim} value={n} defaultChecked={current[dim] === n} className="peer sr-only" />
                <span className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-300 text-sm peer-checked:border-zinc-900 peer-checked:bg-zinc-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500">
                  {n}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button type="submit" className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white">
        Guardar valoración
      </button>
    </form>
  );
}
