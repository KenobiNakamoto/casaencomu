import { STAGE_LABELS, type Stage } from "@/lib/listing";

const TONES = {
  zinc: "bg-zinc-100 text-zinc-700",
  blue: "bg-sky-100 text-sky-800",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-emerald-100 text-emerald-800",
  violet: "bg-violet-100 text-violet-800",
  red: "bg-red-100 text-red-800",
} as const;
type Tone = keyof typeof TONES;

export function Chip({ tone = "zinc", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
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

export function StageChip({ stage }: { stage: string }) {
  const s = stage as Stage;
  return <Chip tone={STAGE_TONE[s] ?? "zinc"}>{STAGE_LABELS[s] ?? stage}</Chip>;
}

export const BudgetChip = () => <Chip tone="red">Fuera de presupuesto</Chip>;
