import { describe, expect, it } from "vitest";
import { buildBookmarklet, COLLECT } from "./bookmarklet";

/**
 * One collector, two readers: the bookmarklet a person clicks on the portal's own page, and the
 * browser reader on the host that evaluates the same expression over the DevTools protocol. If
 * they ever diverge, Idealista is read two different ways and only one of them is tested.
 */
describe("the collector is one expression both readers can use", () => {
  it("evaluates to the capture as a JSON string, with no token in it", () => {
    const doc = {
      title: "Piso en venta en Calle del Rosselló — idealista",
      body: { innerText: "575.000 €\n87 m²\n3 hab." },
      getElementById: () => null,
      querySelectorAll: (sel: string) =>
        sel.startsWith("meta")
          ? [{ getAttribute: (a: string) => (a === "property" ? "og:title" : "Piso de 87 m²") }]
          : [],
    };
    const raw = new Function("document", "location", `return ${COLLECT}`)(doc, {
      href: "https://www.idealista.com/inmueble/112006681/",
    });
    const c = JSON.parse(raw as string);
    expect(c).toMatchObject({ url: "https://www.idealista.com/inmueble/112006681/", title: doc.title });
    expect(JSON.parse(c.og)["og:title"]).toBe("Piso de 87 m²");
    expect(c.text).toContain("87 m²");
    // The reader supplies the token itself; the collector must never carry one.
    expect(COLLECT).not.toContain("token");
  });

  it("the bookmarklet still wraps it in the form POST, with the member's token", () => {
    const href = buildBookmarklet("https://casa.example.com/", "TOKEN-123");
    const code = decodeURIComponent(href.replace(/^javascript:/, ""));
    expect(code).toContain('"https://casa.example.com/api/capture"');
    expect(code).toContain('"TOKEN-123"');
    expect(code).toContain("v.token=");
    expect(code).toContain("f.submit()");
    // The collector goes in whole, so the two readers cannot drift apart.
    expect(code).toContain(COLLECT);
  });
});
