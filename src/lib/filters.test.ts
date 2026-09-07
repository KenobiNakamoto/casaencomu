import { describe, expect, it } from "vitest";
import {
  ARCHIVED_COUNT_SQL,
  backHref,
  countFilters,
  COVER_SQL,
  detailHref,
  listHref,
  listSql,
  mapHref,
  ORDER,
  parseFilters,
  qualifies,
  toQuery,
  withArea,
} from "./filters";
import { budgetFit } from "./listing";
import type { AreaFeature } from "./geo";

const f = (sp: Record<string, string>) => parseFilters(sp);
const cols = "p.id";

/** A one-degree square with its corner on the origin, plus the name the fallback matches on. */
const area: AreaFeature = {
  type: "Feature",
  properties: { id: "gotic", name: "Gòtic", level: "barrio", district: "Ciutat Vella" },
  geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
};

const row = (over: Partial<Parameters<typeof qualifies>[2]> = {}) => ({
  haystack: "Piso reformado en el Gòtic 3 hab 80 m2 300000",
  lat: 0.5,
  lng: 0.5,
  neighborhood: "Gòtic",
  ...over,
});

describe("parseFilters", () => {
  it("keeps only values it recognises", () => {
    const v = f({ hab: "3", banos: "x", m2: "-4", etapa: "inventada", estado: "nope", puntuacion: "9", orden: "azar" });
    expect(v.hab).toBe("3");
    expect(v.banos).toBe("");
    expect(v.m2).toBe("");
    expect(v.etapa).toBe("");
    expect(v.estado).toBe("");
    expect(v.puntuacion).toBe("");
    expect(v.orden).toBe("fecha");
  });

  it("splits a price range and tolerates an open end", () => {
    expect(f({ precio: "100000-300000" })).toMatchObject({ precioMin: "100000", precioMax: "300000" });
    expect(f({ precio: "-300000" })).toMatchObject({ precioMin: "", precioMax: "300000" });
    expect(f({ precio: "100000-" })).toMatchObject({ precioMin: "100000", precioMax: "" });
    expect(f({ precio: "caro" })).toMatchObject({ precioMin: "", precioMax: "" });
  });

  it("takes the first value when a key repeats, and trims the query", () => {
    expect(parseFilters({ q: ["  gotic ", "otro"] }).q).toBe("gotic");
  });

  it("treats archivadas as a switch, not free text", () => {
    expect(f({ archivadas: "1" }).archivadas).toBe("1");
    expect(f({ archivadas: "si" }).archivadas).toBe("");
  });
});

