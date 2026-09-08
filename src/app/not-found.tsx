import Link from "next/link";

/** A wrong or stale link, including a property that no longer exists (F34). */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-[22px] font-medium text-ink">Esta página no existe</h1>
      <p className="mt-2 text-sm text-muted">
        Puede que la propiedad se haya borrado, o que el enlace esté incompleto.
      </p>
      <Link href="/propiedades" className="btn-primary mt-6 inline-flex h-12 items-center rounded-lg px-5 text-sm font-semibold">
        Ir a Propiedades
      </Link>
    </div>
  );
}
