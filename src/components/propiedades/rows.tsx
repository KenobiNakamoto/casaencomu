import Link from "next/link";
import { budgetFit, type Budget } from "@/lib/listing";
import { type Listed } from "./card";
import { BudgetChip, StageChip } from "./chip";
import { fmtEur, fmtNum } from "./format";

const th = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const td = "px-3 py-3 align-top";

export function RowsTable({ items, budget, href }: { items: Listed[]; budget: Budget | null; href: (id: string) => string }) {
  return (
    <div className="overflow-x-auto rounded-card border border-hairline">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-surface-soft">
          <tr>
            <th className={th}>Título</th>
            <th className={`${th} text-right`}>Precio</th>
            <th className={`${th} text-right`}>m²</th>
            <th className={`${th} text-right`}>Hab.</th>
            <th className={th}>Barrio</th>
            <th className={th}>Etapa</th>
            <th className={`${th} text-right`}>Nota</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline-soft">
          {items.map((p) => (
            <tr key={p.id} id={`p-${p.id}`} data-property={p.id} className="scroll-mt-[calc(var(--header-h)+16px)] hover:bg-surface-soft">
              <td className={td}>
                <Link href={href(p.id)} className="font-medium hover:underline">
                  {p.title}
                </Link>
              </td>
              <td className={`${td} whitespace-nowrap text-right font-semibold`}>
                {fmtEur(p.price_eur, "—")}
                {budgetFit(p.price_eur, budget) === "over" && (
                  <span className="ml-1">
                    <BudgetChip />
                  </span>
                )}
              </td>
              <td className={`${td} text-right`}>{p.area_m2 !== null ? fmtNum(p.area_m2) : "—"}</td>
              <td className={`${td} text-right`}>{p.rooms ?? "—"}</td>
              <td className={td}>{p.neighborhood ?? "—"}</td>
              <td className={td}>
                <StageChip stage={p.stage} />
              </td>
              <td className={`${td} text-right`}>{p.family_avg?.toLocaleString("es-ES") ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
