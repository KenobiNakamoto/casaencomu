"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
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
