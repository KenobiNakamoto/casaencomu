import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DIMENSIONS } from "./listing";
import { familyAverage, matrix, memberAverage, UPSERT_RATING_SQL, type RatingRow } from "./ratings";

// Two members, second one has rated only two of six dimensions.
const rows: RatingRow[] = [
  { user_id: "u1", dimension: "ubicacion", score: 5 },
  { user_id: "u1", dimension: "distribucion", score: 3 },
  { user_id: "u1", dimension: "luz_vistas", score: 4 },
  { user_id: "u2", dimension: "ubicacion", score: 2 },
  { user_id: "u2", dimension: "estado", score: 1 },
];

describe("familyAverage", () => {
  it("is the mean over present scores only, 1 decimal", () => {
    expect(familyAverage(rows)).toBe(3); // (5+3+4+2+1)/5
    expect(familyAverage(rows.slice(0, 2))).toBe(4);
    expect(familyAverage([{ user_id: "u1", dimension: "estado", score: 2 }, { user_id: "u2", dimension: "estado", score: 5 }])).toBe(3.5);
  });

  it("ignores missing dimensions and members", () => {
    // A third member who has not rated, and four unrated dimensions, change nothing.
    expect(familyAverage(rows)).toBe(familyAverage([...rows]));
    expect(familyAverage([{ user_id: "u9", dimension: "encaje_familiar", score: 4 }])).toBe(4);
  });

  it("is null when nobody has rated", () => {
    expect(familyAverage([])).toBeNull();
  });
});

describe("memberAverage", () => {
  it("averages one member's present scores", () => {
    expect(memberAverage(rows, "u1")).toBe(4);
    expect(memberAverage(rows, "u2")).toBe(1.5);
    expect(memberAverage(rows, "u3")).toBeNull();
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
