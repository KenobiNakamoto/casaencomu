import { userByCaptureToken } from "@/lib/auth";
import { COLLECT } from "@/lib/bookmarklet";
import { db } from "@/lib/db";
import { siteName } from "@/lib/url";

/**
 * How long the queue keeps offering a link nobody could read. There is deliberately no cooldown
 * here: the server's own failed fetch already moved `last_checked_at`, so a cooldown on that
 * column would make a freshly pasted link wait for no reason. How often to try again is the
 * reader's business, and it remembers its own attempts.
 */
const GIVE_UP_AFTER_MS = 7 * 24 * 3_600_000;
const LIMIT = 20;

/**
 * The links a real browser still has to open, and the collector to run in them. Read by
 * `scripts/capture-agent.mjs` on the host: the app lives in a container and cannot drive a
 * browser, and a page Idealista refuses to a server is only ever read by a browser a person owns.
 *
 * Authenticated by the capture token alone, like the capture itself — the reader has no session.
 */
export async function GET(req: Request) {
  const user = await userByCaptureToken(req.headers.get("x-capture-token") ?? "");
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const now = Date.now();
  const { rows } = await db.execute({
    sql: `SELECT s.url_original AS url FROM sources s JOIN properties p ON p.id = s.property_id
          WHERE p.filled = 0 AND s.last_check_outcome IS NOT 'removed' AND s.first_seen_at > ?
          ORDER BY s.first_seen_at ASC LIMIT ?`,
    args: [new Date(now - GIVE_UP_AFTER_MS).toISOString(), LIMIT],
  });

  return Response.json({
    collect: COLLECT,
    items: rows.map((r) => ({ url: String(r.url), site: siteName(String(r.url)) })),
  });
}
