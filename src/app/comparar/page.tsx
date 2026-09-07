import Link from "next/link";
import { db } from "@/lib/db";
import { STAGE_LABELS, type Stage } from "@/lib/listing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Prop = {
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
  rating: number | null;
};

type Cell = string | number | boolean | null;

const eur = (n: number) => `${n.toLocaleString("es-ES")} €`;
const show = (v: Cell) =>
  v == null ? "Sin datos" : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v);
const bool = (v: number | null) => (v == null ? null : v !== 0);

const ROWS: [string, (p: Prop) => Cell][] = [
  ["Precio", (p) => (p.price_eur == null ? null : eur(p.price_eur))],
  [
    "€/m²",
    (p) =>
      p.price_eur == null || !p.area_m2 ? null : `${eur(Math.round(p.price_eur / p.area_m2))}/m²`,
  ],
  ["m²", (p) => p.area_m2],
  ["Habitaciones", (p) => p.rooms],
  ["Baños", (p) => p.bathrooms],
  ["Planta", (p) => p.floor],
  ["Ascensor", (p) => bool(p.lift)],
  ["Exterior", (p) => p.outdoor],
  ["Parking", (p) => bool(p.parking)],
  ["Estado", (p) => p.condition],
  ["Certificado energético", (p) => p.energy_rating],
  ["Barrio", (p) => p.neighborhood],
  ["Etapa", (p) => STAGE_LABELS[p.stage] ?? p.stage],
  [
    "Nota familiar",
    (p) =>
      p.rating == null
        ? null
        : p.rating.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  ],
];

export default async function CompararPage({ searchParams }: { searchParams: SearchParams }) {
  const { ids } = await searchParams;
  const wanted = (typeof ids === "string" ? ids : "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const message = (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-[22px] font-medium">Comparar</h1>
      <div className="mt-6 rounded-card border border-hairline px-6 py-16 text-center">
        <p className="text-lg font-medium">Elige entre 2 y 4 propiedades</p>
        <p className="mt-1 text-sm text-muted">
          Abre <code className="rounded bg-surface-strong px-1.5 py-0.5 text-xs">/comparar?ids=a,b,c</code> con sus identificadores, o parte desde{" "}
          <Link href="/propiedades" className="font-medium text-ink underline underline-offset-4">
            Propiedades
          </Link>
          .
        </p>
      </div>
    </div>
  );
  if (wanted.length < 2) return message;

  const { rows } = await db.execute({
    sql: `SELECT p.*,
            (SELECT id FROM photos WHERE property_id = p.id AND position = 0) AS cover,
            (SELECT AVG(score) FROM ratings WHERE property_id = p.id) AS rating
          FROM properties p WHERE p.id IN (${wanted.map(() => "?").join(",")})`,
    args: wanted,
  });
  const props = (rows as unknown as Prop[]).sort(
    (a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id),
  );
  if (props.length < 2) return message;

  const th = "sticky left-0 whitespace-nowrap px-3 py-3 text-left text-sm font-medium text-muted";
  const td = "min-w-44 px-3 py-3 align-top text-sm";
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10">
      <h1 className="text-[22px] font-medium">Comparar</h1>
      <p className="mt-1 text-sm text-muted">Las filas en las que difieren van resaltadas.</p>
      <div className="mt-6 overflow-x-auto rounded-card border border-hairline">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className={th + " bg-raised"} />
              {props.map((p) => (
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
              <th className={th + " bg-raised"}>Título</th>
              {props.map((p) => (
                <td key={p.id} className={td + " font-medium"}>
                  <Link href={`/propiedades/${encodeURIComponent(p.id)}`} className="hover:underline">
                    {p.title}
                  </Link>
                </td>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {ROWS.map(([label, get]) => {
              const cells = props.map(get);
              const differ = cells.some((c) => c !== cells[0]);
              const bg = differ ? " bg-accent-tint" : " bg-raised";
              return (
                <tr key={label} className={bg}>
                  <th className={th + bg}>{label}</th>
                  {cells.map((c, i) => (
                    <td key={props[i].id} className={td + (differ ? " font-medium text-ink" : " text-body")}>
                      {show(c)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
