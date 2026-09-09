import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, StageChip } from "@/components/propiedades/chip";
import { fmtDate, fmtDateTime, fmtEur, fmtNum, SIN_DATOS, siNo } from "@/components/propiedades/format";
import { Gallery } from "@/components/propiedades/gallery";
import { LocationMap } from "@/components/propiedades/location-map";
import { OpinionForm } from "@/components/propiedades/opinion-form";
import { PendingPoll } from "@/components/propiedades/pending-poll";
import { availabilityLine, AVAILABILITY_LABEL, isStale, propertyAvailability, type SourceAvailability } from "@/lib/availability";
import { CompareToggle, CompareTray } from "@/components/comparar/controls";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { backHref } from "@/lib/filters";
import { DIMENSION_LABELS, DIMENSIONS, STAGE_LABELS, type Stage } from "@/lib/listing";
import { markReviewed } from "@/lib/notifications";
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
  lat: number | null;
  lng: number | null;
  neighborhood: string | null;
  created_at: string;
  /** 0 while nothing has been read from the advertisement: the title is a placeholder. */
  filled: number;
};
type Source = {
  portal: string;
  url_original: string;
  via: string;
  availability: SourceAvailability;
  /** Last attempt. `last_ok_at` is the last one that actually read the advertisement. */
  last_checked_at: string | null;
  last_ok_at: string | null;
  last_check_outcome: string | null;
  /** Which layer produced each field: the portal, the AI reading the page, the AI deducing it. */
  field_origin_json: string | null;
};
type Event = { kind: string; payload_json: string | null; created_at: string; actor: string | null };
type Comment = { body: string; created_at: string; name: string };
type Member = { id: string; name: string };
type MyRating = RatingRow & { updated_at: string };

const AVAILABILITY: Record<string, string> = AVAILABILITY_LABEL;
const PRECISION: Record<string, string> = { exact: "(exacta)", approx: "(aproximada)" };

/**
 * The link is saved and the record exists; this says why it is still empty. Written after the
 * fact, on the page, so it survives a reload — the message under the add field is gone by then.
 */
