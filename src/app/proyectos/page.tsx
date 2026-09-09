import { currentUser } from "@/lib/auth";
import { membersOf, pendingInvites, projectsOf, roleOf } from "@/lib/control";
import { currentProjectId } from "@/lib/db";
import { input } from "@/components/propiedades/format";
import { cambiarProyectoAction, crearProyectoAction, expulsarAction, invitarAction, revocarAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISO: Record<string, string> = {
  member: "Esa persona ya está en el proyecto.",
  invalid: "Esa dirección de correo no es válida.",
  nombre: "Ponle un nombre al proyecto.",
};

const h2 = "text-lg font-medium";
const btn = "h-12 shrink-0 rounded-lg bg-ink px-5 text-base font-medium text-canvas transition hover:opacity-90";
const btnQuiet =
  "h-9 shrink-0 rounded-lg border border-control-border px-3 text-sm font-medium text-body transition hover:text-ink";

/**
 * Who is in this project, who else you belong to, and the invitations you have sent.
 *
 * The owner is the person who started the project. They can invite and they can remove; everyone
 * else sees the same list and no buttons — the family should know who can read their search
 * without being able to change it (Kenobi, 2026-09-09).
 */
export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; nuevo?: string }>;
}) {
  const { e, nuevo } = await searchParams;
  const me = await currentUser();
  const projectId = await currentProjectId();
  const [mine, people, role] = await Promise.all([
    projectsOf(me.email),
    membersOf(projectId),
    roleOf(me.email, projectId),
  ]);
  const here = mine.find((p) => p.id === projectId);
  const owner = role === "owner";
  const invites = owner ? await pendingInvites(projectId) : [];
  const base = process.env.PUBLIC_URL || "http://localhost:3000";
  const isMe = (email: string) => email.toLowerCase() === me.email.toLowerCase();

  return (
    <div className="mx-auto max-w-2xl divide-y divide-hairline-soft px-4 py-6 sm:px-6">
      <h1 className="pb-6 text-[22px] font-medium">Proyectos</h1>

      {e ? (
        <p role="alert" className="pb-4 text-sm text-error">
          {AVISO[e] ?? "No se ha podido hacer."}
        </p>
      ) : null}

      <section className="space-y-4 py-8">
        <h2 className={h2}>Quién está en «{here?.name ?? "este proyecto"}»</h2>
        <ul className="divide-y divide-hairline-soft">
          {people.map((p) => (
            <li key={p.email} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-body">
                {p.email}
                {isMe(p.email) ? <span className="text-muted"> · tú</span> : null}
              </span>
              <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-xs text-muted">
                {p.role === "owner" ? "Propietario" : "Miembro"}
              </span>
              {owner && p.role === "member" ? (
                <form action={expulsarAction}>
                  <input type="hidden" name="correo" value={p.email} readOnly />
                  <button type="submit" className={btnQuiet}>
                    Quitar
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {owner ? null : (
          <p className="text-sm text-muted">
            Solo el propietario del proyecto puede invitar o quitar a alguien.
          </p>
        )}
      </section>

      {owner ? (
        <section className="space-y-4 py-8">
          <h2 className={h2}>Invitar a alguien</h2>
          <form action={invitarAction} className="flex gap-2">
            <input
              type="email"
              name="correo"
              required
              placeholder="correo@ejemplo.com"
              aria-label="Correo de la persona que invitas"
              className={input}
            />
            <button type="submit" className={btn}>
              Invitar
            </button>
          </form>
          <p className="text-sm text-muted">
            La app no envía correos. Copia el enlace y mándaselo tú por WhatsApp o como quieras.
            Caduca a los 14 días y solo funciona para esa dirección.
          </p>

          {invites.length ? (
            <ul className="space-y-4">
              {invites.map((i) => (
                <li key={i.token} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-body">{i.email}</span>
                    <form action={revocarAction}>
                      <input type="hidden" name="token" value={i.token} readOnly />
                      <button type="submit" className={btnQuiet}>
                        Anular
                      </button>
                    </form>
                  </div>
                  {/* ponytail: a read-only field, not a copy button — no client component for one string */}
                  <input
                    readOnly
                    value={`${base}/invitacion/${i.token}`}
                    aria-label={`Enlace de invitación para ${i.email}`}
                    className={`${input} font-mono text-xs ${i.token === nuevo ? "border-accent" : ""}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No hay invitaciones pendientes.</p>
          )}
        </section>
      ) : null}

      <section className="space-y-4 py-8">
        <h2 className={h2}>Tus proyectos</h2>
        <ul className="divide-y divide-hairline-soft">
          {mine.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-body">
                {p.name}
                {/* Two projects can share a name, so the one that is not yours says whose it is. */}
                <span className="text-muted">{p.role === "owner" ? " · tuyo" : ` · de ${p.owner}`}</span>
              </span>
              {p.id === projectId ? (
                <span className="shrink-0 text-sm text-muted">Estás aquí</span>
              ) : (
                <form action={cambiarProyectoAction}>
                  <input type="hidden" name="proyecto" value={p.id} readOnly />
                  <button type="submit" className={btnQuiet}>
                    Ir
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 py-8">
        <h2 className={h2}>Empezar otro proyecto</h2>
        <p className="text-body">
          Una búsqueda aparte, con sus pisos y su gente. Lo que guardes en uno no se ve en el otro.
        </p>
        <form action={crearProyectoAction} className="flex gap-2">
          <input
            type="text"
            name="nombre"
            required
            maxLength={60}
            placeholder="Piso para el verano"
            aria-label="Nombre del proyecto"
            className={input}
          />
          <button type="submit" className={btn}>
            Crear
          </button>
        </form>
      </section>
    </div>
  );
}
