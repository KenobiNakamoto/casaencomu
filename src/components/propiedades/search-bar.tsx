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
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

/** After this long the person deserves to be told it has not stalled. */
const SLOW_MS = 10_000;

/**
 * The wash inside the pill. `sent` is the accent rising; it then waits, because the answer is the
 * server's and the server has up to 25 seconds. `ok` and `bad` are the verdict, and they play for
 * `VERDICT_MS`. When this browser can answer on its own — nothing typed, a portal we cannot fetch
 * — the wait is only `SENT_MS`, which is the ~700ms the whole thing was asked to be.
 */
type Flash = "sent" | "ok" | "bad" | null;
const SENT_MS = 230;
const VERDICT_MS = 470;

/**
 * The pill searches. The round + adds a listing: clicking it grows a link field leftwards from the
 * button, which never moves, and the search box gives up the width. The + turns into an × as it
 * grows and is what closes it again, so there is one control there rather than two; Escape also
 * closes, and Enter saves.
 *
 * Only a link to a site we do not take is answered here; everything else is sent. A portal that
 * blocks the server no longer costs the person anything — the record is created either way and
 * the page it opens says what is still missing. What is sent goes by `fetch`, so a failure leaves
 * the field open with the link still in it and the message beside it (F16).
 */
export function SearchBar({ q, hidden, clearHref }: { q: string; hidden: Record<string, string>; clearHref: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [flash, setFlash] = useState<Flash>(null);
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

  useEffect(() => {
    if (flash !== "ok" && flash !== "bad") return;
    const t = setTimeout(() => setFlash(null), VERDICT_MS);
    return () => clearTimeout(t);
  }, [flash]);

  /** The accent first, then the verdict — never the verdict on its own. */
  const answer = (kind: "ok" | "bad") => setTimeout(() => setFlash(kind), SENT_MS);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return; // one submission at a time, without disabling the field
    setFlash("sent");
    const value = url.trim();
    // Three answers this browser already has. They are the reason the pill can say anything in
    // under a second at all: nothing is sent, so nothing is waited for.
    if (!value) {
      answer("bad");
      return setState({ kind: "error", message: "Pega el enlace del anuncio." });
    }
    if (routeFor(value) === "unsupported") {
      answer("bad");
      return setState({ kind: "unsupported" });
    }

    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = (await res.json().catch(() => null)) as { location?: string; error?: string } | null;
      if (res.ok && data?.location) {
        const to = data.location;
        setFlash("ok");
        // The green is the confirmation, so it is worth the half second it takes — after a wait
        // that can be twenty times longer, and the page it leaves for is the answer anyway.
        setTimeout(() => {
          setOpen(false);
          setUrl("");
          setState({ kind: "idle" });
          router.push(to);
        }, VERDICT_MS);
        return;
      }
      setFlash("bad");
      setState({ kind: "error", message: data?.error ?? "No se pudo guardar el anuncio." });
    } catch {
      setFlash("bad");
      setState({ kind: "error", message: "No hay conexión con el servidor. El enlace sigue aquí; inténtalo otra vez." });
    }
  }

  function close() {
    setOpen(false);
    setState({ kind: "idle" });
  }

  /**
   * One curve and one duration for the whole control: the field grows and the icon turns on the
   * same movement, so they read as one thing opening rather than two things animating at once.
   */
  const motion = "duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)]";
  const pill =
    "pill relative h-14 items-center rounded-full border border-hairline bg-raised shadow-tier transition focus-within:border-ink sm:h-16";

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
        data-flash={flash || undefined}
        className={`${pill} flex shrink-0 justify-end pr-2 ${motion} ${
          open ? "w-full pl-2 sm:w-[min(520px,52%)]" : "w-14 border-transparent bg-transparent shadow-none sm:w-16"
        }`}
        style={{ transitionProperty: "width, background-color, border-color, box-shadow" }}
      >
        {open && (
          <>
            <label className="flex min-w-0 flex-1 flex-col justify-center px-3">
              <span className="text-xs font-semibold text-ink">Añadir enlace</span>
              <input
                ref={field}
                type="url"
                name="url"
                // Not `required`: that is what draws the browser's own bubble over the pill. The
                // empty case is answered here, and `/api/import` refuses it too.
                aria-required="true"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (!busy) setState({ kind: "idle" });
                }}
                inputMode="url"
                autoComplete="off"
                aria-describedby="add-status"
                enterKeyHint="go"
                placeholder="Pega el enlace de un anuncio"
                className="w-full truncate bg-transparent text-ink placeholder:text-placeholder"
              />
            </label>
            {/* Enter saves. The button beside the field closes now, so this is the submission —
                and, being a real submit button, it is what makes Enter work at all. */}
            <button type="submit" className="sr-only" aria-disabled={busy}>
              Guardar el anuncio
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-label={open ? "Cerrar" : "Añadir un anuncio"}
          aria-expanded={open}
          aria-busy={busy}
          className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full transition aria-busy:opacity-60 sm:h-12 sm:w-12"
        >
          {/* A + turned 45° is an ×, so there is one icon, not two. It takes the long way round —
              half a turn, then the last 45° — on the same curve as the field beside it. */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={`transition-transform ${motion}`}
            style={{ transform: `rotate(${open ? 225 : 0}deg)` }}
            aria-hidden
          >
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
          </p>
        )}
      </div>
    </div>
  );
}
