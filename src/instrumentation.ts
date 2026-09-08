// ponytail: one flag per loop, no queue — an overlapping run is skipped, not queued
let running = false;
let filling = false;

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

  // The fill layers. An import fires its own pass, so this one is the safety net: it catches a
  // pass that failed, a source the browser reader filled minutes later, and every record already
  // stored on the day a key is first configured. Without a key it returns at once and costs
  // nothing, and no source is marked done, so none is silently skipped.
  const { runEnrichment } = await import("./lib/enrich");
  setInterval(async () => {
    if (filling) return;
    filling = true;
    try {
      await runEnrichment();
    } catch (e) {
      console.error("[enrich] run failed", e);
    } finally {
      filling = false;
    }
  }, 120_000).unref();
}
