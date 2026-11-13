import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { ask, AI_TIMEOUT_MS } from "./ai";
const opts = { system: "read", prompt: "synthetic", name: "fields", schema: z.object({ rooms: z.number().nullable() }) };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("distinguishes valid empty output from service and invalid-output failures", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-key");
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ content: [{ type: "tool_use", input: { rooms: null } }] }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ content: [{ type: "tool_use", input: { rooms: "invalid" } }] }))
    .mockRejectedValueOnce(new Error("network"));
  vi.stubGlobal("fetch", fetch);
  expect(await ask(opts)).toEqual({ rooms: null });
  expect(await ask(opts)).toBeNull(); expect(await ask(opts)).toBeNull(); expect(await ask(opts)).toBeNull();
});
it("applies its own deadline even without a caller deadline", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-key");
  const stop = new AbortController(); stop.abort();
  const deadline = vi.spyOn(AbortSignal, "timeout").mockReturnValue(stop.signal);
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => { init.signal.throwIfAborted(); return Response.json({}); }));
  expect(await ask(opts)).toBeNull();
  expect(deadline).toHaveBeenCalledWith(AI_TIMEOUT_MS);
});
