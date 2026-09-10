import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { inviteByToken, inviteProblem, type Problem } from "@/lib/control";
import { aceptarInvitacionAction } from "@/app/proyectos/actions";

export const dynamic = "force-dynamic";

const PORQUE: Record<Problem, string> = {
  unknown: "Esta invitación no existe, o quien te la mandó la ha anulado.",
  used: "Esta invitación ya se ha usado.",
  expired: "Esta invitación ha caducado. Pídele otra a quien te la mandó.",
  other: "Esta invitación es para otra dirección de correo.",
};

/**
 * «Te han invitado a este proyecto.» The link is opened by whoever it was sent to, and the app
 * knows who that is: the address they signed in with. The link alone proves nothing.
 *
 * Nothing changes until the button is pressed. A link that joins a project by being opened would
 * be joined by the first program that follows it — a chat app making a preview, for one.
 */
export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const me = await currentUser();
  const invite = await inviteByToken(token);
  const problem = inviteProblem(invite, me.email);

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-16 sm:px-6">
      {problem ? (
        <>
          <h1 className="text-[22px] font-medium">No se puede aceptar</h1>
          <p className="text-body">{PORQUE[problem]}</p>
          <p className="text-sm text-muted">Has entrado como {me.email}.</p>
        </>
      ) : (
        <>
          <h1 className="text-[22px] font-medium">Te han invitado a «{invite!.project_name}»</h1>
          <p className="text-body">
            {invite!.invited_by} quiere buscar piso contigo. Si aceptas, veréis los mismos pisos, las
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
          <p className="text-sm text-muted">Entras como {me.email}.</p>
        </>
      )}
      <Link href="/propiedades" className="inline-block text-sm font-medium text-ink underline underline-offset-4">
        Ir a mis pisos
      </Link>
    </div>
  );
}
