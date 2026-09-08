"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The one dialog in the application, built on the native `<dialog>` element.
 *
 * ponytail: the platform already does the modal work — the top layer, the backdrop, the focus
 * trap, Escape, and inertness of the page behind. A library would re-implement all of it. What
 * the element does not do by itself is return focus to whatever opened it, and that is the only
 * thing this wrapper adds.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
      // The heading, not the field: a screen reader should hear what this is before what to type.
      el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Escape and the backdrop both fire `close`, so one handler covers every way out.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const done = () => {
      (opener.current as HTMLElement | null)?.focus?.();
      onClose();
    };
    el.addEventListener("close", done);
    return () => el.removeEventListener("close", done);
  }, [onClose]);

  return (
    <dialog ref={ref} className="app-dialog" aria-label={title} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      {/* The click above closes on the backdrop only: the backdrop is the dialog element itself. */}
      <div className="app-dialog-body" onClick={(e) => e.stopPropagation()}>
        <div className="app-dialog-head">
          <h2 tabIndex={-1} data-autofocus className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Cerrar" className="app-dialog-x">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
