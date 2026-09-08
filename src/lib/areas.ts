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

