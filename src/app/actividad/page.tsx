import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { STAGE_LABELS } from "@/lib/listing";

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
    case "duplicate":
      return `${who} volvió a guardar ${t}`;
    case "price_change":
      return `Precio de ${t}: ${eur(p.from)} → ${eur(p.to)}`;
    case "availability_change":
      return `${t} ya no está disponible`;
    case "facts_change":
      return `Datos actualizados en ${t}`;
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

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "ahora mismo";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ayer";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

const initial = (name: string | null) => (name ?? "?").trim().charAt(0).toUpperCase() || "?";

export default async function ActividadPage() {
  const user = await currentUser();
  const since = user.last_seen_at; // last time this member opened Actividad (null = never)

  const { rows } = await db.execute(
    `SELECT e.id, e.property_id, e.kind, e.payload_json, e.actor_id, e.created_at,
            p.title, u.name AS actor
       FROM events e
       LEFT JOIN properties p ON p.id = e.property_id
       LEFT JOIN users u ON u.id = e.actor_id
      ORDER BY e.created_at DESC LIMIT 200`,
  );
  const events = rows as unknown as Row[];

  // Only this page writes last_seen_at (currentUser() does not touch it).
  await db.execute({
    sql: "UPDATE users SET last_seen_at = ? WHERE id = ?",
    args: [new Date().toISOString(), user.id],
  });

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] font-medium">Actividad</h1>
      {events.length === 0 ? (
        <p className="mt-4 text-muted">Todavía no hay actividad.</p>
      ) : (
        <ol className="mt-4 divide-y divide-hairline-soft">
          {events.map((e) => {
            const isNew = !!since && e.created_at > since && e.actor_id !== user.id;
            return (
              <li key={e.id}>
                <Link
                  href={`/propiedades/${e.property_id}`}
                  className="-mx-3 flex min-h-11 items-start gap-3 rounded-lg px-3 py-3 transition hover:bg-surface-soft"
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      e.actor ? "bg-surface-strong text-ink" : "bg-rausch-tint text-rausch"
                    }`}
                    aria-hidden
                  >
                    {e.actor ? initial(e.actor) : "↻"}
                  </span>
                  <span className="flex-1 text-[15px] leading-snug">
                    {isNew && (
                      <span className="mr-2 inline-block rounded-full bg-rausch px-2 py-0.5 align-middle text-[11px] font-semibold text-white">
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
      )}
    </section>
  );
}
