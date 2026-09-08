"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { routeFor } from "@/lib/url";

/** What the person is looking at. Only a failure persists; the dialog closes on success. */
type State =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "slow" }
  | { kind: "capture"; portal: string }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

/** After this long the person deserves to be told it has not stalled. */
const SLOW_MS = 10_000;

const portalName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "este portal";
  }
};

/**
 * `Añadir propiedad`. The URL is classified here, before anything is sent: Idealista answers a
 * server fetch with a 403 challenge every time, so posting one only spends ten seconds to
 * rediscover a block we already measured (F16).
 *
 * Whatever happens, the typed URL stays in the field.
 */
export function AddDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const router = useRouter();
  const busy = state.kind === "saving" || state.kind === "slow";

  useEffect(() => {
    if (state.kind !== "saving") return;
    const t = setTimeout(() => setState({ kind: "slow" }), SLOW_MS);
    return () => clearTimeout(t);
  }, [state.kind]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return; // one submission at a time, without disabling the field
    const value = url.trim();
    if (!value) return setState({ kind: "error", message: "Pega el enlace del anuncio." });

    const route = routeFor(value);
    if (route === "capture") return setState({ kind: "capture", portal: portalName(value) });
    if (route === "unsupported") return setState({ kind: "unsupported" });

    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = (await res.json().catch(() => null)) as { location?: string; error?: string } | null;
      if (res.ok && data?.location) {
        setOpen(false);
        setUrl("");
        setState({ kind: "idle" });
        router.push(data.location);
        return;
      }
      setState({ kind: "error", message: data?.error ?? "No se pudo guardar el anuncio." });
    } catch {
      setState({ kind: "error", message: "No hay conexión con el servidor. El enlace sigue aquí; inténtalo otra vez." });
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary add-trigger" aria-haspopup="dialog">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="add-trigger-text">Añadir propiedad</span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Añadir propiedad">
        {/* The real endpoint and method, so a submission that arrives before this component has
            hydrated still imports the advertisement the old way — a 303 back to the list — instead
            of navigating to a GET with the URL in the query string. `onSubmit` takes over once
            React is listening. */}
        <form method="post" action="/api/import" onSubmit={submit} className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
            Enlace del anuncio
            <input
              type="url"
              name="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (state.kind !== "saving" && state.kind !== "slow") setState({ kind: "idle" });
              }}
              placeholder="https://…"
              inputMode="url"
              autoComplete="off"
              aria-describedby="add-status"
              className="h-12 w-full rounded-lg border border-control-border bg-raised px-3 font-normal text-ink transition focus:border-ink"
            />
          </label>

          <div id="add-status" role="status" className="add-status">
            {state.kind === "saving" && <p className="text-sm text-muted">Guardando propiedad…</p>}
            {state.kind === "slow" && (
              <p className="text-sm text-muted">Guardando propiedad… Está tardando más de lo normal, pero sigue en marcha.</p>
            )}
            {state.kind === "error" && <p className="text-sm text-error">{state.message}</p>}
            {state.kind === "unsupported" && (
              <p className="text-sm text-body">
                Este portal no admite importación por enlace. Puedes probar el marcador en la página del anuncio.
              </p>
            )}
            {state.kind === "capture" && (
              <p className="text-sm text-body">
                {state.portal} bloquea la lectura desde el servidor. Abre el anuncio en el navegador y pulsa el marcador.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary h-12 rounded-lg px-5 text-sm font-semibold" aria-disabled={busy}>
              {busy ? "Guardando…" : "Añadir enlace"}
            </button>
          </div>
        </form>

        <section className="mt-6 border-t border-hairline-soft pt-5">
          <h3 className="text-sm font-semibold text-ink">Guardar desde el anuncio</h3>
          <p className="mt-1 text-sm text-muted">
            Idealista y Housfy solo se pueden guardar desde la propia página del anuncio, con el marcador. Se
            arrastra una vez a la barra de favoritos y ya sirve para siempre.
          </p>
          {/* ponytail: the marker itself lives on Ayuda. It is a `javascript:` href, which React 19
              rewrites to a throw, so that page emits its anchor as raw HTML. One copy is enough. */}
          <Link href="/ayuda" className="mt-3 inline-flex h-11 items-center rounded-lg border border-ink px-4 text-sm font-semibold text-ink">
            Instalar el marcador
          </Link>
        </section>
      </Dialog>
    </>
  );
}
