import { currentUser } from "@/lib/auth";
import { runEnrichment } from "@/lib/enrich";
import { extractResult, rawOf, type Presence, type Raw } from "@/lib/extract";
import { fetchGuarded } from "@/lib/fetching";
import {
  failResponse,
  IMPORT_DEADLINE_MS,
  isJsonBody,
  MAX_HTML_BYTES,
  PAGE_FETCH_MS,
  pendingNote,
  pendingRecord,
  successResponse,
  type PendingReason,
} from "@/lib/intake";
import type { Listing } from "@/lib/listing";
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
  try {
    const expected = new URL(process.env.PUBLIC_URL ?? req.url);
    // Next dev normalizes req.url to localhost even when bound to 127.0.0.1. Use the
    // actual request authority in development; never trust forwarded headers or replace
    // an explicitly configured public origin. Scheme, hostname and port must still match.
    if (!process.env.PUBLIC_URL && process.env.NODE_ENV === "development") {
      const host = req.headers.get("host");
      if (host) {
        const authority = new URL(`${expected.protocol}//${host}`);
        if (authority.username || authority.password || authority.pathname !== "/" || authority.search || authority.hash) return false;
        expected.host = authority.host;
      }
    }
    return new URL(origin).origin === expected.origin;
  } catch {
    return false;
  }
}

/** Layer 1: one guarded fetch and the deterministic extractor. Never throws, never retries. */
type Read =
  | { pending: false; listing: Listing; presence: Presence; raw: Raw }
  | { pending: true; reason: PendingReason; raw: Raw | null };

async function readListing(url: string, deadline: AbortSignal): Promise<Read> {
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
    return { pending: true, reason: "offline", raw: null };
  }
  // Includes a redirect off the allowlist, refused before the hop was taken.
  if ("refused" in page) return { pending: true, reason: "offsite", raw: null };
  if (page.truncated) return { pending: true, reason: "unreadable", raw: null };

  const input = { url, finalUrl: page.finalUrl, status: page.status, html: page.body.toString("utf8") };
  const r = extractResult(input);
  // A challenge page is not evidence of anything, so it is not kept. Anything else we did manage
  // to download is: it is what layer 2 reads later, and for Idealista there is no second chance.
  if (r.kind === "listing") return { pending: false, listing: r.listing, presence: r.presence, raw: rawOf(input) };
  return { pending: true, reason: r.kind === "blocked" ? "blocked" : r.kind, raw: r.kind === "blocked" ? null : rawOf(input) };
}

/**
 * A link is accepted, then read — not the other way round. Only a URL we would never fetch is
 * refused; everything else becomes a record on the spot, and the layers that fill it run after
 * the answer has gone back. Nothing a member pastes is ever lost because a portal said no.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!sameOrigin(req)) return failResponse(req, 403, "Petición no permitida");

  let url: string | null;
  try {
    url = await readUrl(req);
  } catch {
    return failResponse(req, 400, "Enlace no válido");
  }
  // ponytail: allowlist instead of a DNS-resolving SSRF guard; revisit if non-portal URLs are ever allowed
  let norm: ReturnType<typeof normalizeUrl>;
  try {
    if (!url || !isAllowedHost(url)) {
      return failResponse(req, 400, "Solo se admiten enlaces de Idealista, Fotocasa, Habitaclia, Housfy, Vivalta o iad España");
    }
    norm = normalizeUrl(url);
  } catch {
    return failResponse(req, 400, "Enlace no válido");
  }

  const deadline = AbortSignal.timeout(IMPORT_DEADLINE_MS);
  const read = await readListing(url, deadline);
  const record = read.pending ? pendingRecord(url, norm.portalRef) : read;

  const saved = await save(
    record.listing,
    { url_original: url, url_normalized: norm.normalized, portal: norm.portal, portal_ref: norm.portalRef },
    { user, via: "paste", presence: record.presence, raw: read.raw, pending: read.pending ? read.reason : null, deadline },
  );
  // Layers 2 and 3, off the request's clock: the answer is already on its way and the page the
  // person lands on refreshes itself while they look at it.
  void runEnrichment({ limit: 1 }).catch((e) => console.error("[enrich] pass failed", e));
  return successResponse(req, saved, read.pending ? pendingNote(read.reason, url) : null);
}
