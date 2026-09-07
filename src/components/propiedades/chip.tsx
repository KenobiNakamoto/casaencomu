import { STAGE_LABELS, type Stage } from "@/lib/listing";

const TONES = {
  zinc: "bg-surface-strong text-body",
  blue: "bg-sky-100 text-sky-800",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-emerald-100 text-emerald-800",
  violet: "bg-violet-100 text-violet-800",
  red: "bg-rausch-tint text-error",
} as const;
type Tone = keyof typeof TONES;

export function Chip({ tone = "zinc", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STAGE_TONE: Record<Stage, Tone> = {
  nueva: "blue",
  revisando: "amber",
  preseleccionada: "green",
  visita_prevista: "violet",
  descartada: "zinc",
  no_disponible: "red",
};

/** Dot colour per stage, for the white photo badge and the stage strip. */
export const STAGE_DOT: Record<Stage, string> = {
  nueva: "bg-sky-500",
  revisando: "bg-amber-500",
  preseleccionada: "bg-emerald-500",
  visita_prevista: "bg-violet-500",
  descartada: "bg-zinc-400",
  no_disponible: "bg-rausch",
};

export function StageChip({ stage }: { stage: string }) {
  const s = stage as Stage;
  return <Chip tone={STAGE_TONE[s] ?? "zinc"}>{STAGE_LABELS[s] ?? stage}</Chip>;
}

/** White pill that floats on a photo (Airbnb's "Guest favorite" badge). */
export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-tier ${className}`}
    >
      {children}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const s = stage as Stage;
  return (
    <Badge>
      <span className={`h-2 w-2 rounded-full ${STAGE_DOT[s] ?? "bg-zinc-400"}`} aria-hidden />
      {STAGE_LABELS[s] ?? stage}
    </Badge>
  );
}

export const BudgetChip = () => <Chip tone="red">Fuera de presupuesto</Chip>;
