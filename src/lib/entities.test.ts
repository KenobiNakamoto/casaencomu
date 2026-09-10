import { describe, expect, it } from "vitest";
import { decode } from "./entities";

/**
 * Issue #143. The decoder knew six names, so every accent an agency wrote as `&oacute;` reached
 * the database as those nine characters — in 19 of the family's 24 descriptions.
 */
describe("the entities a listing is actually written with", () => {
  // Counted in the family's own descriptions, most common first. If one of these regresses, the
  // longest piece of text on the page goes back to being unreadable.
  const MEASURED: [string, string][] = [
    ["&oacute;", "ó"], ["&aacute;", "á"], ["&iacute;", "í"], ["&ntilde;", "ñ"], ["&uacute;", "ú"],
    ["&eacute;", "é"], ["&bull;", "•"], ["&sup2;", "²"], ["&iexcl;", "¡"], ["&ordf;", "ª"],
    ["&ccedil;", "ç"], ["&Oacute;", "Ó"], ["&ndash;", "–"], ["&Aacute;", "Á"], ["&Uacute;", "Ú"],
    ["&ordm;", "º"], ["&Iacute;", "Í"], ["&euro;", "€"], ["&ograve;", "ò"], ["&Ntilde;", "Ñ"],
    ["&egrave;", "è"], ["&Eacute;", "É"], ["&agrave;", "à"],
  ];

  it.each(MEASURED)("%s → %s", (entity, char) => {
    expect(decode(entity)).toBe(char);
  });

  it("reads the whole sentence the issue quoted", () => {
    expect(decode("&iexcl;Descubre este &aacute;tico de 72 m&sup2; en una 8&ordf; planta")).toBe(
      "¡Descubre este ático de 72 m² en una 8ª planta",
    );
  });

  // HTML's names are case-sensitive: they are two different letters, not two spellings of one.
  it("keeps the case the name carries", () => {
    expect(decode("&Ouml;&ouml;")).toBe("Öö");
  });

  it("still takes the five ASCII names written either way", () => {
    expect(decode("&amp;&AMP;&lt;&gt;&quot;&apos;")).toBe("&&<>\"'");
  });

  it("still takes a numeric entity, decimal or hex", () => {
    expect(decode("&#233;&#xE9;&#X2014;")).toBe("éé—");
  });

  it("leaves a name it does not know exactly as it found it", () => {
    expect(decode("&thereexists; &notanentity;")).toBe("&thereexists; &notanentity;");
  });

  // The one thing a second pass must never do: turn text that means `&eacute;` into `é`.
  it("decodes once, so an escaped entity survives as text", () => {
    expect(decode("&amp;eacute;")).toBe("&eacute;");
  });

  it("writes a non-breaking space as an ordinary one and drops a soft hyphen", () => {
    // `toText` collapses runs of spaces afterwards, and it cannot see a character it does not
    // know is a space. A soft hyphen is invisible and only ever breaks a search.
    expect(decode("72&nbsp;m")).toBe("72 m");
    expect(decode("Eix&shy;ample")).toBe("Eixample");
  });

  it("passes a bare ampersand through, because an agency writes them", () => {
    expect(decode("Pisos & Casas")).toBe("Pisos & Casas");
  });
});
