import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { extractResult } from "@/lib/extract";
import { failureMessage, IMPORT_DEADLINE_MS, MAX_CAPTURE_BYTES, successLocation } from "@/lib/intake";
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

/** Form POST from the bookmarklet. Arrives with `Origin: null`; the `capture_token` is the CSRF guard. */
export async function POST(req: Request) {
  const user = await currentUser();
  // The body is read before it is parsed, so an oversized capture is refused, not buffered whole.
  const raw = await req.arrayBuffer();
  if (raw.byteLength > MAX_CAPTURE_BYTES) return fail(413, "La captura es demasiado grande");
  const fd = await new Response(raw, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  if (fd.get("token") !== user.capture_token) return fail(403, "Marcador no válido. Vuelve a instalarlo desde Ayuda");

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

  const r = extractResult({ url, title, ld, og, blob, imgs, text });
  if (r.kind !== "listing") return fail(422, failureMessage(r));

  const saved = await save(
    r.listing,
    { url_original: url, url_normalized: norm.normalized, portal: norm.portal, portal_ref: norm.portalRef },
    { user, via: "bookmarklet", presence: r.presence, deadline: AbortSignal.timeout(IMPORT_DEADLINE_MS) },
  );
  return new Response(null, { status: 303, headers: { Location: successLocation(saved) } });
}
