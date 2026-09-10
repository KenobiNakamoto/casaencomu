import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("./page.tsx");
const copy = read("./copy.tsx");
const list = read("../propiedades/page.tsx");

/**
 * V26. The help led with dragging a bookmarklet to a desktop toolbar. Since #111 that is the
 * exception: a pasted link is opened by a real browser on the server (F37).
 */
describe("the help names the way in, in the order it is used", () => {
  it("puts the pasted link before the marker", () => {
    expect(page.indexOf("Cómo añadir un piso")).toBeLessThan(page.indexOf("El marcador, para lo demás"));
    expect(page.indexOf("«Añadir enlace»")).toBeLessThan(page.indexOf("Arrástralo a la barra"));
  });

  // The list is built from the allowlist, so it cannot promise a portal the app would refuse.
  it("takes the portals from the allowlist itself, never from a hand-written list", () => {
    expect(page).toContain('import { PORTALS } from "@/lib/url"');
    expect(page).toContain("{PORTALS.map((p) => (");
    for (const name of ["Idealista", "Fotocasa", "Habitaclia", "Housfy", "Vivalta", "iad"]) {
      expect(read("../../lib/url.ts"), name).toContain(name);
    }
  });

  it("says what a portal we do not know needs", () => {
    expect(page).toContain("De otro portal no podemos leer el enlace.");
  });

  it("promises no iOS share extension", () => {
    expect(page).not.toMatch(/App Store.{0,40}instal/i);
    expect(page).toContain("No hay nada que instalar desde la App Store");
    for (const banned of ["extensión", "compartir con la app", "Atajos"]) {
      expect(page, banned).not.toContain(banned);
    }
  });

  it("never calls copying the code installing it", () => {
    expect(page).toContain("Copiar el código no es instalarlo");
    expect(copy).toContain("Copiar el código");
  });

  it("keeps the manual selection when the clipboard refuses", () => {
    expect(copy).toContain("No se pudo copiar. Selecciónalo a mano en el cuadro de abajo.");
    expect(copy).toContain("<textarea");
    expect(copy).toContain("readOnly");
  });

  it("folds the server readout away as the technical detail it is", () => {
    expect(page).toContain("Detalles técnicos");
    expect(page).toContain("<details className=\"group\">");
  });
});

/** F30 and PIP-14: a shared number that appears from nowhere reads as a rule, not a decision. */
describe("the budget says it belongs to everybody", () => {
  it("says so, and says whose hand it was", () => {
    expect(list).toContain("Es el de todos: si lo cambias, cambia para toda la familia.");
    expect(list).toContain("{presupuesto.by}");
    expect(list).toContain("ago(presupuesto.at)");
  });
});
