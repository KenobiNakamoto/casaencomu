import { currentUser } from "@/lib/auth";
import { extractResult } from "@/lib/extract";
import { fetchGuarded } from "@/lib/fetching";
import {
  failResponse,
  failureMessage,
  IMPORT_DEADLINE_MS,
  isJsonBody,
  MAX_HTML_BYTES,
  PAGE_FETCH_MS,
  successLocation,
} from "@/lib/intake";
import { save } from "@/lib/save";
import { isAllowedHost, normalizeUrl } from "@/lib/url";

/** `{ url }` as JSON, or `url` form-encoded (the list page posts a plain form). */
async function readUrl(req: Request): Promise<string | null> {
  const body = isJsonBody(req) ? await req.json() : Object.fromEntries(await req.formData());
  return typeof body?.url === "string" ? body.url : null;
}

/**
 * This endpoint makes the server fetch a URL on the caller's behalf, so a valid session cookie
 * alone must not be enough: a foreign page could otherwise post a form here. `/api/capture` is
 * the deliberate exception and checks the user's capture token instead.
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // a form from another site sends `Origin: null`
  const expected = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!sameOrigin(req)) return failResponse(req, 403, "Petición no permitida");

  const url = await readUrl(req);
  // ponytail: allowlist instead of a DNS-resolving SSRF guard; revisit if non-portal URLs are ever allowed
  let norm: ReturnType<typeof normalizeUrl>;
  try {
    if (!url || !isAllowedHost(url)) {
      return failResponse(req, 400, "Solo se admiten enlaces de Idealista, Fotocasa o Habitaclia");
    }
    norm = normalizeUrl(url);
  } catch {
    return failResponse(req, 400, "Enlace no válido");
  }

  // Never retried, never worked around: a block or a challenge earns the bookmarklet hint.
  const deadline = AbortSignal.timeout(IMPORT_DEADLINE_MS);
  let page;
  try {
    page = await fetchGuarded(url, {
      allow: isAllowedHost,
      maxBytes: MAX_HTML_BYTES,
      timeoutMs: PAGE_FETCH_MS,
      signal: deadline,
      accept: "text/html,application/xhtml+xml",
    });
  } catch {
    return failResponse(req, 422, "No se pudo descargar el anuncio. Abre el anuncio y pulsa el marcador");
  }
  if ("refused" in page) {
    // Includes a redirect off the allowlist, refused before the hop was taken.
    return failResponse(req, 400, "El enlace lleva fuera del portal. Abre el anuncio y pulsa el marcador");
  }
  if (page.truncated) return failResponse(req, 422, "La página es demasiado grande. Abre el anuncio y pulsa el marcador");

  const r = extractResult({ url, finalUrl: page.finalUrl, status: page.status, html: page.body.toString("utf8") });
  if (r.kind !== "listing") return failResponse(req, 422, failureMessage(r));

  const saved = await save(
    r.listing,
    { url_original: url, url_normalized: norm.normalized, portal: norm.portal, portal_ref: norm.portalRef },
    { user, via: "paste", presence: r.presence, deadline },
  );
  return new Response(null, { status: 303, headers: { Location: successLocation(saved) } });
}
