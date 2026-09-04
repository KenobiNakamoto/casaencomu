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

const eur = (n: number) => `€ ${n.toLocaleString("es-ES")}`;
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
  const message = <p className="p-4 text-zinc-600">Elige entre 2 y 4 propiedades</p>;
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

  const th = "sticky left-0 p-2 text-left font-medium whitespace-nowrap";
  const td = "min-w-40 p-2 align-top";
  return (
    <div className="overflow-x-auto p-4">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={th + " bg-white"}>Foto</th>
            {props.map((p) => (
              <td key={p.id} className={td}>
                {p.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ponytail: local photo route, no optimizer
                  <img
                    src={`/api/photos/${p.cover}`}
                    alt=""
                    className="h-28 w-40 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-28 w-40 items-center justify-center rounded bg-zinc-100 text-zinc-500">
                    Sin datos
                  </div>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th className={th + " bg-white"}>Título</th>
            {props.map((p) => (
              <td key={p.id} className={td + " font-semibold"}>
                <a href={`/propiedades/${encodeURIComponent(p.id)}`}>{p.title}</a>
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, get]) => {
            const cells = props.map(get);
            const bg = cells.some((c) => c !== cells[0]) ? " bg-amber-50" : " bg-white";
            return (
              <tr key={label} className={bg}>
                <th className={th + bg}>{label}</th>
                {cells.map((c, i) => (
                  <td key={props[i].id} className={td}>
                    {show(c)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
