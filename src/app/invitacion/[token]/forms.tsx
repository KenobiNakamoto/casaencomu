"use client";

import { useActionState } from "react";
import { input } from "@/components/propiedades/format";
import type { Aviso } from "@/app/entrar/actions";
import { crearCuentaAction } from "./actions";


/**
 * One form, two jobs. A new person gives a name and a clave; somebody who already has an account
 * gives only a clave, because their name is already known and this link is a reset.
 */
export function CuentaNuevaForm({
  token,
  email,
  nueva,
}: {
  token: string;
  email: string;
  nueva: boolean;
}) {
  const [aviso, action, pending] = useActionState<Aviso, FormData>(crearCuentaAction, null);
  return (
    <form action={action} className="space-y-4">
      {aviso && (
        <p role="alert" className="rounded-lg bg-warning-bg px-4 py-3 text-sm text-warning-ink">
          {aviso.msg}
        </p>
      )}
      <input type="hidden" name="token" value={token} readOnly />
      <label className="block space-y-2">
        <span className="text-sm text-muted">Correo</span>
        {/* Read-only on purpose: the invitation names the address, and the form cannot change it. */}
        <input
          value={email}
          readOnly
          autoComplete="username"
          className={`${input} text-muted`}
          aria-label="Correo de la invitación"
        />
      </label>
      {nueva && (
        <label className="block space-y-2">
          <span className="text-sm text-muted">Tu nombre</span>
          <input name="nombre" required maxLength={40} autoComplete="name" className={input} />
        </label>
      )}
      <label className="block space-y-2">
        <span className="text-sm text-muted">{nueva ? "Tu clave" : "Clave nueva"}</span>
        <input
          name="clave"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className={input}
        />
        <span className="block text-sm text-muted">Diez caracteres como mínimo.</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-lg bg-ink px-6 text-base font-medium text-canvas transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Un momento…" : nueva ? "Crear la cuenta y entrar" : "Guardar la clave y entrar"}
      </button>
    </form>
  );
}
