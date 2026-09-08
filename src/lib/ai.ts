import { z } from "zod";

/**
 * The whole model client: one POST, structured output through a single tool. No SDK — the
 * Messages API is a JSON body and a header pair, and a dependency would be more code than this.
 *
 * ponytail: Anthropic only. Point `AI_BASE_URL` at a proxy if the family ever wants the model to
 * run on the Air itself; anything with a different request shape earns its own function then.
 */
const BASE = process.env.AI_BASE_URL ?? "https://api.anthropic.com";
const MODEL = process.env.AI_MODEL ?? "claude-sonnet-5";
const MAX_TOKENS = 2048;

/** No key, no AI. Both fill layers are skipped and the record says what is still empty. */
export const aiReady = () => !!process.env.ANTHROPIC_API_KEY;

export type Image = { media_type: string; data: string };

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/**
 * Asks for one object shaped like `schema` and returns it, or null. Null is an ordinary answer
 * here: no key, a refusal, a timeout, a body that does not parse. Every caller must already
 * handle "this layer found nothing", so a failure needs no separate path.
 */
export async function ask<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  name: string;
  images?: Image[];
  signal?: AbortSignal;
}): Promise<z.output<T> | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const content: Block[] = [
    ...(opts.images ?? []).map(
      (i): Block => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } }),
    ),
    { type: "text", text: opts.prompt },
  ];

  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: opts.system,
        messages: [{ role: "user", content }],
        tools: [
          {
            name: opts.name,
            description: "Devuelve los campos encontrados. Un campo que no puedas justificar va como null.",
            input_schema: z.toJSONSchema(opts.schema, { io: "input" }),
          },
        ],
        tool_choice: { type: "tool", name: opts.name },
      }),
      signal: opts.signal,
    });
  } catch {
    return null; // network error, or the caller's deadline fired
  }
  if (!res.ok) {
    console.warn(`[ai] ${opts.name} → HTTP ${res.status}`);
    return null;
  }

  const body = (await res.json().catch(() => null)) as { content?: { type: string; input?: unknown }[] } | null;
  const input = body?.content?.find((b) => b.type === "tool_use")?.input;
  if (input === undefined) return null;
  const parsed = opts.schema.safeParse(input);
  return parsed.success ? (parsed.data as z.output<T>) : null;
}
