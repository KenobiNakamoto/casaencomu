// Portal hosts and listing refs, copied from spike/RESULTS.md (2026-09-04).

export const ALLOWED_HOSTS = new Set(["idealista.com", "fotocasa.es", "habitaclia.com"]); // after dropping `www.`
/**
 * Hosts `savePhotos` is allowed to download from. A download allowlist, not a display filter:
 * anything else in a page's image list is simply never fetched. That is what keeps a tracking
 * pixel (`www.facebook.com`) or a static map tile (`api.mapbox.com`) out of the photo store.
 */
export const ALLOWED_IMAGE_HOSTS = new Set([
  "img4.idealista.com",
  "static.fotocasa.es",
  "images.habimg.com",
  "media.mobiliagestion.es", // Vivalta
  "images.iadespana.es", // iad España
  "static0.housfy.com", // Housfy — `cms.housfy.com` is site furniture, deliberately not here
]);

export type Portal = "idealista" | "fotocasa" | "habitaclia" | "generic";

// listing ref, matched on the pathname
const REF: Record<Exclude<Portal, "generic">, RegExp> = {
  idealista: /\/inmueble\/(\d+)\/?$/, // https://www.idealista.com/inmueble/112446118/
  fotocasa: /\/(\d+)\/d\/?$/, // https://www.fotocasa.es/es/comprar/vivienda/<zone>/<slug>/190311653/d
  habitaclia: /-i(\d+)\.htm$/, // https://www.habitaclia.com/comprar-<slug>-barcelona-i8166003810008.htm
};

const hostOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");

/** Lowercase host, no `www.`, no query or fragment, no trailing slash. Throws on an invalid URL. */
export function normalizeUrl(url: string): { portal: Portal; portalRef: string | null; normalized: string } {
  const u = new URL(url);
  const host = hostOf(url);
  const portal: Portal = ALLOWED_HOSTS.has(host) ? (host.split(".")[0] as Portal) : "generic";
  const path = u.pathname.replace(/\/+$/, "");
  const portalRef = portal === "generic" ? null : (path.match(REF[portal])?.[1] ?? null);
  return { portal, portalRef, normalized: `${u.protocol}//${host}${path}` };
}

// ponytail: allowlist instead of a DNS-resolving SSRF guard; revisit if non-portal URLs are ever allowed
export function isAllowedHost(url: string): boolean {
  try {
    return ALLOWED_HOSTS.has(hostOf(url));
  } catch {
    return false;
  }
}

export function isAllowedImageHost(url: string): boolean {
  try {
    return ALLOWED_IMAGE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
