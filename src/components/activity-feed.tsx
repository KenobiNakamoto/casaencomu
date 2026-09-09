import Link from "next/link";
import { availabilityLine } from "@/lib/availability";
import { db } from "@/lib/db";
import { STAGE_LABELS } from "@/lib/listing";
import { ago } from "./propiedades/format";

type Row = {
  id: string;
  property_id: string;
  kind: string;
  payload_json: string | null;
  actor_id: string | null;
  created_at: string;
  title: string | null;
  actor: string | null;
};

const eur = (n: unknown) => (typeof n === "number" ? `${n.toLocaleString("es-ES")} €` : "—");
const stage = (s: unknown) => (STAGE_LABELS as Record<string, string>)[String(s)] ?? String(s ?? "—");

function line(e: Row) {
  const who = e.actor ?? "Alguien";
  const t = `«${e.title ?? "sin título"}»`;
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(e.payload_json ?? "{}") ?? {};
  } catch {
    // ponytail: unreadable payload → the line still renders, without the detail
  }
  switch (e.kind) {
    case "import":
      return `${who} añadió ${t}`;
    case "completed":
      // The advertisement was saved before anything could be read from it. Now it has been.
      return `Ya se ha leído el anuncio de ${t}`;
    case "duplicate":
      return `${who} volvió a guardar ${t}`;
    case "price_change":
      return `Precio de ${t}: ${eur(p.from)} → ${eur(p.to)}`;
    case "availability_change":
      // F04: this said "ya no está disponible" for every one of them, the `unknown` warnings
      // included, which is the opposite of what an unknown outcome means.
      return availabilityLine(String(p.to ?? ""), t);
    case "facts_change":
      return `Datos actualizados en ${t}`;
    case "enriched": {
      // Never "Datos actualizados": the advertisement did not change, our reading of it did.
      const n = (Array.isArray(p.read) ? p.read.length : 0) + (Array.isArray(p.inferred) ? p.inferred.length : 0);
      return `Se completaron ${n} dato${n === 1 ? "" : "s"} de ${t}`;
    }
    case "stage_change":
      return `${who} pasó ${t} a ${stage(p.to)}`;
    case "comment":
      return `${who} comentó en ${t}`;
    case "rating":
      return `${who} puntuó ${t}`;
    default:
      return `${who}: ${e.kind} en ${t}`;
  }
}

const initial = (name: string | null) => (name ?? "?").trim().charAt(0).toUpperCase() || "?";

/**
 * Everything that happened in this project, newest first. It is one component because it is shown
 * in two places: the «Actividad» tab of the bell menu, and the page behind «Ver todo».
 */
export default async function ActivityFeed({
  userId,
  since,
  limit = 200,
}: {
  userId: string;
  since: string | null;
  limit?: number;
}) {
  const { rows } = await db.execute({
    sql: `SELECT e.id, e.property_id, e.kind, e.payload_json, e.actor_id, e.created_at,
                 p.title, u.name AS actor
            FROM events e
            LEFT JOIN properties p ON p.id = e.property_id
            LEFT JOIN users u ON u.id = e.actor_id
           ORDER BY e.created_at DESC LIMIT ?`,
    args: [limit],
  });
  const events = rows as unknown as Row[];

  if (events.length === 0) return <p className="px-3 py-6 text-muted">Todavía no hay actividad.</p>;

  return (
    <ol className="divide-y divide-hairline-soft">
      {events.map((e) => {
        const isNew = !!since && e.created_at > since && e.actor_id !== userId;
        return (
          <li key={e.id}>
            <Link
              href={`/propiedades/${e.property_id}`}
              className="flex min-h-11 items-start gap-3 rounded-lg px-3 py-3 transition hover:bg-surface-soft"
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  e.actor ? "bg-surface-strong text-ink" : "bg-accent-tint text-accent"
                }`}
                aria-hidden
              >
                {e.actor ? initial(e.actor) : "↻"}
              </span>
              <span className="flex-1 text-[15px] leading-snug">
                {isNew && (
                  <span className="mr-2 inline-block rounded-full bg-action px-2 py-0.5 align-middle text-[11px] font-semibold text-on-action">
                    nuevo
                  </span>
                )}
                {line(e)}
              </span>
              <time dateTime={e.created_at} className="shrink-0 pt-0.5 text-sm text-muted">
                {ago(e.created_at)}
              </time>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
