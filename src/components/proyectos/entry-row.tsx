import Link from "next/link";
import { Cover } from "@/components/propiedades/card";
import { StageBadge } from "@/components/propiedades/chip";
import { fmtEur, fmtNum } from "@/components/propiedades/format";
import { DIMENSION_LABELS, DIMENSIONS } from "@/lib/listing";
import { STANCE_SHORT, type Basis } from "@/lib/opinion-input";
import type { Entry } from "@/lib/people";

const BASIS_SHORT: Record<Basis, string> = { listing: "Por el anuncio", visit: "La ha visitado" };
const when = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
const score = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * One home, and what one person said about it, side by side.
 *
 * The left is the home as the main list draws it — the same cover, the same price line — so the
 * column is recognisable at a glance while you read down it. The right is only this person: no
 * average, no other member, no family number. Mixing the two is what makes a page like this
 * unreadable, because you stop knowing whose opinion you are looking at.
 *
 * Below 1024 px the two stack, the home first. A telephone reads one column.
 */
export function EntryRow({ e, who }: { e: Entry; who: string }) {
  const meta = [e.neighborhood, e.area_m2 !== null && fmtNum(e.area_m2, "m²"), e.rooms !== null && `${e.rooms} hab.`]
    .filter(Boolean)
    .join(" · ");
  const scored = DIMENSIONS.filter((d) => typeof e.scores[d] === "number");
  const nothing = !e.opinion && scored.length === 0 && e.comments.length === 0;

  // `minmax(0,…)` on the phone column too: a grid item's default `min-width: auto` lets a long
  // title size the track, and the row then runs off a 390 px screen.
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-card bg-raised p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      {/* ---- the home, as the main page draws it ---- */}
      <Link href={`/propiedades/${e.propertyId}`} className="flex min-w-0 gap-3">
        <div className="relative h-[86px] w-[116px] shrink-0 overflow-hidden rounded-lg bg-surface-soft">
          <Cover id={e.cover_id} className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StageBadge stage={e.stage} />
            {!e.filled && <span className="text-xs text-muted">Sin leer</span>}
          </div>
          <h2 className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug text-ink">{e.title}</h2>
          <p className="truncate text-sm text-muted">{meta || "Sin datos"}</p>
          <p className="text-[15px] font-semibold text-ink">{fmtEur(e.price_eur, "Sin precio")}</p>
        </div>
      </Link>

      {/* ---- what this person said, and nothing anybody else said ---- */}
      <div className="min-w-0 border-t border-hairline-soft pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        {nothing ? (
          <p className="text-sm text-muted">Sin opinión, sin puntuaciones y sin comentarios.</p>
        ) : (
          <div className="space-y-3">
            {e.opinion && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  {e.opinion.stance ? (
                    <span className="rounded-full border border-hairline px-2 py-0.5 text-xs font-medium text-ink">
                      {STANCE_SHORT[e.opinion.stance]}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Sin postura registrada</span>
                  )}
                  {e.opinion.basis && <span className="text-xs text-muted">{BASIS_SHORT[e.opinion.basis]}</span>}
                  {e.avg !== null && <span className="text-sm text-muted">★ {score(e.avg)}</span>}
                  <span className="ml-auto text-xs text-muted">{when(e.opinion.updated_at)}</span>
                </div>
                {e.opinion.blocker === 1 && (
                  <p className="text-sm font-medium text-error">Hay un impedimento importante para {who.toLowerCase() === "tú" ? "ti" : who}</p>
                )}
                {e.opinion.reasoning ? (
                  <p className="whitespace-pre-line text-sm text-body">{e.opinion.reasoning}</p>
                ) : (
                  <p className="text-sm text-muted">Sin explicación.</p>
                )}
              </div>
            )}

            {scored.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {scored.map((d) => (
                  <li key={d} className="text-xs text-muted">
                    {DIMENSION_LABELS[d]} <span className="font-semibold text-ink">{e.scores[d]}</span>
                  </li>
                ))}
                {scored.length < DIMENSIONS.length && (
                  <li className="text-xs text-muted">({DIMENSIONS.length - scored.length} sin puntuar)</li>
                )}
              </ul>
            )}

            {e.comments.length > 0 && (
              <ul className="space-y-2 border-t border-hairline-soft pt-2">
                {e.comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <p className="text-xs text-muted">
                      {when(c.created_at)}
                      {c.parent_id && " · respuesta"}
                      {c.opinion_name && ` · sobre la opinión de ${c.opinion_name}`}
                      {c.updated_at && " · editado"}
                    </p>
                    <p className="whitespace-pre-line text-body">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
