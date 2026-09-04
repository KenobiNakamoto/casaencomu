import Link from "next/link";
import type { Budget } from "@/lib/settings";
import { BudgetChip, StageChip } from "./chip";
import { fmtEur, fmtNum } from "./format";

/** One row of the list query. */
export type Listed = {
  id: string;
  title: string;
  price_eur: number | null;
  area_m2: number | null;
  rooms: number | null;
  stage: string;
  neighborhood: string | null;
  cover_id: string | null;
  family_avg: number | null;
};

export const outOfBudget = (price: number | null, budget: Budget | null) =>
  budget !== null && price !== null && (price < budget.min || price > budget.max);

export function Cover({ id, className }: { id: string | null; className: string }) {
  // ponytail: plain <img>; next/image would refetch the authenticated route without the Access cookie
  // eslint-disable-next-line @next/next/no-img-element
  if (id) return <img src={`/api/photos/${id}`} alt="" loading="lazy" className={`${className} object-cover`} />;
  return <div className={`${className} bg-zinc-200`} aria-hidden />;
}

export function PropertyCard({ p, budget }: { p: Listed; budget: Budget | null }) {
  return (
    <li className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <Link href={`/propiedades/${p.id}`} className="block">
        <Cover id={p.cover_id} className="aspect-[4/3] w-full" />
        <div className="space-y-1.5 p-3">
          <h2 className="line-clamp-2 font-medium leading-snug">{p.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{fmtEur(p.price_eur, "Sin precio")}</span>
            {outOfBudget(p.price_eur, budget) && <BudgetChip />}
          </div>
          <p className="text-sm text-zinc-600">
            {[
              p.area_m2 !== null && fmtNum(p.area_m2, "m²"),
              p.rooms !== null && `${p.rooms} hab.`,
              p.neighborhood,
            ]
              .filter(Boolean)
              .join(" · ") || "Sin datos"}
          </p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <StageChip stage={p.stage} />
            <span className="text-sm text-zinc-600">
              {p.family_avg !== null ? `★ ${p.family_avg.toLocaleString("es-ES")}` : "Sin valorar"}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
