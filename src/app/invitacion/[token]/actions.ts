"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  accountBy,
  createAccount,
  endAllSessions,
  setPassword,
  startSession,
} from "@/lib/accounts";
import { acceptInvite, inviteByToken, inviteProblem } from "@/lib/control";
import { PROBLEMA, type Aviso } from "@/app/entrar/actions";

/**
 * Making an account from an invitation, and setting a new clave from the same link.
 *
 * **The token is the only evidence here**, because the person has no session yet — that is the
 * point of the page. So everything is checked again from the token: the invitation must exist, be
 * unused and be in date, and the address is the one the invitation names. Nothing is read from the
 * form except the name and the clave.
 */
export async function crearCuentaAction(_prev: Aviso, formData: FormData): Promise<Aviso> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("nombre") ?? "");
  const password = String(formData.get("clave") ?? "");

  const invite = await inviteByToken(token);
  const problem = inviteProblem(invite, invite?.email ?? "");
  if (problem || !invite) return { msg: "Esta invitación ya no sirve. Pídele otra a quien te la mandó." };

  const email = invite.email;
  const known = await accountBy(email);

  if (known) {
    // The reset path. Every session of that account ends, because a person who is setting a new
    // clave may be doing it exactly because somebody else has the old one.
    if (!(await setPassword(email, password))) return { msg: PROBLEMA.weak };
    await endAllSessions(email);
  } else {
    const made = await createAccount(email, name, password);
    if (!made.ok) return { msg: PROBLEMA[made.reason] ?? "No se ha podido crear la cuenta." };
  }

  const joined = await acceptInvite(token, email);
  if (!joined.ok) return { msg: "Esta invitación ya no sirve. Pídele otra a quien te la mandó." };

  (await cookies()).set(SESSION_COOKIE, await startSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/propiedades");
}
