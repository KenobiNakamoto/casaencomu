import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { buildBookmarklet } from "@/lib/bookmarklet";
import { input } from "@/components/propiedades/format";
import { PERSON_NAME_MAX } from "@/lib/project-shape";
import { renombrarseAction } from "./actions";

/**
 * Everything about you rather than about a home: what the family sees you called, and the
 * bookmarklet that carries your name onto whatever you save. They are one page because they are
 * one thing — the account — and because there was never enough of either to be a page on its own.
 */
export default async function AjustesPage() {
  const { capture_token, name, email } = await currentUser();
  const publicUrl = process.env.PUBLIC_URL || "http://localhost:3000";
  const bookmarklet = buildBookmarklet(publicUrl, capture_token);
  const now = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  const uptimeMin = Math.floor(process.uptime() / 60);

  // React 19 rewrites any `javascript:` href to a throw, so the anchor is emitted as raw HTML.
  // Safe: buildBookmarklet percent-encodes the code, so no quote or angle bracket reaches the attribute.
  const link =
    `<a href="${bookmarklet}" class="btn-primary inline-flex h-12 items-center gap-2 rounded-lg px-5 font-medium select-none">` +
    "📌 Guardar en CasaEnComú</a>";

  const h2 = "text-lg font-medium";
  return (
    <div className="mx-auto max-w-2xl divide-y divide-hairline-soft px-4 py-6 sm:px-6">
      <h1 className="pb-6 text-[22px] font-medium">Ajustes</h1>

      <section className="space-y-3 py-8">
        <h2 className={h2}>Tu nombre</h2>
        <p className="text-body">
          Es como te ve el resto en las opiniones y en la actividad. Solo en este proyecto: en otro
          puedes llamarte de otra manera.
        </p>
        <form action={renombrarseAction} className="flex gap-2">
          <input
            type="text"
            name="nombre"
            required
            maxLength={PERSON_NAME_MAX}
            defaultValue={name}
            aria-label="Tu nombre"
            className={input}
          />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-lg bg-ink px-5 text-base font-medium text-canvas transition hover:opacity-90"
          >
            Guardar
          </button>
        </form>
        <p className="text-sm text-muted">Entras como {email}.</p>
      </section>

      <section className="space-y-3 py-8">
        <h2 className={h2}>Guardar desde el navegador</h2>
        <p className="text-body">Arrástralo a la barra de marcadores (no hagas clic aquí):</p>
        <p dangerouslySetInnerHTML={{ __html: link }} />
        <p className="text-sm text-muted">
          Después, abre un anuncio y pulsa el marcador. Se abre una pestaña con el piso guardado.
        </p>
      </section>

      <section className="space-y-3 py-8">
        <h2 className={h2}>En el iPhone (Safari)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-body">
          <li>Guarda cualquier página en Favoritos: botón Compartir → «Añadir marcador».</li>
          <li>Abre Marcadores → «Editar» y toca ese marcador.</li>
          <li>Cámbiale el nombre a «Guardar en CasaEnComú» y sustituye la dirección por el código de abajo.</li>
          <li>Abre un anuncio, toca la barra de direcciones y elige el marcador.</li>
        </ol>
        <p className="text-sm text-muted">Mantén pulsado el cuadro → «Seleccionar todo» → «Copiar».</p>
        {/* ponytail: no select-on-focus client component; long-press → Seleccionar todo works on iOS */}
        <textarea
          readOnly
          value={bookmarklet}
          rows={4}
          className="w-full rounded-lg border border-control-border p-3 font-mono text-xs break-all focus:border-ink"
        />
      </section>

      <section className="space-y-3 py-8">
        <h2 className={h2}>Cómo añadir un piso</h2>
        <p className="text-body">
          <strong className="text-ink">Fotocasa o Habitaclia:</strong> copia el enlace del anuncio y pégalo en{" "}
          <Link href="/propiedades" className="font-medium text-ink underline underline-offset-4">
            Propiedades
          </Link>{" "}
          → «Añadir enlace».
        </p>
        <p className="text-body">
          <strong className="text-ink">Idealista:</strong> bloquea al servidor. Abre el anuncio en el navegador y pulsa el marcador.
        </p>
      </section>

      <section className="space-y-3 py-8">
        <h2 className={h2}>Estado</h2>
        <p className="text-sm text-muted">
          Servidor en marcha desde hace {uptimeMin} min · {now}
        </p>
      </section>
    </div>
  );
}
