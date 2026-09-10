import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-migrate-"));
const { db, applySchema, stageRepairStatements } = await import("./db");

const at = (h: number) => new Date(Date.UTC(2026, 8, 1, h)).toISOString();

/** A property left as it was before this migration: availability written over the stage. */
async function stranded(history: string[]) {
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO properties (id, title, stage, created_at, updated_at) VALUES (?, ?, 'no_disponible', ?, ?)",
    args: [id, "Piso", at(0), at(0)],
  });
  for (const [i, to] of history.entries()) {
    await db.execute({
      sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, 'stage_change', ?, NULL, ?)",
      args: [randomUUID(), id, JSON.stringify({ from: "nueva", to }), at(i + 1)],
    });
  }
  return id;
}

const stageOf = async (id: string) =>
  String((await db.execute({ sql: "SELECT stage FROM properties WHERE id = ?", args: [id] })).rows[0].stage);

beforeAll(async () => {
  await applySchema();
});

describe("the migration chain", () => {
  it("reaches version 7 and adds every column the code reads", async () => {
    expect(Number((await db.execute("PRAGMA user_version")).rows[0][0])).toBe(7);
    const cols = async (table: string) =>
      (await db.execute(`PRAGMA table_info(${table})`)).rows.map((r) => String(r.name));
    expect(await cols("sources")).toEqual(
      expect.arrayContaining([
        "last_check_outcome",
        "field_presence_json",
        "photo_urls_json",
        "consecutive_gone",
        "raw_json",
        "field_origin_json",
        "enriched_at",
      ]),
    );
    expect(await cols("properties")).toEqual(expect.arrayContaining(["stage_version", "filled"]));
    expect(await cols("photos")).toContain("source_url");
    // «Por revisar» is the absence of a row here, so the table has to exist before it can be read.
    expect(await cols("reviews")).toEqual(expect.arrayContaining(["property_id", "user_id", "reviewed_at"]));
    // `reviews` is «has this person looked at it». An opinion is a different thing and its own table.
    expect(await cols("opinions")).toEqual(
      expect.arrayContaining(["stance", "reasoning", "blocker", "basis", "withdrawn", "version", "published_at"]),
    );
    expect(await cols("opinion_drafts")).toEqual(expect.arrayContaining(["payload_json", "revision", "base_version"]));
    // A conversation with answers in it: who is answered, what is answered, and who took it back.
    expect(await cols("comments")).toEqual(
      expect.arrayContaining(["parent_id", "opinion_user_id", "updated_at", "deleted_at", "version"]),
    );
  });

  it("is idempotent: running it again changes nothing", async () => {
    await applySchema();
    expect(Number((await db.execute("PRAGMA user_version")).rows[0][0])).toBe(7);
  });

  // Everything stored before this migration was read the old way, and the record says so: a row
  // that already holds facts must not be shown as "sin leer" the moment the column appears.
  it("counts what was already stored as read", async () => {
    const id = randomUUID();
    await db.execute({
      sql: "INSERT INTO properties (id, title, stage, created_at, updated_at) VALUES (?, 'Piso', 'nueva', ?, ?)",
      args: [id, at(0), at(0)],
    });
    const { rows } = await db.execute({ sql: "SELECT filled FROM properties WHERE id = ?", args: [id] });
    expect(Number(rows[0].filled)).toBe(1);
  });
});

describe("the opinions everybody already had", () => {
  // Whoever scored a home held an opinion before this table existed. The migration gives it a
  // row without inventing a word of it — no stance, no reasoning, and their own date.
  it("gives every past scorer an opinion, keeps the scores, and invents nothing", async () => {
    const home = randomUUID();
    const person = randomUUID();
    await db.batch(
      [
        {
          sql: "INSERT INTO properties (id, title, stage, created_at, updated_at) VALUES (?, 'Piso', 'nueva', ?, ?)",
          args: [home, at(0), at(0)],
        },
        {
          sql: "INSERT INTO users (id, email, name, capture_token, created_at) VALUES (?, ?, 'Alguien', ?, ?)",
          args: [person, `${person}@example.test`, randomUUID(), at(0)],
        },
        {
          sql: "INSERT INTO ratings (property_id, user_id, dimension, score, updated_at) VALUES (?, ?, 'ubicacion', 5, ?)",
          args: [home, person, at(1)],
        },
        {
          sql: "INSERT INTO ratings (property_id, user_id, dimension, score, updated_at) VALUES (?, ?, 'estado', 3, ?)",
          args: [home, person, at(4)],
        },
        // Back to the version before the opinions table, so the runner applies that step again.
        "DELETE FROM opinions",
        "PRAGMA user_version = 5",
      ],
      "write",
    );

    await applySchema();

    const { rows } = await db.execute({
      sql: "SELECT stance, reasoning, blocker, basis, withdrawn, version, published_at FROM opinions WHERE property_id = ? AND user_id = ?",
      args: [home, person],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].stance).toBeNull();
    expect(rows[0].basis).toBeNull();
    expect(String(rows[0].reasoning)).toBe("");
    expect(Number(rows[0].blocker)).toBe(0);
    expect(Number(rows[0].withdrawn)).toBe(0);
    // Their own last rating, never today: the migration does not pretend they said it now.
    expect(String(rows[0].published_at)).toBe(at(4));

    const kept = await db.execute({ sql: "SELECT count(*) AS n FROM ratings WHERE property_id = ?", args: [home] });
    expect(Number(kept.rows[0].n)).toBe(2);
  });
});

describe("restoring a stage a recheck overwrote", () => {
  it("gives back the last stage a member actually chose", async () => {
    const id = await stranded(["revisando", "preseleccionada"]);
    await db.batch(await stageRepairStatements(), "write");
    expect(await stageOf(id)).toBe("preseleccionada");
  });

  it("does not resurrect a stage that no longer exists", async () => {
    // a `no_disponible` written into the history by an older version is not a decision
    const id = await stranded(["preseleccionada", "no_disponible"]);
    await db.batch(await stageRepairStatements(), "write");
    expect(await stageOf(id)).toBe("preseleccionada");
  });

  it("puts a property with no decision back in the queue, and says so", async () => {
    const id = await stranded([]);
    await db.batch(await stageRepairStatements(), "write");
    expect(await stageOf(id)).toBe("revisando");
    const [e] = (
      await db.execute({
        sql: "SELECT payload_json FROM events WHERE property_id = ? AND kind = 'stage_change' ORDER BY created_at DESC LIMIT 1",
        args: [id],
      })
    ).rows;
    const payload = JSON.parse(String(e.payload_json));
    expect(payload).toMatchObject({ from: "no_disponible", to: "revisando" });
    expect(payload.nota).toContain("no había ninguna etapa anterior");
  });

  it("leaves every other property alone", async () => {
    const id = randomUUID();
    await db.execute({
      sql: "INSERT INTO properties (id, title, stage, created_at, updated_at) VALUES (?, ?, 'descartada', ?, ?)",
      args: [id, "Otro", at(0), at(0)],
    });
    await db.batch(await stageRepairStatements(), "write");
    expect(await stageOf(id)).toBe("descartada");
  });

  it("has nothing left to do once it has run", async () => {
    expect(await stageRepairStatements()).toEqual([]);
  });
});
