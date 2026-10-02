import Link from "next/link";
import type { Person } from "@/lib/people";

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const when = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
const score = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * One person in a project: who they are, how much they have said, and the way into the rest.
 *
 * The numbers are counted things, never a score of the person. «3 opiniones» is a fact; a
 * ranking of the family by how much they participate is not something this app should draw.
 *
 * Somebody who has never opened the project has no `users` row and so nothing to open. The row
 * says that rather than offering a link to an empty page.
 */
export function PersonRow({ p, projectId, isMe }: { p: Person; projectId: string; isMe: boolean }) {
  const parts = [
    p.opinions > 0 && `${p.opinions} ${p.opinions === 1 ? "opinión" : "opiniones"}`,
    p.scored > 0 && `${p.scored} ${p.scored === 1 ? "piso puntuado" : "pisos puntuados"}`,
    p.comments > 0 && `${p.comments} ${p.comments === 1 ? "comentario" : "comentarios"}`,
    p.added > 0 && `${p.added} ${p.added === 1 ? "piso añadido" : "pisos añadidos"}`,
  ].filter(Boolean) as string[];

  const body = (
    <>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold text-ink"
        aria-hidden
      >
        {initial(p.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-ink">
            {p.name}
            {isMe && " (tú)"}
          </span>
          {p.role === "owner" && <span className="text-xs text-muted">Quien lo creó</span>}
          {p.avg !== null && <span className="text-sm text-muted">★ {score(p.avg)} de media</span>}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted">
          {parts.length > 0 ? parts.join(" · ") : "Todavía no ha puntuado ni escrito nada"}
        </span>
        {p.lastAt && <span className="mt-0.5 block text-xs text-muted">Lo último, el {when(p.lastAt)}</span>}
      </span>
    </>
  );

  return (
    <li>
      {p.id ? (
        <Link
          href={`/proyectos/${projectId}/persona/${p.id}`}
          className="flex items-center gap-3 rounded-card bg-raised p-4 transition hover:bg-surface-soft"
        >
          {body}
          <span className="shrink-0 text-muted" aria-hidden>
            ›
          </span>
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-card bg-sunken p-4">
          {body}
          {/* Invited, never arrived: there is no page to open, and saying so is the honest row. */}
          <span className="shrink-0 text-xs text-muted">Sin entrar todavía</span>
        </div>
      )}
    </li>
  );
}
