"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { acceptInvite, createInvite, createProject, isMember, removeMember, revokeInvite } from "@/lib/control";
import { currentProjectId, PROJECT_COOKIE } from "@/lib/db";

const PAGE = "/proyectos";

/** The signed-in address. The proxy sets this header and overwrites anything that arrives in it. */
async function me(): Promise<string> {
  const email = (await headers()).get("x-user-email");
  if (!email) throw Object.assign(new Error("unauthorized"), { status: 401 });
  return email;
}

/**
 * The cookie names the project the person is looking at. It is a preference, not a permission:
 * `resolveProject()` checks the membership again on every request, so a cookie for somebody
 * else's project is ignored rather than obeyed.
 */
async function look(projectId: string) {
  (await cookies()).set(PROJECT_COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 31_536_000,
  });
}

export async function crearProyectoAction(formData: FormData) {
  const email = await me();
  const name = String(formData.get("nombre") ?? "").trim().slice(0, 60);
  if (!name) redirect(`${PAGE}?e=nombre`);
  await look(await createProject(name, email));
  redirect(PAGE);
}

export async function cambiarProyectoAction(formData: FormData) {
  const email = await me();
  const id = String(formData.get("proyecto") ?? "");
  // Checked here as well, so a forged form cannot even set the cookie.
  if (await isMember(email, id)) await look(id);
  redirect("/propiedades");
}

export async function invitarAction(formData: FormData) {
  const email = await me();
  const result = await createInvite(await currentProjectId(), email, String(formData.get("correo") ?? ""));
  if ("refused" in result) redirect(`${PAGE}?e=${result.refused}`);
  revalidatePath(PAGE);
  redirect(`${PAGE}?nuevo=${result.token}`);
}

export async function revocarAction(formData: FormData) {
  const email = await me();
  await revokeInvite(await currentProjectId(), email, String(formData.get("token") ?? ""));
  revalidatePath(PAGE);
}

export async function expulsarAction(formData: FormData) {
  const email = await me();
  await removeMember(await currentProjectId(), email, String(formData.get("correo") ?? ""));
  revalidatePath(PAGE);
}

/**
 * The one way into somebody else's project. `acceptInvite` decides, on the signed-in address; a
 * refusal goes back to the invitation page, which says why in words.
 */
export async function aceptarInvitacionAction(formData: FormData) {
  const email = await me();
  const token = String(formData.get("token") ?? "");
  const accepted = await acceptInvite(token, email);
  if (!accepted.ok) redirect(`/invitacion/${encodeURIComponent(token)}`);
  await look(accepted.projectId);
  redirect("/propiedades");
}
