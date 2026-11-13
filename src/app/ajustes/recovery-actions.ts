"use server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionEmail } from "@/lib/accounts";
import { issueRecoveryCode } from "@/lib/recovery";

export type RecoveryState = { msg: string; code?: string; expires?: string } | null;
export async function recoveryCodeAction(_prev: RecoveryState, form: FormData): Promise<RecoveryState> {
  const email = await sessionEmail((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email) return { msg: "Entra con tu cuenta para crear el código." };
  const result = await issueRecoveryCode(email, String(form.get("clave") ?? ""));
  return result ? { ...result, msg: "Guárdalo ahora en tu gestor de contraseñas. No volveremos a mostrarlo." }
    : { msg: "No se pudo crear el código. Comprueba tu clave o espera un minuto si has hecho varios intentos." };
}
