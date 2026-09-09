#!/usr/bin/env node
// The model, without an API key. The Air already has the Claude Code CLI, signed in, so this is
// the whole difference: `ask()` in src/lib/ai.ts posts a Messages request, and instead of
// api.anthropic.com it reaches this, which runs `claude -p` and hands the answer back in the same
// shape. Fixed instructions in, one JSON object out.
//
// It runs on the host, beside the container, for the same reason the browser reader does: the CLI
// and its credentials live on the Mac, not in the image.
//
//   CASA_AI_TOKEN=… node scripts/ai-bridge.mjs
//
// Then in the app's .env: AI_BASE_URL=http://host.docker.internal:8788 and ANTHROPIC_API_KEY set
// to the same CASA_AI_TOKEN — the app already sends it as `x-api-key`, and here it is the shared
// secret that keeps the rest of the network out.
//
// Nothing about the fill layers moves here: the prompts, the range guards, the provenance marks
// and the validation all stay in src/lib/enrich.ts. This only carries the request.

import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.CASA_AI_PORT ?? 8788);
const HOST = process.env.CASA_AI_HOST ?? "0.0.0.0";
const TOKEN = process.env.CASA_AI_TOKEN ?? "";
const BIN = process.env.CASA_AI_BIN ?? "claude";
const MODEL = process.env.CASA_AI_MODEL ?? "";
const TIMEOUT_MS = Number(process.env.CASA_AI_TIMEOUT_MS ?? 180_000);
const MAX_BODY = 48 * 1024 * 1024; // four photographs as base64, with room to spare

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/**
 * The user turn, as one prompt. The images are already files by now, so they arrive as names the
 * CLI can open; everything else is the text the caller wrote plus the shape it wants back.
 */
export function promptFor(body, files = []) {
  const content = body?.messages?.at(-1)?.content;
  const text = Array.isArray(content)
    ? content.filter((b) => b?.type === "text").map((b) => b.text).join("\n\n")
    : String(content ?? "");
  const schema = body?.tools?.[0]?.input_schema ?? {};
  return [
    files.length
      ? `Abre estas imágenes con la herramienta Read antes de responder:\n${files.map((f) => `- ${f}`).join("\n")}`
      : "",
    text,
    "Responde con un único objeto JSON y nada más. Sin explicación, sin texto alrededor, sin ```.",
    `El objeto tiene que cumplir este esquema:\n${JSON.stringify(schema)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The object the model meant, out of whatever it actually printed. A fence, a sentence before it,
 * a trailing "espero que ayude" — all survivable. Anything else is null, and null is an answer the
 * caller already handles.
 */
export function parseJson(text) {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const a = body.indexOf("{");
  const b = body.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(body.slice(a, b + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** One `claude -p`, in a directory of its own. Resolves to the printed text, or null. */
function runClaude({ prompt, system, cwd }) {
  const args = ["-p", prompt, "--output-format", "json", "--allowed-tools", "Read"];
  if (system) args.push("--append-system-prompt", system);
  if (MODEL) args.push("--model", MODEL);

  return new Promise((resolve) => {
    const child = spawn(BIN, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      console.warn(`[ai-bridge] no answer in ${TIMEOUT_MS} ms — killed`);
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      console.error(`[ai-bridge] cannot run ${BIN}: ${e.message}`);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn(`[ai-bridge] exit ${code} ${err.trim().slice(0, 300)}`);
        return resolve(null);
      }
      // ponytail: --output-format json wraps the answer; if that ever changes, the raw text still works
      try {
        const env = JSON.parse(out);
        resolve(env.is_error ? null : String(env.result ?? ""));
      } catch {
        resolve(out);
      }
    });
  });
}

const read = (req) =>
  new Promise((resolve, reject) => {
    let n = 0;
    const parts = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_BODY) return reject(new Error("body too large"));
      parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });

const authorised = (given) => {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};

const send = (res, status, body) => {
  const s = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
};

async function messages(req, res) {
  if (!authorised(req.headers["x-api-key"])) return send(res, 401, { error: "bad key" });

  let body;
  try {
    body = JSON.parse(await read(req));
  } catch {
    return send(res, 400, { error: "bad body" });
  }
  const name = body?.tools?.[0]?.name ?? "answer";

  const dir = await mkdtemp(join(tmpdir(), "casa-ai-"));
  try {
    const images = (body?.messages?.at(-1)?.content ?? []).filter?.((b) => b?.type === "image") ?? [];
    const files = [];
    for (const [i, img] of images.entries()) {
      const file = `foto-${i + 1}.${EXT[img.source?.media_type] ?? "jpg"}`;
      await writeFile(join(dir, file), Buffer.from(img.source?.data ?? "", "base64"));
      files.push(file);
    }

    const started = Date.now();
    const text = await runClaude({ prompt: promptFor(body, files), system: body?.system, cwd: dir });
    const input = parseJson(text);
    console.log(
      `[ai-bridge] ${name} ${files.length} foto(s) ${Math.round((Date.now() - started) / 1000)}s → ${input ? Object.keys(input).filter((k) => input[k] != null).join(",") || "nada" : "sin respuesta"}`,
    );
    // No answer is not an error here: the caller reads "this layer found nothing" off an empty
    // tool call exactly as it would off a refusal, and a 500 would only be logged twice.
    return send(res, 200, { content: [{ type: "tool_use", name, input: input ?? {} }] });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1]?.endsWith("ai-bridge.mjs")) {
  if (!TOKEN) {
    console.error("ai-bridge: set CASA_AI_TOKEN (the app sends it as ANTHROPIC_API_KEY)");
    process.exit(2);
  }
  createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/messages") return void messages(req, res).catch((e) => {
      console.error("[ai-bridge]", e);
      send(res, 500, { error: "bridge failed" });
    });
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    send(res, 404, { error: "not here" });
  }).listen(PORT, HOST, () => console.log(`[ai-bridge] ${HOST}:${PORT} → ${BIN}${MODEL ? ` (${MODEL})` : ""}`));
}
