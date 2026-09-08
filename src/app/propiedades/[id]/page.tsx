import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/propiedades/card";
import { Chip, StageChip } from "@/components/propiedades/chip";
import { fmtDate, fmtDateTime, fmtEur, fmtNum, SIN_DATOS, siNo } from "@/components/propiedades/format";
import { CommentForm } from "@/components/propiedades/comment-form";
import { RatingForm } from "@/components/propiedades/rating-form";
import { StageForm } from "@/components/propiedades/stage-form";
import { availabilityLine, AVAILABILITY_LABEL, isStale, type SourceAvailability } from "@/lib/availability";
import { CompareToggle, CompareTray } from "@/components/comparar/controls";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { backHref } from "@/lib/filters";
import { DIMENSION_LABELS, DIMENSIONS, STAGE_LABELS, type Stage } from "@/lib/listing";
import { familyAverage, matrix, memberAverage, type RatingRow } from "@/lib/ratings";


type Property = {
  id: string;
  title: string;
  stage: string;
  stage_version: number | null;
  price_eur: number | null;
  fees_eur: number | null;
  area_m2: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  lift: number | null;
  outdoor: string | null;
  parking: number | null;
  condition: string | null;
  energy_rating: string | null;
  description: string | null;
  address_text: string | null;
  address_precision: string;
  neighborhood: string | null;
  created_at: string;
};
type Source = {
  portal: string;
  url_original: string;
  via: string;
  availability: SourceAvailability;
  /** Last attempt. `last_ok_at` is the last one that actually read the advertisement. */
  last_checked_at: string | null;
  last_ok_at: string | null;
};
type Event = { kind: string; payload_json: string | null; created_at: string; actor: string | null };
type Comment = { body: string; created_at: string; name: string };
type Member = { id: string; name: string };

const AVAILABILITY: Record<string, string> = AVAILABILITY_LABEL;
const PRECISION: Record<string, string> = { exact: "(exacta)", approx: "(aproximada)" };
const stageLabel = (s: unknown) => STAGE_LABELS[s as Stage] ?? String(s ?? "?");

