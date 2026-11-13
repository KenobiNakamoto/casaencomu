"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  startSession,
} from "@/lib/accounts";
import { createInvitedAccount } from "@/lib/registration";
import { PROJECT_COOKIE } from "@/lib/db";
import type { Aviso } from "@/app/entrar/actions";
import { PROBLEMA } from "@/lib/account-messages";

/** Register a new invited account; existing accounts must sign in to join. */
export async function crearCuentaAction(_prev: Aviso, formData: FormData): Promise<Aviso> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("nombre") ?? "");
  const password = String(formData.get("clave") ?? "");

  const made = await createInvitedAccount(token, name, password);
  if (!made.ok) return { msg: PROBLEMA[made.reason] ?? "Esta invitación ya no sirve. Pídele otra a quien te la mandó." };
  const email = made.email;
  (await cookies()).set(PROJECT_COOKIE, made.projectId, { httpOnly: true, sameSite: "lax", path: "/" });

  (await cookies()).set(SESSION_COOKIE, await startSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/propiedades");
}
