"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * «Buscar novedades». One button, pressed by a person.
 *
 * Deliberately not a timer. A feed that refreshes itself moves the line somebody is reading, and
 * — worse — a re-render of this page while an editor is open elsewhere is exactly the thing that
 * loses what they were typing (PIP-13: no polling, no guessed attention).
 */
export function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      className="touch-target h-9 shrink-0 rounded-lg border border-control-border px-3 text-sm font-medium text-body transition hover:text-ink disabled:opacity-60"
      disabled={pending}
    >
      {pending ? "Buscando…" : "Buscar novedades"}
    </button>
  );
}
