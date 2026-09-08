/**
 * Builds `public/areas.geojson` — the map's zone overlay — for one country, at every
 * administrative level that country uses.
 *
 *   pnpm tsx scripts/build-areas.mts es                    # the whole country
 *   pnpm tsx scripts/build-areas.mts es --root Catalunya   # one first-level area
 *   pnpm tsx scripts/build-areas.mts es --root Catalunya --max-rank 4
 *
 * The source is OpenStreetMap, because it is the only free source that covers every country the
 * same way, from a region down to a city neighbourhood. What differs between countries is only
 * which `admin_level` number means what — Spain calls level 7 a comarca, Germany calls it an
 * Amt — and that is the entire content of `scripts/areas/<code>.json`. To add a country, write
 * that file. Nothing in here changes. See `scripts/areas/README.md`.
 *
 * Two services, each for the one thing it is good at:
 *
 *   Overpass          which areas exist, one query per parent area. Names and ids only, no
 *                     geometry: asking it for every municipality of a region at once answers
 *                     504, and the same question asked one comarca at a time answers in
 *                     three seconds.
 *   polygons.osm.fr   the shape of one area, one relation per request, at a fine tolerance.
 *                     Making it small is `align()`'s job, not the request's: a border between
 *                     two areas has to be generalised once for both of them, or the map draws
 *                     it twice.
 *
 * Every response is cached under `_local/overpass/`. A second run costs nothing, and a run
 * interrupted halfway resumes. `--fresh` ignores the cache.
 *
 * OSM data is ODbL. The map carries the attribution; keep it there.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mapshaper from "mapshaper";
import { inArea, type AreaFeature, type AreaProps } from "../src/lib/geo";

/** `tol` is the generalisation, in metres, and `digits` the decimals kept. Both per rank. */
type Level = { rank: number; level: string; admin: number; tol: number; digits: number; chunk?: number };
/**
 * `scope` is the part of the country this deployment covers — named areas at one rank, kept whole
 * with everything inside them. It is the product's decision, not the country's shape: delete it
 * and the same file builds the whole country.
 */
type Scope = { rank: number; names: string[] };
type Config = { code: string; name: string; osm: number; levels: Level[]; scope?: Scope };

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const code = (args.find((a) => !a.startsWith("--")) ?? "es").toLowerCase();
const rootFilter = flag("root")?.toLowerCase();
const maxRank = Number(flag("max-rank") ?? 99);
const fresh = args.includes("--fresh");
const config = JSON.parse(readFileSync(join("scripts/areas", `${code}.json`), "utf8")) as Config;
const scope = config.scope;

const CACHE = "_local/overpass";
const UA = "casaencomu-area-builder/1";
/**
 * One Overpass instance, deliberately. The mirrors look interchangeable and are not: an `area:`
 * query needs an areas index, and a mirror that does not build one answers `200` with an empty
 * result instead of an error. Rotating between them turned "43 comarques" into "0 comarques" and
 * cached it. A slow answer is recoverable; a confidently wrong one is not.
 */
const OVERPASS = "https://overpass-api.de/api/interpreter";
const METRES_PER_DEG = 111_320;

/**
 * Overpass allows two queries at a time per address and answers 429 when it has had enough. It
 * also says, on `/api/status`, exactly when the next slot frees. Guessing at that number is what
 * left twelve comarques unanswered on three runs in a row; asking is one request.
 */
