export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
    return;
  const { applySchema } = await import("./lib/db");
  await applySchema();
  // ponytail: the hourly recheck loop arrives in #14
}
