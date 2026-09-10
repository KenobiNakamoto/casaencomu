import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { familyAverage, type RatingRow } from "./ratings";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-opinions-"));
const { db, applySchema } = await import("./db");
const { EMPTY, publish, readMine, saveDraft, validate, withdraw } = await import("./opinions");
const { DIMENSIONS } = await import("./listing");

const at = (h: number) => new Date(Date.UTC(2026, 8, 10, h)).toISOString();

let home = "";
const A = "user-a";
const B = "user-b";

async function member(id: string) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO users (id, email, name, capture_token, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, `${id}@example.test`, id, randomUUID(), at(0)],
  });
}

const opinion = (over: Partial<Parameters<typeof publish>[2]> = {}) => ({ ...EMPTY, stance: "me_interesa" as const, ...over });

const allSix = (score: number) => Object.fromEntries(DIMENSIONS.map((d) => [d, score]));

const ratingsOf = async (): Promise<RatingRow[]> =>
  (await db.execute({ sql: "SELECT user_id, dimension, score FROM ratings WHERE property_id = ?", args: [home] })).rows.map(
    (r) => ({ user_id: String(r.user_id), dimension: String(r.dimension), score: Number(r.score) }),
  );

const events = async (kind: string) =>
  Number((await db.execute({ sql: "SELECT count(*) AS n FROM events WHERE property_id = ? AND kind = ?", args: [home, kind] })).rows[0].n);

beforeAll(async () => {
  await applySchema();
  await member(A);
  await member(B);
});

beforeEach(async () => {
  home = randomUUID();
  await db.execute({
    sql: "INSERT INTO properties (id, title, created_at, updated_at) VALUES (?, 'Piso', ?, ?)",
    args: [home, at(0), at(0)],
  });
});

describe("what may be published", () => {
  it("needs a stance and nothing else", () => {
    expect(validate(opinion())).toBeNull();
    expect(validate(EMPTY)?.detail).toBe("stance");
  });

  it("refuses a blocker with no explanation, and reasoning past the limit", () => {
    expect(validate(opinion({ blocker: true }))?.detail).toBe("blocker_needs_reasoning");
    expect(validate(opinion({ blocker: true, reasoning: "El piso da a la vía del tren." }))).toBeNull();
    expect(validate(opinion({ reasoning: "x".repeat(1501) }))?.detail).toBe("reasoning_too_long");
  });

  it("refuses a score that is not one of the five", () => {
    expect(validate(opinion({ scores: { ubicacion: 0 } }))?.detail).toBe("score");
    expect(validate(opinion({ scores: { ubicacion: 6 } }))?.detail).toBe("score");
    expect(validate(opinion({ scores: { ubicacion: null } }))).toBeNull();
  });
});

describe("publishing", () => {
  it("a stance alone is a whole opinion: it counts, and it moves no average", async () => {
    const r = await publish(home, A, opinion(), { version: 0, revision: 0 }, at(1));
    expect(r).toMatchObject({ ok: true, version: 1, changed: true });
    expect(await ratingsOf()).toEqual([]);
    expect(familyAverage(await ratingsOf())).toBeNull();
    expect(await events("opinion")).toBe(1);
  });

  it("gives each person one vote — the worked case from the contract", async () => {
    await publish(home, A, opinion({ scores: allSix(5) }), { version: 0, revision: 0 }, at(1));
    await publish(home, B, opinion({ scores: { ubicacion: 1 } }), { version: 0, revision: 0 }, at(2));
    expect(familyAverage(await ratingsOf())).toBe(3);
  });

  it("«No lo sé» removes a score that was published before, and never writes a zero", async () => {
    await publish(home, B, opinion({ scores: { ubicacion: 4, estado: 2 } }), { version: 0, revision: 0 }, at(1));
    const mine = await readMine(home, B);
    await publish(home, B, opinion({ scores: { ubicacion: null, estado: 2 } }), { version: mine.version, revision: mine.revision }, at(2));
    const rows = await ratingsOf();
    expect(rows.map((r) => r.dimension)).toEqual(["estado"]);
    expect(rows.some((r) => r.score === 0)).toBe(false);
  });

  it("publishing the same opinion again writes no event and does not move the version", async () => {
    await publish(home, A, opinion({ reasoning: "Nos gusta la zona." }), { version: 0, revision: 0 }, at(1));
    const mine = await readMine(home, A);
    const again = await publish(home, A, opinion({ reasoning: "Nos gusta la zona." }), { version: mine.version, revision: mine.revision }, at(2));
    expect(again).toMatchObject({ ok: true, version: 1, changed: false });
    expect(await events("opinion")).toBe(1);
    // The draft is still spent: its revision moved even though nothing was published.
    expect((await readMine(home, A)).revision).toBe(mine.revision + 1);
  });

  it("refuses a publication whose version has moved, and changes nothing", async () => {
    await publish(home, A, opinion({ reasoning: "Primera." }), { version: 0, revision: 0 }, at(1));
    const stale = await publish(home, A, opinion({ reasoning: "Segunda." }), { version: 0, revision: 0 }, at(2));
    expect(stale).toEqual({ ok: false, reason: "conflict" });
    expect((await readMine(home, A)).published?.reasoning).toBe("Primera.");
  });
});

