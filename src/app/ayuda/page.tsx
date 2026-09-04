import { currentUser } from "@/lib/auth";
import { buildBookmarklet } from "@/lib/bookmarklet";

export default async function AyudaPage() {
  const { capture_token } = await currentUser();
  const publicUrl = process.env.PUBLIC_URL || "http://localhost:3000";
  const bookmarklet = buildBookmarklet(publicUrl, capture_token);
  const now = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  const uptimeMin = Math.floor(process.uptime() / 60);

  // React 19 rewrites any `javascript:` href to a throw, so the anchor is emitted as raw HTML.
  // Safe: buildBookmarklet percent-encodes the code, so no quote or angle bracket reaches the attribute.
  const link =
    `<a href="${bookmarklet}" class="inline-block rounded-lg bg-zinc-900 px-4 py-3 text-white select-none">` +
    "📌 Guardar en CasaEnComú</a>";

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-6">
      <h1 className="text-2xl font-semibold">Ayuda</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Guardar desde el navegador</h2>
        <p>Arrástralo a la barra de marcadores (no hagas clic aquí):</p>
        <p dangerouslySetInnerHTML={{ __html: link }} />
        <p className="text-sm text-zinc-600">
          Después, abre un anuncio y pulsa el marcador. Se abre una pestaña con el piso guardado.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">En el iPhone (Safari)</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Guarda cualquier página en Favoritos: botón Compartir → «Añadir marcador».</li>
          <li>Abre Marcadores → «Editar» y toca ese marcador.</li>
          <li>Cámbiale el nombre a «Guardar en CasaEnComú» y sustituye la dirección por el código de abajo.</li>
          <li>Abre un anuncio, toca la barra de direcciones y elige el marcador.</li>
        </ol>
        <p className="text-sm text-zinc-600">Mantén pulsado el cuadro → «Seleccionar todo» → «Copiar».</p>
        {/* ponytail: no select-on-focus client component; long-press → Seleccionar todo works on iOS */}
        <textarea
          readOnly
          value={bookmarklet}
          rows={4}
          className="w-full rounded-lg border border-zinc-300 p-2 font-mono text-xs break-all"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Cómo añadir un piso</h2>
        <p>
          <strong>Fotocasa o Habitaclia:</strong> copia el enlace del anuncio y pégalo en{" "}
          <a href="/propiedades" className="underline">
            Propiedades
          </a>{" "}
          → «Añadir enlace».
        </p>
        <p>
          <strong>Idealista:</strong> bloquea al servidor. Abre el anuncio en el navegador y pulsa el marcador.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Estado</h2>
        <p className="text-sm text-zinc-600">
          Servidor en marcha desde hace {uptimeMin} min · {now}
        </p>
      </section>
    </div>
  );
}
