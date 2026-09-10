/**
 * HTML entities → the characters they stand for.
 *
 * Its own file because two very different callers need it: the extractor, on the way in, and one
 * migration, to repair what was stored before this existed. `db.ts` cannot import the extractor.
 *
 * Only the names a listing actually uses. The full HTML5 table is 2,231 names, most of them
 * mathematical, and none of that appears in an advertisement for a flat.
 */

/**
 * HTML's Latin-1 names, in code-point order from 160 (`nbsp`) to 255 (`yuml`). The order *is* the
 * table, so the whole Spanish alphabet costs one line — and the accents were the entire bug
 * (issue #143: `&eacute;Descubre` for `¡Descubre`).
 */
const LATIN1 =
  ("nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn " +
    "sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest " +
    "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml " +
    "Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times " +
    "Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig " +
    "agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml " +
    "igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide " +
    "oslash ugrave uacute ucirc uuml yacute thorn yuml").split(" ");

const NAMED: Record<string, string> = {
  ...Object.fromEntries(LATIN1.map((name, i) => [name, String.fromCodePoint(160 + i)])),
  // The typography an agency writes: dashes, quotation marks, a bullet list, a price.
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•", hellip: "…", euro: "€", trade: "™",
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  // Two deliberate departures from the code point. A non-breaking space becomes an ordinary one,
  // so the whitespace collapse that follows can see it. A soft hyphen becomes nothing: it is
  // invisible on the page and only ever breaks a search that should have matched.
  nbsp: " ", shy: "",
};

/**
 * One pass, left to right, so nothing is decoded twice: `&amp;eacute;` is the text `&eacute;`
 * and comes back as that, not as `é`.
 *
 * Names are case-sensitive, because HTML's are — `&Oacute;` is Ó and `&oacute;` is ó. The
 * lowercase fallback is for the five ASCII names, which are written either way in the wild.
 */
export const decode = (s: string) =>
  // `[a-z][a-z0-9]*`, not `[a-z]+`: six of the Latin-1 names carry a digit — `sup2`, `frac12` —
  // and a letters-only pattern walked straight past every «72 m&sup2;» in the family's data.
  s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] !== "#") return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
    const hex = e[1] === "x" || e[1] === "X";
    const n = parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });

/** The columns a page's own words reach, and the only ones that can hold an entity. */
export const WORDS = ["title", "description", "address_text", "neighborhood", "agency"] as const;
