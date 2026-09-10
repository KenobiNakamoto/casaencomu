import { currentUser } from "@/lib/auth";
import { membersOf, pendingInvites, projectsOf } from "@/lib/control";
import { currentProjectId } from "@/lib/db";
import { input } from "@/components/propiedades/format";
import { ProjectCard } from "@/components/proyectos/project-card";
import { crearProyectoAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Every search you belong to, one card each, three across on a wide screen.
 *
 * It used to be four stacked sections about whichever project the cookie named, which said that a
 * project is a setting of the app. It is the other way round: the project is the thing, and the
 * app is what you are looking at one of them through. So each one carries its own name, what it is
 * for, and the people in it, and the three dots open all of that for that card alone (#148).
 *
 * The owner is the person who started the project. They can invite and they can remove; everyone
 * else sees the same list and no buttons — the family should know who can read their search
 * without being able to change it (Kenobi, 2026-09-09).
 */
export default async function ProyectosPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const me = await currentUser();
  const projectId = await currentProjectId();
  const mine = await projectsOf(me.email);
  // One control-database query per project, and a family has two or three. The panel has to hold
  // the people and the invitations of the card it belongs to, not of the project you happen to be
  // looking at, so they are all fetched here rather than after a click.
  const detail = await Promise.all(
    mine.map(async (p) => ({
      people: await membersOf(p.id),
      invites: p.role === "owner" ? await pendingInvites(p.id) : [],
    })),
  );
  const base = process.env.PUBLIC_URL || "http://localhost:3000";

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-14">
      <h1 className="text-[22px] font-medium">Proyectos</h1>
      <p className="mt-1 max-w-prose text-body">
        Cada proyecto es una búsqueda aparte, con sus pisos y su gente. Lo que guardes en uno no se ve en el otro.
      </p>

      {e ? (
        <p role="alert" className="mt-4 text-sm text-error">
          {e === "nombre" ? "Ponle un nombre al proyecto." : "No se ha podido hacer."}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map((p, i) => (
          <ProjectCard
            key={p.id}
            p={p}
            people={detail[i].people}
            invites={detail[i].invites}
            here={p.id === projectId}
            myEmail={me.email}
            base={base}
          />
        ))}

        {/* The last card is the empty one, so starting a search is where the searches are. */}
        <li className="flex flex-col justify-center gap-3 rounded-card border border-dashed border-control-border p-5">
          <h2 className="text-lg font-medium text-ink">Empezar otro proyecto</h2>
          <form action={crearProyectoAction} className="space-y-3">
            <input
              type="text"
              name="nombre"
              required
              maxLength={60}
              placeholder="Piso para el verano"
              aria-label="Nombre del proyecto"
              className={input}
            />
            <button
              type="submit"
              className="h-12 w-full rounded-lg bg-ink px-5 text-base font-medium text-canvas transition hover:opacity-90"
            >
              Crear
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
