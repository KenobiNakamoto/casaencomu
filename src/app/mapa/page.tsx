import Mapa from "@/components/mapa/Mapa";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MapaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  // ponytail: the list's other URL filters are not wired to the map; add when the family asks
  for (const k of ["etapa", "todas"]) if (typeof sp[k] === "string") q.set(k, sp[k]);
  return <Mapa query={q.toString()} />;
}
