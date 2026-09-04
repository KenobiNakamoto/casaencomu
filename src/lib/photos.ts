import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { db } from "./db";
import { isAllowedImageHost } from "./url";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const MAX_PHOTOS = 40; // ponytail: 40 photos keeps the import under 20 s
const MAX_BYTES = 5 * 1024 * 1024;
const CONCURRENCY = 4;

export const photoPath = (propertyId: string, sha256: string) =>
  join(DATA_DIR, "photos", propertyId, sha256 + ".jpg");

/** Original bytes, or null when the response is not a small image. */
async function fetchImage(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
  if (Number(res.headers.get("content-length")) > MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.byteLength > MAX_BYTES ? null : buf;
}

/** True when a new photo row was written; false when skipped (bad fetch, duplicate). */
async function savePhoto(propertyId: string, url: string, position: number): Promise<boolean> {
  const buf = await fetchImage(url);
  if (!buf) return false;
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const dup = await db.execute({
    sql: "SELECT 1 FROM photos WHERE property_id = ? AND sha256 = ?",
    args: [propertyId, sha256],
  });
  if (dup.rows.length) return false;
  const { data, info } = await sharp(buf)
    .rotate()
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  await mkdir(join(DATA_DIR, "photos", propertyId), { recursive: true });
  await writeFile(photoPath(propertyId, sha256), data);
  // OR IGNORE: two workers can race on the same bytes at two URLs; the UNIQUE index settles it.
  const { rowsAffected } = await db.execute({
    sql: "INSERT OR IGNORE INTO photos (id, property_id, position, sha256, width, height) VALUES (?, ?, ?, ?, ?, ?)",
    args: [randomUUID(), propertyId, position, sha256, info.width, info.height],
  });
  return rowsAffected > 0;
}

/**
 * Downloads, dedupes, resizes to 800 px JPEG and records photos. Returns how many were saved.
 * One failed photo never fails the import; `position` keeps the listing's order.
 */
export async function savePhotos(propertyId: string, urls: string[]): Promise<number> {
  const list = [...new Set(urls)].filter((u) => isAllowedImageHost(u)).slice(0, MAX_PHOTOS);
  let saved = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const position = next++;
      try {
        if (await savePhoto(propertyId, list[position], position)) saved++;
      } catch {
        // ponytail: a bad photo is skipped, not retried
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return saved;
}
