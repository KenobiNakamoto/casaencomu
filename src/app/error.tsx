"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Anything a page throws lands here instead of the framework's own screen (F34). It says what
 * failed in the family's language, keeps the navigation reachable, and offers the one action
 * that usually works.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[640px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-[22px] font-medium text-ink">Algo ha fallado</h1>
      <p className="mt-2 text-sm text-muted">
        No hemos podido cargar esta página. No se ha perdido nada de lo que habíais guardado.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary h-12 rounded-lg px-5 text-sm font-semibold">
          Reintentar
        </button>
        <Link href="/propiedades" className="h-12 rounded-lg border border-ink px-5 text-sm font-medium leading-[3rem] text-ink">
          Ir a Propiedades
        </Link>
      </div>
      {/* The digest is what ties this screen to a line in the server log. */}
      {error.digest && <p className="mt-6 text-xs text-muted-soft">Referencia: {error.digest}</p>}
    </div>
  );
}
