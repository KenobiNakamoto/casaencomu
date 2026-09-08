import { readFile } from "node:fs/promises";
import path from "node:path";
import { type AreaFeature, type Areas } from "./geo";

// ponytail: server-only. The file lives in `public/` so the browser fetches the same bytes the
// server reads, and the Dockerfile already copies that folder next to server.js.
let cache: Areas | undefined;

export async function loadAreas(): Promise<Areas> {
  cache ??= JSON.parse(await readFile(path.join(process.cwd(), "public", "areas.geojson"), "utf8")) as Areas;
  return cache;
}

export async function findArea(id: string): Promise<AreaFeature | undefined> {
  return id ? (await loadAreas()).features.find((f) => f.properties.id === id) : undefined;
}

/**
 * The area and every area above it, widest first — `Catalunya`, `Barcelonès`, `Barcelona`. The
 * chain is what makes a zone readable: `Sant Martí` alone does not say which city it is in.
 */
export async function areaChain(id: string): Promise<AreaFeature[]> {
  const by = new Map((await loadAreas()).features.map((f) => [f.properties.id, f]));
  const chain: AreaFeature[] = [];
  // ponytail: the depth guard is for a parent cycle, which the build cannot produce today.
  for (let f = by.get(id); f && chain.length < 8; f = f.properties.parent ? by.get(f.properties.parent) : undefined) chain.unshift(f);
  return chain;
}
