"use client";

import { useActionState } from "react";
import { input } from "@/components/propiedades/format";
import type { Aviso } from "@/app/entrar/actions";
import { cambiarClaveAction } from "./actions";

/** Changing your own clave. A client component so a refusal lands over the fields, not on a new page. */
export function ClaveForm() {
  const [aviso, action, pending] = useActionState<Aviso, FormData>(cambiarClaveAction, null);
  return (
    <form action={action} className="space-y-3">
      {aviso && (
        <p role="alert" className="rounded-lg bg-warning-bg px-4 py-3 text-sm text-warning-ink">
          {aviso.msg}
        </p>
      )}
      <label className="block space-y-2">
        <span className="text-sm text-muted">La clave de ahora</span>
        <input name="vieja" type="password" autoComplete="current-password" required className={input} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm text-muted">La clave nueva</span>
        <input
          name="nueva"
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
        className="h-12 shrink-0 rounded-lg bg-ink px-5 text-base font-medium text-canvas transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Cambiar la clave"}
      </button>
    </form>
  );
}
