"use client";

import { useActionState, type ReactNode } from "react";
import { stageAction, type StageState } from "@/app/propiedades/actions";
import type { DraftOwner } from "@/lib/draft-storage";
import { OpinionEditor } from "@/components/propiedades/opinion-editor";
import { STAGE_LABELS, STAGES } from "@/lib/listing";
import { type Mine } from "@/lib/opinion-input";

type Props = {
  owner: DraftOwner;
  propertyId: string;
  /** The author's own opinion and draft, for the editor this box opens. */
  mine: Mine;
  stage: string;
  version: number;
  /** The state of this home, written by the server: what the advertisement is doing, and when. */
  children: ReactNode;
};

/**
 * The box under the photographs: your opinion on the left, the family's decision on the right.
 *
 * It has lost two thirds of its contents and is better for it. The six radios went to the editor
 * this box opens, because a score is part of an opinion and not a thing that can be saved on its
 * own (#141). The comment box went down to the conversation, because a box that can answer a
 * thread has to stand beside it (#146). What is left is the one shared decision — the stage — and
 * the version check that stops two people moving it past each other.
 */
export function OpinionForm({ propertyId, mine, stage, version, children, owner }: Props) {
  const [state, action, pending] = useActionState<StageState, FormData>(stageAction, null);
  const failed = state && !state.ok ? state : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* ---- your opinion, which opens over the page ---- */}
      <div className="bento flex flex-col gap-3">
        <p className="text-sm font-semibold text-ink">Tu opinión</p>
        <OpinionEditor owner={owner} propertyId={propertyId} mine={mine} />
      </div>

      {/* ---- the state of the home, and the one decision the family shares ---- */}
      <form action={action} className="bento flex flex-col gap-4">
        <input type="hidden" name="propertyId" value={propertyId} readOnly />
        <input type="hidden" name="version" value={version} readOnly />
        <p className="text-sm font-semibold text-ink">Estado</p>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
          Etapa
          {/* key: React resets the form after the action but never re-applies a changed
              defaultValue on a <select>. */}
          <select
            key={`${stage}-${version}`}
            name="etapa"
            defaultValue={stage}
            className="h-12 w-full rounded-lg border border-control-border bg-raised px-3 text-ink transition focus:border-ink"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {children}

        <div className="mt-auto space-y-2 pt-2">
          <button type="submit" disabled={pending} className="btn-primary h-12 w-full rounded-lg px-6 text-base font-medium">
            {pending ? "Guardando…" : "Guardar la etapa"}
          </button>
          <p id="opinion-status" role="status" aria-live="polite" className="text-sm">
            {failed && <span className="text-error">{failed.message}</span>}
            {state?.ok && <span className="text-ok">Guardado: {state.saved}.</span>}
          </p>
        </div>
      </form>
    </div>
  );
}
