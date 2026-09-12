/**
 * The mark: the house and the name, one component so the header and the front door cannot drift
 * apart. The header draws it at 28 px beside the tabs; `/entrar` and `/invitacion` draw it large
 * and centred, because on those two pages it is the only thing that says where you are.
 *
 * `currentColor` on the stroke, so the size and the colour are the caller's to set.
 */
export default function Marca({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight text-accent ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </svg>
      CasaEnComú
    </span>
  );
}
