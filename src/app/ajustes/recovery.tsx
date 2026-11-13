"use client";
import { useActionState } from "react";
import { input } from "@/components/propiedades/format";
import { recoveryCodeAction } from "./recovery-actions";

export default function RecoveryCodeForm() {
  const [state, action, pending] = useActionState(recoveryCodeAction, null);
  return <form action={action} className="space-y-3">
    <p className="text-body">Crea un código para recuperar tu cuenta si olvidas la clave. El código dura un año y solo se puede usar una vez. Crear otro invalida el anterior.</p>
    {state && <div role="status" className="space-y-2 text-body">
      <p>{state.msg}</p>
      {state.code && <>
        <label className="block space-y-2"><span>Tu código de recuperación</span><textarea readOnly value={state.code} className={input} rows={3} /></label>
        <p className="text-sm text-muted">Válido hasta {new Date(state.expires!).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}. Quien tenga este código puede cambiar tu clave.</p>
      </>}
    </div>}
    <label className="block space-y-2"><span className="text-sm text-muted">La clave de ahora</span><input name="clave" type="password" autoComplete="current-password" maxLength={1024} required className={input} /></label>
    <button disabled={pending} className="btn-primary h-12 rounded-lg px-5 disabled:opacity-60">{pending ? "Creando…" : "Crear código de recuperación"}</button>
  </form>;
}
