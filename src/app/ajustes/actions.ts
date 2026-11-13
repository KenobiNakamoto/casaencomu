"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changeOwnPassword } from "@/lib/recovery";
import { SESSION_COOKIE, sessionEmail } from "@/lib/accounts";
import { currentUser } from "@/lib/auth";
import type { Aviso } from "@/app/entrar/actions";
import { db } from "@/lib/db";
import { PERSON_NAME_MAX } from "@/lib/project-shape";

/**
 * Your own name, and nobody else's: the row is found by the signed-in identity, never by an id in
 * the form. The id does not change, so every opinion, rating and comment already written stays
 * attributed to the same person under the new name.
 *
 * The name lives in the project's own database, so it is per project. That is the silo doing what
 * it was built to do — the family calls you «papá» and the flatmates call you by your name.
 */
export async function renombrarseAction(formData: FormData) {
  const user = await currentUser();
  const name = String(formData.get("nombre") ?? "").trim().slice(0, PERSON_NAME_MAX);
  if (!name) return;
  await db.execute({ sql: "UPDATE users SET name = ? WHERE id = ?", args: [name, user.id] });
  revalidatePath("/", "layout");
}

/**
 * Your own clave. The current one is asked for even though you are already signed in: a session
 * left open on a shared computer must not be enough to lock the owner out of their own account.
 *
 * Every other session of yours ends. If somebody else knew the old clave, the reason you are here
 * is to stop them, and leaving their session open would undo the whole exercise.
 */
export async function cambiarClaveAction(_prev: Aviso, formData: FormData): Promise<Aviso> {
  const { cookies } = await import("next/headers");
  const email = await sessionEmail((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email) return { msg: "No has entrado." };

  const vieja = String(formData.get("vieja") ?? "");
  const nueva = String(formData.get("nueva") ?? "");
  if (!(await changeOwnPassword(email, vieja, nueva))) return { msg: "Comprueba la clave de ahora. La nueva necesita entre 10 y 1024 caracteres." };

  // The session this form was sent from is one of them, so the person signs in again. That is the
  // proof the new clave works, at the moment they still remember typing it.
  redirect("/entrar");
}