describe("listSql — the qualifying set", () => {
  it("binds every numeric filter as an argument, never as text", () => {
    const v = f({ precio: "100000-300000", hab: "3", banos: "2", m2: "80", barrio: "Gòtic" });
    const { sql, args } = listSql(v, cols);
    expect(args).toEqual([100000, 300000, 3, 2, 80, "Gòtic"]);
    expect(sql).not.toContain("100000");
  });

  it("compares rooms, baths and area as minimums, which is what the labels claim", () => {
    const { sql } = listSql(f({ hab: "3", banos: "2", m2: "80" }), cols);
    expect(sql).toContain("p.rooms >= ?");
    expect(sql).toContain("p.bathrooms >= ?");
    expect(sql).toContain("p.area_m2 >= ?");
  });

  it("hides discarded and removed homes by default", () => {
    const { sql } = listSql(f({}), cols);
    expect(sql).toContain("p.stage != 'descartada'");
    expect(sql).toContain("availability != 'removed'");
  });

  it("shows them when asked, and when a stage is named", () => {
    for (const sp of [{ archivadas: "1" }, { etapa: "descartada" }] as Record<string, string>[]) {
      const { sql } = listSql(f(sp), cols);
      expect(sql).not.toContain("p.stage != 'descartada'");
    }
  });

  it("still filters by the named stage", () => {
    const { sql, args } = listSql(f({ etapa: "descartada" }), cols);
    expect(sql).toContain("p.stage = ?");
    expect(args).toContain("descartada");
  });

  it("puts the score filter outside, where family_avg exists", () => {
    const { sql, args } = listSql(f({ puntuacion: "4" }), cols);
    expect(sql).toContain(") WHERE family_avg >= ?");
    expect(args).toEqual([4]);
  });

  it("takes the first photo that exists, not position zero (F39)", () => {
    expect(COVER_SQL).toContain("ORDER BY position LIMIT 1");
    expect(COVER_SQL).not.toContain("position = 0");
    expect(listSql(f({}), cols).sql).toContain(COVER_SQL);
  });

  it("can sort by any ordering whatever columns the caller asked for", () => {
    // Regression: ORDER BY runs on the outer statement, so the map's column set — which never
    // had created_at — failed with "no such column" the moment it took the default ordering.
    for (const orden of Object.keys(ORDER)) {
      const { sql } = listSql(f({ orden }), "");
      for (const col of ORDER[orden].replace(/ (ASC|DESC)|IS NULL/g, "").split(",")) {
        expect(sql).toContain(col.trim());
      }
    }
  });

  it("gives every caller the identifier and the sort columns unasked", () => {
    const { sql } = listSql(f({}), "");
    expect(sql).toContain("p.id");
    expect(sql).toContain("p.created_at");
    expect(sql).toContain("p.price_eur");
  });

  it("always selects what the JavaScript pass needs", () => {
    const { sql } = listSql(f({}), cols);
    expect(sql).toContain("AS haystack");
    expect(sql).toContain("AS family_avg");
    expect(sql).toContain("AS cover_id");
  });

  it("gives the list and the map the same predicate for the same query (F13)", () => {
    const v = f({ q: "gotic", precio: "100000-300000", hab: "3", estado: "reformado", zona: "gotic", puntuacion: "4" });
    const list = listSql(v, "p.id, p.title, p.created_at");
    const map = listSql(v, "p.id, p.lat, p.lng");
    const strip = (s: string) => s.replace(/SELECT [\s\S]*?,\n\s+\(SELECT id FROM photos/, "SELECT (SELECT id FROM photos");
    expect(strip(list.sql)).toBe(strip(map.sql));
    expect(list.args).toEqual(map.args);
  });

  it("counts what the archive policy hides", () => {
    expect(ARCHIVED_COUNT_SQL).toContain("p.stage = 'descartada'");
    expect(ARCHIVED_COUNT_SQL).toContain("COUNT(*)");
  });
});

describe("qualifies — what SQL cannot do", () => {
  it("ignores accents in both directions", () => {
    expect(qualifies(f({ q: "gotic" }), undefined, row())).toBe(true);
    expect(qualifies(f({ q: "gòtic" }), undefined, row({ haystack: "piso en el gotic" }))).toBe(true);
  });

  it("requires every word of the query", () => {
    expect(qualifies(f({ q: "piso reformado" }), undefined, row())).toBe(true);
    expect(qualifies(f({ q: "piso ascensor" }), undefined, row())).toBe(false);
  });

  it("applies the condition preset", () => {
    expect(qualifies(f({ estado: "reformado" }), undefined, row())).toBe(true);
    expect(qualifies(f({ estado: "obra_nueva" }), undefined, row())).toBe(false);
  });

  it("uses geometry when there are coordinates and the neighbourhood name when there are none", () => {
    expect(qualifies(f({}), area, row())).toBe(true);
    expect(qualifies(f({}), area, row({ lat: 9, lng: 9 }))).toBe(false);
    expect(qualifies(f({}), area, row({ lat: null, lng: null }))).toBe(true);
    expect(qualifies(f({}), area, row({ lat: null, lng: null, neighborhood: "Gracia" }))).toBe(false);
  });
});

describe("toQuery — one set of filters, one URL", () => {
  it("drops empty values and both defaults", () => {
    expect(toQuery(f({ orden: "fecha", vista: "galeria", hab: "" }))).toBe("");
  });

  it("survives a round trip unchanged", () => {
    const url = "q=gotic&precio=100000-300000&hab=3&banos=2&m2=80&estado=reformado&etapa=nueva&barrio=G%C3%B2tic&puntuacion=4&orden=precio&vista=filas&archivadas=1";
    const once = toQuery(f(Object.fromEntries(new URLSearchParams(url))));
    expect(toQuery(f(Object.fromEntries(new URLSearchParams(once))))).toBe(once);
    expect(new URLSearchParams(once).get("barrio")).toBe("Gòtic");
  });

  it("rebuilds the price range from its two halves", () => {
    expect(toQuery(f({ precio: "100000-" }))).toBe("precio=100000-");
    expect(toQuery(f({ precio: "-" }))).toBe("");
  });

  it("lets a patch clear a key", () => {
    const v = f({ q: "gotic", hab: "3" });
    expect(toQuery(v, { q: "" })).toBe("hab=3");
  });
});

describe("links", () => {
  const v = f({ q: "gotic", hab: "3", zona: "gotic" });

  it("hands the map every filter, not just stage and area (F13)", () => {
    expect(mapHref(v)).toBe("/mapa?q=gotic&hab=3&zona=gotic");
    expect(listHref(v)).toBe("/propiedades?q=gotic&hab=3&zona=gotic");
  });

  it("falls back to a bare path when nothing is set", () => {
    expect(listHref(f({}))).toBe("/propiedades");
    expect(mapHref(f({}))).toBe("/mapa");
  });

  it("carries the list into the detail page and back out again (F14)", () => {
    const to = detailHref("abc", v);
    expect(to).toBe("/propiedades/abc?desde=q%3Dgotic%26hab%3D3%26zona%3Dgotic");
    const desde = new URLSearchParams(to.split("?")[1]).get("desde")!;
    expect(backHref(desde, "abc")).toBe("/propiedades?q=gotic&hab=3&zona=gotic#p-abc");
  });

  it("returns to the plain list when there were no filters", () => {
    expect(detailHref("abc", f({}))).toBe("/propiedades/abc");
    expect(backHref("", "abc")).toBe("/propiedades#p-abc");
  });

  it("cannot be talked into leaving the site", () => {
    for (const evil of [
      "https://evil.example/x",
      "//evil.example",
      "/../../etc/passwd",
      "\\\\evil.example",
      "q=ok&next=https://evil.example",
      "%2f%2fevil.example",
    ]) {
      expect(backHref(evil, "abc").startsWith("/propiedades")).toBe(true);
      expect(backHref(evil, "abc")).not.toContain("evil.example");
    }
  });

  it("keeps an identifier out of the fragment syntax", () => {
    expect(backHref("", 'a b#"')).toBe("/propiedades#p-a%20b%23%22");
  });
});

describe("countFilters", () => {
  it("counts the stage, whose bubble was shown but never counted (F31)", () => {
    expect(countFilters(f({ etapa: "nueva" }))).toBe(1);
  });

  it("counts a half-open price range once", () => {
    expect(countFilters(f({ precio: "100000-300000" }))).toBe(1);
    expect(countFilters(f({ precio: "-300000" }))).toBe(1);
  });

  it("does not count archivadas, which widens the set", () => {
    expect(countFilters(f({ archivadas: "1" }))).toBe(0);
  });

  it("does not count the ordering or the view", () => {
    expect(countFilters(f({ orden: "precio", vista: "filas" }))).toBe(0);
  });

  it("agrees with what the bubbles show", () => {
    expect(countFilters(f({ q: "a", hab: "3", banos: "2", m2: "80", barrio: "X", puntuacion: "4", estado: "reformado", etapa: "nueva", precio: "1-2" }))).toBe(9);
  });
});

describe("withArea", () => {
  it("keeps an identifier the area file confirms and drops one it does not", () => {
    expect(withArea(f({ zona: "gotic" }), area).zona).toBe("gotic");
    expect(withArea(f({ zona: "inventada" }), undefined).zona).toBe("");
  });
});

describe("budgetFit (F30)", () => {
  const b = (min: number | null, max: number | null) => ({ min, max });

  it("warns only above the maximum", () => {
    expect(budgetFit(400000, b(200000, 300000))).toBe("over");
    expect(budgetFit(300000, b(200000, 300000))).toBe("ok");
  });

  it("marks below the minimum as its own thing, not the same warning", () => {
    expect(budgetFit(100000, b(200000, 300000))).toBe("under");
  });

  it("accepts a maximum on its own", () => {
    expect(budgetFit(100000, b(null, 300000))).toBe("ok");
    expect(budgetFit(400000, b(null, 300000))).toBe("over");
  });

  it("accepts a minimum on its own", () => {
    expect(budgetFit(400000, b(200000, null))).toBe("ok");
    expect(budgetFit(100000, b(200000, null))).toBe("under");
  });

  it("says nothing without a budget or without a price", () => {
    expect(budgetFit(400000, null)).toBe("ok");
    expect(budgetFit(null, b(200000, 300000))).toBe("ok");
  });
});

describe("the contract is used, not bypassed", () => {
  it("has one Filters shape and no second copy of it", async () => {
    const bar = await import("node:fs/promises").then((fs) => fs.readFile("src/components/propiedades/filter-bar.tsx", "utf8"));
    expect(bar).not.toContain("export type FilterValues");
  });

  it("leaves no query that filters homes outside this module", async () => {
    const fs = await import("node:fs/promises");
    for (const file of ["src/app/propiedades/page.tsx", "src/app/mapa/page.tsx"]) {
      const src = await fs.readFile(file, "utf8");
      expect(src).toContain("listSql(");
      expect(src).toContain("qualifies(");
      expect(src).not.toContain("p.stage != 'descartada'");
      // `FROM properties p` is the aliased shape only the contract may build. The two plain
      // counting queries left on the list page decide nothing about which homes qualify.
      expect(src).not.toContain("FROM properties p");
    }
  });

  it("does not hand the search haystack to the browser", async () => {
    // The statement adds `haystack` for the JavaScript pass. Spreading a row into a marker sent
    // every description in the database to the client and doubled the map page's payload.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/app/mapa/page.tsx", "utf8");
    expect(src).not.toContain("...p,");
  });

  it("has no markers route left to disagree with them", async () => {
    const fs = await import("node:fs/promises");
    await expect(fs.stat("src/app/api/markers/route.ts")).rejects.toThrow();
  });
});
