"use client";
import { useActionState } from "react";
import { input } from "@/components/propiedades/format";
import { recuperarAction } from "./actions";

export default function RecoveryForm() {
  const [state, action, pending] = useActionState(recuperarAction, null);
  return <form action={action} className="space-y-4">
    {state && <p role="status" className="text-body">{state.msg}</p>}
    <label className="block space-y-2"><span>Tu correo</span><input name="correo" type="email" autoComplete="username" maxLength={254} required className={input} /></label>
    <label className="block space-y-2"><span>Código de recuperación</span><input name="codigo" autoComplete="off" spellCheck={false} maxLength={100} required className={input} /></label>
    <label className="block space-y-2"><span>La clave nueva</span><input name="clave" type="password" autoComplete="new-password" minLength={10} maxLength={1024} required className={input} /></label>
    <button disabled={pending} className="btn-primary h-12 rounded-lg px-5 disabled:opacity-60">{pending ? "Guardando…" : "Cambiar la clave"}</button>
  </form>;
}
