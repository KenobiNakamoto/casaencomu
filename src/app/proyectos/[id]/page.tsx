import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listProjects } from "@/lib/control";
import { hasSpoken, isIn, peopleOf, totalsOf } from "@/lib/people";
import { PersonRow } from "@/components/proyectos/person-row";

export const dynamic = "force-dynamic";

/**
 * One project, read rather than configured.
 *
 * `/proyectos` is the list of searches and the place to rename one or invite somebody. This is
 * the other question: what is this search, and who is looking at it with me. The people are the
 * point of the page — each row is a way into what that person thinks of everything, which no
 * other screen can answer, because the detail page holds one home at a time.
 *
 * It reads the project in the URL, not the one the cookie points at, so following a link from
 * another search shows that search. Everything here is a read: looking at a project must never
 * enrol anybody in it, which is why `currentUser()` is not called inside the project's scope.
 */
export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentUser();
  // The one gate. A project you do not belong to does not exist as far as this page is concerned.
  if (!(await isIn(me.email, id))) notFound();

  const project = (await listProjects()).find((p) => p.id === id);
  if (!project) notFound();

  const people = await peopleOf(id);
  const totals = await totalsOf(id, people.length);
  const spoken = people.filter(hasSpoken);
  const quiet = people.filter((p) => !hasSpoken(p));

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-14">
      <Link href="/proyectos" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
        ← Proyectos
      </Link>

      <h1 className="mt-3 text-[26px] font-medium text-ink">{project.name}</h1>
      {project.purpose && <p className="mt-1 text-body">{project.purpose}</p>}

      <p className="mt-3 text-sm text-muted">
        {count(totals.properties, "piso", "pisos")} · {count(totals.people, "persona", "personas")} ·{" "}
        {count(totals.opinions, "opinión", "opiniones")} · {count(totals.comments, "comentario", "comentarios")}
      </p>

      {project.description && (
        <p className="mt-4 max-w-prose whitespace-pre-line rounded-card bg-sunken p-4 text-sm text-body">
          {project.description}
        </p>
      )}

      <h2 className="mt-10 text-lg font-medium text-ink">Quién busca</h2>
      <p className="mt-1 text-sm text-muted">
        Abre a una persona para ver, piso por piso, qué ha puntuado y qué ha escrito.
      </p>

      <ul className="mt-5 space-y-3">
        {spoken.map((p) => (
          <PersonRow key={p.email} p={p} projectId={id} isMe={p.email === me.email} />
        ))}
      </ul>

      {quiet.length > 0 && (
        <>
          <h3 className="mt-8 text-sm font-semibold text-muted">Todavía no han dicho nada</h3>
          <ul className="mt-3 space-y-3">
            {quiet.map((p) => (
              <PersonRow key={p.email} p={p} projectId={id} isMe={p.email === me.email} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
