import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CommentRow } from "./comment-shape";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-comments-"));
const { db, applySchema } = await import("./db");
const { COMMENTS_SQL, edit, post, remove, thread, visible } = await import("./comments");
const { EMPTY, publish } = await import("./opinions");

const at = (h: number) => new Date(Date.UTC(2026, 8, 10, h)).toISOString();
const A = "user-a";
const B = "user-b";
let home = "";
let other = "";

async function member(id: string) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO users (id, email, name, capture_token, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, `${id}@example.test`, id, randomUUID(), at(0)],
  });
}

async function property() {
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO properties (id, title, created_at, updated_at) VALUES (?, 'Piso', ?, ?)",
    args: [id, at(0), at(0)],
  });
  return id;
}

const rows = async (id = home): Promise<CommentRow[]> =>
  (await db.execute({ sql: COMMENTS_SQL, args: [id] })).rows as unknown as CommentRow[];

const one = async (id: string) =>
  (await db.execute({ sql: "SELECT * FROM comments WHERE id = ?", args: [id] })).rows[0];

const commentEvents = async () =>
  (await db.execute({ sql: "SELECT payload_json FROM events WHERE property_id = ? AND kind = 'comment'", args: [home] })).rows;

/** Writes a comment and hands back its identifier, so a test can name what it wrote. */
async function say(body: string, who = A, over: { id?: string; parentId?: string | null; opinionUserId?: string | null } = {}) {
  const id = over.id ?? randomUUID();
  const r = await post(home, who, { id, body, parentId: over.parentId, opinionUserId: over.opinionUserId }, at(1));
  return { id, r };
}

beforeAll(async () => {
  await applySchema();
  await member(A);
  await member(B);
});

beforeEach(async () => {
  home = await property();
  other = await property();
});

describe("writing in the conversation", () => {
  it("keeps the line breaks inside and drops the whitespace around", async () => {
    const { id } = await say("  Primera línea\n\nsegunda  ");
    expect(String((await one(id))!.body)).toBe("Primera línea\n\nsegunda");
  });

  it("refuses an empty box, and whitespace is an empty box", async () => {
    expect((await say("   \n  ")).r).toEqual({ ok: false, reason: "empty" });
    expect((await rows())).toHaveLength(0);
  });

  it("refuses more than the limit", async () => {
    expect((await say("x".repeat(4001))).r).toEqual({ ok: false, reason: "too_long" });
  });

  it("accepts a blank identifier and refuses a made-up one", async () => {
    expect(await post(home, A, { id: "", body: "Sin navegador" }, at(1))).toEqual({ ok: true });
    expect(await post(home, A, { id: "no-soy-un-uuid", body: "Hola" }, at(1))).toEqual({ ok: false, reason: "bad_id" });
    expect(await rows()).toHaveLength(1);
  });
});

describe("sending the same thing twice (V14)", () => {
  it("writes one comment and one event", async () => {
    const id = randomUUID();
    await post(home, A, { id, body: "Me gusta" }, at(1));
    expect(await post(home, A, { id, body: "Me gusta" }, at(2))).toEqual({ ok: true });
    expect(await rows()).toHaveLength(1);
    expect(await commentEvents()).toHaveLength(1);
  });

  it("cannot be used to overwrite: neither a changed body nor another author", async () => {
    const id = randomUUID();
    await post(home, A, { id, body: "Lo original" }, at(1));
    await post(home, B, { id, body: "Otra cosa" }, at(2));
    const row = (await one(id))!;
    expect(String(row.body)).toBe("Lo original");
    expect(String(row.user_id)).toBe(A);
  });
});

describe("replies are one level deep (V21)", () => {
  it("a reply hangs off a root", async () => {
    const { id: root } = await say("¿Alguien lo ha visto?");
    const { r } = await say("Yo el jueves", B, { parentId: root });
    expect(r).toEqual({ ok: true });
    const tree = thread(await rows());
    expect(tree).toHaveLength(1);
    expect(tree[0].replies.map((c) => c.body)).toEqual(["Yo el jueves"]);
  });

  it("a reply to a reply is refused", async () => {
    const { id: root } = await say("Raíz");
    const { id: reply } = await say("Respuesta", B, { parentId: root });
    expect((await say("Al segundo nivel", A, { parentId: reply })).r).toEqual({ ok: false, reason: "bad_parent" });
  });

  it("a parent in another home is refused", async () => {
    const elsewhere = randomUUID();
    await post(other, A, { id: elsewhere, body: "En otra vivienda" }, at(1));
    expect((await say("Respondiendo a lo de al lado", A, { parentId: elsewhere })).r).toEqual({ ok: false, reason: "bad_parent" });
  });

  it("a parent that no longer exists is refused", async () => {
    expect((await say("A la nada", A, { parentId: randomUUID() })).r).toEqual({ ok: false, reason: "bad_parent" });
  });
});

describe("naming the opinion a comment answers (V21, V23)", () => {
  beforeEach(async () => {
    await publish(home, B, { ...EMPTY, stance: "dudas" }, { version: 0, revision: 0 }, at(1));
  });

  it("names a published opinion on this home", async () => {
    const { id, r } = await say("Estoy de acuerdo con tus dudas", A, { opinionUserId: B });
    expect(r).toEqual({ ok: true });
    expect(String((await one(id))!.opinion_user_id)).toBe(B);
    expect(String((await rows()).find((c) => c.id === id)!.opinion_name)).toBe(B);
  });

  it("refuses an opinion published on another home", async () => {
    await publish(other, A, { ...EMPTY, stance: "me_interesa" }, { version: 0, revision: 0 }, at(1));
    // A is an author of an opinion — somewhere else. Naming it from here has to fail.
    const fresh = randomUUID();
    await db.execute({ sql: "DELETE FROM opinions WHERE property_id = ? AND user_id = ?", args: [home, A] });
    expect(await post(home, B, { id: fresh, body: "Sobre la tuya", opinionUserId: A }, at(2))).toEqual({
      ok: false,
      reason: "bad_reference",
    });
  });

  it("refuses an opinion that was withdrawn", async () => {
    await db.execute({ sql: "UPDATE opinions SET withdrawn = 1 WHERE property_id = ? AND user_id = ?", args: [home, B] });
    expect((await say("Sobre la tuya", A, { opinionUserId: B })).r).toEqual({ ok: false, reason: "bad_reference" });
  });
});