const PENDING: Record<string, string> = {
  blocked:
    "Este portal no deja leer el anuncio desde el servidor. Se leerá en un navegador; si tarda, ábrelo tú y pulsa el marcador.",
  offline: "No se pudo descargar la página. Se volverá a intentar.",
  offsite: "El enlace lleva fuera del portal, así que no se pudo leer. Ábrelo y pulsa el marcador.",
  unreadable: "No se pudo leer la página. Se volverá a intentar.",
  removed: "El anuncio ya no está publicado, así que no hay datos que leer. El enlace queda guardado.",
  default: "Todavía no se ha leído este anuncio. El enlace está guardado.",
};
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
    case "enriched": {
      // Never "Datos actualizados": the advertisement did not change, our reading of it did.
      const n = (Array.isArray(p.read) ? p.read.length : 0) + (Array.isArray(p.inferred) ? p.inferred.length : 0);
      return `Se completaron ${n} dato${n === 1 ? "" : "s"} que faltaban`;
    }
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
const band = "mt-12";
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
      { sql: "SELECT portal, url_original, via, availability, last_checked_at, last_ok_at, last_check_outcome, field_origin_json FROM sources WHERE property_id = ? ORDER BY first_seen_at", args: [id] },
      {
        sql: "SELECT e.kind, e.payload_json, e.created_at, u.name AS actor FROM events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.property_id = ? ORDER BY e.created_at DESC",
        args: [id],
      },
      { sql: "SELECT user_id, dimension, score, updated_at FROM ratings WHERE property_id = ?", args: [id] },
      { sql: "SELECT c.body, c.created_at, u.name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.property_id = ? ORDER BY c.created_at", args: [id] },
      "SELECT id, name FROM users ORDER BY created_at",
    ],
    "read",
  );
  const p = prop.rows[0] as unknown as Property | undefined;
  if (!p) notFound();

  // Opening it is reviewing it: this is what takes the home off «Por revisar» for this person.
  // After `notFound()`, so a link to something that is gone never counts as having looked at it.
  await markReviewed(user.id, p.id);

  const photoIds = photos.rows.map((r) => String(r.id));
  const sourceRows = sources.rows as unknown as Source[];
  const eventRows = (events.rows as unknown as Event[]).map((e) => ({ ...e, payload: parse(e.payload_json) }));
  const priceHistory = eventRows.filter((e) => e.kind === "price_change");
  const ratingRows = ratings.rows as unknown as MyRating[];
  const commentRows = comments.rows as unknown as Comment[];
  const memberRows = members.rows as unknown as Member[];
  const m = matrix(ratingRows, memberRows.map((u) => u.id), DIMENSIONS);
  const family = familyAverage(ratingRows);
  const perM2 = p.price_eur !== null && p.area_m2 ? fmtEur(Math.round(p.price_eur / p.area_m2)) : null;

  // The state column of the opinion box: what the advertisement is doing, and when each of us
  // last said something here.
  const availability = propertyAvailability(sourceRows);
  const lastChecked = sourceRows.map((s) => s.last_ok_at).filter(Boolean).sort().at(-1) ?? null;
  const mineAt = ratingRows.filter((r) => r.user_id === user.id).map((r) => r.updated_at).sort().at(-1) ?? null;
  const voices = new Set([...ratingRows.map((r) => r.user_id)]).size;

  const facts: [string, string, string][] = [
    ["Superficie", fmtNum(p.area_m2, "m²"), "area_m2"],
    ["Habitaciones", fmtNum(p.rooms), "rooms"],
    ["Baños", fmtNum(p.bathrooms), "bathrooms"],
    ["Planta", p.floor ?? SIN_DATOS, "floor"],
    ["Ascensor", siNo(p.lift), "lift"],
    ["Exterior", p.outdoor ?? SIN_DATOS, "outdoor"],
    ["Parking", siNo(p.parking), "parking"],
    ["Estado", p.condition ?? SIN_DATOS, "condition"],
    ["Certificado energético", p.energy_rating ?? SIN_DATOS, "energy_rating"],
    ["Honorarios", fmtEur(p.fees_eur), "fees_eur"],
    ["Barrio", p.neighborhood ?? SIN_DATOS, "neighborhood"],
    ["Dirección", p.address_text ? `${p.address_text} ${PRECISION[p.address_precision] ?? ""}`.trim() : SIN_DATOS, "address_text"],
  ];
  // A deduced value is not a fact the advertisement states, and the two must never look alike.
  // Only layer 3 is marked: layer 2 copies words that are on the page, which the portal's own
  // extractor simply failed to find.
  const origin: Record<string, string> = Object.assign({}, ...sourceRows.map((s) => parse(s.field_origin_json)));
  const deduced = (key: string) => origin[key] === "ai_inferred";
  const summary = [p.neighborhood, p.area_m2 !== null && fmtNum(p.area_m2, "m²"), p.rooms !== null && `${p.rooms} hab.`, p.bathrooms !== null && `${p.bathrooms} baños`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
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

      {!p.filled && (
        <div className="mt-4 rounded-lg bg-accent-tint px-4 py-3 text-sm text-body">
          <p>{PENDING[sourceRows[0]?.last_check_outcome ?? ""] ?? PENDING.default}</p>
          {sourceRows[0]?.last_check_outcome !== "removed" && <PendingPoll />}
        </div>
      )}

      {/* The price sits with the title, where a person looks for it, and not in a card halfway
          down the page (PIP-07). */}
      <header className="mt-4 space-y-1">
        <h1 className="text-[22px] font-medium leading-tight sm:text-[26px]">{p.title}</h1>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-[22px] font-semibold leading-tight text-ink">{fmtEur(p.price_eur, "Sin precio")}</p>
          {perM2 && <p className="text-sm text-muted">{perM2}/m²</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-body">
          {summary && <span>{summary}</span>}
          <StageChip stage={p.stage} />
          <span className="text-muted">{family !== null ? `★ ${score(family)} en familia` : "Sin valorar"}</span>
        </div>
      </header>

      {photoIds.length > 0 && <Gallery ids={photoIds} title={p.title} />}

      {/* ---- band 1: the advertisement's own words, and the facts beside them ---- */}
      <section className={`${band} grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12`}>
        <div>
          <h2 className={h2}>Descripción</h2>
          {p.description ? (
            <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-body">{p.description}</p>
          ) : (
            <p className="mt-4 text-sm text-muted">Sin descripción.</p>
          )}
        </div>
        <aside className="lg:col-start-2 lg:row-start-1">
          <div className="bento">
            <h2 className="mb-2 text-sm font-semibold text-ink">Datos</h2>
            <dl>
              {facts.map(([k, val, key]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-hairline-soft py-2.5 text-sm last:border-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium text-ink">
                    {val}
                    {deduced(key) && <span className="ml-1.5 text-[11px] font-normal text-muted">deducido</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {facts.some(([, , key]) => deduced(key)) && (
              <p className="mt-3 text-xs text-muted">
                «deducido» lo ha completado la IA a partir del texto o de las fotos. El anuncio no lo dice.
              </p>
            )}
          </div>
        </aside>
      </section>

      {/* ---- band 2: one box, one button ---- */}
      <section className={band}>
        <h2 className={h2}>Tu opinión</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Las respuestas, el comentario y la etapa se guardan a la vez, con el botón de abajo.
        </p>
        <OpinionForm propertyId={p.id} current={m[user.id]} stage={p.stage} version={Number(p.stage_version ?? 0)}>
          <dl className="space-y-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-muted">Anuncio</dt>
              <dd>
                <Chip tone={availability === "active" ? "success" : availability === "unknown" ? "warning" : "danger"}>
                  {AVAILABILITY[availability] ?? availability}
                </Chip>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Comprobado</dt>
              <dd className="text-body">{lastChecked ? fmtDateTime(lastChecked) : "Nunca"}</dd>
            </div>
            <div>
              <dt className="text-muted">Tus respuestas</dt>
              <dd className="text-body">{mineAt ? fmtDate(mineAt) : "Todavía no has valorado"}</dd>
            </div>
            <div>
              <dt className="text-muted">La familia</dt>
              <dd className="text-body">
                {voices === 0 ? "Nadie ha valorado" : voices === 1 ? "1 persona ha valorado" : `${voices} personas han valorado`}
                {` · ${commentRows.length} ${commentRows.length === 1 ? "comentario" : "comentarios"}`}
              </dd>
            </div>
          </dl>
        </OpinionForm>
      </section>

      {/* ---- band 3: the table, and the conversation beside it ---- */}
      <section className={band}>
        <h2 className={h2}>Lo que opina la familia</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="bento overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={`${cell} text-left font-medium text-muted`}>Aspecto</th>
                  {memberRows.map((u) => (
                    <th key={u.id} className={`${cell} text-center font-medium ${u.id === user.id ? "text-ink" : "text-muted"}`}>
                      {u.id === user.id ? "Tú" : u.name}
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

          <div className="bento flex flex-col">
            <p className="mb-3 text-sm font-semibold text-ink">Comentarios</p>
            {commentRows.length === 0 ? (
              <p className="text-sm text-muted">
                Todavía no hay comentarios. El tuyo se escribe arriba, junto a tus respuestas.
              </p>
            ) : (
              // Newest first in the markup and `column-reverse` on the list: the newest comment
              // sits at the foot, and the pane opens scrolled to it — where a conversation is read
              // from. A column-reverse scroller starts at its own start, which is the bottom, so
              // this costs no JavaScript. It is not stretched to the band: a stretched
              // column-reverse list packs two comments against the floor and leaves a hole.
              <ul className="flex max-h-[520px] flex-col-reverse gap-4 overflow-y-auto">
                {[...commentRows].reverse().map((c, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold text-ink" aria-hidden>
                      {initial(c.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px]">
                        <span className="font-semibold text-ink">{c.name}</span>
                        <span className="text-muted"> · {fmtDateTime(c.created_at)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-body">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>

    {/* ---- band 4: where it is, at the full width of the window and much wider than it is tall.
        It sits outside the container rather than breaking out of it with a viewport width, which
        would add a horizontal scrollbar of exactly the vertical scrollbar's width. ---- */}
    <section className="mt-12 border-t border-hairline-soft">
      <div className="mx-auto max-w-[1120px] px-4 pb-3 pt-8 sm:px-6 lg:px-10">
        <h2 className={h2}>Dónde está</h2>
        <p className="mt-1 text-sm text-muted">
          {p.address_text ?? p.neighborhood ?? "Sin dirección en el anuncio"}
          {p.address_precision === "approx" && " · ubicación aproximada: la zona, no el portal"}
          {p.address_precision === "exact" && " · ubicación exacta"}
        </p>
      </div>
      {p.lat !== null && p.lng !== null && p.address_precision !== "none" ? (
        <div className="location-strip">
          <LocationMap lat={p.lat} lng={p.lng} precision={p.address_precision === "exact" ? "exact" : "approx"} />
        </div>
      ) : (
        <div className="mx-auto max-w-[1120px] px-4 pb-10 sm:px-6 lg:px-10">
          <p className="rounded-card bg-sunken px-4 py-6 text-sm text-muted">
            El anuncio no da coordenadas, así que no se puede situar en el mapa.
          </p>
        </div>
      )}
    </section>

    {/* ---- the record of the advertisement. Not an opinion, so it reads last. ---- */}
    <div className="mx-auto max-w-[1120px] divide-y divide-hairline-soft px-4 pb-14 sm:px-6 lg:px-10">
      <section className="space-y-4 py-8">
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

      <section className="space-y-4 py-8">
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

      <section className="space-y-4 py-8">
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
    </>
  );
}
