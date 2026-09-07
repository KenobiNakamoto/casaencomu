/**
 * Ingest saved page captures through the app's own extractor and `save()`.
 *
 *   pnpm tsx scripts/ingest.mts <dir> [--reset] [--user <email>]
 *
 * A capture is one JSON file holding a page as the app already understands it — either the
 * server-fetch shape (`{url, status, html}`) or the bookmarklet shape
 * (`{url, title, ld, og, blob, imgs, text}`). Nothing is invented here: every field comes out of
 * `extract()`, exactly as it would from `/api/import` or `/api/capture`.
 *
 * It exists because two of the family's four portals cannot be read by a server fetch —
 * Idealista answers 403 through DataDome, and Housfy serves an empty SPA shell — so their pages
 * have to be collected in a real browser first. See `SCAFFOLD.md` § 5.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db, applySchema } from "../src/lib/db";
import { extract, type Page } from "../src/lib/extract";
import { save } from "../src/lib/save";
import { normalizeUrl } from "../src/lib/url";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) ?? "captures";
const reset = args.includes("--reset");
const email = args[args.indexOf("--user") + 1] ?? "kenobi@example.com";

const asPage = (d: Record<string, unknown>): Page => {
  const j = <T,>(v: unknown, fallback: T): T => {
    if (typeof v !== "string") return (v as T) ?? fallback;
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  };
  return {
    url: String(d.url),
    title: typeof d.title === "string" ? d.title : undefined,
    finalUrl: typeof d.finalUrl === "string" ? d.finalUrl : undefined,
    status: typeof d.status === "number" ? d.status : undefined,
    html: typeof d.html === "string" ? d.html : undefined,
    // the bookmarklet fields arrive as JSON strings, the same way the form posts them
    ld: d.ld === undefined ? undefined : j<unknown[]>(d.ld, []),
    og: d.og === undefined ? undefined : j<Record<string, string>>(d.og, {}),
    blob: typeof d.blob === "string" ? d.blob : undefined,
    imgs: d.imgs === undefined ? undefined : j<string[]>(d.imgs, []),
    text: typeof d.text === "string" ? d.text : undefined,
  };
};

await applySchema();
if (reset) {
  await db.execute("DELETE FROM properties"); // foreign keys cascade
  console.log("reset: properties cleared");
}

await db.execute({
  sql: "INSERT OR IGNORE INTO users (id, email, name, capture_token, created_at) VALUES (?, ?, ?, ?, ?)",
  args: [randomUUID(), email, email.split("@")[0], randomUUID(), new Date().toISOString()],
});
const user = (await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] }))
  .rows[0] as unknown as { id: string };

let ok = 0;
let gone = 0;
let dup = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const page = asPage(JSON.parse(readFileSync(join(dir, file), "utf8")));
  const norm = normalizeUrl(page.url);
  const listing = extract(page);
  if (!listing) {
    gone++;
    console.log(`  ${file.padEnd(30)} — no listing (removed, blocked or unreadable), status ${page.status ?? "?"}`);
    continue;
  }
  const r = await save(
    listing,
    { url_original: page.url, url_normalized: norm.normalized, portal: norm.portal, portal_ref: norm.portalRef },
    user,
    page.html ? "paste" : "bookmarklet",
  );
  if (r.duplicate) dup++;
  else ok++;
  const f = listing;
  console.log(
    `  ${file.padEnd(30)} ${r.duplicate ? "dup " : "ok  "} ` +
      [f.price_eur && `${f.price_eur} €`, f.area_m2 && `${f.area_m2} m²`, f.rooms && `${f.rooms} hab`,
       f.bathrooms && `${f.bathrooms} ba`, f.lat != null && "geo", `${f.photos.length} fotos`]
        .filter(Boolean)
        .join(" · "),
  );
}
console.log(`\n${ok} imported, ${dup} duplicates, ${gone} with no listing`);
