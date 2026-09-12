import { headers } from "next/headers";
import Link from "next/link";
import { accountBy } from "@/lib/accounts";
import { inviteByToken, inviteProblem, type Problem } from "@/lib/control";
import { aceptarInvitacionAction } from "@/app/proyectos/actions";
import { CuentaNuevaForm } from "./forms";

export const dynamic = "force-dynamic";

const PORQUE: Record<Problem, string> = {
  unknown: "Esta invitación no existe, o quien te la mandó la ha anulado.",
  used: "Esta invitación ya se ha usado.",
  expired: "Esta invitación ha caducado. Pídele otra a quien te la mandó.",
  other: "Esta invitación es para otra dirección de correo.",
};

function Marco({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-sm space-y-6 px-4 py-16 sm:px-6">{children}</div>;
}

/**
 * «Te han invitado a este proyecto.» This page does three different things, and which one depends
 * on who is reading it:
 *
 * - **Nobody is signed in, and the invited address has no account.** An invitation is the only way
 *   to make an account, so this is the sign-up form: a name and a clave, and the person is in.
 * - **Nobody is signed in, and the address already has an account.** The same link then sets a new
 *   clave. There is no mail server to send a reset to, so the owner hands over a link exactly as
 *   they do for a new person — one code path, one table, nothing extra to keep correct.
 * - **Somebody is signed in.** The signed-in address is the evidence, never the one in the link,
 *   and the button only joins the project.
 *
 * Nothing changes until a button is pressed. A link that joined a project by being opened would be
 * joined by the first program that follows it — a chat application making a preview, for one.
 */
export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const me = (await headers()).get("x-user-email");
  const invite = await inviteByToken(token);

  // With no session there is no address to compare against, so «other» cannot apply yet: the
  // person is about to prove the address by setting its clave.
  const problem = inviteProblem(invite, me ?? invite?.email ?? "");

  if (problem || !invite) {
    return (
      <Marco>
        <h1 className="text-[22px] font-medium">No se puede aceptar</h1>
        <p className="text-body">{PORQUE[problem ?? "unknown"]}</p>
        {me && <p className="text-sm text-muted">Has entrado como {me}.</p>}
      </Marco>
    );
  }

  if (me) {
    return (
      <Marco>
        <h1 className="text-[22px] font-medium">Te han invitado a «{invite.project_name}»</h1>
        <p className="text-body">
          {invite.invited_by} quiere buscar piso contigo. Si aceptas, veréis los mismos pisos, las
          mismas notas y las mismas valoraciones.
        </p>
        <form action={aceptarInvitacionAction}>
          <input type="hidden" name="token" value={token} readOnly />
          <button
            type="submit"
            className="h-12 w-full rounded-lg bg-ink px-6 text-base font-medium text-canvas transition hover:opacity-90"
          >
            Aceptar invitación
          </button>
        </form>
        <p className="text-sm text-muted">Entras como {me}.</p>
        <Link
          href="/propiedades"
          className="inline-block text-sm font-medium text-ink underline underline-offset-4"
        >
          Ir a mis pisos
        </Link>
      </Marco>
    );
  }

  const known = await accountBy(invite.email);
  return (
    <Marco>
      <h1 className="text-[22px] font-medium">
        {known ? "Pon una clave nueva" : `Te han invitado a «${invite.project_name}»`}
      </h1>
      <p className="text-body">
        {known
          ? "Escribe una clave nueva. La anterior deja de funcionar, y se cierran las sesiones abiertas."
          : `${invite.invited_by} quiere buscar piso contigo. Crea tu cuenta y entras a «${invite.project_name}».`}
      </p>
      <CuentaNuevaForm token={token} email={invite.email} nueva={!known} />
    </Marco>
  );
}
