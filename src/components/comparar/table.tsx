"use client";

import Link from "next/link";
import { Fragment, useState, useSyncExternalStore } from "react";
import { aspect, blockers, digest, overall, said, stanceLine, voiceCount, type Lens, type Voice } from "@/lib/compare";
import { DIMENSION_LABELS, DIMENSIONS, STAGE_LABELS, type Stage } from "@/lib/listing";
import { STANCE_SHORT } from "@/lib/opinion-input";
import type { RatingRow } from "@/lib/ratings";

export type Prop = {
  id: string;
  title: string;
  stage: Stage;
  price_eur: number | null;
  area_m2: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  lift: number | null;
  outdoor: string | null;
  parking: number | null;
  condition: string | null;
  energy_rating: string | null;
  neighborhood: string | null;
  cover: string | null;
  /** null when every advertisement for it is still up. */
  gone: boolean;
  /** Published and un-withdrawn only. A draft never leaves its author's screen. */
  voices: Voice[];
  scores: RatingRow[];
  portals: string[];
};

type Cell = string | number | boolean | null;
type Ctx = { who: Lens; readerId: string; people: { id: string; name: string }[] };

const eur = (n: number) => `${n.toLocaleString("es-ES")} €`;
const bool = (v: number | null) => (v == null ? null : v !== 0);
const show = (v: Cell) => (v == null ? "Sin datos" : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v));
const one = (v: Cell) =>
  v == null ? "Sin datos" : (v as number).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Only ever used for somebody else: the reader reads «Tu nota» and «No has opinado». */
const naming = (c: Ctx, id: string) => c.people.find((p) => p.id === id)?.name ?? "Esa persona";

type Row = {
  section: string;
  label: string | ((c: Ctx) => string);
  /** The typed value the difference is decided on, before any formatting. */
  raw: (p: Prop, c: Ctx) => Cell;
  show?: (v: Cell) => string;
  /** For a cell that is more than one line of text. `raw` still decides the highlight. */
  cell?: (p: Prop, c: Ctx) => React.ReactNode;
};

const FACTS = "Datos";
const FAMILY = "La familia";
const ASPECTS = "Aspectos";
const ORIGIN = "Origen";

/**
 * Each row gives the raw typed value and, separately, how to show it. The difference is decided
 * on the raw value: two prices that round to the same €/m² still differ, and two absent facts do
 * not differ just because both print as `Sin datos` (F15).
 *
 * The opinion rows read through the lens `Ver como`, so choosing a person turns every one of them
 * into that person's. The fact rows ignore it: a flat has the same number of rooms for everybody.
 */
