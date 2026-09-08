"use client";

import { useActionState } from "react";
import { setStageAction, type SaveState } from "@/app/propiedades/actions";
import { STAGE_LABELS, STAGES } from "@/lib/listing";
import { input } from "./format";

/**
 * The stage the family agreed on. The form carries the `stage_version` it was drawn with, so a
 * decision made against a screen someone else has already changed is refused and explained,
 * rather than quietly winning (F25).
 */
export function StageForm({ propertyId, stage, version }: { propertyId: string; stage: string; version: number }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setStageAction, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="propertyId" value={propertyId} readOnly />
      <input type="hidden" name="version" value={version} readOnly />
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
        Etapa
        {/* key: React resets the form after the action but never re-applies a changed defaultValue on a <select> */}
        <select key={`${stage}-${version}`} name="etapa" defaultValue={stage} className={input}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-lg bg-ink px-6 text-base font-medium text-canvas transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar etapa"}
      </button>
      {/* Only a failure persists. A routine success needs no receipt: the badge above changes. */}
      <p role="status" className="text-sm">
        {state && !state.ok && <span className="text-error">{state.message}</span>}
      </p>
    </form>
  );
}
