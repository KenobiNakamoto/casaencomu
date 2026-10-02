"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Panel } from "@/components/panel";
import { input } from "@/components/propiedades/format";
import {
  cambiarProyectoAction,
  claveNuevaAction,
  expulsarAction,
  guardarProyectoAction,
  invitarAction,
  revocarAction,
  type Aviso,
} from "@/app/proyectos/actions";
import { DESCRIPTION_MAX, NAME_MAX, PURPOSE_MAX, type Invite, type Member, type Mine } from "@/lib/project-shape";

const btn = "h-12 shrink-0 rounded-lg bg-ink px-5 text-base font-medium text-canvas transition hover:opacity-90";
const btnQuiet =
  "touch-target h-9 shrink-0 rounded-lg border border-control-border px-3 text-sm font-medium text-body transition hover:text-ink";
const label = "block text-sm font-medium text-ink";
const h3 = "text-sm font-semibold uppercase tracking-wide text-muted";

function Nota({ state }: { state: Aviso }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-muted" : "text-error"}`}>
      {state.msg}
    </p>
  );
}

/** The token in a box you can select, and a button for the ninety per cent of times you cannot. */
function InviteLink({ link, who }: { link: string; who: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      {/* ponytail: readonly input, not a styled span — select-all works when the clipboard does not */}
      <input readOnly value={link} aria-label={`Enlace de invitación para ${who}`} className={`${input} h-11 font-mono text-xs`} />
      <button
        type="button"
        className={`${btnQuiet} h-11`}
        onClick={() => {
          navigator.clipboard?.writeText(link).then(
            () => setCopied(true),
            () => {},
          );
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

/**
 * One project, as a card, with everything about it behind the three dots.
 *
 * The panel is one dialog with three parts rather than three menu items, because they are one
 * question — who is this search for — and because a person who opens it to invite somebody
 * usually wants to see who is already there first.
 *
 * Nothing in it navigates: every form is a server action that revalidates, so the panel is still
 * open and in the same place when the answer arrives (#148).
 */
export function ProjectCard({
  p,
  people,
  invites,
  here,
  myEmail,
  base,
}: {
  p: Mine;
  people: Member[];
  invites: Invite[];
  here: boolean;
  myEmail: string;
  base: string;
}) {
  const [open, setOpen] = useState(false);
  const [saved, save] = useActionState(guardarProyectoAction, null);
  const [invited, invite] = useActionState(invitarAction, null);
  const owner = p.role === "owner";
  const isMe = (email: string) => email.toLowerCase() === myEmail.toLowerCase();
  const id = <input type="hidden" name="proyecto" value={p.id} readOnly />;

  return (
    <li className="flex flex-col rounded-card border border-hairline bg-raised p-5 shadow-lift">
      <div className="flex items-start gap-2">
        {/* The name opens the project; the three dots change it. Reading and configuring are two
            different errands, and the card used to offer only the second one. */}
        <h2 className="min-w-0 flex-1 text-lg font-medium leading-snug text-ink">
          <Link href={`/proyectos/${p.id}`} className="underline-offset-4 hover:underline">
            {p.name}
          </Link>
        </h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Opciones de ${p.name}`}
          className="touch-target -mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-soft hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </div>

      {p.purpose ? <p className="mt-1 text-sm text-accent">{p.purpose}</p> : null}
      {p.description ? (
        <p className="mt-3 line-clamp-4 text-body">{p.description}</p>
      ) : (
        <p className="mt-3 text-body text-muted">
          {owner ? "Sin descripción todavía. Cuéntale a la familia qué buscáis aquí." : "Sin descripción."}
        </p>
      )}

      <div className="mt-auto flex items-center gap-3 pt-5 text-sm text-muted">
        <span className="min-w-0 flex-1 truncate">
          {p.people} {p.people === 1 ? "persona" : "personas"}
          {/* Two projects can share a name, so the one that is not yours says whose it is. */}
          {owner ? " · tuyo" : ` · de ${p.owner}`}
        </span>
        {here ? (
          <span className="shrink-0 font-medium text-ink">Estás aquí</span>
        ) : (
          <form action={cambiarProyectoAction}>
            {id}
            <button type="submit" className={btnQuiet}>
              Ir
            </button>
          </form>
        )}
      </div>

      <Panel label={`Opciones de ${p.name}`} open={open} onClose={() => setOpen(false)}>
        <div className="space-y-8 p-6">
          <div className="flex items-start gap-3">
            <h2 className="min-w-0 flex-1 text-[22px] font-medium leading-tight">{p.name}</h2>
            <button type="button" onClick={() => setOpen(false)} className={btnQuiet}>
              Cerrar
            </button>
          </div>

          {owner ? (
            <form action={save} className="space-y-3">
              <h3 className={h3}>Nombre y descripción</h3>
              {id}
              <label className={label}>
                Nombre
                <input type="text" name="nombre" required maxLength={NAME_MAX} defaultValue={p.name} className={`${input} mt-1`} />
              </label>
              <label className={label}>
                Para qué es
                <input
                  type="text"
                  name="proposito"
                  maxLength={PURPOSE_MAX}
                  defaultValue={p.purpose}
                  placeholder="Alquiler en Gràcia para septiembre"
                  className={`${input} mt-1`}
                />
              </label>
              <label className={label}>
                Descripción
                <textarea
                  name="descripcion"
                  maxLength={DESCRIPTION_MAX}
                  rows={4}
                  defaultValue={p.description}
                  placeholder="Lo que buscáis, lo que no queréis, el presupuesto del que habéis hablado."
                  className="mt-1 w-full rounded-lg border border-control-border bg-raised p-3 text-ink transition focus:border-ink"
                />
              </label>
              <p className="text-sm text-muted">Lo lee todo el mundo que está en el proyecto.</p>
              <div className="flex items-center gap-3">
                <button type="submit" className={btn}>
                  Guardar
                </button>
                <Nota state={saved} />
              </div>
            </form>
          ) : null}

          <section className="space-y-3">
            <h3 className={h3}>Gente</h3>
            <ul className="divide-y divide-hairline-soft">
              {people.map((m) => (
                <li key={m.email} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1 truncate text-body">
                    {m.email}
                    {isMe(m.email) ? <span className="text-muted"> · tú</span> : null}
                  </span>
                  <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-xs text-muted">
                    {m.role === "owner" ? "Propietario" : "Miembro"}
                  </span>
                  {owner && m.role === "member" ? (
                    <>
                      {/* Somebody who has forgotten their clave. It makes the same invitation
                          link, which the owner sends the same way; there is no mail server. */}
                      <form action={claveNuevaAction}>
                        {id}
                        <input type="hidden" name="correo" value={m.email} readOnly />
                        <button type="submit" className={btnQuiet}>
                          Clave nueva
                        </button>
                      </form>
                      <form action={expulsarAction}>
                        {id}
                        <input type="hidden" name="correo" value={m.email} readOnly />
                        <button type="submit" className={btnQuiet}>
                          Quitar
                        </button>
                      </form>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
            {owner ? null : <p className="text-sm text-muted">Solo el propietario puede invitar o quitar a alguien.</p>}
          </section>

          {owner ? (
            <section className="space-y-3">
              <h3 className={h3}>Invitaciones</h3>
              <form action={invite} className="flex gap-2">
                {id}
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
              <Nota state={invited} />
              <p className="text-sm text-muted">
                La app no envía correos. Copia el enlace y mándaselo tú por WhatsApp o como quieras. Caduca a los 14
                días y solo funciona para esa dirección.
              </p>

              {invites.length ? (
                <ul className="space-y-3">
                  {invites.map((i) => (
                    <li key={i.token} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-body">{i.email}</span>
                        <form action={revocarAction}>
                          {id}
                          <input type="hidden" name="token" value={i.token} readOnly />
                          <button type="submit" className={btnQuiet}>
                            Anular
                          </button>
                        </form>
                      </div>
                      <InviteLink link={`${base}/invitacion/${i.token}`} who={i.email} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No hay invitaciones pendientes.</p>
              )}
            </section>
          ) : null}
        </div>
      </Panel>
    </li>
  );
}
