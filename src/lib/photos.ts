import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { db } from "./db";
import { fetchGuarded } from "./fetching";
import { isAllowedImageHost } from "./url";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const MAX_PHOTOS = 40;
const MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 5_000;
const CONCURRENCY = 4;

export const photoPath = (propertyId: string, sha256: string) =>
  join(DATA_DIR, "photos", propertyId, sha256 + ".jpg");

/**
 * Original bytes, or null when the response is not a small image. The cap is applied to the
 * stream, so a response that declares no `content-length` is stopped at 5 MiB rather than
 * buffered whole and measured afterwards (finding F38).
 */
async function fetchImage(url: string, deadline?: AbortSignal): Promise<Buffer | null> {
  const r = await fetchGuarded(url, {
    allow: isAllowedImageHost,
    maxBytes: MAX_BYTES,
    timeoutMs: PHOTO_TIMEOUT_MS,
    signal: deadline,
  });
  if ("refused" in r) return null;
  if (r.status !== 200 || r.truncated || !r.contentType.startsWith("image/")) return null;
  return r.body.byteLength ? r.body : null;
}

/** True when a new photo row was written; false when skipped (bad fetch, duplicate). */
async function savePhoto(
  propertyId: string,
  url: string,
  position: number,
  deadline?: AbortSignal,
): Promise<boolean> {
  const buf = await fetchImage(url, deadline);
  if (!buf) return false;
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const dup = await db.execute({
    sql: "SELECT id, source_url FROM photos WHERE property_id = ? AND sha256 = ?",
    args: [propertyId, sha256],
  });
  if (dup.rows.length) {
    // Rows stored before the source_url column existed have none, and their URLs are never
    // guessed. Learning it here, from bytes we already hold, is the one honest way to fill it —
    // and it stops the next refresh downloading the same photo again.
    if (dup.rows[0].source_url == null) {
      await db.execute({ sql: "UPDATE photos SET source_url = ? WHERE id = ?", args: [url, dup.rows[0].id] });
    }
    return false;
  }
  const { data, info } = await sharp(buf)
    .rotate()
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  await mkdir(join(DATA_DIR, "photos", propertyId), { recursive: true });
  await writeFile(photoPath(propertyId, sha256), data);
  // OR IGNORE: two workers can race on the same bytes at two URLs; the UNIQUE index settles it.
  const { rowsAffected } = await db.execute({
    sql: `INSERT OR IGNORE INTO photos (id, property_id, position, sha256, width, height, source_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), propertyId, position, sha256, info.width, info.height, url],
  });
  return rowsAffected > 0;
}

/**
 * Downloads, dedupes, resizes to 800 px JPEG and records photos. Returns how many were saved.
 * One failed photo never fails the import; `position` keeps the listing's order. A caller with an
 * overall deadline passes it: the remaining photos are then abandoned, and the count it gets back
 * is the honest one, which is what the page reports (`Faltan N fotos`).
 */
export async function savePhotos(propertyId: string, urls: string[], deadline?: AbortSignal): Promise<number> {
  // MAX_PHOTOS is a ceiling for the property, not for one call. Without the count a refresh would
  // fetch the next 40 URLs each time and the set would grow on every check.
  const held = Number(
    (await db.execute({ sql: "SELECT count(*) FROM photos WHERE property_id = ?", args: [propertyId] })).rows[0][0],
  );
  const room = MAX_PHOTOS - held;
  if (room <= 0) return 0;
  const list = [...new Set(urls)].filter((u) => isAllowedImageHost(u)).slice(0, room);
  let saved = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length && !deadline?.aborted) {
      const position = next++;
      try {
        if (await savePhoto(propertyId, list[position], position, deadline)) saved++;
      } catch {
        // ponytail: a bad photo is skipped, not retried
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return saved;
}