async function slotFreesIn(): Promise<number> {
  const text = await fetch("https://overpass-api.de/api/status").then((r) => r.text()).catch(() => "");
  const waits = [...text.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
  return waits.length ? Math.min(...waits) + 2 : 60;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cacheFile = (key: string) => join(CACHE, `${createHash("sha1").update(key).digest("hex").slice(0, 16)}.json`);

/** Any request, answered from disk when it has been answered before. */
async function cached(key: string, get: () => Promise<Response>, keep: (body: string) => boolean = () => true): Promise<string | null> {
  mkdirSync(CACHE, { recursive: true });
  const file = cacheFile(key);
  if (!fresh && existsSync(file)) return readFileSync(file, "utf8") || null;
  // Two different failures, two different answers. A server that says 429 or 504 is busy and
  // wants a minute. A connection that never opens is one of the several addresses the name
  // resolves to being unreachable from here, and the cure is to dial again straight away —
  // `fetch failed / ECONNREFUSED` in half a second, while `curl` to the same host succeeds.
  // A failure is never cached, so a second run asks only what is still missing.
  for (let attempt = 1; attempt <= 8; attempt++) {
    let status = 0;
    const body = await get()
      .then(async (res) => {
        status = res.status;
        return res.ok ? res.text() : "";
      })
      .catch(() => "");
    if (body.startsWith("{") && keep(body)) {
      writeFileSync(file, body);
      return body;
    }
    if (body.startsWith("{")) return body; // real, just not worth remembering
    // 429: it told us to wait, so wait exactly that long. Any other answer: it is busy, give it a
    // minute. No answer at all — `fetch failed / ECONNREFUSED` in a fifth of a second, with no
    // request having left the machine — is the network here, not the server, so dial again soon
    // and then less often: 2 s, 4, 8, 16, up to about two minutes.
    await sleep(status === 429 ? (await slotFreesIn()) * 1000 : status ? 30_000 : Math.min(2_000 * 2 ** (attempt - 1), 120_000));
  }
  return null;
}

/* -------------------------------------------------------------- discovery */

type Relation = { id: number; tags: Record<string, string> };
const unanswered: string[] = [];

/** Every administrative relation of one `admin_level` inside one other relation. */
async function childrenOf(parentOsm: number, admin: number): Promise<Relation[]> {
  const query =
    `[out:json][timeout:180];\n` +
    `rel(area:${3600000000 + parentOsm})["boundary"="administrative"]["admin_level"="${admin}"];\n` +
    `out tags;`;
  const body = await cached(
    query,
    () =>
      fetch(OVERPASS, {
        method: "POST",
        headers: { "user-agent": UA },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(180_000),
      }),
    // An empty answer is never cached. It is what a busy or half-built server returns instead of
    // an error, and remembering it would bake the gap into every later run.
    (b) => (JSON.parse(b).elements as unknown[]).length > 0,
  );
  if (!body) {
    // Not fatal. One region missing its municipalities is a gap; a crash after forty minutes of
    // asking is a lost afternoon. The run says what it did not get, and a second run asks again —
    // only for the gaps, because a failure is never cached.
    unanswered.push(`admin_level ${admin} inside relation ${parentOsm}`);
    return [];
  }
  return JSON.parse(body).elements as Relation[];
}

/**
 * `--probe` answers the only question a new country asks: which `admin_level` number holds what.
 *
 *   pnpm tsx scripts/build-areas.mts de --probe
 *   pnpm tsx scripts/build-areas.mts de --probe --inside 62422      # inside Berlin
 *
 * It prints the count and four names per level, and nothing else. Write the config from what it
 * says, not from what a wiki page says: mapping practice differs by country and by city.
 */
if (args.includes("--probe")) {
  const inside = Number(flag("inside") ?? config.osm);
  for (const admin of [3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const names = await childrenOf(inside, admin)
      .then((rels) => rels.map((r) => r.tags?.name).filter(Boolean))
      .catch(() => null);
    const count = names ? String(names.length).padStart(5) : "  ...";
    console.log(`admin_level ${String(admin).padStart(2)}  ${count}  ${names ? names.slice(0, 4).join(" · ") : "too many to ask at once — probe inside a smaller area"}`);
  }
  process.exit(0);
}

/* --------------------------------------------------------------- geometry */

type Geometry = AreaFeature["geometry"];

/**
 * The shape of one relation, at one fine tolerance for every rank. The three numbers are the
 * service's own generalisation; the first dominates and a quarter of it for the other two
 * matches the ratio its own interface uses.
 *
 * A metre is far finer than the map needs — Catalonia alone is 2 MB at this setting — but the
 * generalisation cannot happen here. Two neighbours share a border in OpenStreetMap, and asking
 * for each of them separately at the rank's own tolerance returns two different copies of that
 * one border. `align()` is where the shapes are made small, together.
 */
const SOURCE_TOL = 1; // metres
async function shapeOf(osm: number): Promise<Geometry | null> {
  const t = SOURCE_TOL / METRES_PER_DEG;
  const params = `${t.toFixed(6)}-${(t / 4).toFixed(6)}-${(t / 4).toFixed(6)}`;
  const url = `https://polygons.openstreetmap.fr/get_geojson.py?id=${osm}&params=${params}`;
  const body = await cached(url, () => fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(240_000) }));
  if (!body) {
    // Remember the ones that never arrive. Three shapes in Catalonia hang on every attempt, and
    // without this each of them costs eight four-minute timeouts on every rebuild — half an hour
    // apiece, to be told again what the last run already found out. `--fresh` asks them again.
    // Only shapes are remembered this way: a missing shape is one area the map cannot draw, while
    // a missing Overpass answer is a whole rank silently emptied.
    writeFileSync(cacheFile(url), "");
    return null;
  }
  const g = JSON.parse(body) as Geometry;
  return g?.type === "Polygon" || g?.type === "MultiPolygon" ? g : null;
}

/**
 * Generalises one whole rank in a single pass, so that the border between two areas is one line
 * and not two.
 *
 * Simplifying each shape on its own cannot do this, whatever the algorithm: Douglas-Peucker keeps
 * a different set of points depending on where the ring starts and which way round it runs, so the
 * two copies of a shared border drift apart. On the six barris of l'Eixample the drift reached
 * 19 m, which at z17 is a black line and a gold line running side by side down the same street.
 *
 * mapshaper does it the way it has to be done: `snap` collapses the near-identical vertices of the
 * two copies into one, which turns the border into a single arc that both areas point at, and the
 * arc is then simplified once. Everything the map draws twice is drawn from the same numbers.
 *
 * Five metres of snapping, measured rather than guessed. OpenStreetMap's own two copies of a
 * border are one to two metres apart — the relations follow different ways down the same street —
 * and at two metres seven in ten border vertices were still the area's own alone. At five, four in
 * five are the neighbour's as well and the middle one is exact. Twenty would close the rest and
 * start flattening a barrio's corners, which are a fifth of a block apart.
 *
 * Mutates, because the feature is the same feature — only its shape is smaller.
 */
async function align(features: AreaFeature[], level: Level): Promise<void> {
  if (!features.length) return;
  const command = [
    `-i in.json snap snap-interval=${(5 / METRES_PER_DEG).toFixed(6)}`,
    `-simplify interval=${level.tol} keep-shapes`,
    `-o out.json format=geojson precision=${10 ** -level.digits}`,
  ].join(" ");
  const out = await mapshaper.applyCommands(command, {
    "in.json": JSON.stringify({ type: "FeatureCollection", features }),
  });
  const shaped = new Map<string, Geometry>(
    (JSON.parse(out["out.json"]) as { features: AreaFeature[] }).features.map((f) => [f.properties.id, f.geometry]),
  );
  for (let i = features.length - 1; i >= 0; i--) {
    const g = shaped.get(features[i].properties.id);
    if (g) features[i].geometry = g;
    else features.splice(i, 1); // simplified away to nothing: an area the map could not draw anyway
  }
}

/** Up to 21 points spread over a feature, for deciding which bigger area contains it. */
function probes(f: AreaFeature): [number, number][] {
  const coords = (f.geometry.type === "Polygon" ? f.geometry.coordinates.flat() : f.geometry.coordinates.flat(2)) as [number, number][];
  const step = Math.max(1, Math.floor(coords.length / 20));
  const picked = coords.filter((_, i) => i % step === 0);
  const mid = picked.reduce((a, p) => [a[0] + p[0] / picked.length, a[1] + p[1] / picked.length] as [number, number], [0, 0]);
  return [mid, ...picked];
}

/** Four at a time: enough to finish a region in minutes, few enough to be a polite guest. */
async function pooled<In, Out>(items: In[], run: (item: In) => Promise<Out>, tick: () => void): Promise<Out[]> {
  const out: Out[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let i = next++; i < items.length; i = next++) {
        out[i] = await run(items[i]);
        tick();
      }
    }),
  );
  return out;
}

