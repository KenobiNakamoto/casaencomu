"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The pill searches. The round + adds a listing: clicking it grows a link field leftwards from the
 * button, which never moves, and the search box gives up the width. Escape or × closes it again.
 */
export function SearchBar({ q, hidden, clearHref }: { q: string; hidden: Record<string, string>; clearHref: string }) {
  const [open, setOpen] = useState(false);
  const url = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) url.current?.focus();
  }, [open]);

  const pill = "h-14 items-center rounded-full border border-hairline bg-raised shadow-tier transition focus-within:border-ink sm:h-16";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
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
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-soft hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        )}
      </form>

      <form
        method="post"
        action="/api/import"
        className={`${pill} flex shrink-0 justify-end pr-2 duration-300 ease-out ${
          open ? "w-full pl-2 sm:w-[min(460px,52%)]" : "w-14 border-transparent bg-transparent shadow-none sm:w-16"
        }`}
        style={{ transitionProperty: "width, background-color, border-color, box-shadow" }}
      >
        {open && (
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-soft hover:text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <label className="flex min-w-0 flex-1 flex-col justify-center px-3">
              <span className="text-xs font-semibold text-ink">Añadir enlace</span>
              <input
                ref={url}
                type="url"
                name="url"
                required
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
          className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full sm:h-12 sm:w-12"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </form>
    </div>
  );
}