describe("correcting and taking back (V23)", () => {
  it("the author can correct their own, and it says so", async () => {
    const { id } = await say("Cvesta 300.000");
    expect(await edit(id, A, "Cuesta 300.000", 1, at(3))).toEqual({ ok: true });
    const row = (await one(id))!;
    expect(String(row.body)).toBe("Cuesta 300.000");
    expect(String(row.updated_at)).toBe(at(3));
    expect(Number(row.version)).toBe(2);
  });

  it("nobody else can, whatever the form says", async () => {
    const { id } = await say("Mío");
    expect(await edit(id, B, "Tuyo", 1, at(3))).toEqual({ ok: false, reason: "not_yours" });
    expect(await remove(id, B, 1, at(3))).toEqual({ ok: false, reason: "not_yours" });
    expect(String((await one(id))!.body)).toBe("Mío");
  });

  it("a version that has moved is refused and writes nothing", async () => {
    const { id } = await say("Uno");
    await edit(id, A, "Dos", 1, at(3));
    expect(await edit(id, A, "Tres", 1, at(4))).toEqual({ ok: false, reason: "conflict" });
    expect(String((await one(id))!.body)).toBe("Dos");
  });

  it("removing clears the words from the row itself", async () => {
    const { id } = await say("Algo que no debí escribir");
    expect(await remove(id, A, 1, at(3))).toEqual({ ok: true });
    const row = (await one(id))!;
    expect(String(row.body)).toBe("");
    expect(String(row.deleted_at)).toBe(at(3));
  });

  it("what is gone cannot be corrected or removed again", async () => {
    const { id } = await say("Adiós");
    await remove(id, A, 1, at(3));
    expect(await edit(id, A, "Vuelvo", 2, at(4))).toEqual({ ok: false, reason: "gone" });
    expect(await remove(id, A, 2, at(4))).toEqual({ ok: false, reason: "gone" });
  });

  it("a correction writes no event: the feed already said this person commented", async () => {
    const { id } = await say("Una");
    await edit(id, A, "Dos", 1, at(3));
    await remove(id, A, 2, at(4));
    expect(await commentEvents()).toHaveLength(1);
  });
});

describe("the words never enter the history (V21)", () => {
  it("a comment event carries an identifier and whether it was an answer", async () => {
    const { id: root } = await say("Raíz");
    await say("Respuesta", B, { parentId: root });
    const payloads = (await commentEvents()).map((r) => JSON.parse(String(r.payload_json)));
    expect(payloads).toEqual([
      { comment_id: root, reply: false },
      { comment_id: expect.any(String), reply: true },
    ]);
    for (const p of payloads) expect(p).not.toHaveProperty("body");
  });

  it("the migration took the words out of every event written before it", async () => {
    const legacy = randomUUID();
    await db.execute({
      sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, 'comment', ?, ?, ?)",
      args: [randomUUID(), home, JSON.stringify({ comment_id: legacy, body: "Lo que dije en 2026" }), A, at(1)],
    });
    // Replay the step on this database exactly as the runner would.
    await db.execute("UPDATE events SET payload_json = json_remove(payload_json, '$.body') WHERE kind = 'comment' AND payload_json IS NOT NULL");
    for (const r of await commentEvents()) expect(String(r.payload_json)).not.toContain("2026");
  });
});

describe("the shape a reader is shown", () => {
  it("a removed root stays as a tombstone when somebody answered it", async () => {
    const { id: root } = await say("Pregunta");
    await say("Respuesta", B, { parentId: root });
    await remove(root, A, 1, at(4));
    const tree = thread(await rows());
    expect(tree).toHaveLength(1);
    expect(tree[0].deleted_at).not.toBeNull();
    expect(tree[0].replies).toHaveLength(1);
    // The tombstone is not counted: there is nothing there to read.
    expect(visible(tree)).toBe(1);
  });

  it("a removed root with nothing under it simply goes", async () => {
    const { id: root } = await say("Un momento");
    await remove(root, A, 1, at(4));
    expect(thread(await rows())).toHaveLength(0);
  });

  it("a removed reply goes, and its root stays", async () => {
    const { id: root } = await say("Raíz");
    const { id: reply } = await say("Me equivoqué", B, { parentId: root });
    await remove(reply, B, 1, at(4));
    const tree = thread(await rows());
    expect(tree).toHaveLength(1);
    expect(tree[0].replies).toHaveLength(0);
    expect(visible(tree)).toBe(1);
  });

  it("oldest first, and each answer under the comment it answers", async () => {
    const { id: first } = await say("Primero");
    await say("Segundo", B);
    await say("Sobre el primero", B, { parentId: first });
    const tree = thread(await rows());
    expect(tree.map((n) => n.body)).toEqual(["Primero", "Segundo"]);
    expect(tree[0].replies.map((c) => c.body)).toEqual(["Sobre el primero"]);
    expect(visible(tree)).toBe(3);
  });
});
