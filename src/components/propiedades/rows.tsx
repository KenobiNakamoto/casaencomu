import Link from "next/link";
import { CompareToggle } from "@/components/comparar/controls";
import { budgetFit, type Budget } from "@/lib/listing";
import { Cover, type Listed } from "./card";
import { BudgetChip, Chip, StageChip } from "./chip";
import { fmtEur, fmtNum } from "./format";

const score = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * The gallery card's information laid out as a row: the photograph on the left, everything else
 * beside it. It was a table of eight narrow columns with no photograph, which scrolled sideways on
 * a phone (issue #95). Same fields, same order of importance, more homes per screen than the
 * gallery.
 */
function Row({ p, budget, href, userId }: { p: Listed; budget: Budget | null; href: string; userId: string }) {
  const meta = [p.area_m2 !== null && fmtNum(p.area_m2, "m²"), p.rooms !== null && `${p.rooms} hab.`]
    .filter(Boolean)
    .join(" · ");
  const perM2 = p.price_eur !== null && p.area_m2 ? fmtEur(Math.round(p.price_eur / p.area_m2)) : null;
  const fit = budgetFit(p.price_eur, budget);
  return (
    // The id is the anchor a back link returns to, so the row is on screen where it was left.
    <li id={`p-${p.id}`} data-property={p.id} className="group scroll-mt-[calc(var(--header-h)+16px)] py-5 first:pt-0 last:pb-0">
      <div className="flex gap-4 sm:gap-5">
        {/* The photograph and the title are separate links to the same home, so the comparison
            control can sit beside the title without being inside an anchor. The photograph's link
            is hidden from assistive technology: the title already names the home. */}
        <div className="relative w-32 shrink-0 sm:w-56">
          <Link href={href} tabIndex={-1} aria-hidden className="block">
            <div className="aspect-[3/2] overflow-hidden rounded-card bg-surface-soft">
              <Cover id={p.cover_id} className="card-photo h-full w-full transition duration-300 group-hover:scale-[1.03]" />
            </div>
          </Link>
          {/* On the photograph, as on the card: the wrapper does the positioning, because
              `.compare-toggle` sets its own `position` and that rule wins over a utility. */}
          <div className="absolute bottom-2 right-2 z-10">
            <CompareToggle userId={userId} id={p.id} label={p.title} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-muted">{p.neighborhood ?? "Sin barrio"}</p>
              <Link href={href} className="mt-0.5 block">
                <h2 className="line-clamp-2 text-[15px] font-medium text-ink group-hover:underline">{p.title}</h2>
              </Link>
            </div>
            {p.family_avg !== null && (
              <p className="shrink-0 whitespace-nowrap text-sm text-ink">★ {score(p.family_avg)}</p>
            )}
          </div>

          <p className="mt-1 truncate text-sm text-muted">{meta || "Sin datos"}</p>

          {/* The stage and the price sit at the foot of the row, apart from the description, so a
              column of rows reads down the two things a decision is made on. */}
          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <StageChip stage={p.stage} />
              {/* The budget is said in words, never by the colour of the price alone. Over the
                  maximum is a problem; under the minimum is only worth noticing (F30). */}
              {fit === "over" && <BudgetChip />}
              {fit === "under" && <Chip>Por debajo del mínimo</Chip>}
            </div>
            <p className="text-[15px] text-ink">
              <span className="font-semibold">{fmtEur(p.price_eur, "Sin precio")}</span>
              {perM2 && <span className="text-muted"> · {perM2}/m²</span>}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

export function RowsList({ items, budget, href, userId }: { items: Listed[]; budget: Budget | null; href: (id: string) => string; userId: string }) {
  return (
    <ul className="divide-y divide-hairline-soft">
      {items.map((p) => (
        <Row key={p.id} p={p} budget={budget} href={href(p.id)} userId={userId} />
      ))}
    </ul>
  );
}
