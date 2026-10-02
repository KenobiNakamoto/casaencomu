import { DIMENSION_LABELS, DIMENSIONS } from "@/lib/listing";
import { STANCE_SHORT, type Basis, type Stance } from "@/lib/opinion-input";
import { splits, type RatingRow } from "@/lib/ratings";

export type PublishedOpinion = {
  user_id: string;
  name: string;
  stance: Stance | null;
  reasoning: string;
  blocker: number;
  basis: Basis | null;
  published_at: string;
  updated_at: string;
};

const BASIS_SHORT: Record<Basis, string> = { listing: "Por el anuncio", visit: "La ha visitado" };

const when = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

/**
 * Six lines is a height, and the server has no heights. 300 characters is roughly six lines at
 * this width, and being wrong only means a fold that was not needed or one line too many.
 * ponytail: measure it in the browser the day somebody notices.
 */
const LONG = 300;

/**
 * What each person thinks, in their own words, above any grid of numbers (doc 04 § 5).
 *
 * The order is the reader first and then by name — never by how positive anybody was. A score is
 * a summary of an opinion, and this is the opinion, so it reads first.
 */
export function OpinionCards({
  opinions,
  ratings,
  readerId,
  silent,
  replyHref,
  personHref,
}: {
  opinions: PublishedOpinion[];
  ratings: RatingRow[];
  readerId: string;
  /** Accounts with no published opinion. Known accounts — not the size of the family. */
  silent: { id: string; name: string }[];
  /**
   * Where «Responder» goes: the conversation, with this person already chosen in the composer
   * (doc 04 § 5). A plain link, so answering somebody needs no JavaScript of ours.
   */
  replyHref: (userId: string) => string;
  /** Everything this person has said, in every home. The name is the way in. */
  personHref: (userId: string) => string;
}) {
  const ordered = [...opinions].sort((a, b) =>
    a.user_id === readerId ? -1 : b.user_id === readerId ? 1 : a.name.localeCompare(b.name, "es") || a.user_id.localeCompare(b.user_id),
  );
  const scored = (id: string) => ratings.filter((r) => r.user_id === id).length;
  const noStance = opinions.filter((o) => o.stance === null).length;

  return (
    <div className="space-y-3">
      {ordered.length === 0 ? (
        <p className="bento text-sm text-muted">
          Todavía no ha opinado nadie. La tuya se escribe arriba, en «Tu opinión».
        </p>
      ) : (
        ordered.map((o) => {
          const n = scored(o.user_id);
          // An impediment is never folded away: it is the one thing somebody needs answered.
          const fold = o.reasoning.length > LONG && !o.blocker;
          return (
            <article key={o.user_id} className="bento space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-sm font-semibold text-ink">
                  <a href={personHref(o.user_id)} className="underline-offset-4 hover:underline">
                    {o.user_id === readerId ? "Tú" : o.name}
                  </a>
                </h3>
                {o.stance ? (
                  <span className="rounded-full border border-hairline px-2 py-0.5 text-xs font-medium text-ink">
                    {STANCE_SHORT[o.stance]}
                  </span>
                ) : (
                  <span className="text-xs text-muted">Sin postura registrada</span>
                )}
                {o.basis && <span className="text-xs text-muted">{BASIS_SHORT[o.basis]}</span>}
                <span className="ml-auto text-xs text-muted">
                  {n === 0 ? "Sin puntuar" : `${n} de ${DIMENSIONS.length} aspectos`} · {when(o.updated_at)}
                </span>
              </div>

              {o.blocker === 1 && (
                <p className="text-sm font-medium text-error">Hay un impedimento importante para esta persona</p>
              )}

              {o.reasoning ? (
                fold ? (
                  <details className="reason">
                    <summary className="reason-summary">
                      <span className="reason-text">{o.reasoning}</span>
                      <span className="reason-more">Leer opinión completa</span>
                    </summary>
                  </details>
                ) : (
                  <p className="whitespace-pre-line text-sm text-body">{o.reasoning}</p>
                )
              ) : (
                <p className="text-sm text-muted">Sin explicación.</p>
              )}

              {/* Answering somebody used to mean scrolling past the table to a box and finding
                  their name in a chooser. Their opinion is where the answer occurs to you. */}
              {o.user_id !== readerId && (
                <a
                  href={replyHref(o.user_id)}
                  className="touch-target inline-flex text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  Responder a {o.name}
                </a>
              )}
            </article>
          );
        })
      )}

      {noStance > 0 && (
        <p className="text-xs text-muted">
          {noStance === 1 ? "1 opinión anterior" : `${noStance} opiniones anteriores`} sin postura registrada: se
          guardaron antes de que existiera la pregunta.
        </p>
      )}

      {silent.length > 0 && (
        <p className="text-xs text-muted">
          <span className="font-medium text-body">Personas registradas sin opinión:</span>{" "}
          {silent.map((u) => u.name).join(", ")}. Es la lista de cuentas conocidas, no la familia entera.
        </p>
      )}
    </div>
  );
}

/**
 * Where the family actually differs, named (doc 04 § 6). An average hides exactly this: two
 * people two points apart average to the middle, and the middle looks like agreement.
 */
export function Disagreements({
  opinions,
  ratings,
  readerId,
  replyHref,
}: {
  opinions: PublishedOpinion[];
  ratings: RatingRow[];
  readerId: string;
  replyHref: (userId: string) => string;
}) {
  const name = (id: string) => (id === readerId ? "tú" : (opinions.find((o) => o.user_id === id)?.name ?? "alguien"));
  const gaps = splits(ratings);
  /**
   * Whom to answer about one gap: the side the reader is not on. This paragraph is the moment
   * the family has something to talk about, and it used to end in a full stop (F—, 2026-09-29).
   */
  const other = (g: { low: string[]; high: string[] }) => {
    const side = g.low.includes(readerId) ? g.high : g.low;
    return (side.find((id) => id !== readerId) ?? [...g.low, ...g.high].find((id) => id !== readerId)) ?? null;
  };
  const stances = new Set(opinions.map((o) => o.stance));
  const opposed = stances.has("me_interesa") && stances.has("no_me_encaja");
  if (!opposed && gaps.length === 0) return null;

  return (
    <div className="bento space-y-2">
      <p className="text-sm font-semibold text-ink">En qué no coincidís</p>
      {opposed && (
        <p className="text-sm text-body">
          A alguien le interesa y a alguien no le encaja:{" "}
          {opinions
            .filter((o) => o.stance === "me_interesa" || o.stance === "no_me_encaja")
            .map((o) => `${o.user_id === readerId ? "Tú" : o.name} (${STANCE_SHORT[o.stance!]})`)
            .join(" · ")}
        </p>
      )}
      {gaps.map((g) => {
        const ask = other(g);
        return (
          <p key={g.dimension} className="text-sm text-body">
            <span className="font-medium">{DIMENSION_LABELS[g.dimension as keyof typeof DIMENSION_LABELS]}</span>:{" "}
            {g.low.map(name).join(", ")} {g.low.length === 1 ? "puntúa" : "puntúan"} {g.min}, {g.high.map(name).join(", ")}{" "}
            {g.high.length === 1 ? "puntúa" : "puntúan"} {g.max}.{" "}
            {ask && (
              <a
                href={replyHref(ask)}
                className="touch-target whitespace-nowrap text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Preguntar a {name(ask)}
              </a>
            )}
          </p>
        );
      })}
    </div>
  );
}
