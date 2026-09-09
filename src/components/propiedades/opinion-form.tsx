"use client";

import { useActionState, useState, type ReactNode } from "react";
import { opinionAction, type OpinionState } from "@/app/propiedades/actions";
import { DIMENSION_LABELS, DIMENSIONS, STAGE_LABELS, STAGES, type Dimension } from "@/lib/listing";

type Props = {
  propertyId: string;
  current: Record<Dimension, number | null>;
  stage: string;
  version: number;
  /** The state of this home, written by the server: what the advertisement is doing, and when. */
  children: ReactNode;
};

/**
 * One opinion, one box, one button.
 *
 * The questions take the left quarter, the comment the middle half, and the state of the home the
 * right quarter. That right column is shorter than the other two on purpose: the button sits in
 * the space it leaves, at the foot of the box, where it reads as the end of the whole box rather
 * than the end of one column.
 *
 * React empties the form once the action returns. That is what clears the comment box, and it is
 * also what emptied the radios on screen while React's own copy still said they were chosen. So
 * the questions are re-mounted after every save, from the answers the server has just confirmed —
 * or, when the save was refused, from the ones that were submitted, because losing what somebody
 * chose is the same failure as losing what they typed (F25).
 */
export function OpinionForm({ propertyId, current, stage, version, children }: Props) {
  const [state, action, pending] = useActionState<OpinionState, FormData>(opinionAction, null);
  // One number per answer from the server, adjusted during the render that sees a new one. It is
  // the key the questions are drawn under, and re-mounting them is what puts the marks back.
  const [seen, setSeen] = useState(state);
  const [generation, setGeneration] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setGeneration((g) => g + 1);
  }
  const failed = state && !state.ok ? state : null;

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
      <input type="hidden" name="propertyId" value={propertyId} readOnly />
      <input type="hidden" name="version" value={version} readOnly />

      {/* ---- the quarter: the questions, and nothing else ---- */}
      <Questions key={generation} answers={{ ...current, ...(failed?.scores ?? {}) }} />

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

/**
 * The six aspects, one row of five choices each. Its own state, so the count under it moves as
 * the person answers; mounted fresh by its parent whenever the server has a newer answer.
 */
function Questions({ answers }: { answers: Record<string, number | null> }) {
  const [scores, setScores] = useState(answers);
  const rated = DIMENSIONS.filter((d) => scores[d] != null).length;

  return (
    <fieldset className="bento space-y-4">
      <legend className="mb-3 text-sm font-semibold text-ink">Tus respuestas</legend>
      {DIMENSIONS.map((dim) => (
        <div key={dim} role="radiogroup" aria-label={DIMENSION_LABELS[dim]} className="space-y-1.5">
          <p className="text-[13px] font-medium text-body">{DIMENSION_LABELS[dim]}</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name={dim}
                  value={n}
                  checked={scores[dim] === n}
                  onChange={() => setScores((s) => ({ ...s, [dim]: n }))}
                  className="peer sr-only"
                />
                <span className="flex h-11 w-full items-center justify-center rounded-lg border border-hairline bg-raised text-sm font-medium text-ink transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-canvas peer-focus-visible:ring-2 peer-focus-visible:ring-focus hover:border-ink">
                  {n}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">{rated} de {DIMENSIONS.length} aspectos valorados</p>
    </fieldset>
  );
}