const ROWS: Row[] = [
  { section: FACTS, label: "Precio", raw: (p) => p.price_eur, show: (v) => (v == null ? "Sin datos" : eur(v as number)) },
  {
    section: FACTS,
    label: "€/m²",
    raw: (p) => (p.price_eur == null || !p.area_m2 ? null : Math.round(p.price_eur / p.area_m2)),
    show: (v) => (v == null ? "Sin datos" : `${eur(v as number)}/m²`),
  },
  { section: FACTS, label: "m²", raw: (p) => p.area_m2 },
  { section: FACTS, label: "Habitaciones", raw: (p) => p.rooms },
  { section: FACTS, label: "Baños", raw: (p) => p.bathrooms },
  { section: FACTS, label: "Planta", raw: (p) => p.floor },
  { section: FACTS, label: "Ascensor", raw: (p) => bool(p.lift) },
  { section: FACTS, label: "Exterior", raw: (p) => p.outdoor },
  { section: FACTS, label: "Parking", raw: (p) => bool(p.parking) },
  { section: FACTS, label: "Estado", raw: (p) => p.condition },
  { section: FACTS, label: "Certificado energético", raw: (p) => p.energy_rating },
  { section: FACTS, label: "Barrio", raw: (p) => p.neighborhood },
  { section: FACTS, label: "Etapa", raw: (p) => p.stage, show: (v) => STAGE_LABELS[v as Stage] ?? String(v) },

  {
    section: FAMILY,
    // The number summarises one person or everybody, and the label has to say which.
    label: (c) => (c.who === null ? "Nota familiar" : c.who === c.readerId ? "Tu nota" : `Nota de ${naming(c, c.who)}`),
    raw: (p, c) => overall(p.scores, c.who),
    show: one,
  },
  {
    section: FAMILY,
    label: "Postura",
    raw: (p, c) => stanceLine(p.voices, c.who),
    show: (v) => (v == null ? "Sin opinión" : String(v)),
  },
  {
    section: FAMILY,
    // Always about the property, never about the lens: it is what stops a count reading as a vote.
    label: "Han opinado",
    raw: (p) => p.voices.length,
    cell: (p, c) => <span className="text-body">{voiceCount(p.voices, c.people.length)}</span>,
  },
  {
    section: FAMILY,
    label: "Impedimentos",
    raw: (p, c) => blockers(p.voices, c.who).join(", ") || null,
    cell: (p, c) => {
      const names = blockers(p.voices, c.who);
      if (names.length === 0) return <span className="text-muted">Ninguno</span>;
      return (
        <span className="font-medium text-error">
          {names.length === 1 ? `${names[0]} señala un impedimento` : `${names.join(", ")} señalan un impedimento`}
        </span>
      );
    },
  },
  {
    section: FAMILY,
    label: "Lo que dice cada uno",
    raw: (p, c) => digest(c.who === null ? p.voices : p.voices.filter((v) => v.user_id === c.who)),
    cell: (p, c) => {
      const voices = said(p.voices, c.who, c.readerId);
      if (voices.length === 0) return <span className="text-muted">Nada escrito</span>;
      return (
        <ul className="space-y-2">
          {voices.map((v) => (
            <li key={v.user_id}>
              <Link
                href={`/propiedades/${encodeURIComponent(p.id)}#opiniones`}
                className="text-xs font-semibold text-ink hover:underline"
              >
                {v.user_id === c.readerId ? "Tú" : v.name}
                {v.stance && <span className="font-normal text-muted"> · {STANCE_SHORT[v.stance]}</span>}
              </Link>
              <p className="mt-0.5 whitespace-pre-line text-body">{v.reasoning}</p>
            </li>
          ))}
        </ul>
      );
    },
  },

  ...DIMENSIONS.map(
    (d): Row => ({
      section: ASPECTS,
      label: DIMENSION_LABELS[d],
      raw: (p, c) => aspect(p.scores, d, c.who),
      show: one,
    }),
  ),

  {
    section: ORIGIN,
    label: "Portal",
    raw: (p) => p.portals.join(", ") || null,
    cell: (p) =>
      p.portals.length === 0 ? (
        <span className="text-muted">Sin datos</span>
      ) : (
        <span className="capitalize text-body">{p.portals.join(", ")}</span>
      ),
  },
  {
    section: ORIGIN,
    label: "Anuncio",
    raw: (p) => p.gone,
    show: (v) => (v ? "Retirado del portal" : "En el portal"),
  },
];

/**
 * Whether the screen is wide enough for every column at once. A store rather than an effect, so
 * the server renders the wide layout and a phone corrects it on hydration without a flash.
 */
const QUERY = "(min-width: 768px)";
function subscribeWide(onChange: () => void) {
  const mq = matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => matchMedia(QUERY).matches,
    () => true,
  );

