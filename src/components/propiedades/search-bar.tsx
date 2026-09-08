"use client";

import Link from "next/link";
import { AddDialog } from "./add-dialog";

/**
 * The pill searches; `Añadir propiedad` opens a dialog beside it.
 *
 * The control used to grow a link field leftwards over 300 ms, taking the search box's width and,
 * on a phone, taking the search box off the screen entirely (F17). Nothing about adding a link
 * needs the search field's space.
 */
export function SearchBar({
  q,
  hidden,
  clearHref,
}: {
  q: string;
  hidden: Record<string, string>;
  clearHref: string;
}) {
  const pill =
    "flex h-14 items-center rounded-full border border-hairline bg-raised shadow-tier transition focus-within:border-ink sm:h-16";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <form method="get" action="/propiedades" className={`${pill} min-w-0 flex-1 pl-5 pr-2 sm:pl-6`}>
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

      <AddDialog />
    </div>
  );
}
