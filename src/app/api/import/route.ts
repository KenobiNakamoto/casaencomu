import { currentUser } from "@/lib/auth";
import { extract } from "@/lib/extract";
import { save } from "@/lib/save";
import { isAllowedHost, normalizeUrl } from "@/lib/url";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** `{ url }` as JSON, or `url` form-encoded (the list page posts a plain form). */
async function readUrl(req: Request): Promise<string | null> {
  const body = req.headers.get("content-type")?.includes("application/json")
    ? await req.json()
    : Object.fromEntries(await req.formData());
  return typeof body?.url === "string" ? body.url : null;
}

export async function POST(req: Request) {
  const user = await currentUser();
  const url = await readUrl(req);
  // ponytail: allowlist instead of a DNS-resolving SSRF guard; revisit if non-portal URLs are ever allowed
  let norm: ReturnType<typeof normalizeUrl>;
  try {
    if (!url || !isAllowedHost(url)) return fail(400, "Solo se admiten enlaces de Idealista, Fotocasa o Habitaclia");
    norm = normalizeUrl(url);
  } catch {
    return fail(400, "Enlace no válido");
  }

  // Never retry, never work around a block: 403 or CAPTCHA → the bookmarklet hint.
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "es-ES,es;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return fail(422, "No se pudo descargar el anuncio. Abre el anuncio y pulsa el marcador");
  }
  const html = await res.text();
  const listing = extract({ url, finalUrl: res.url, status: res.status, html });
  if (!listing) {
    const removed = res.ok || res.status === 404 || res.status === 410;
    return fail(422, removed ? "Este anuncio ya no está disponible" : "Abre el anuncio y pulsa el marcador");
  }

  const { propertyId, duplicate } = await save(
    listing,
    { url_original: url, url_normalized: norm.normalized, portal: norm.portal, portal_ref: norm.portalRef },
    user,
    "paste",
  );
  return new Response(null, {
    status: 303,
    headers: { Location: `/propiedades/${propertyId}${duplicate ? "?dup=1" : ""}` },
  });
}
