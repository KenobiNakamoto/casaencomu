import Link from "next/link";
import type { Budget } from "@/lib/settings";
import { outOfBudget, type Listed } from "./card";
import { BudgetChip, StageChip } from "./chip";
import { fmtEur, fmtNum } from "./format";

const th = "px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500";
const td = "px-2 py-1.5 align-top";

export function RowsTable({ items, budget }: { items: Listed[]; budget: Budget | null }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-zinc-50">
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
        <tbody className="divide-y divide-zinc-100">
          {items.map((p) => (
            <tr key={p.id}>
              <td className={td}>
                <Link href={`/propiedades/${p.id}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
              </td>
              <td className={`${td} whitespace-nowrap text-right`}>
                {fmtEur(p.price_eur, "—")}
                {outOfBudget(p.price_eur, budget) && (
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
