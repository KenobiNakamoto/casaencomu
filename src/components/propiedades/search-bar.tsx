"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { routeFor } from "@/lib/url";

/** What the person is looking at. Only a failure persists; success navigates away. */
type State =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "slow" }
  | { kind: "capture"; portal: string }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

/** After this long the person deserves to be told it has not stalled. */
const SLOW_MS = 10_000;

/** "Idealista", not "idealista": the name opens the sentence. */
const portalName = (url: string) => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
    return host.charAt(0).toUpperCase() + host.slice(1);
  } catch {
    return "Este portal";
  }
};

/**
 * The pill searches. The round + adds a listing: clicking it grows a link field leftwards from the
 * button, which never moves, and the search box gives up the width. Escape or × closes it again.
 *
 * What the link does once it is typed is PIP-08's work, kept: the URL is classified in the browser
 * before anything is sent, because Idealista answers a server fetch with a 403 challenge every
 * time (F16). What is sent goes by `fetch`, so a failure leaves the field open with the link still
 * in it and the message beside it, instead of navigating away and losing what was typed.
 */
export function SearchBar({ q, hidden, clearHref }: { q: string; hidden: Record<string, string>; clearHref: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const field = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const busy = state.kind === "saving" || state.kind === "slow";

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

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

  function close() {
    setOpen(false);
    setState({ kind: "idle" });
  }

  const pill = "h-14 items-center rounded-full border border-hairline bg-raised shadow-tier transition focus-within:border-ink sm:h-16";

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-3" onKeyDown={(e) => e.key === "Escape" && close()}>
      <form method="get" action="/propiedades" className={`${pill} min-w-0 flex-1 pl-5 pr-2 sm:pl-6 ${open ? "hidden sm:flex" : "flex"}`}>
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} readOnly />
        ))}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="mr-3 shrink-0 text-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <label className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="text-xs font-semibold text-ink">Buscar</span>
          <input
            name="q"
            type="search"
            enterKeyHint="search"
            defaultValue={q}
            placeholder="Barrio, calle o palabras del anuncio"
            className="w-full truncate bg-transparent text-ink placeholder:text-placeholder"
          />
        </label>
        <button type="submit" className="sr-only">
          Buscar
        </button>
        {q && (
          <Link
            href={clearHref}
            aria-label="Borrar la búsqueda"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-soft hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        )}
      </form>

      {/* The real endpoint and method, so a submission that arrives before this component has
          hydrated still imports the advertisement the old way — a 303 back to the list — instead
          of navigating to a GET with the URL in the query string. `onSubmit` takes over once React
          is listening. */}
      <form
        method="post"
        action="/api/import"
        onSubmit={submit}
        className={`${pill} flex shrink-0 justify-end pr-2 duration-300 ease-out ${
          open ? "w-full pl-2 sm:w-[min(520px,52%)]" : "w-14 border-transparent bg-transparent shadow-none sm:w-16"
        }`}
        style={{ transitionProperty: "width, background-color, border-color, box-shadow" }}
      >
        {open && (
          <>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-soft hover:text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <label className="flex min-w-0 flex-1 flex-col justify-center px-3">
              <span className="text-xs font-semibold text-ink">Añadir enlace</span>
              <input
                ref={field}
                type="url"
                name="url"
                required
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (!busy) setState({ kind: "idle" });
                }}
                inputMode="url"
                autoComplete="off"
                aria-describedby="add-status"
                placeholder="Pega un anuncio de Idealista, Fotocasa o Habitaclia"
                className="w-full truncate bg-transparent text-ink placeholder:text-placeholder"
              />
            </label>
          </>
        )}
        <button
          type={open ? "submit" : "button"}
          onClick={open ? undefined : () => setOpen(true)}
          aria-label={open ? "Guardar el anuncio" : "Añadir un anuncio"}
          aria-expanded={open}
          aria-busy={busy}
          className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full transition aria-busy:opacity-60 sm:h-12 sm:w-12"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </form>

      {/* Below the pill, not inside it: the field keeps its height whatever the message says. */}
      <div id="add-status" role="status" className="add-status">
        {open && state.kind !== "idle" && (
          <p className="add-status-box">
            {state.kind === "saving" && <span className="text-muted">Guardando propiedad…</span>}
            {state.kind === "slow" && <span className="text-muted">Guardando propiedad… Tarda más de lo normal, pero sigue en marcha.</span>}
            {state.kind === "error" && <span className="text-error">{state.message}</span>}
            {state.kind === "unsupported" && (
              <span className="text-body">
                Este portal no se puede importar por enlace.{" "}
                <Link href="/ayuda" className="font-semibold text-ink underline underline-offset-4">
                  Usa el marcador
                </Link>
                .
              </span>
            )}
            {state.kind === "capture" && (
              <span className="text-body">
                {state.portal} bloquea la lectura desde el servidor. Abre el anuncio y pulsa el marcador.{" "}
                <Link href="/ayuda" className="font-semibold text-ink underline underline-offset-4">
                  Instalarlo
                </Link>
                .
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
