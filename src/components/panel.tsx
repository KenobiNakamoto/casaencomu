"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * One native `<dialog>`, shared by everything that has to open over the page (doc 07). The
 * browser already gives the top layer, Escape, the focus trap and the return of focus to whatever
 * opened it; none of that is worth reimplementing, so this only adds the two things it does not:
 * closing on the backdrop, and asking first when there is something to lose.
 *
 * `guard` returns true to refuse the close. The caller shows its own question: a browser
 * confirmation box inside a modal is the one thing the person cannot style, read or undo.
 */
export function Panel({
  label,
  open,
  onClose,
  guard,
  children,
}: {
  label: string;
  open: boolean;
  onClose: () => void;
  guard?: () => boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const tryClose = () => {
    if (guard?.()) return;
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className="panel"
      onCancel={(e) => {
        // Escape closes a dialog before anything can ask. Take it back, then ask.
        e.preventDefault();
        tryClose();
      }}
      onClick={(e) => {
        // The content is a centred child, so a click on the dialog itself landed outside it.
        if (e.target === e.currentTarget) tryClose();
      }}
      onClose={onClose}
    >
      {children}
    </dialog>
  );
}
