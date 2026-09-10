import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DIMENSIONS } from "./listing";
import {
  changedScores,
  contributors,
  dimensionAverage,
  FAMILY_AVG_SQL,
  familyAverage,
  isPartial,
  matrix,
  memberAverage,
  splits,
  UPSERT_RATING_SQL,
  type RatingRow,
} from "./ratings";

// Two members, second one has rated only two of six dimensions.
const rows: RatingRow[] = [
  { user_id: "u1", dimension: "ubicacion", score: 5 },
  { user_id: "u1", dimension: "distribucion", score: 3 },
  { user_id: "u1", dimension: "luz_vistas", score: 4 },
  { user_id: "u2", dimension: "ubicacion", score: 2 },
  { user_id: "u2", dimension: "estado", score: 1 },
];

describe("familyAverage", () => {
  // The whole point of #130. Averaging rows lets whoever answered most decide the number.
  const six5s: RatingRow[] = DIMENSIONS.map((d) => ({ user_id: "a", dimension: d, score: 5 }));
  const one1: RatingRow[] = [{ user_id: "b", dimension: "ubicacion", score: 1 }];

  it("gives each person the same weight, whatever they filled", () => {
    expect(familyAverage([...six5s, ...one1])).toBe(3); // (5,0 + 1,0) / 2, not (5×6 + 1) / 7
  });

  it("is not the mean of the rows", () => {
    const rowMean = [...six5s, ...one1].reduce((a, r) => a + r.score, 0) / 7;
    expect(Math.round(rowMean * 10) / 10).toBe(4.4);
    expect(familyAverage([...six5s, ...one1])).not.toBe(4.4);
  });

  it("does not round a person before averaging people", () => {
    // a: (5+4)/2 = 4,5 · b: 4 → 4,25 → 4,3. Rounding a first would give (4,5 + 4)/2 = 4,3 too,
    // so use a case where it differs: a: (5+5+4)/3 = 4,666… · b: 1 → 2,8, not (4,7 + 1)/2 = 2,9.
    const a: RatingRow[] = [
      { user_id: "a", dimension: "ubicacion", score: 5 },
      { user_id: "a", dimension: "distribucion", score: 5 },
      { user_id: "a", dimension: "luz_vistas", score: 4 },
    ];
    expect(familyAverage([...a, { user_id: "b", dimension: "ubicacion", score: 1 }])).toBe(2.8);
  });

  it("ignores members who have not rated, and unrated dimensions", () => {
    expect(familyAverage(rows)).toBe(2.8); // u1 (5+3+4)/3 = 4,0 · u2 (2+1)/2 = 1,5 → 2,75
    expect(familyAverage([{ user_id: "u9", dimension: "encaje_familiar", score: 4 }])).toBe(4);
  });

  it("is null when nobody has rated, never zero", () => {
    expect(familyAverage([])).toBeNull();
  });
});

describe("dimensionAverage", () => {
  it("is one score per person, so the plain mean is already fair", () => {
    expect(dimensionAverage(rows.filter((r) => r.dimension === "ubicacion"))).toBe(3.5); // (5+2)/2
    expect(dimensionAverage([])).toBeNull();
  });
});

describe("contributors and isPartial", () => {
  it("counts people, not rows", () => {
    expect(contributors(rows)).toBe(2);
    expect(contributors([])).toBe(0);
  });

  it("is partial while anybody who answered left an aspect empty", () => {
    expect(isPartial(rows, DIMENSIONS.length)).toBe(true);
    const full = DIMENSIONS.map((d) => ({ user_id: "a", dimension: d, score: 4 }));
    expect(isPartial(full, DIMENSIONS.length)).toBe(false);
    expect(isPartial([], DIMENSIONS.length)).toBe(false);
  });
});

describe("FAMILY_AVG_SQL", () => {
  it("groups by person before it averages, like familyAverage does", () => {
    expect(FAMILY_AVG_SQL).toContain("GROUP BY user_id");
    expect(FAMILY_AVG_SQL).toContain("AVG(person_mean)");
  });
});

