import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryRow } from "@/components/proyectos/entry-row";
import { fmtEur } from "@/components/propiedades/format";
import { currentUser } from "@/lib/auth";
import { listProjects } from "@/lib/control";
import { isIn, ledgerOf, personIn, said } from "@/lib/people";

export const dynamic = "force-dynamic";

/**
 * One person, every home, in one column each.
 *
 * The detail page answers «what does the family think of this home». Nobody could ask the
 * question the other way round — «what does this person think of everything» — and that is the
 * one a family actually asks out loud before it decides anything.
 *
 * Every home stays on the list, including the ones they never opened: silence about a home is
 * worth reading. The ones they touched come first, so the page does not open on empty rows.
 */
export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string; personaId: string }>;
}) {
  const { id, personaId } = await params;
  const me = await currentUser();
  if (!(await isIn(me.email, id))) notFound();

  const project = (await listProjects()).find((p) => p.id === id);
  const person = await personIn(id, personaId);
  if (!project || !person) notFound();

  const entries = await ledgerOf(id, personaId);
  const spoke = entries.filter(said);
  const quiet = entries.filter((e) => !said(e));
  const isMe = person.email === me.email;

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-14">
      <Link
        href={`/proyectos/${id}`}
        className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        ← {project.name}
      </Link>

      <h1 className="mt-3 text-[26px] font-medium text-ink">
        {isMe ? "Lo que has dicho tú" : `Lo que opina ${person.name}`}
      </h1>
      <p className="mt-1 text-body">
        {spoke.length === 0
          ? isMe
            ? "Todavía no has dicho nada de ningún piso."
            : `${person.name} todavía no ha dicho nada de ningún piso.`
          : `Ha dejado algo en ${spoke.length} de ${entries.length} ${entries.length === 1 ? "piso" : "pisos"}.`}
      </p>

      {entries.length === 0 ? (
        <p className="mt-8 rounded-card bg-sunken p-6 text-sm text-muted">
          Este proyecto todavía no tiene pisos guardados.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {spoke.map((e) => (
            <EntryRow key={e.propertyId} e={e} who={isMe ? "Tú" : person.name} />
          ))}
        </ul>
      )}

      {/* The rest, behind a fold the browser opens on its own. They belong on the page — silence
          about a home is worth knowing — but twenty empty rows must not bury the one opinion.
          ponytail: a native <details>, no client component. */}
      {quiet.length > 0 && (
        <details className="mt-8">
          <summary className="touch-target cursor-pointer text-sm font-medium text-body hover:text-ink">
            {quiet.length} {quiet.length === 1 ? "piso del que no ha dicho nada" : "pisos de los que no ha dicho nada"}
          </summary>
          <ul className="mt-3 space-y-1">
            {quiet.map((e) => (
              <li key={e.propertyId}>
                <Link
                  href={`/propiedades/${e.propertyId}`}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-3 py-2 text-sm transition hover:bg-surface-soft"
                >
                  <span className="min-w-0 flex-1 truncate text-body">{e.title}</span>
                  <span className="text-muted">{fmtEur(e.price_eur, "Sin precio")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
