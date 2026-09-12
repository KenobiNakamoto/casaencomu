import { accountCount } from "@/lib/accounts";
import { EntrarForm, PrimeraCuentaForm } from "./forms";

export const dynamic = "force-dynamic";

/**
 * The front door. It is one of the two pages the proxy lets through without a session — the other
 * is an invitation — because a person with no session has to be able to reach one of them.
 *
 * On an empty install it makes the first account instead, and that account owns the first project.
 * Every account after it arrives with an invitation, so there is no open sign-up to close later.
 */
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  const { a } = await searchParams;
  const first = (await accountCount()) === 0;

  return (
    <div className="mx-auto max-w-sm space-y-6 px-4 py-16 sm:px-6">
      <h1 className="text-[22px] font-medium">{first ? "Empieza el proyecto de búsqueda" : "Entrar"}</h1>
      <p className="text-body">
        {first
          ? "Todavía no hay ninguna cuenta. La primera es la tuya, y es la que invita a los demás."
          : "Entra con tu correo y tu clave."}
      </p>
      {first ? <PrimeraCuentaForm /> : <EntrarForm next={a ?? "/"} />}
      {!first && (
        <p className="text-sm text-muted">
          ¿No tienes cuenta? Solo se entra con una invitación. Pídesela a quien lleva el proyecto.
        </p>
      )}
    </div>
  );
}
