"use client";

import { useActionState } from "react";
import { input } from "@/components/propiedades/format";
import { entrarAction, primeraCuentaAction, type Aviso } from "./actions";

/**
 * The two forms of the front door. They are client components for one reason: a refused password
 * has to appear above the field the person is still looking at, without losing what they typed.
 */

const BUTTON =
  "h-12 w-full rounded-lg bg-ink px-6 text-base font-medium text-canvas transition hover:opacity-90 disabled:opacity-60";

function Error({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p role="alert" className="rounded-lg bg-warning-bg px-4 py-3 text-sm text-warning-ink">
      {aviso.msg}
    </p>
  );
}

export function EntrarForm({ next }: { next: string }) {
  const [aviso, action, pending] = useActionState<Aviso, FormData>(entrarAction, null);
  return (
    <form action={action} className="space-y-4">
      <Error aviso={aviso} />
      <input type="hidden" name="a" value={next} readOnly />
      <label className="block space-y-2">
        <span className="text-sm text-muted">Correo</span>
        <input name="correo" type="email" autoComplete="username" required className={input} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm text-muted">Clave</span>
        <input
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          className={input}
        />
      </label>
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

export function PrimeraCuentaForm() {
  const [aviso, action, pending] = useActionState<Aviso, FormData>(primeraCuentaAction, null);
  return (
    <form action={action} className="space-y-4">
      <Error aviso={aviso} />
      <label className="block space-y-2">
        <span className="text-sm text-muted">Clave de instalación</span>
        <input name="instalacion" type="password" required autoComplete="off" className={input} />
        <span className="block text-sm text-muted">La proporciona quien instala la aplicación. Solo se usa una vez.</span>
      </label>
      <label className="block space-y-2">
        <span className="text-sm text-muted">Tu nombre</span>
        <input name="nombre" required maxLength={40} autoComplete="name" className={input} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm text-muted">Correo</span>
        <input name="correo" type="email" autoComplete="username" required className={input} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm text-muted">Clave</span>
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
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Creando…" : "Crear la cuenta"}
      </button>
    </form>
  );
}
