import { access, stat, statfs } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { control, controlReady, projectDir } from "./control";
import { db, inProject } from "./db";

/** Read actual tables/files. Never create a missing project database during a health probe. */
export async function checkDataHealth(): Promise<void> {
  await controlReady;
  const root = process.env.DATA_DIR ?? "./data";
  await access(join(root, "control.db"), constants.R_OK | constants.W_OK);
  const space = await statfs(root);
  if (space.bavail * space.bsize < 128 * 1024 * 1024) throw new Error("low data space");
  await control.execute("SELECT email FROM accounts LIMIT 1");
  const { rows } = await control.execute("SELECT id FROM projects");
  for (const row of rows) {
    const id = String(row.id);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("invalid project path");
    const dir = projectDir(id);
    if ((await stat(join(dir, "casa.db"))).size === 0) throw new Error("missing database");
    await access(join(dir, "casa.db"), constants.R_OK | constants.W_OK);
    await inProject(id, async () => {
      await db.execute("SELECT id FROM properties LIMIT 1");
      // A cheap live sample; complete photo verification runs during each backup.
      const photo = (await db.execute("SELECT property_id, sha256 FROM photos ORDER BY rowid DESC LIMIT 1")).rows[0];
      if (photo) {
        if (![photo.property_id, photo.sha256].every(v => /^[a-zA-Z0-9_-]+$/.test(String(v)))) throw new Error("invalid photo path");
        await access(join(dir, "photos", String(photo.property_id), `${photo.sha256}.jpg`), constants.R_OK);
      }
    });
  }
}
