"use client";

import { useState, useTransition } from "react";
import { publishOpinionAction, saveDraftAction, withdrawOpinionAction } from "@/app/propiedades/actions";
import { Panel } from "@/components/panel";
import { DIMENSION_LABELS, DIMENSIONS, type Dimension } from "@/lib/listing";
// Never `@/lib/opinions`: one runtime value from there drags `node:async_hooks` into the
// browser bundle and Turbopack refuses to build the page.
import { EMPTY, REASONING_MAX, type Basis, type Mine, type OpinionInput, type Stance } from "@/lib/opinion-input";

const STANCE_LABELS: Record<Stance, string> = {
  me_interesa: "Me interesa",
  dudas: "Tengo dudas",
  no_me_encaja: "No me encaja",
};

/** The words behind the five numbers. Shown once as a scale, and given to every radio by name. */
const SCORE_LABELS = ["Muy desfavorable", "Desfavorable", "Aceptable", "Favorable", "Muy favorable"];

const BASIS_LABELS: Record<Basis, string> = {
  listing: "Me baso en el anuncio",
  visit: "He visitado la propiedad",
};

/** What the editor opens with: the unsent draft first, then the publication, then nothing. */
function initial(mine: Mine): OpinionInput {
  if (mine.draft) return mine.draft;
  if (mine.published && !mine.published.withdrawn) {
    const p = mine.published;
    return { stance: p.stance, reasoning: p.reasoning, blocker: p.blocker, basis: p.basis, scores: p.scores };
  }
  return { ...EMPTY, basis: "listing" };
}

const sameInput = (a: OpinionInput, b: OpinionInput) =>
  a.stance === b.stance &&
  a.reasoning === b.reasoning &&
  a.blocker === b.blocker &&
  a.basis === b.basis &&
  DIMENSIONS.every((d) => (a.scores[d] ?? null) === (b.scores[d] ?? null));

const REFUSALS: Record<string, string> = {
  stance: "Elige cómo lo ves antes de publicar.",
  blocker_needs_reasoning: "Escribe cuál es el impedimento.",
  reasoning_too_long: `El texto no puede pasar de ${REASONING_MAX} caracteres.`,
  score: "Alguna puntuación no es válida.",
};

/**
 * Where a person says what they think, and the only way a score reaches the database (#141).
 *
 * Two rules run through it. Nothing is shared until «Publicar opinión»: a draft is stored on the
 * server so it survives the phone, and no other member can read it or learn that it exists.
 * Nothing saves by itself: there is no autosave, no debounce and no save on blur, so a half-formed
 * thought stays half-formed until the person decides otherwise.
 */
