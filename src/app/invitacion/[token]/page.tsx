import { headers } from "next/headers";
import Link from "next/link";
import { accountBy } from "@/lib/accounts";
import { inviteByToken, inviteProblem, type Problem } from "@/lib/control";
import { aceptarInvitacionAction } from "@/app/proyectos/actions";
import Puerta from "@/components/puerta";
import { CuentaNuevaForm } from "./forms";

export const dynamic = "force-dynamic";

const PORQUE: Record<Problem, string> = {
  unknown: "Esta invitación no existe, o quien te la mandó la ha anulado.",
  used: "Esta invitación ya se ha usado.",
  expired: "Esta invitación ha caducado. Pídele otra a quien te la mandó.",
  other: "Esta invitación es para otra dirección de correo.",
};

/** The same shell as `/entrar`: the mark, the tagline, and the card the message sits in. */
const Marco = Puerta;

/** A link only grants membership. An existing account must authenticate independently. */
export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const me = (await headers()).get("x-user-email");
  const invite = await inviteByToken(token);

  // With no session there is no address to compare against, so «other» cannot apply yet: the
  // account holder must sign in, or create an account if the address has none.
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
      <h1 className="text-[22px] font-medium">Te han invitado a «{invite.project_name}»</h1>
      <p className="text-body">
        {known
          ? "Ya tienes cuenta. Entra con tu correo y tu clave para aceptar la invitación."
          : `${invite.invited_by} quiere buscar piso contigo. Crea tu cuenta para aceptar.`}
      </p>
      {known ? (
        <Link href={`/entrar?a=${encodeURIComponent(`/invitacion/${token}`)}`} className="inline-block text-sm font-medium text-ink underline underline-offset-4">
          Entrar para aceptar
        </Link>
      ) : <CuentaNuevaForm token={token} email={invite.email} />}
    </Marco>
  );
}
