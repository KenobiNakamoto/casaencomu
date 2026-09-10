"use client";

import { useState } from "react";

/**
 * A copy button over a box the text is still in.
 *
 * The clipboard is not always there — an insecure origin, a browser that refuses it, a permission
 * denied — so the box stays selectable and the button says so when it fails. Copying is never
 * called installing: what is copied still has to be pasted into a bookmark by hand, and V26 is
 * explicit that the two must not be confused.
 */
export function CopyBox({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(value).then(
              () => setState("done"),
              () => setState("failed"),
            ) ?? setState("failed")
          }
          className="touch-target h-9 rounded-lg border border-control-border px-3 text-sm font-medium text-body transition hover:text-ink"
        >
          {state === "done" ? "Copiado" : "Copiar el código"}
        </button>
        <p className="text-xs text-muted">
          {state === "failed"
            ? "No se pudo copiar. Selecciónalo a mano en el cuadro de abajo."
            : "Mantén pulsado el cuadro → «Seleccionar todo» → «Copiar»."}
        </p>
      </div>
      <textarea
        readOnly
        value={value}
        rows={4}
        aria-label={label}
        className="w-full rounded-lg border border-control-border p-3 font-mono text-xs break-all focus:border-ink"
      />
    </div>
  );
}
