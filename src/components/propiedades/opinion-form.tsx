"use client";

import { useActionState, type ReactNode } from "react";
import { opinionAction, type OpinionState } from "@/app/propiedades/actions";
import { OpinionEditor } from "@/components/propiedades/opinion-editor";
import { STAGE_LABELS, STAGES } from "@/lib/listing";
import { type Mine } from "@/lib/opinion-input";

type Props = {
  propertyId: string;
  /** The author's own opinion and draft, for the editor this box opens. */
  mine: Mine;
  stage: string;
  version: number;
  /** The state of this home, written by the server: what the advertisement is doing, and when. */
  children: ReactNode;
};

/**
 * The box under the photographs: your opinion, the family's conversation, and the state of the
 * home. Three quarters, and one button under the right one.
 *
 * The six radios used to live in the left quarter and write straight into the database. They now
 * live in the editor this box opens, because a score is part of an opinion — versioned, drafted
 * and withdrawable — and not a thing that can be saved on its own (#141). What is left in this
 * form is the comment and the stage: the conversation and the decision, neither of which belongs
 * to one person.
 */
export function OpinionForm({ propertyId, mine, stage, version, children }: Props) {
  const [state, action, pending] = useActionState<OpinionState, FormData>(opinionAction, null);
  const failed = state && !state.ok ? state : null;

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
      <input type="hidden" name="propertyId" value={propertyId} readOnly />
      <input type="hidden" name="version" value={version} readOnly />

      {/* ---- the quarter: your opinion, which opens over the page ---- */}
      <div className="bento flex flex-col gap-3">
        <p className="text-sm font-semibold text-ink">Tu opinión</p>
        <OpinionEditor propertyId={propertyId} mine={mine} />
      </div>

      {/* ---- the half: what you actually think ---- */}
      <div className="bento flex flex-col">
        <label htmlFor="opinion-body" className="mb-3 text-sm font-semibold text-ink">
          Tu comentario
        </label>
        <textarea
          id="opinion-body"
          name="body"
          // `key` re-mounts the field, so an emptied box after a success and the returned words
          // after a failure both take effect. `defaultValue` alone keeps whatever React first drew.
          key={failed ? "failed" : "fresh"}
          defaultValue={failed?.text ?? ""}
          maxLength={4000}
          placeholder="Qué te gusta, qué te preocupa y qué hay que comprobar."
          aria-describedby="opinion-status"
          aria-invalid={failed ? true : undefined}
          className="min-h-[220px] w-full flex-1 rounded-lg border border-control-border bg-raised p-3 text-ink transition focus:border-ink"
        />
        <p className="mt-2 text-xs text-muted">Se guarda con tus respuestas, en una sola pieza.</p>
      </div>

      {/* ---- the other quarter: the state, and under it the space the button sits in ---- */}
      <div className="flex flex-col gap-4">
        <div className="bento space-y-4">
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
        </div>

        <div className="mt-auto space-y-2">
          <button type="submit" disabled={pending} className="btn-primary h-12 w-full rounded-lg px-6 text-base font-medium">
            {pending ? "Guardando…" : "Guardar mi opinión"}
          </button>
          {/* Only a failure has to persist; the success line names what was written, because
              three things went in at once and «guardado» alone would not say which. */}
          <p id="opinion-status" role="status" aria-live="polite" className="text-sm">
            {failed && <span className="text-error">{failed.message}</span>}
            {state?.ok && <span className="text-ok">Guardado: {state.saved}.</span>}
          </p>
        </div>
      </div>
    </form>
  );
}
