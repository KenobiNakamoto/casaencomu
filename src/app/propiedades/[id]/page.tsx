import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/propiedades/card";
import { Chip, StageChip } from "@/components/propiedades/chip";
import { fmtDate, fmtDateTime, fmtEur, fmtNum, SIN_DATOS, siNo } from "@/components/propiedades/format";
import { RatingForm } from "@/components/propiedades/rating-form";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DIMENSION_LABELS, DIMENSIONS, STAGE_LABELS, STAGES, type Stage } from "@/lib/listing";
import { familyAverage, matrix, memberAverage, type RatingRow } from "@/lib/ratings";
import { commentAction, setStageAction } from "../actions";

type Property = {
  id: string;
  title: string;
  stage: string;
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
type Source = { portal: string; url_original: string; via: string; availability: string; last_checked_at: string | null };
type Event = { kind: string; payload_json: string | null; created_at: string; actor: string | null };
type Comment = { body: string; created_at: string; name: string };
type Member = { id: string; name: string };

const AVAILABILITY: Record<string, string> = { active: "Activo", unknown: "Desconocido", gone: "No disponible", removed: "No disponible" };
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
      return `Disponibilidad: ${AVAILABILITY[String(p.from)] ?? p.from} → ${AVAILABILITY[String(p.to)] ?? p.to}`;
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

const h2 = "text-lg font-semibold";
const section = "space-y-3";
const button = "h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white";
const cell = "border-b border-zinc-100 py-1.5 pr-3 align-top";

export default async function PropiedadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await currentUser();

  // ponytail: one batch, seven statements, no joins to untangle
  const [prop, photos, sources, events, ratings, comments, members] = await db.batch(
    [
      { sql: "SELECT * FROM properties WHERE id = ?", args: [id] },
      { sql: "SELECT id FROM photos WHERE property_id = ? ORDER BY position", args: [id] },
      { sql: "SELECT portal, url_original, via, availability, last_checked_at FROM sources WHERE property_id = ? ORDER BY first_seen_at", args: [id] },
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

  const facts: [string, string][] = [
    ["Precio", fmtEur(p.price_eur)],
    ["Honorarios", fmtEur(p.fees_eur)],
    ["€/m²", p.price_eur !== null && p.area_m2 ? `${fmtEur(Math.round(p.price_eur / p.area_m2))}/m²` : SIN_DATOS],
    ["Superficie", fmtNum(p.area_m2, "m²")],
    ["Habitaciones", fmtNum(p.rooms)],
    ["Baños", fmtNum(p.bathrooms)],
    ["Planta", p.floor ?? SIN_DATOS],
    ["Ascensor", siNo(p.lift)],
    ["Exterior", p.outdoor ?? SIN_DATOS],
    ["Parking", siNo(p.parking)],
    ["Estado", p.condition ?? SIN_DATOS],
    ["Certificado energético", p.energy_rating ?? SIN_DATOS],
    ["Barrio", p.neighborhood ?? SIN_DATOS],
    ["Dirección", p.address_text ? `${p.address_text} ${PRECISION[p.address_precision] ?? ""}`.trim() : SIN_DATOS],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <Link href="/propiedades" className="text-sm text-zinc-600 underline">
        ← Propiedades
      </Link>

      {(Array.isArray(sp.dup) ? sp.dup[0] : sp.dup) === "1" && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Ya estaba guardada.</p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold leading-tight">{p.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-zinc-600">
            <span className="text-xl font-semibold text-zinc-900">{fmtEur(p.price_eur, "Sin precio")}</span>
            {p.neighborhood && <span>· {p.neighborhood}</span>}
            <StageChip stage={p.stage} />
            <span>· {family !== null ? `★ ${family.toLocaleString("es-ES")}` : "Sin valorar"}</span>
          </div>
        </div>
        <form action={setStageAction.bind(null, p.id)} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Etapa
            {/* key: React resets the form after the action but never re-applies a changed defaultValue on a <select> */}
            <select key={p.stage} name="etapa" defaultValue={p.stage} className="h-11 rounded-md border border-zinc-300 px-2 text-sm text-zinc-900">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={button}>
            Cambiar
          </button>
        </form>
      </header>

      <section className={section}>
        {photoIds.length === 0 ? (
          <p className="text-sm text-zinc-600">Sin fotos.</p>
        ) : (
          <div className="flex snap-x gap-2 overflow-x-auto pb-2">
            {photoIds.map((pid) => (
              <Cover key={pid} id={pid} className="h-56 w-auto shrink-0 snap-start rounded-md sm:h-72" />
            ))}
          </div>
        )}
      </section>

      <section className={section}>
        <h2 className={h2}>Datos</h2>
        <table className="w-full text-sm">
          <tbody>
            {facts.map(([k, val]) => (
              <tr key={k}>
                <th scope="row" className={`${cell} w-44 text-left font-medium text-zinc-600`}>
                  {k}
                </th>
                <td className={cell}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={section}>
        <h2 className={h2}>Fuentes</h2>
        {sourceRows.length === 0 ? (
          <p className="text-sm text-zinc-600">{SIN_DATOS}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {sourceRows.map((s) => {
              const check = s.via === "bookmarklet" || s.availability === "unknown";
              return (
                <li key={s.url_original} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium capitalize">{s.portal}</span>
                  {/^https?:\/\//.test(s.url_original) && (
                    <a href={s.url_original} target="_blank" rel="noopener noreferrer" className="underline">
                      Ver anuncio
                    </a>
                  )}
                  <span className="text-zinc-600">vía {s.via === "bookmarklet" ? "marcador" : s.via}</span>
                  <Chip tone={s.availability === "active" ? "green" : s.availability === "unknown" ? "amber" : "red"}>
                    {AVAILABILITY[s.availability] ?? s.availability}
                  </Chip>
                  <span className="text-zinc-600">Comprobado: {s.last_checked_at ? fmtDateTime(s.last_checked_at) : "nunca"}</span>
                  {check && (
                    <span className="text-amber-800">
                      <Chip tone="amber">Comprobar</Chip> Abre el anuncio y vuelve a pulsar el marcador.
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={section}>
        <h2 className={h2}>Descripción</h2>
        {p.description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">{p.description}</p>
        ) : (
          <p className="text-sm text-zinc-600">Sin descripción.</p>
        )}
      </section>

      <section className={section}>
        <h2 className={h2}>Historial de precio</h2>
        {priceHistory.length === 0 ? (
          <p className="text-sm text-zinc-600">Sin cambios de precio.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {priceHistory.map((e, i) => (
              <li key={i}>
                <span className="text-zinc-600">{fmtDate(e.created_at)}:</span> {describe(e.kind, e.payload)}
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
                <th className={`${cell} text-left font-medium text-zinc-600`}>Dimensión</th>
                {memberRows.map((u) => (
                  <th key={u.id} className={`${cell} text-center font-medium ${u.id === user.id ? "text-zinc-900" : "text-zinc-600"}`}>
                    {u.name}
                  </th>
                ))}
                <th className={`${cell} text-center font-medium text-zinc-600`}>Media</th>
              </tr>
            </thead>
            <tbody>
              {DIMENSIONS.map((dim) => {
                const dimRows = ratingRows.filter((r) => r.dimension === dim);
                return (
                  <tr key={dim}>
                    <th scope="row" className={`${cell} text-left font-normal`}>
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
        <h3 className="pt-2 font-medium">Tu valoración</h3>
        <RatingForm propertyId={p.id} current={m[user.id]} />
      </section>

      <section className={section}>
        <h2 className={h2}>Comentarios</h2>
        {commentRows.length === 0 ? (
          <p className="text-sm text-zinc-600">Sin comentarios.</p>
        ) : (
          <ul className="space-y-3">
            {commentRows.map((c, i) => (
              <li key={i} className="rounded-md bg-zinc-50 p-3 text-sm">
                <div className="mb-1 text-xs text-zinc-600">
                  <span className="font-medium text-zinc-900">{c.name}</span> · {fmtDateTime(c.created_at)}
                </div>
                <p className="whitespace-pre-line">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form action={commentAction.bind(null, p.id)} className="space-y-2">
          <textarea
            name="body"
            required
            rows={3}
            maxLength={4000}
            placeholder="Escribe un comentario…"
            className="w-full rounded-md border border-zinc-300 p-2 text-sm"
          />
          <button type="submit" className={button}>
            Comentar
          </button>
        </form>
      </section>

      <section className={section}>
        <h2 className={h2}>Actividad</h2>
        {eventRows.length === 0 ? (
          <p className="text-sm text-zinc-600">Sin actividad.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {eventRows.map((e, i) => (
              <li key={i}>
                <span className="text-zinc-600">{fmtDateTime(e.created_at)}</span> · {describe(e.kind, e.payload)}
                {e.actor && <span className="text-zinc-600"> · {e.actor}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
