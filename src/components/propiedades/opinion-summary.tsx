import { STANCE_SHORT, type Stance } from "@/lib/opinion-input";

/** The three opinion columns every list row carries (#144). */
export type Opinions = {
  family_avg: number | null;
  voices: number;
  scorers: number;
  partial: number;
  my_stance: Stance | null;
};

const score = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const people = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;

/**
 * What the family thinks about this home, in one line (doc 04 § 5).
 *
 * The number is never shown on its own. «3,7» reads as a fact about the home; «3,7/5 · 3 personas
 * · Parcial» reads as what it is — three people, some of whom skipped aspects. A home nobody has
 * looked at says so and offers the way in, rather than showing a blank where a number goes.
 */
export function summaryLine(p: Opinions): string {
  if (p.scorers > 0 && p.family_avg !== null) {
    return `${score(p.family_avg)}/5 · ${people(p.scorers)}${p.partial ? " · Parcial" : ""}`;
  }
  // A stance is an opinion. It is counted, and it moves no number.
  if (p.voices > 0) return `${people(p.voices)} han opinado`;
  return "Sin opiniones · Añade la tuya";
}

export function OpinionSummary({ p, className = "" }: { p: Opinions; className?: string }) {
  const line = summaryLine(p);

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted ${className}`}>
      {p.my_stance && (
        <span className="rounded-full border border-hairline px-2 py-0.5 text-xs font-medium text-ink">
          {STANCE_SHORT[p.my_stance]}
        </span>
      )}
      {p.scorers > 0 && p.family_avg !== null && <span aria-hidden>★</span>}
      <span>{line}</span>
    </span>
  );
}
