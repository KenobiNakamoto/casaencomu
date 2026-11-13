"use server";

import { recoverAccount } from "@/lib/recovery";
import type { Aviso } from "@/app/entrar/actions";

export async function recuperarAction(_prev: Aviso, form: FormData): Promise<Aviso> {
  const password = String(form.get("clave") ?? "");
  if (password.length < 10 || password.length > 1024) return { msg: "La clave necesita entre 10 y 1024 caracteres." };
  const ok = await recoverAccount(String(form.get("correo") ?? ""), String(form.get("codigo") ?? ""), password);
  return { msg: ok
    ? "Clave cambiada. Entra con la nueva clave y crea otro código de recuperación en Ajustes."
    : "El correo o el código no son válidos. El código puede haber caducado o haberse usado." };
}