describe("memberAverage", () => {
  it("averages one member's present scores", () => {
    expect(memberAverage(rows, "u1")).toBe(4);
    expect(memberAverage(rows, "u2")).toBe(1.5);
    expect(memberAverage(rows, "u3")).toBeNull();
  });
});

describe("splits — where the family actually differs", () => {
  const at = (user: string, dimension: string, score: number) => ({ user_id: user, dimension, score });

  it("needs two people and a gap of two", () => {
    expect(splits([at("a", "estado", 3), at("b", "estado", 5)])).toHaveLength(1);
    // 4 against 5 is the same opinion written twice.
    expect(splits([at("a", "estado", 4), at("b", "estado", 5)])).toEqual([]);
    // One person cannot disagree with themselves.
    expect(splits([at("a", "estado", 1)])).toEqual([]);
  });

  it("names both sides, because a number tells nobody who to ask", () => {
    const [gap] = splits([at("a", "ubicacion", 5), at("b", "ubicacion", 2), at("c", "ubicacion", 2)]);
    expect(gap).toMatchObject({ dimension: "ubicacion", min: 2, max: 5, high: ["a"] });
    expect(gap.low.sort()).toEqual(["b", "c"]);
  });

  it("looks at each aspect on its own", () => {
    const rows = [at("a", "estado", 1), at("b", "estado", 5), at("a", "ubicacion", 4), at("b", "ubicacion", 4)];
    expect(splits(rows).map((g) => g.dimension)).toEqual(["estado"]);
  });
});

describe("matrix", () => {
  it("gives a score or null per member per dimension", () => {
    const m = matrix(rows, ["u1", "u2", "u3"], DIMENSIONS);
    expect(m.u1.ubicacion).toBe(5);
    expect(m.u1.estado).toBeNull();
    expect(m.u2.estado).toBe(1);
    expect(m.u3.ubicacion).toBeNull();
    expect(Object.keys(m.u3)).toEqual([...DIMENSIONS]);
  });

  it("drops rows for unknown members or dimensions", () => {
    const m = matrix([{ user_id: "ghost", dimension: "nope", score: 5 }, ...rows], ["u1"], ["ubicacion"]);
    expect(m).toEqual({ u1: { ubicacion: 5 } });
  });
});

describe("one score per member per dimension", () => {
  const dir = mkdtempSync(join(tmpdir(), "casa-ratings-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("upsert SQL targets the (property_id, user_id, dimension) key", () => {
    expect(UPSERT_RATING_SQL).toMatch(/ON CONFLICT\(property_id, user_id, dimension\) DO UPDATE/);
  });

  it("rating twice yields one row with the latest score", async () => {
    process.env.DATA_DIR = dir;
    const { db, applySchema } = await import("./db");
    await applySchema();
    const now = new Date().toISOString();
    await db.execute({
      sql: "INSERT INTO users (id, email, name, capture_token, created_at) VALUES ('u1', 'ana@example.com', 'ana', 't1', ?)",
      args: [now],
    });
    await db.execute({
      sql: "INSERT INTO properties (id, title, created_at, updated_at) VALUES ('p1', 'Piso', ?, ?)",
      args: [now, now],
    });
    await db.execute({ sql: UPSERT_RATING_SQL, args: ["p1", "u1", "ubicacion", 2, now] });
    await db.execute({ sql: UPSERT_RATING_SQL, args: ["p1", "u1", "ubicacion", 5, now] });
    const { rows } = await db.execute("SELECT score FROM ratings WHERE property_id = 'p1' AND user_id = 'u1'");
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(5);
  });
});

describe("changedScores", () => {
  const current = { ubicacion: 4, estado: 2 };

  it("returns only what is new or different", () => {
    expect(changedScores(current, { ubicacion: 4, estado: 5, luz_vistas: 3 })).toEqual([
      ["estado", 5],
      ["luz_vistas", 3],
    ]);
  });

  it("an unchanged form writes nothing at all", () => {
    expect(changedScores(current, current)).toEqual([]);
    expect(changedScores({}, {})).toEqual([]);
  });

  it("a first score counts as a change", () => {
    expect(changedScores({}, { ubicacion: 1 })).toEqual([["ubicacion", 1]]);
  });
});
