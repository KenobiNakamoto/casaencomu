import type { ExtractResult } from "./extract";
import type { SaveResult } from "./save";

/** The whole import is bounded, page fetch included; the page fetch gets at most 12 s of it. */
export const IMPORT_DEADLINE_MS = 25_000;
export const PAGE_FETCH_MS = 12_000;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_CAPTURE_BYTES = 1024 * 1024;

/**
 * One Spanish sentence per failed observation. `removed` is the only one that says the
 * advertisement is gone; `blocked` and `unreadable` say we could not read the page, which is not
 * the same thing and must never be shown as one (finding F03).
 */
export function failureMessage(r: Extract<ExtractResult, { kind: "removed" | "blocked" | "unreadable" }>): string {
  switch (r.kind) {
    case "removed":
      return "Este anuncio ya no está disponible";
    case "blocked":
      return "El portal ha bloqueado la lectura. Abre el anuncio y pulsa el marcador";
    case "unreadable":
      return "No se pudo leer el anuncio. Abre el anuncio y pulsa el marcador";
  }
}

/** Where a successful import sends the browser, and what the property page then says. */
export function successLocation(r: SaveResult): string {
  const q = new URLSearchParams();
  if (r.outcome !== "created") q.set("estado", r.outcome === "updated" ? "actualizada" : "igual");
  if (r.photosMissing > 0) q.set("faltan", String(r.photosMissing));
  return `/propiedades/${r.propertyId}${q.size ? `?${q}` : ""}`;
}

/**
 * A browser that posted a plain form must not be shown a JSON body (finding F16). It goes back to
 * the list, which already renders `?error=`. A JSON caller keeps getting JSON.
 */
export function failResponse(req: Request, status: number, error: string): Response {
  if (wantsJson(req)) return Response.json({ error }, { status });
  return new Response(null, { status: 303, headers: { Location: `/propiedades?error=${encodeURIComponent(error)}` } });
}

export const isJsonBody = (req: Request) => !!req.headers.get("content-type")?.includes("application/json");

const wantsJson = (req: Request) => !!req.headers.get("accept")?.includes("application/json") || isJsonBody(req);

/**
 * The mirror of `failResponse`. A browser form still gets its 303, because it has nothing to run
 * the redirect with; the add dialog gets the destination as data, so a failure can stay in the
 * dialog with the typed URL still in the field (F16).
 */
export function successResponse(req: Request, r: SaveResult): Response {
  const location = successLocation(r);
  if (wantsJson(req)) return Response.json({ location, outcome: r.outcome });
  return new Response(null, { status: 303, headers: { Location: location } });
}
