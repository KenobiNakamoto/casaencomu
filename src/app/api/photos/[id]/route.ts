import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { photoPath } from "@/lib/photos";

const notFound = () => Response.json({ error: "not found" }, { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await currentUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { rows } = await db.execute({
    sql: "SELECT property_id, sha256 FROM photos WHERE id = ?",
    args: [id],
  });
  if (!rows.length) return notFound();
  const path = photoPath(String(rows[0].property_id), String(rows[0].sha256));
  const size = await stat(path).then((s) => s.size, () => null);
  if (size === null) return notFound();
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
