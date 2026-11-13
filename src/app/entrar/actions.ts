"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  endSession,
  startSession,
} from "@/lib/accounts";
import { PROBLEMA } from "@/lib/account-messages";
import { createFirstAccount } from "@/lib/registration";

/**
 * The login page is the only page a person without a session can use, so everything it can do is
 * in this file: sign in, sign out, and make the first account of an empty install.
 */

/** Where the proxy wanted to send them. Only a path of ours, never an address somebody supplied. */
const safeNext = (raw: string) => (/^\/[^/\\]/.test(raw) ? raw : "/");

async function open(email: string, next: string): Promise<never> {
  (await cookies()).set(SESSION_COOKIE, await startSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(safeNext(next));
}

export type Aviso = { msg: string } | null;

export async function entrarAction(_prev: Aviso, formData: FormData): Promise<Aviso> {
  const email = String(formData.get("correo") ?? "");
  const password = String(formData.get("clave") ?? "");
  const next = String(formData.get("a") ?? "/");

  const got = await checkPassword(email, password);
  if (!got.ok) {
    // One sentence for both answers. «This address does not exist» would turn the form into a
    // list of who is in this family, for anybody who wants to ask it one address at a time.
    return {
      msg:
        got.reason === "locked"
          ? "Demasiados intentos. Espera un minuto y vuelve a probar."
          : "El correo o la clave no son correctos.",
    };
  }
  return open(got.email, next);
}

/**
 * The first account, on an install where none exists. Every account after it arrives with an
 * invitation, so this runs once in the life of a server.
 *
 * **It never makes a second, empty project.** A server that ran before accounts existed already
 * holds projects and a membership list, written under whatever address the old door reported —
 * and none of those addresses can sign in now. So the first account takes over what is there,
 * rather than starting beside it and hiding every flat already saved.
 */
export async function primeraCuentaAction(_prev: Aviso, formData: FormData): Promise<Aviso> {
  const made = await createFirstAccount(
    String(formData.get("correo") ?? ""),
    String(formData.get("nombre") ?? ""),
    String(formData.get("clave") ?? ""),
    String(formData.get("instalacion") ?? ""),
  );
  if (!made.ok) return { msg: PROBLEMA[made.reason] ?? "No se ha podido crear la cuenta." };
  return open(made.email, "/");
}



export async function salirAction() {
  const jar = await cookies();
  await endSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/entrar");
}
