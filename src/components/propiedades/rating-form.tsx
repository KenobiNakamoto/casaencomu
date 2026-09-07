import { rateAction } from "@/app/propiedades/actions";
import { DIMENSION_LABELS, DIMENSIONS, type Dimension } from "@/lib/listing";

type Props = { propertyId: string; current: Record<Dimension, number | null> };

/** Six groups of five radios, 44 px targets; pre-checked with the member's saved scores. */
export function RatingForm({ propertyId, current }: Props) {
  return (
    <form action={rateAction.bind(null, propertyId)} className="space-y-4">
      {DIMENSIONS.map((dim) => (
        <fieldset key={dim} className="space-y-1.5">
          <legend className="text-sm font-medium text-ink">{DIMENSION_LABELS[dim]}</legend>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer">
                <input type="radio" name={dim} value={n} defaultChecked={current[dim] === n} className="peer sr-only" />
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline text-sm font-medium text-ink transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-canvas peer-focus-visible:ring-2 peer-focus-visible:ring-accent hover:border-ink">
                  {n}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button type="submit" className="h-12 w-full rounded-lg bg-accent px-6 text-base font-medium text-white transition hover:bg-accent-active">
        Guardar valoración
      </button>
    </form>
  );
}
