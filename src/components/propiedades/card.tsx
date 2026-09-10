import Link from "next/link";
import { CompareToggle } from "@/components/comparar/controls";
import { budgetFit, type Budget } from "@/lib/listing";
import { type Stance } from "@/lib/opinion-input";
import { OpinionSummary } from "./opinion-summary";
import { Badge, StageBadge } from "./chip";
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
  /** How many people hold an opinion, how many of them scored, and whether anybody skipped. */
  voices: number;
  scorers: number;
  partial: number;
  my_stance: Stance | null;
  lat: number | null;
  lng: number | null;
  precision: "exact" | "approx" | "none";
  /** 0 while nothing has been read from the advertisement, so the title is a placeholder. */
  filled: number;
};


export function Cover({ id, className }: { id: string | null; className: string }) {
  // ponytail: plain <img>; next/image would refetch the authenticated route without the Access cookie
  // eslint-disable-next-line @next/next/no-img-element
  if (id) return <img src={`/api/photos/${id}`} alt="" loading="lazy" className={`${className} object-cover`} />;
  return (
    <div className={`${className} flex items-center justify-center bg-surface-strong text-muted-soft`} aria-hidden>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </svg>
    </div>
  );
}

const score = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Airbnb-style card: the photo is the card; text sits below with no border. */
export function PropertyCard({ p, budget, href, userId }: { p: Listed; budget: Budget | null; href: string; userId: string }) {
  const meta = [p.neighborhood, p.area_m2 !== null && fmtNum(p.area_m2, "m²"), p.rooms !== null && `${p.rooms} hab.`]
    .filter(Boolean)
    .join(" · ");
  const perM2 = p.price_eur !== null && p.area_m2 ? fmtEur(Math.round(p.price_eur / p.area_m2)) : null;
  const fit = budgetFit(p.price_eur, budget);
  return (
    // The id is the anchor a back link returns to, so the card is on screen where it was left.
    <li id={`p-${p.id}`} data-property={p.id} className="group scroll-mt-[calc(var(--header-h)+16px)]">
      {/* The photo and the title are separate links to the same home, so the comparison control
          can sit on the photograph without being inside an anchor. The photo's link is hidden
          from assistive technology: the title below already names the home. */}
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden className="block">
          <div className="relative aspect-[20/19] overflow-hidden rounded-card bg-surface-soft shadow-lift">
            <Cover id={p.cover_id} className="card-photo h-full w-full transition duration-300 group-hover:scale-[1.03]" />
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              <StageBadge stage={p.stage} />
              {/* The link is saved; the advertisement has not been read. Saying so is the whole
                  point of keeping the record instead of refusing the link. */}
              {!p.filled && <Badge>Sin leer</Badge>}
            </div>
            {p.family_avg !== null && (
              <div className="absolute right-3 top-3">
                <Badge>★ {score(p.family_avg)}</Badge>
              </div>
            )}
            {fit !== "ok" && (
              <div className="absolute bottom-3 left-3">
                {/* Over the maximum is a problem; under the minimum is only worth noticing (F30). */}
                <Badge className={fit === "over" ? "text-error" : "text-muted"}>
                  {fit === "over" ? "Fuera de presupuesto" : "Por debajo del mínimo"}
                </Badge>
              </div>
            )}
          </div>
        </Link>
        {/* The wrapper does the positioning: `.compare-toggle` sets `position: relative` for its
            own message, and that rule wins over a Tailwind utility on the same element. */}
        <div className="absolute bottom-3 right-3 z-10">
          <CompareToggle userId={userId} id={p.id} label={p.title} className="compare-compact" />
        </div>
      </div>
      <Link href={href} className="mt-3 block space-y-0.5">
        <h2 className="truncate text-[15px] font-medium text-ink">{p.title}</h2>
        <p className="truncate text-sm text-muted">{meta || "Sin datos"}</p>
        <p className="text-[15px] text-ink">
          <span className="font-semibold">{fmtEur(p.price_eur, "Sin precio")}</span>
          {perM2 && <span className="text-muted"> · {perM2}/m²</span>}
        </p>
        {/* The corner badge is the number; this line is what the number rests on. A card with a
            star and nothing else invites the family to argue with an average (#144). */}
        <OpinionSummary p={p} className="truncate" />
      </Link>
    </li>
  );
}
