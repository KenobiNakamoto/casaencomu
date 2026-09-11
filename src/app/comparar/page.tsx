import Link from "next/link";
import { CompareTable, type Prop } from "@/components/comparar/table";
import { currentUser } from "@/lib/auth";
import { NOT_REMOVED_SQL } from "@/lib/availability";
import type { Voice } from "@/lib/compare";
import { db } from "@/lib/db";
import { COVER_SQL } from "@/lib/filters";
import type { RatingRow } from "@/lib/ratings";
import { MAX, MIN, parseIds } from "@/lib/selection";

/** SQLite has no boolean: `blocker` arrives as 0 or 1 and becomes one before the table sees it. */
type VoiceRow = Omit<Voice, "blocker"> & { property_id: string; blocker: number };
type ScoreRow = RatingRow & { property_id: string };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-[22px] font-medium">Comparar</h1>
      <div className="mt-6 rounded-card border border-hairline px-6 py-16 text-center">{children}</div>
    </div>
  );
}

/** The URL is authoritative when it carries identifiers; the tray is how they get there. */
export default async function CompararPage({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  const wanted = parseIds(typeof sp.ids === "string" ? sp.ids : "");

  if (wanted.length < MIN) {
    return (
      <Empty>
        <p className="text-lg font-medium">Elige entre {MIN} y {MAX} propiedades</p>
        <p className="mt-1 text-sm text-muted">
          Marca <strong>Comparar</strong> en dos propiedades de la lista o del mapa. Aparece una barra
          abajo con lo que llevas elegido.
        </p>
        <Link href="/propiedades" className="mt-5 inline-flex h-12 items-center rounded-full btn-primary px-5 text-sm font-semibold">
          Ir a Propiedades
        </Link>
      </Empty>
    );
  }

  const holes = wanted.map(() => "?").join(",");
  // Opinions, scores and sources come whole and are split per property here rather than in six
  // queries: the selection is at most four, so one pass over each is cheaper than four round
  // trips. Only published, un-withdrawn opinions — a draft belongs to its author alone.
  const [props, voices, scores, sources, people] = await db.batch(
    [
      {
        // No family number in SQL here: the table derives every number from `scores`, so the
        // aspect rows and the number above them cannot disagree, and `Ver como` can recompute
        // all of them for one person without a second query (#130, #161).
        sql: `SELECT p.*, ${COVER_SQL} AS cover,
                NOT ${NOT_REMOVED_SQL} AS gone
              FROM properties p WHERE p.id IN (${holes})`,
        args: wanted,
      },
      {
        sql: `SELECT o.property_id, o.user_id, o.stance, o.reasoning, o.blocker, u.name
              FROM opinions o JOIN users u ON u.id = o.user_id
              WHERE o.property_id IN (${holes}) AND o.withdrawn = 0`,
        args: wanted,
      },
      { sql: `SELECT property_id, user_id, dimension, score FROM ratings WHERE property_id IN (${holes})`, args: wanted },
      { sql: `SELECT property_id, portal FROM sources WHERE property_id IN (${holes}) ORDER BY first_seen_at`, args: wanted },
      "SELECT id, name FROM users ORDER BY created_at",
    ],
    "read",
  );
  const rows = props.rows;
  const voiceRows = voices.rows as unknown as VoiceRow[];
  const scoreRows = scores.rows as unknown as ScoreRow[];
  const sourceRows = sources.rows as unknown as { property_id: string; portal: string }[];
  // Every field is copied out by name. A libSQL row is not a plain object, and React refuses to
  // pass one from a server component to a client component — silently in production, and as a
  // console error for every row in development.
  const mine = (id: string) => ({
    voices: voiceRows
      .filter((v) => v.property_id === id)
      .map((v) => ({ user_id: v.user_id, name: v.name, stance: v.stance, reasoning: v.reasoning, blocker: v.blocker !== 0 })),
    scores: scoreRows
      .filter((s) => s.property_id === id)
      .map((s) => ({ user_id: s.user_id, dimension: s.dimension, score: s.score })),
    portals: [...new Set(sourceRows.filter((s) => s.property_id === id).map((s) => String(s.portal)))],
  });
  // The sender's order is the reader's order, so a shared link shows the same columns in the
  // same places.
  const found = (rows as unknown as (Omit<Prop, "gone" | "voices" | "scores" | "portals"> & { gone: number })[])
    .map((p) => ({ ...p, gone: p.gone !== 0, ...mine(p.id) }))
    .sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id));
  const missing = wanted.length - found.length;

  if (found.length < MIN) {
    return (
      <Empty>
        <p className="text-lg font-medium">No encontramos estas propiedades</p>
        <p className="mt-1 text-sm text-muted">
          {missing === wanted.length
            ? "Puede que se hayan borrado, o que el enlace esté incompleto."
            : "Solo queda una, y hacen falta dos para comparar."}
        </p>
        <Link href="/propiedades" className="mt-5 inline-flex h-12 items-center rounded-full btn-primary px-5 text-sm font-semibold">
          Ir a Propiedades
        </Link>
      </Empty>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 pb-32 sm:px-6 lg:px-10">
      <h1 className="text-[22px] font-medium">
        Comparar {found.length} {found.length === 1 ? "propiedad" : "propiedades"}
      </h1>
      <p className="mt-1 text-sm text-muted">Las filas en las que difieren van resaltadas.</p>
      {/* Never a heading that claims four over three columns: say what is missing instead. */}
      {missing > 0 && (
        <p className="mt-4 rounded-lg bg-accent-tint px-4 py-3 text-sm text-error" role="status">
          {missing === 1 ? "Una de las propiedades del enlace ya no existe." : `${missing} propiedades del enlace ya no existen.`}{" "}
          Comparamos las {found.length} que quedan.
        </p>
      )}
      <CompareTable
        props={found}
        people={people.rows.map((u) => ({ id: String(u.id), name: String(u.name) }))}
        readerId={user.id}
      />
    </div>
  );
}