function parse(json: string | null): Record<string, unknown> {
  try {
    const v = JSON.parse(json ?? "null");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** One Spanish line per `events` row. */
function describe(kind: string, p: Record<string, unknown>) {
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  switch (kind) {
    case "import":
      return `Guardada${typeof p.portal === "string" ? ` desde ${p.portal}` : ""}`;
    case "duplicate":
      return "Ya estaba guardada (intento repetido)";
    case "price_change":
      return `Precio: ${fmtEur(num(p.from))} → ${fmtEur(num(p.to))}`;
    case "availability_change":
      return availabilityLine(String(p.to), "Este anuncio").replace("Este anuncio: ", "");
    case "facts_change":
      return "Datos del anuncio actualizados";
    case "stage_change":
      return `Etapa: ${stageLabel(p.from)} → ${stageLabel(p.to)}`;
    case "comment":
      return `Comentario: «${String(p.body ?? "").slice(0, 80)}${String(p.body ?? "").length > 80 ? "…" : ""}»`;
    case "rating":
      return "Valoración guardada";
    default:
      return kind;
  }
}

const h2 = "text-[22px] font-medium leading-tight";
const section = "space-y-4 py-8";
const cell = "border-b border-hairline-soft py-2 pr-3 align-top";
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const score = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function PropiedadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const estado = one(sp.estado);
  // The list this home was opened from. Rebuilt through the filter contract before it is used,
  // so a hand-edited value can only ever produce a list URL (F14).
  const desde = one(sp.desde) ?? "";
  const faltan = Number(one(sp.faltan) ?? 0);
  const user = await currentUser();

  // ponytail: one batch, seven statements, no joins to untangle
  const [prop, photos, sources, events, ratings, comments, members] = await db.batch(
    [
      { sql: "SELECT * FROM properties WHERE id = ?", args: [id] },
      { sql: "SELECT id FROM photos WHERE property_id = ? ORDER BY position", args: [id] },
      { sql: "SELECT portal, url_original, via, availability, last_checked_at, last_ok_at FROM sources WHERE property_id = ? ORDER BY first_seen_at", args: [id] },
      {
        sql: "SELECT e.kind, e.payload_json, e.created_at, u.name AS actor FROM events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.property_id = ? ORDER BY e.created_at DESC",
        args: [id],
      },
      { sql: "SELECT user_id, dimension, score FROM ratings WHERE property_id = ?", args: [id] },
      { sql: "SELECT c.body, c.created_at, u.name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.property_id = ? ORDER BY c.created_at", args: [id] },
      "SELECT id, name FROM users ORDER BY created_at",
    ],
    "read",
  );
  const p = prop.rows[0] as unknown as Property | undefined;
  if (!p) notFound();

  const photoIds = photos.rows.map((r) => String(r.id));
  const sourceRows = sources.rows as unknown as Source[];
  const eventRows = (events.rows as unknown as Event[]).map((e) => ({ ...e, payload: parse(e.payload_json) }));
  const priceHistory = eventRows.filter((e) => e.kind === "price_change");
  const ratingRows = ratings.rows as unknown as RatingRow[];
  const commentRows = comments.rows as unknown as Comment[];
  const memberRows = members.rows as unknown as Member[];
  const m = matrix(ratingRows, memberRows.map((u) => u.id), DIMENSIONS);
  const family = familyAverage(ratingRows);
  const perM2 = p.price_eur !== null && p.area_m2 ? fmtEur(Math.round(p.price_eur / p.area_m2)) : null;

  const facts: [string, string][] = [
    ["Superficie", fmtNum(p.area_m2, "m²")],
    ["Habitaciones", fmtNum(p.rooms)],
    ["Baños", fmtNum(p.bathrooms)],
    ["Planta", p.floor ?? SIN_DATOS],
    ["Ascensor", siNo(p.lift)],
    ["Exterior", p.outdoor ?? SIN_DATOS],
    ["Parking", siNo(p.parking)],
    ["Estado", p.condition ?? SIN_DATOS],
    ["Certificado energético", p.energy_rating ?? SIN_DATOS],
    ["Honorarios", fmtEur(p.fees_eur)],
    ["Barrio", p.neighborhood ?? SIN_DATOS],
    ["Dirección", p.address_text ? `${p.address_text} ${PRECISION[p.address_precision] ?? ""}`.trim() : SIN_DATOS],
  ];
  const summary = [p.neighborhood, p.area_m2 !== null && fmtNum(p.area_m2, "m²"), p.rooms !== null && `${p.rooms} hab.`, p.bathrooms !== null && `${p.bathrooms} baños`]
    .filter(Boolean)
    .join(" · ");

  // Photo grid on md+: 1 large + up to 4; fewer photos get a narrower grid.
  const n = photoIds.length;
  const shown = n >= 5 ? 5 : n >= 3 ? 3 : n;
  const gridCols = n >= 5 ? "md:grid-cols-4 md:grid-rows-2" : n >= 3 ? "md:grid-cols-3 md:grid-rows-2" : "md:grid-cols-2 md:grid-rows-1";

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6 lg:px-10">
      <div className="flex items-center justify-between gap-3">
      <Link href={backHref(desde, p.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink transition hover:bg-surface-soft">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Propiedades
      </Link>
        <CompareToggle userId={user.id} id={p.id} label={p.title} />
      </div>
      <CompareTray userId={user.id} visible={[p.id]} />

      {/* What the import just did. A second look at a known advertisement is a refresh, not a
          rejected duplicate, so it says whether anything actually changed. */}
      {estado === "igual" && (
        <p className="mt-4 rounded-lg bg-ok-tint px-4 py-3 text-sm text-ok">Ya la teníamos. Sin cambios en el anuncio.</p>
      )}
      {estado === "actualizada" && (
        <p className="mt-4 rounded-lg bg-ok-tint px-4 py-3 text-sm text-ok">Ya la teníamos. Datos actualizados.</p>
      )}
      {faltan > 0 && (
        <p className="mt-2 rounded-lg bg-accent-tint px-4 py-3 text-sm text-body">
          {faltan === 1 ? "No se pudo guardar 1 foto." : `No se pudieron guardar ${faltan} fotos.`} Vuelve a comprobar el
          anuncio para intentarlo otra vez.
        </p>
      )}

      <header className="mt-4 space-y-1">
        <h1 className="text-[22px] font-medium leading-tight sm:text-[26px]">{p.title}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-body">
          {summary && <span>{summary}</span>}
          <StageChip stage={p.stage} />
          <span className="text-muted">{family !== null ? `★ ${score(family)}` : "Sin valorar"}</span>
        </div>
      </header>

      {photoIds.length > 0 && (
        <section className="mt-5">
          <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 no-scrollbar md:hidden">
            {photoIds.map((pid) => (
              <Cover key={pid} id={pid} className="aspect-[4/3] w-[86vw] shrink-0 snap-center rounded-card" />
            ))}
          </div>
          <div className={`hidden gap-2 overflow-hidden rounded-card md:grid md:h-[420px] ${gridCols}`}>
            {photoIds.slice(0, shown).map((pid, i) => (
              <Cover key={pid} id={pid} className={`h-full w-full ${i === 0 && n >= 3 ? "col-span-2 row-span-2" : ""}`} />
            ))}
          </div>
          {n > shown && (
            <details className="mt-3">
              <summary className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-ink px-4 text-sm font-medium text-ink transition hover:bg-surface-soft">
                Ver todas las fotos ({n})
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                {photoIds.map((pid) => (
                  <Cover key={pid} id={pid} className="aspect-[4/3] w-full rounded-lg" />
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
        {/* Side card: price, stage, your rating. Under the header on phones, sticky right rail on lg. */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:self-start lg:sticky lg:top-28">
          <div className="space-y-5 rounded-card border border-hairline bg-raised p-6 shadow-tier">
            <div>
              <p className="text-[22px] font-semibold leading-tight">{fmtEur(p.price_eur, "Sin precio")}</p>
              <p className="text-sm text-muted">
                {perM2 ? `${perM2}/m²` : SIN_DATOS}
                {family !== null && ` · ★ ${score(family)} en familia`}
              </p>
            </div>
            <StageForm propertyId={p.id} stage={p.stage} version={Number(p.stage_version ?? 0)} />
            <div className="border-t border-hairline-soft pt-5">
              <p className="mb-3 text-sm font-semibold text-ink">Tu valoración</p>
              <RatingForm propertyId={p.id} current={m[user.id]} />
            </div>
          </div>
        </aside>

        <div className="mt-8 divide-y divide-hairline-soft lg:col-start-1 lg:row-start-1 lg:mt-0">
          <section className="space-y-4 pb-8">
            <h2 className={h2}>Datos</h2>
            <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {facts.map(([k, val]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-hairline-soft py-2.5 text-sm">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium text-ink">{val}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={section}>
            <h2 className={h2}>Descripción</h2>
            {p.description ? (
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-body">{p.description}</p>
            ) : (
              <p className="text-sm text-muted">Sin descripción.</p>
            )}
          </section>

          <section className={section}>
            <h2 className={h2}>Fuentes</h2>
            {sourceRows.length === 0 ? (
              <p className="text-sm text-muted">{SIN_DATOS}</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {sourceRows.map((s) => {
                  const check = s.via === "bookmarklet" || s.availability === "unknown";
                  return (
                    <li key={s.url_original} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium capitalize text-ink">{s.portal}</span>
                      {/^https?:\/\//.test(s.url_original) && (
                        <a href={s.url_original} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-4">
                          Ver anuncio
                        </a>
                      )}
                      <span className="text-muted">vía {s.via === "bookmarklet" ? "marcador" : s.via}</span>
                      <Chip tone={s.availability === "active" ? "success" : s.availability === "unknown" ? "warning" : "danger"}>
                        {AVAILABILITY[s.availability] ?? s.availability}
                      </Chip>
                      {s.availability === "active" && isStale(s.last_ok_at, new Date()) && (
                        <Chip tone="warning">Sin comprobar hace más de 48 h</Chip>
                      )}
                      {/* two different facts: when we last tried, and when we last succeeded */}
                      <span className="text-muted">Comprobado: {s.last_checked_at ? fmtDateTime(s.last_checked_at) : "nunca"}</span>
                      <span className="text-muted">Visto bien: {s.last_ok_at ? fmtDateTime(s.last_ok_at) : "nunca"}</span>
                      {check && (
                        <span className="text-warning-ink">
                          <Chip tone="warning">Comprobar</Chip> Abre el anuncio y vuelve a pulsar el marcador.
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={section}>
            <h2 className={h2}>Historial de precio</h2>
            {priceHistory.length === 0 ? (
              <p className="text-sm text-muted">Sin cambios de precio.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {priceHistory.map((e, i) => (
                  <li key={i}>
                    <span className="text-muted">{fmtDate(e.created_at)}:</span> {describe(e.kind, e.payload)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={section}>
            <h2 className={h2}>Valoraciones</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={`${cell} text-left font-medium text-muted`}>Dimensión</th>
                    {memberRows.map((u) => (
                      <th key={u.id} className={`${cell} text-center font-medium ${u.id === user.id ? "text-ink" : "text-muted"}`}>
                        {u.name}
                      </th>
                    ))}
                    <th className={`${cell} text-center font-medium text-muted`}>Media</th>
                  </tr>
                </thead>
                <tbody>
                  {DIMENSIONS.map((dim) => {
                    const dimRows = ratingRows.filter((r) => r.dimension === dim);
                    return (
                      <tr key={dim}>
                        <th scope="row" className={`${cell} text-left font-normal text-body`}>
                          {DIMENSION_LABELS[dim]}
                        </th>
                        {memberRows.map((u) => (
                          <td key={u.id} className={`${cell} text-center`}>
                            {m[u.id][dim] ?? "—"}
                          </td>
                        ))}
                        <td className={`${cell} text-center font-medium`}>{familyAverage(dimRows)?.toLocaleString("es-ES") ?? "—"}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row" className={`${cell} text-left font-medium`}>
                      Media
                    </th>
                    {memberRows.map((u) => (
                      <td key={u.id} className={`${cell} text-center font-medium`}>
                        {memberAverage(ratingRows, u.id)?.toLocaleString("es-ES") ?? "—"}
                      </td>
                    ))}
                    <td className={`${cell} text-center font-semibold`}>{family?.toLocaleString("es-ES") ?? "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className={section}>
            <h2 className={h2}>Comentarios</h2>
            {commentRows.length === 0 ? (
              <p className="text-sm text-muted">Sin comentarios.</p>
            ) : (
              <ul className="space-y-5">
                {commentRows.map((c, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold text-ink" aria-hidden>
                      {initial(c.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm">
                        <span className="font-semibold text-ink">{c.name}</span>
                        <span className="text-muted"> · {fmtDateTime(c.created_at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-body">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <CommentForm propertyId={p.id} />
          </section>

          <section className={section}>
            <h2 className={h2}>Actividad</h2>
            {eventRows.length === 0 ? (
              <p className="text-sm text-muted">Sin actividad.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-hairline pl-5 text-sm">
                {eventRows.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-raised bg-accent" aria-hidden />
                    <div className="text-muted">
                      {fmtDateTime(e.created_at)}
                      {e.actor && ` · ${e.actor}`}
                    </div>
                    <div className="text-body">{describe(e.kind, e.payload)}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