describe("the private half", () => {
  it("is the author's, and nobody else's", async () => {
    await saveDraft(home, A, opinion({ reasoning: "Todavía no lo tengo claro." }), { revision: 0 }, at(1));
    expect((await readMine(home, A)).draft?.reasoning).toBe("Todavía no lo tengo claro.");
    const other = await readMine(home, B);
    expect(other.draft).toBeNull();
    expect(other.revision).toBe(0);
    expect(other.published).toBeNull();
  });

  it("never reaches the family's activity", async () => {
    await saveDraft(home, A, opinion({ reasoning: "secreto" }), { revision: 0 }, at(1));
    const payloads = (await db.execute({ sql: "SELECT payload_json FROM events WHERE property_id = ?", args: [home] })).rows;
    expect(payloads.map((r) => String(r.payload_json ?? "")).join(" ")).not.toContain("secreto");
    expect(await events("opinion")).toBe(0);
  });

  it("is cleared by publishing, and a save typed before it is refused after it", async () => {
    await saveDraft(home, A, opinion({ reasoning: "borrador" }), { revision: 0 }, at(1));
    const before = await readMine(home, A);
    await publish(home, A, opinion({ reasoning: "publicada" }), { version: before.version, revision: before.revision }, at(2));

    expect((await readMine(home, A)).draft).toBeNull();
    // The other tab still believes in revision 1. Accepting it would bring back discarded work.
    const late = await saveDraft(home, A, opinion({ reasoning: "borrador" }), { revision: before.revision }, at(3));
    expect(late).toEqual({ ok: false, reason: "conflict" });
    expect((await readMine(home, A)).draft).toBeNull();
  });

  it("keeps one person's editing invisible to the other", async () => {
    await publish(home, A, opinion({ reasoning: "Me encaja." }), { version: 0, revision: 0 }, at(1));
    const mine = await readMine(home, A);
    await saveDraft(home, A, opinion({ reasoning: "Ahora dudo." }), { revision: mine.revision }, at(2));
    expect((await readMine(home, A)).published?.reasoning).toBe("Me encaja.");
  });
});

describe("withdrawal", () => {
  it("leaves every average, keeps the words privately, and can be published again", async () => {
    await publish(home, A, opinion({ scores: allSix(5) }), { version: 0, revision: 0 }, at(1));
    await publish(home, B, opinion({ scores: { ubicacion: 1 } }), { version: 0, revision: 0 }, at(2));
    expect(familyAverage(await ratingsOf())).toBe(3);

    const mine = await readMine(home, A);
    expect(await withdraw(home, A, { version: mine.version, revision: mine.revision }, at(3))).toMatchObject({ ok: true });

    expect(familyAverage(await ratingsOf())).toBe(1);
    const after = await readMine(home, A);
    expect(after.published?.withdrawn).toBe(true);
    expect(after.published?.reasoning).toBe("");
    expect(after.draft?.scores.ubicacion).toBe(5);
    expect(await events("opinion_withdrawn")).toBe(1);

    const back = await publish(home, A, opinion({ scores: allSix(5) }), { version: after.version, revision: after.revision }, at(4));
    expect(back).toMatchObject({ ok: true, changed: true });
    expect((await readMine(home, A)).published?.withdrawn).toBe(false);
    expect(familyAverage(await ratingsOf())).toBe(3);
  });

  it("does not overwrite a draft written while it was in flight", async () => {
    await publish(home, A, opinion({ reasoning: "publicada" }), { version: 0, revision: 0 }, at(1));
    const mine = await readMine(home, A);
    await saveDraft(home, A, opinion({ reasoning: "escrito en la otra pestaña" }), { revision: mine.revision }, at(2));

    expect(await withdraw(home, A, { version: mine.version, revision: mine.revision }, at(3))).toEqual({ ok: false, reason: "conflict" });
    expect((await readMine(home, A)).draft?.reasoning).toBe("escrito en la otra pestaña");
    expect((await readMine(home, A)).published?.withdrawn).toBe(false);
  });

  it("takes back the scores an old rating event still carried", async () => {
    await db.execute({
      sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, 'rating', ?, ?, ?)",
      args: [randomUUID(), home, JSON.stringify({ scores: { ubicacion: 5 } }), A, at(1)],
    });
    await publish(home, A, opinion({ scores: { ubicacion: 5 } }), { version: 0, revision: 0 }, at(2));
    const mine = await readMine(home, A);
    await withdraw(home, A, { version: mine.version, revision: mine.revision }, at(3));

    const { rows } = await db.execute({ sql: "SELECT kind, payload_json FROM events WHERE property_id = ? AND kind = 'rating'", args: [home] });
    expect(rows).toHaveLength(1); // the event stays: who acted, and when
    expect(rows[0].payload_json).toBeNull(); // what they said does not
  });

  it("cannot withdraw what was never published", async () => {
    expect(await withdraw(home, B, { version: 0, revision: 0 }, at(1))).toEqual({ ok: false, reason: "conflict" });
  });
});
