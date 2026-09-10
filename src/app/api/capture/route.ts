import { z } from "zod";
import { captureIdentity } from "@/lib/auth";
import { runEnrichment } from "@/lib/enrich";
import { extractResult, rawOf } from "@/lib/extract";
import { IMPORT_DEADLINE_MS, MAX_CAPTURE_BYTES, pendingRecord, successLocation } from "@/lib/intake";
import { inProject } from "@/lib/db";
import { save } from "@/lib/save";
import { normalizeUrl } from "@/lib/url";

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** A form field that carries JSON; unparsable or off-shape → undefined, never a failed import. */
const jsonField = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .optional()
    .transform((s): z.output<T> | undefined => {
      if (!s) return undefined;
      try {
        const r = schema.safeParse(JSON.parse(s));
        return r.success ? r.data : undefined;
      } catch {
        return undefined;
      }
    });

const Form = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  ld: jsonField(z.array(z.unknown())),
  og: jsonField(z.record(z.string(), z.string())),
  blob: z.string().optional(),
  imgs: jsonField(z.array(z.string())),
  text: z.string().optional(),
});

/**
 * Form POST from the bookmarklet, or from the browser reader on the host. Arrives with
 * `Origin: null` and no session cookie, so the `capture_token` is both the CSRF guard and the
 * identity: it names the member whose bookmark it is.
 */
export async function POST(req: Request) {
  // The body is read before it is parsed, so an oversized capture is refused, not buffered whole.
  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_CAPTURE_BYTES) return fail(413, "La captura es demasiado grande");
  const fd = await new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  // The token names the project as well as the member, so everything below reads and writes
  // that project's database and nothing else.
  const who = await captureIdentity(String(fd.get("token") ?? ""));
  if (!who) return fail(403, "Marcador no válido. Vuelve a instalarlo desde Ayuda");
  const user = who.user;

  const parsed = Form.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(400, "Datos del marcador incompletos");
  // `title` is `document.title`: on a page with no og:* and no JSON-LD it is the only title there
  // is. It was parsed and then dropped before it reached the extractor — finding F01.
  const { url, title, ld, og, blob, imgs, text } = parsed.data;

  let norm: ReturnType<typeof normalizeUrl>;
  try {
    norm = normalizeUrl(url);
  } catch {
    return fail(400, "Enlace no válido");
  }

  const page = { url, title, ld, og, blob, imgs, text };
  const r = extractResult(page);
  // A capture that will not parse is still the page: it is kept, the record exists, and layer 2
  // reads it afterwards. Throwing it away made the person collect it twice for nothing.
  const record = r.kind === "listing" ? r : pendingRecord(url, norm.portalRef);

  const saved = await inProject(who.projectId, () =>
    save(
      record.listing,
      { url_original: url, url_normalized: norm.normalized, portal: norm.portal, portal_ref: norm.portalRef },
      {
        user,
        via: "bookmarklet",
        presence: record.presence,
        raw: r.kind === "blocked" ? null : rawOf(page),
        pending: r.kind === "listing" ? null : r.kind,
        deadline: AbortSignal.timeout(IMPORT_DEADLINE_MS),
      },
    ),
  );
  void inProject(who.projectId, () => runEnrichment({ limit: 1 })).catch((e) =>
    console.error("[enrich] pass failed", e),
  );
  return new Response(null, { status: 303, headers: { Location: successLocation(saved) } });
}