/* ------------------------------------------------------------------ build */

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const byRank = new Map<number, AreaFeature[]>();
const osmOf = new Map<string, number>(); // feature id -> OSM relation id, for the next level's query
const line = (s: string) => process.stdout.write(`\r${s.padEnd(72)}`);

for (const level of config.levels) {
  if (level.rank > maxRank) break;
  // Ask inside the widest area that can answer, because a spatial Overpass query is the scarce
  // thing here: the public endpoint allows two at a time and rate-limits an IP that asks more.
  // One question for every barrio in Catalonia is answered in seconds; the same question asked
  // once per comarca is 43 questions and a 429. `chunk` only goes deeper where it has to — in
  // Spain that is the 947 municipalities, which time out unless they are asked by province.
  const parents =
    level.rank === 1
      ? [{ osm: config.osm, name: config.name }]
      : (byRank.get(level.chunk ?? 1) ?? []).map((f) => ({ osm: osmOf.get(f.properties.id)!, name: f.properties.name }));

  const found = new Map<number, Relation>();
  for (const [i, parent] of parents.entries()) {
    if (i) await sleep(3_000); // two slots per IP, and a slot is held for as long as the query runs
    line(`  ${level.level.padEnd(10)} asking  ${i + 1}/${parents.length}  ${parent.name}`);
    for (const rel of await childrenOf(parent.osm, level.admin)) if (rel.tags?.name) found.set(rel.id, rel);
  }

  let rels = [...found.values()];
  if (level.rank === 1 && rootFilter) {
    // Before any shape is asked for: nineteen regions nobody wants are nineteen of the slowest
    // requests the polygon service has.
    const kept = rels.filter((r) => r.tags.name.toLowerCase().includes(rootFilter));
    if (!kept.length) throw new Error(`--root ${rootFilter} matched none of: ${rels.map((r) => r.tags.name).join(", ")}`);
    rels = kept;
  }
  if (level.rank === scope?.rank) {
    // Before any shape is asked for, as above. This is also what keeps the ranks below small:
    // a level with `chunk` set to this rank asks only inside what is left here.
    const want = scope.names.map(slug);
    const kept = rels.filter((r) => want.includes(slug(r.tags.name)));
    if (kept.length !== want.length) {
      throw new Error(`scope matched ${kept.length} of ${want.length} names among: ${rels.map((r) => r.tags.name).join(", ")}`);
    }
    rels = kept;
  }
  let done = 0;
  const shapes = await pooled(
    rels,
    (rel) => shapeOf(rel.id),
    () => line(`  ${level.level.padEnd(10)} drawing ${++done}/${rels.length}`),
  );

  const features: AreaFeature[] = [];
  for (const [i, rel] of rels.entries()) {
    const geometry = shapes[i];
    if (!geometry) continue;
    // OSM ids are stable and unique across levels, so the id cannot collide with another area's.
    const properties: AreaProps = {
      id: `${level.rank}-${slug(rel.tags.name)}-${rel.id}`,
      name: rel.tags.name, // the local name, the way the portals and the family write it
      level: level.level,
      rank: level.rank,
      parent: null,
    };
    osmOf.set(properties.id, rel.id);
    features.push({ type: "Feature", properties, geometry });
  }

  // One pass over the whole rank, so that two areas that share a border share its geometry.
  await align(features, level);

  // The parent is the smallest area above this one that holds the feature. Not always one rank
  // up: a barrio in a town with no districts hangs off the municipality instead.
  for (const f of features) {
    const points = probes(f);
    for (let r = level.rank - 1; r >= 1 && !f.properties.parent; r--) {
      let best: { id: string; hits: number } | null = null;
      for (const up of byRank.get(r) ?? []) {
        const hits = points.filter((p) => inArea(p[0], p[1], up)).length;
        if (hits > (best?.hits ?? 0)) best = { id: up.properties.id, hits };
      }
      if (best) f.properties.parent = best.id;
    }
  }

  byRank.set(level.rank, features);
  const lost = rels.length - features.length;
  const orphans = level.rank === 1 ? 0 : features.filter((f) => !f.properties.parent).length;
  line(
    `  ${level.level.padEnd(10)} ${String(features.length).padStart(4)} areas` +
      `${lost ? `, ${lost} with no shape` : ""}${orphans ? `, ${orphans} with no parent` : ""}\n`,
  );

}

