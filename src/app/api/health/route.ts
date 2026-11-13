import { checkDataHealth } from "@/lib/health";

/**
 * The one route outside the proxy, so two rules hold at once: it must answer without a session,
 * and it must say nothing private. No project name, no address, no count of anything the family
 * wrote — «ok» and a clock, and that is all a health check has ever needed (V23).
 *
 * It reads the control database. Before PIP-16 it returned `{ok:true}` without touching anything,
 * which is a check that answers «ok» from a server whose data disk has gone — and the disk is
 * external and removable, so that is the failure it exists to catch.
 *
 * Checks actual control/project tables, disk space and a retained photo sample. The backup
 * performs the complete integrity and photo check. No diagnostic paths leave this endpoint.
 */
export async function GET() {
  const started = performance.now();
  try {
    await checkDataHealth();
  } catch {
    // The reason is deliberately not returned: it would carry a filesystem path.
    return Response.json({ ok: false, db: "unreachable", time: new Date().toISOString() }, { status: 503 });
  }
  return Response.json({
    ok: true,
    db: "ok",
    ms: Math.round((performance.now() - started) * 10) / 10,
    time: new Date().toISOString(),
  });
}
