/**
 * Shown while a page's data is on its way (F34). It is deliberately quiet: a spinner that
 * animates for 80 ms is noise, and reduced motion removes the pulse anyway.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
      <p role="status" className="text-sm text-muted">
        Cargando…
      </p>
      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton aspect-[20/19] rounded-card" />
            <div className="skeleton mt-3 h-4 w-3/4 rounded" />
            <div className="skeleton mt-2 h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