export function CompareTable({
  props,
  people,
  readerId,
}: {
  props: Prop[];
  /** Every account, so a count can say «2 de 4» without ever claiming 4 is the whole family. */
  people: { id: string; name: string }[];
  readerId: string;
}) {
  const wide = useWide();
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [second, setSecond] = useState(1);
  const [who, setWho] = useState<Lens>(null);

  // On a phone the first column is fixed and one other is chosen. Every selection is kept; only
  // the visible pair changes, so switching never costs a home.
  const pair = Math.min(second, props.length - 1);
  const shown = wide || props.length < 3 ? props : [props[0], props[pair]];
  const ctx: Ctx = { who, readerId, people };

  const rows = ROWS.map((r) => {
    const values = shown.map((p) => r.raw(p, ctx));
    return { ...r, values, differ: values.some((v) => v !== values[0]) };
  });
  const visible = onlyDiff ? rows.filter((r) => r.differ) : rows;
  // Nothing of this person is anywhere in the selection, which is worth saying out loud rather
  // than leaving four columns of «Sin opinión» to be read as disagreement.
  const absent = who !== null && !props.some((p) => p.voices.some((v) => v.user_id === who));

  const th = "sticky left-0 z-10 whitespace-nowrap px-3 py-3 text-left text-sm font-medium text-muted";
  const td = "min-w-44 px-3 py-3 align-top text-sm";
  // `min-w-0` on both halves: without it a select is as wide as its longest option, and a
  // property title is long enough to push the whole page sideways on a phone.
  const field = "h-11 min-w-0 max-w-full rounded-lg border border-control-border bg-raised px-2 text-ink";
  const control = "flex min-w-0 max-w-full items-center gap-2 text-sm text-body";

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          Solo diferencias
        </label>
        <label className={control}>
          Ver como
          <select value={who ?? ""} onChange={(e) => setWho(e.target.value || null)} className={field}>
            <option value="">Toda la familia</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === readerId ? `${p.name} (tú)` : p.name}
              </option>
            ))}
          </select>
        </label>
        {!wide && props.length > 2 && (
          <label className={control}>
            Comparar con
            <select value={pair} onChange={(e) => setSecond(Number(e.target.value))} className={field}>
              {props.slice(1).map((p, i) => (
                <option key={p.id} value={i + 1}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {absent && (
        <p className="mt-3 text-sm text-muted" role="status">
          {who === readerId ? "No has opinado" : `${naming(ctx, who)} no ha opinado`} sobre ninguna de estas propiedades.
        </p>
      )}

      {onlyDiff && visible.length === 0 && (
        <p className="mt-6 rounded-card border border-hairline px-6 py-10 text-center text-sm text-muted">
          Estas propiedades coinciden en todo lo que comparamos.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-card border border-hairline">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} bg-raised`} />
              {shown.map((p) => (
                <td key={p.id} className={td}>
                  {p.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ponytail: local photo route, no optimizer
                    <img src={`/api/photos/${p.cover}`} alt="" className="aspect-[4/3] w-52 rounded-card object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] w-52 items-center justify-center rounded-card bg-surface-strong text-sm text-muted">
                      Sin foto
                    </div>
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b border-hairline">
              <th className={`${th} bg-raised`}>Título</th>
              {shown.map((p) => (
                <td key={p.id} className={`${td} font-medium`}>
                  <Link href={`/propiedades/${encodeURIComponent(p.id)}`} className="hover:underline">
                    {p.title}
                  </Link>
                </td>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {visible.map((r, i) => {
              const bg = r.differ ? " bg-accent-tint" : " bg-raised";
              const label = typeof r.label === "function" ? r.label(ctx) : r.label;
              return (
                // `${section} ${label}` because two rows are legitimately called «Estado» — the
                // flat's condition and the family's score for it. A bare label as the key made
                // React reconcile one onto the other when «Solo diferencias» hid rows between them.
                <Fragment key={`${r.section} ${label}`}>
                  {/* A heading only where its section actually starts, so hiding every row of a
                      section with «Solo diferencias» hides that section's heading with them. */}
                  {r.section !== visible[i - 1]?.section && (
                    <tr className="bg-surface-strong">
                      <th
                        colSpan={shown.length + 1}
                        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        {r.section}
                      </th>
                    </tr>
                  )}
                  <tr className={bg}>
                    <th className={th + bg}>{label}</th>
                    {shown.map((p, j) => (
                      <td key={p.id} className={td + (r.differ ? " font-medium text-ink" : " text-body")}>
                        {r.cell ? r.cell(p, ctx) : (r.show ?? show)(r.values[j])}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