export function OpinionEditor({ propertyId, mine }: { propertyId: string; mine: Mine }) {
  const published = mine.published && !mine.published.withdrawn ? mine.published : null;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(() => initial(mine));
  const [saved, setSaved] = useState(() => initial(mine));
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const dirty = !sameInput(input, saved);
  const set = <K extends keyof OpinionInput>(key: K, value: OpinionInput[K]) => {
    setInput((i) => ({ ...i, [key]: value }));
    setNote(null);
  };
  const setScore = (dim: Dimension, score: number | null) => {
    setInput((i) => ({ ...i, scores: { ...i.scores, [dim]: score } }));
    setNote(null);
  };

  const run = (action: () => Promise<Awaited<ReturnType<typeof publishOpinionAction>>>, done: string, close: boolean) =>
    start(async () => {
      const result = await action();
      if (!result.ok) {
        // Nothing on screen is touched. What the person typed is the one thing a refusal may
        // never cost them (F25).
        setNote({
          tone: "error",
          text:
            result.reason === "conflict"
              ? "Hay una versión más reciente. Vuelve a cargar la página y compara antes de continuar."
              : (REFUSALS[result.detail ?? ""] ?? "No se ha podido guardar. Tus cambios siguen aquí."),
        });
        return;
      }
      setSaved(input);
      setLeaving(false);
      setNote({ tone: "ok", text: done });
      if (close) setOpen(false);
    });

  const rated = DIMENSIONS.filter((d) => typeof input.scores[d] === "number").length;

  return (
    <>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            setInput(initial(mine));
            setSaved(initial(mine));
            setNote(null);
            setLeaving(false);
            setConfirming(false);
            setOpen(true);
          }}
          className="btn-primary h-12 w-full rounded-lg px-6 text-base font-medium"
        >
          {published ? "Editar mi opinión" : "Publicar opinión"}
        </button>
        <p className="text-sm text-muted">
          {published
            ? `Opinión publicada · ${STANCE_LABELS[published.stance ?? "dudas"]}`
            : mine.draft
              ? "Borrador guardado · solo tú"
              : "Todavía no has opinado"}
        </p>
      </div>

      <Panel label="Tu opinión" open={open} onClose={() => setOpen(false)} guard={() => (dirty ? (setLeaving(true), true) : false)}>
        <div className="flex max-h-[inherit] flex-col">
          <div className="border-b border-hairline px-5 py-4">
            <h2 className="text-lg font-medium text-ink">Tu opinión</h2>
            <p className="text-sm text-muted">Solo tú la ves hasta que la publiques.</p>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">¿Cómo lo ves?</legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(Object.keys(STANCE_LABELS) as Stance[]).map((s) => (
                  <label key={s} className="flex-1 cursor-pointer">
                    <input
                      type="radio"
                      name="stance"
                      value={s}
                      checked={input.stance === s}
                      onChange={() => set("stance", s)}
                      className="peer sr-only"
                    />
                    <span className="flex h-12 w-full items-center justify-center rounded-lg border border-hairline bg-raised px-3 text-sm font-medium text-ink transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-canvas peer-focus-visible:ring-2 peer-focus-visible:ring-focus hover:border-ink">
                      {STANCE_LABELS[s]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="reasoning" className="mb-2 block text-sm font-semibold text-ink">
                Por qué lo ves así
              </label>
              <textarea
                id="reasoning"
                rows={4}
                maxLength={REASONING_MAX}
                value={input.reasoning}
                onChange={(e) => set("reasoning", e.target.value)}
                placeholder="Qué te gusta, qué te preocupa y qué necesitas comprobar."
                className="w-full rounded-lg border border-control-border bg-raised p-3 text-ink transition focus:border-ink"
              />
              <p className="mt-1 text-right text-xs text-muted">
                {input.reasoning.length}/{REASONING_MAX}
              </p>
            </div>

            <label className="flex items-start gap-3 text-sm text-body">
              <input
                type="checkbox"
                checked={input.blocker}
                onChange={(e) => set("blocker", e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[var(--ink)]"
              />
              <span>
                Hay un impedimento importante para mí
                <span className="block text-xs text-muted">
                  No descarta la casa ni cambia la etapa. Aparece junto a tu nombre, con tu explicación.
                </span>
              </span>
            </label>

            <details className="rounded-lg border border-hairline">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
                Valorar por aspectos
                <span className="ml-2 font-normal text-muted">
                  {rated} de {DIMENSIONS.length} aspectos valorados
                </span>
              </summary>
              <div className="space-y-4 border-t border-hairline px-4 py-4">
                <p className="text-xs text-muted">1 muy desfavorable · 5 muy favorable</p>
                {DIMENSIONS.map((dim) => (
                  <div key={dim} role="radiogroup" aria-label={DIMENSION_LABELS[dim]} className="space-y-1.5">
                    <p className="text-[13px] font-medium text-body">{DIMENSION_LABELS[dim]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label key={n} className="flex-1 cursor-pointer">
                          <input
                            type="radio"
                            name={dim}
                            value={n}
                            aria-label={`${n} ${SCORE_LABELS[n - 1]}`}
                            checked={input.scores[dim] === n}
                            onChange={() => setScore(dim, n)}
                            className="peer sr-only"
                          />
                          <span className="flex h-11 w-full min-w-11 items-center justify-center rounded-lg border border-hairline bg-raised text-sm font-medium text-ink transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-canvas peer-focus-visible:ring-2 peer-focus-visible:ring-focus hover:border-ink">
                            {n}
                          </span>
                        </label>
                      ))}
                      <label className="cursor-pointer basis-full sm:basis-auto">
                        <input
                          type="radio"
                          name={dim}
                          value=""
                          aria-label={`${DIMENSION_LABELS[dim]}: no lo sé`}
                          checked={input.scores[dim] === null}
                          onChange={() => setScore(dim, null)}
                          className="peer sr-only"
                        />
                        <span className="flex h-11 items-center justify-center rounded-lg border border-hairline bg-raised px-3 text-sm text-muted transition peer-checked:border-ink peer-checked:text-ink peer-focus-visible:ring-2 peer-focus-visible:ring-focus hover:border-ink">
                          No lo sé
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">¿En qué te basas?</legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(Object.keys(BASIS_LABELS) as Basis[]).map((b) => (
                  <label key={b} className="flex-1 cursor-pointer">
                    <input
                      type="radio"
                      name="basis"
                      value={b}
                      checked={input.basis === b}
                      onChange={() => set("basis", b)}
                      className="peer sr-only"
                    />
                    <span className="flex h-12 w-full items-center justify-center rounded-lg border border-hairline bg-raised px-3 text-sm text-ink transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-canvas peer-focus-visible:ring-2 peer-focus-visible:ring-focus hover:border-ink">
                      {BASIS_LABELS[b]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {published && (
              <div className="border-t border-hairline pt-4">
                {confirming ? (
                  <div className="space-y-2 text-sm">
                    <p className="text-body">Dejará de mostrarse a la familia. Puedes volver a publicarla más adelante.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => withdrawOpinionAction(propertyId, { version: mine.version, revision: mine.revision }),
                            "Opinión retirada.",
                            true,
                          )
                        }
                        className="h-11 rounded-lg border border-error px-4 text-sm font-medium text-error transition hover:bg-raised"
                      >
                        Sí, retirarla
                      </button>
                      <button type="button" onClick={() => setConfirming(false)} className="h-11 px-3 text-sm text-muted underline">
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirming(true)} className="text-sm text-muted underline">
                    Retirar mi opinión
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-hairline px-5 py-4">
            {leaving && (
              <div className="rounded-lg border border-hairline bg-raised p-3 text-sm">
                <p className="mb-2 text-body">Tienes cambios sin guardar.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setLeaving(false)} className="h-10 rounded-lg border border-hairline px-3 text-sm">
                    Seguir editando
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => saveDraftAction(propertyId, input, { version: mine.version, revision: mine.revision }),
                        "Borrador guardado · solo tú",
                        true,
                      )
                    }
                    className="h-10 rounded-lg border border-hairline px-3 text-sm"
                  >
                    Guardar borrador
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInput(saved);
                      setLeaving(false);
                      setOpen(false);
                    }}
                    className="h-10 px-3 text-sm text-muted underline"
                  >
                    Descartar los cambios
                  </button>
                </div>
              </div>
            )}

            {note && (
              <p role="status" aria-live="polite" className={`text-sm ${note.tone === "ok" ? "text-ok" : "text-error"}`}>
                {note.text}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => publishOpinionAction(propertyId, input, { version: mine.version, revision: mine.revision }),
                    published ? "Cambios publicados." : "Opinión publicada.",
                    true,
                  )
                }
                className="btn-primary h-12 flex-1 rounded-lg px-6 text-base font-medium"
              >
                {pending ? "Publicando…" : published ? "Publicar cambios" : "Publicar opinión"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => saveDraftAction(propertyId, input, { version: mine.version, revision: mine.revision }),
                    "Borrador guardado · solo tú",
                    false,
                  )
                }
                className="h-12 rounded-lg border border-hairline px-4 text-sm font-medium text-ink transition hover:border-ink"
              >
                Guardar borrador
              </button>
              <button type="button" onClick={() => (dirty ? setLeaving(true) : setOpen(false))} className="h-12 px-3 text-sm text-muted underline">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}
