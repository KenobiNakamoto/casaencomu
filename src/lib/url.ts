// Portal hosts and listing refs, copied from spike/RESULTS.md (2026-09-04).

/** The three sites with a branch of their own in `extract.ts`. The `portal` label comes from here. */
export const PORTAL_HOSTS = new Set(["idealista.com", "fotocasa.es", "habitaclia.com"]); // after dropping `www.`

/**
 * Every site a member may paste, and the only hosts the server will ever fetch. It is the SSRF
 * guard on `/api/import`, not a list of sites we like. Wider than `PORTAL_HOSTS`: the three small
 * portals import through the generic branch and have no `portal` label of their own.
 */
export const ALLOWED_HOSTS = new Set([...PORTAL_HOSTS, "housfy.com", "vivalta.es", "iadespana.es"]);

/**
 * Which path is expected to fill the record. It no longer refuses anything: a link is accepted
 * first and read afterwards, so a portal that blocks the server costs the person nothing. Read
 * it as a forecast, not a gate — `capture` means "a real browser has to open this one".
 * Measured in `docs/PORTALS.md`.
 */
const hostOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");

export type Route = "server" | "capture" | "unsupported";
const SERVER = new Set(["fotocasa.es", "habitaclia.com"]);
const CAPTURE = new Set(["idealista.com", "housfy.com", "vivalta.es", "iadespana.es"]);

export function routeFor(url: string): Route {
  let host: string;
  try {
    host = hostOf(url);
  } catch {
    return "unsupported";
  }
  if (SERVER.has(host)) return "server";
  return CAPTURE.has(host) ? "capture" : "unsupported";
}
/**
 * The six portals as a person reads them. Built from the allowlist and the router above, so the
 * help page can never claim to support a site the app would refuse, or miss one it accepts.
 */
const PORTAL_NAMES: Record<string, string> = {
  "idealista.com": "Idealista",
  "fotocasa.es": "Fotocasa",
  "habitaclia.com": "Habitaclia",
  "housfy.com": "Housfy",
  "vivalta.es": "Vivalta",
  "iadespana.es": "iad España",
};

export const PORTALS: { host: string; name: string; route: Route }[] = [...ALLOWED_HOSTS].map((host) => ({
  host,
  name: PORTAL_NAMES[host] ?? host,
  route: routeFor(`https://${host}/`),
}));

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

/** How a site is named in a sentence a person reads. `iad` is lowercase on its own pages. */
const SITE_NAMES: Record<string, string> = {
  "idealista.com": "Idealista",
  "fotocasa.es": "Fotocasa",
  "habitaclia.com": "Habitaclia",
  "housfy.com": "Housfy",
  "vivalta.es": "Vivalta",
  "iadespana.es": "iad España",
};

/** "Idealista", not "idealista": the name opens the sentence. Unknown hosts keep their host. */
export function siteName(url: string): string {
  try {
    const host = hostOf(url);
    return SITE_NAMES[host] ?? host.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  } catch {
    return "El portal";
  }
}

// listing ref, matched on the pathname
const REF: Record<Exclude<Portal, "generic">, RegExp> = {
  idealista: /\/inmueble\/(\d+)\/?$/, // https://www.idealista.com/inmueble/112446118/
  fotocasa: /\/(\d+)\/d\/?$/, // https://www.fotocasa.es/es/comprar/vivienda/<zone>/<slug>/190311653/d
  habitaclia: /-i(\d+)\.htm$/, // https://www.habitaclia.com/comprar-<slug>-barcelona-i8166003810008.htm
};


/** Lowercase host, no `www.`, no query or fragment, no trailing slash. Throws on an invalid URL. */
export function normalizeUrl(url: string): { portal: Portal; portalRef: string | null; normalized: string } {
  const u = new URL(url);
  const host = hostOf(url);
  const portal: Portal = PORTAL_HOSTS.has(host) ? (host.split(".")[0] as Portal) : "generic";
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
