import Marca from "./marca";

/**
 * The front door: the shell of `/entrar` and `/invitacion`, the only two pages a person can reach
 * with no session. They have no header, no data and one thing to do, so the mark goes here —
 * otherwise nothing on screen says what this is.
 *
 * The three blurred shapes behind the card are decoration and nothing else, so they are
 * `aria-hidden` and empty. Their colour, size, path and timing are all in `globals.css` under
 * `.puerta`; this file only says how many there are.
 */
export default function Puerta({ children }: { children: React.ReactNode }) {
  return (
    <div className="puerta">
      <div className="puerta-fondo" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="relative w-full max-w-[380px] space-y-7">
        <div className="space-y-3 text-center">
          <Marca size={38} className="text-2xl" />
          <p className="text-body">Preparaos para encontrar vuestra casa, juntos.</p>
        </div>
        <div className="puerta-tarjeta space-y-5">{children}</div>
      </div>
    </div>
  );
}
