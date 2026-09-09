"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The photographs, in three layers.
 *
 * 1. The hero grid on the page: one large and four small, every one of them a button.
 * 2. The mosaic, over the page: every photograph, at two widths, scrolling.
 * 3. One photograph, over the mosaic: previous, next, the arrow keys, a counter.
 *
 * Both layers are a native `<dialog>` opened with `showModal()`, and that is the whole reason
 * this needs no library: the browser gives the top layer, Escape, the focus trap, the return of
 * focus to whatever opened it, and `::backdrop` to darken. Nesting them is what makes closing
 * the photograph land back on the mosaic rather than on the page — Escape closes the top layer
 * only, and the second backdrop stacks on the first, so the page reads as further away.
 */
export function Gallery({ ids, title }: { ids: string[]; title: string }) {
  const mosaic = useRef<HTMLDialogElement>(null);
  const zoom = useRef<HTMLDialogElement>(null);
  const [at, setAt] = useState(0);
  // The mosaic's photographs are not in the document until it has been opened once. A lazy image
  // inside a `display: none` dialog is measured as off screen, and the browser does not come back
  // to it when the dialog opens — the grid stayed blank. It also means a visit that never opens
  // the gallery never asks for the other twenty-five photographs.
  const [everOpened, setEverOpened] = useState(false);
  const n = ids.length;

  const openMosaic = () => {
    setEverOpened(true);
    mosaic.current?.showModal();
  };
  const openZoom = (i: number) => {
    setAt(i);
    zoom.current?.showModal();
  };
  const step = useCallback((d: number) => setAt((i) => Math.min(n - 1, Math.max(0, i + d))), [n]);

  // Arrow keys move through the photographs. Escape is the browser's, not ours.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!zoom.current?.open) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  // A click that lands on the dialog itself landed outside its content, because the content is a
  // centred child. `currentTarget` is the dialog either way, so the comparison has to be `target`.
  const closeOnOutside = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  };

  const alt = (i: number) => `Foto ${i + 1} de ${n} del anuncio: ${title}`;
  // ponytail: the hero is 1 + 4 above md, 1 + 2 from three photographs, one alone below that.
  const shown = n >= 5 ? 5 : n >= 3 ? 3 : n;
  const gridCols = n >= 5 ? "md:grid-cols-4 md:grid-rows-2" : n >= 3 ? "md:grid-cols-3 md:grid-rows-2" : "md:grid-cols-2 md:grid-rows-1";

  return (
    <section className="mt-5">
      {/* Phone: one photograph per screen, swiped, and the same five the desktop hero shows. The
          pill below opens the rest. Thirty <img> on the page cost thirty requests even inside a
          `display: none` strip, and the hydration script queues behind them: the first tap on the
          gallery did nothing, because the button was not yet a button. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 no-scrollbar md:hidden">
        {ids.slice(0, shown).map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={openMosaic}
            className="photo-open aspect-[4/3] w-[86vw] shrink-0 snap-center overflow-hidden rounded-card bg-surface-soft"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${id}`} alt={alt(i)} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <div className="relative hidden md:block">
        <div className={`grid h-[420px] gap-2 overflow-hidden rounded-card ${gridCols}`}>
          {ids.slice(0, shown).map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={openMosaic}
              className={`photo-open overflow-hidden bg-surface-soft ${i === 0 && n >= 3 ? "col-span-2 row-span-2" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${id}`} alt={alt(i)} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
        {/* Over the grid at its foot, the way a listing site does it. */}
        <button type="button" onClick={openMosaic} className="photo-all absolute bottom-4 right-4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />
          </svg>
          Ver las {n} fotos
        </button>
      </div>
      <button type="button" onClick={openMosaic} className="photo-all mt-3 md:hidden">
        Ver las {n} fotos
      </button>

      {/* ---- layer 2: the mosaic ---- */}
      <dialog ref={mosaic} onClick={closeOnOutside} className="photo-layer photo-layer-scroll" aria-label={`Fotos de ${title}`}>
        <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-20">
          {/* Fixed rows and a dense flow: every fifth photograph takes four cells and the rest
              pack in around it. Every stored photograph is 4:3, so the mosaic has to come from
              the cells rather than from the pictures. */}
          <div className="grid auto-rows-[150px] grid-cols-2 gap-3 [grid-auto-flow:dense] sm:auto-rows-[190px] sm:grid-cols-3">
            {(everOpened ? ids : []).map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() => openZoom(i)}
                className={`photo-tile overflow-hidden rounded-card bg-surface-soft ${i % 5 === 0 ? "col-span-2 row-span-2" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/photos/${id}`} alt={alt(i)} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
        {/* ponytail: no count here. The control that opened this said how many, and a pill fixed
            over the grid only covers a photograph. The carousel keeps its counter, where the
            question "which one am I on" is a real one. */}
        <button type="button" onClick={() => mosaic.current?.close()} className="photo-close" aria-label="Cerrar las fotos">
          <Cross />
        </button>
      </dialog>

      {/* ---- layer 3: one photograph ---- */}
      <dialog ref={zoom} onClick={closeOnOutside} className="photo-layer photo-zoom" aria-label={alt(at)}>
        {/* Only the neighbours are in the document, so opening the last of forty costs one request. */}
        {ids.map((id, i) =>
          Math.abs(i - at) > 1 ? null : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={id} src={`/api/photos/${id}`} alt={alt(i)} hidden={i !== at} className="photo-full" />
          ),
        )}
        <button type="button" onClick={() => step(-1)} disabled={at === 0} className="photo-step left-3 sm:left-6" aria-label="Foto anterior">
          <Chevron d="M15 5l-7 7 7 7" />
        </button>
        <button type="button" onClick={() => step(1)} disabled={at === n - 1} className="photo-step right-3 sm:right-6" aria-label="Foto siguiente">
          <Chevron d="M9 5l7 7-7 7" />
        </button>
        <p className="photo-count" aria-live="polite">
          {at + 1} / {n}
        </p>
        <button type="button" onClick={() => zoom.current?.close()} className="photo-close" aria-label="Volver a todas las fotos">
          <Cross />
        </button>
      </dialog>
    </section>
  );
}

const Cross = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const Chevron = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
