"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  acceptInvite,
  createInvite,
  createProject,
  isMember,
  removeMember,
  revokeInvite,
  updateProject,
} from "@/lib/control";
import { PROJECT_COOKIE } from "@/lib/db";

const PAGE = "/proyectos";

/** The signed-in address. The proxy sets this header and overwrites anything that arrives in it. */
async function me(): Promise<string> {
  const email = (await headers()).get("x-user-email");
  if (!email) throw Object.assign(new Error("unauthorized"), { status: 401 });
  return email;
}

/**
 * Which project a form is about. It is a field now rather than the cookie, because the cards show
 * every project at once and you manage the one whose panel is open, not the one you are looking
 * at. It is safe to take from the form: every function it reaches asks `mustOwn` first, so an id
 * typed in by hand only buys a 403.
 */
const which = (formData: FormData) => String(formData.get("proyecto") ?? "");

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

/** What a panel says back. Nothing navigates, so the panel stays open and the words appear in it. */
export type Aviso = { ok: boolean; msg: string } | null;

export async function crearProyectoAction(formData: FormData) {
  const email = await me();
  const name = String(formData.get("nombre") ?? "").trim().slice(0, 60);
  if (!name) redirect(`${PAGE}?e=nombre`);
  await look(await createProject(name, email));
  redirect(PAGE);
}

export async function cambiarProyectoAction(formData: FormData) {
  const email = await me();
  const id = which(formData);
  // Checked here as well, so a forged form cannot even set the cookie.
  if (await isMember(email, id)) await look(id);
  redirect("/propiedades");
}

export async function guardarProyectoAction(_prev: Aviso, formData: FormData): Promise<Aviso> {
  const email = await me();
  const saved = await updateProject(which(formData), email, {
    name: String(formData.get("nombre") ?? ""),
    purpose: String(formData.get("proposito") ?? ""),
    description: String(formData.get("descripcion") ?? ""),
  });
  if (!saved) return { ok: false, msg: "Ponle un nombre al proyecto." };
  revalidatePath(PAGE);
  return { ok: true, msg: "Guardado." };
}

const REFUSED = {
  member: "Esa persona ya está en el proyecto.",
  invalid: "Esa dirección de correo no es válida.",
};

export async function invitarAction(_prev: Aviso, formData: FormData): Promise<Aviso> {
  const email = await me();
  const result = await createInvite(which(formData), email, String(formData.get("correo") ?? ""));
  if ("refused" in result) return { ok: false, msg: REFUSED[result.refused] };
  revalidatePath(PAGE);
  return { ok: true, msg: "Listo. Copia el enlace y mándaselo." };
}

/**
 * A link that lets somebody who is already in the house set a new clave. It is the same invitation
 * the owner sends to a new person — there is no mail server, so a reset cannot be mailed, and one
 * mechanism that works beats a second one to keep correct.
 */
export async function claveNuevaAction(formData: FormData) {
  const email = await me();
  await createInvite(which(formData), email, String(formData.get("correo") ?? ""), true);
  revalidatePath(PAGE);
}

export async function revocarAction(formData: FormData) {
  const email = await me();
  await revokeInvite(which(formData), email, String(formData.get("token") ?? ""));
  revalidatePath(PAGE);
}

export async function expulsarAction(formData: FormData) {
  const email = await me();
  await removeMember(which(formData), email, String(formData.get("correo") ?? ""));
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