// Everything below the scope rank that is not inside one of the named areas goes. The ranks
// above it stay whole: the map needs a zone to draw in every zoom band, and there are five of them.
if (scope) {
  const inScope = new Set((byRank.get(scope.rank) ?? []).map((f) => f.properties.id));
  const parentOf = new Map(config.levels.flatMap((l) => byRank.get(l.rank) ?? []).map((f) => [f.properties.id, f.properties.parent]));
  const held = (f: AreaFeature) => {
    for (let id = f.properties.parent; id; id = parentOf.get(id) ?? null) if (inScope.has(id)) return true;
    return false;
  };
  for (const l of config.levels) {
    if (l.rank > scope.rank) byRank.set(l.rank, (byRank.get(l.rank) ?? []).filter(held));
  }
}

const all = config.levels.flatMap((l) => byRank.get(l.rank) ?? []);
const json = JSON.stringify({ type: "FeatureCollection", features: all });
writeFileSync("public/areas.geojson", json);
const kb = json.length / 1024;
console.log(`\n${all.length} areas, ${new Set(all.map((f) => f.properties.id)).size} unique ids, ${kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`}`);
if (unanswered.length) console.log(`${unanswered.length} questions went unanswered — run it again to fill them in:\n  ${unanswered.join("\n  ")}`);
