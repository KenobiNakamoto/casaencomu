// ponytail: one loop, one flag, no queue — an overlapping run is skipped, not queued
let running = false;

export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
    return;
  const { applySchema } = await import("./lib/db");
  await applySchema();

  const { runRechecks } = await import("./lib/recheck");
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runRechecks();
    } catch (e) {
      console.error("[recheck] run failed", e);
    } finally {
      running = false;
    }
  };
  // first run after one hour; RECHECK_AT_BOOT=1 runs one pass at startup (manual check)
  if (process.env.RECHECK_AT_BOOT === "1") void tick();
  setInterval(tick, 3_600_000).unref();
}
