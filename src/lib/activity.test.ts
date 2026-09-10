import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/** V25 — explicit activity reads. PIP-13, issue #151. */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-activity-"));

const { db, applySchema } = await import("./db");
const { feed, markRead, unreadCount, PAGE } = await import("./activity");

const ANA = randomUUID();
const BRUNO = randomUUID();
const HOME = randomUUID();
const at = (n: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString();

/** An event by `actor`, `n` seconds into the day. Returns its id. */
async function happened(actor: string | null, n: number, kind = "comment") {
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO events (id, property_id, kind, payload_json, actor_id, created_at) VALUES (?, ?, ?, '{}', ?, ?)",
    args: [id, HOME, kind, actor, at(n)],
  });
  return id;
}

beforeAll(async () => {
  await applySchema();
  for (const [id, name] of [[ANA, "ana"], [BRUNO, "bruno"]]) {
    await db.execute({
      sql: "INSERT INTO users (id, email, name, capture_token, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, `${name}@example.com`, name, randomUUID(), at(0)],
    });
  }
  await db.execute({
    sql: "INSERT INTO properties (id, title, stage, created_at, updated_at) VALUES (?, 'Piso', 'nueva', ?, ?)",
    args: [HOME, at(0), at(0)],
  });
});

describe("reading is a button, not a render", () => {
  it("counts what somebody else did and never what you did yourself", async () => {
    await happened(BRUNO, 1);
    await happened(ANA, 2);
    expect(await unreadCount(ANA)).toBe(1);
    expect(await unreadCount(BRUNO)).toBe(1);
  });

  it("marks the ids it is given, and nothing else", async () => {
    const mine = await happened(BRUNO, 3);
    const other = await happened(BRUNO, 4);
    const before = await unreadCount(ANA);

    await markRead(ANA, [mine]);
    expect(await unreadCount(ANA)).toBe(before - 1);

    const { read } = await feed(ANA);
    expect(read.has(mine)).toBe(true);
    expect(read.has(other)).toBe(false);
  });

  it("is idempotent: pressing it twice is pressing it once", async () => {
    const id = await happened(BRUNO, 5);
    await markRead(ANA, [id]);
    const after = await unreadCount(ANA);
    await markRead(ANA, [id, id]);
    expect(await unreadCount(ANA)).toBe(after);
  });

  it("ignores anything in the form that is not an event id", async () => {
    expect(await markRead(ANA, ["", "../../etc/passwd", "1 OR 1=1"])).toBe(0);
  });

  // Reading is per person. Ana marking a line read must not mark it read for Bruno.
  it("keeps one person's reading to that person", async () => {
    const id = await happened(null, 6, "price_change");
    await markRead(ANA, [id]);
    expect((await feed(ANA)).read.has(id)).toBe(true);
    expect((await feed(BRUNO)).read.has(id)).toBe(false);
  });
});

describe("a page you never loaded stays unread", () => {
  it("marks only the page that was drawn, and the one behind it stays unread", async () => {
    // A second person's day: more than one page of it.
    const ids: string[] = [];
    for (let i = 0; i < PAGE + 10; i++) ids.push(await happened(BRUNO, 100 + i));

    const first = await feed(ANA);
    expect(first.rows).toHaveLength(PAGE);
    expect(first.older).not.toBeNull();

    const drawn = first.rows.filter((r) => !first.read.has(r.id) && r.actor_id !== ANA).map((r) => r.id);
    await markRead(ANA, drawn);

    // Everything that was on screen is read now.
    const again = await feed(ANA);
    expect(again.rows.filter((r) => !again.read.has(r.id))).toHaveLength(0);

    // The page below it was never drawn, so none of it was marked.
    const second = await feed(ANA, first.older!);
    expect(second.rows.some((r) => !second.read.has(r.id))).toBe(true);
    expect(await unreadCount(ANA)).toBeGreaterThan(0);

    // And an event written after the page was drawn is not read by that button either.
    const later = await happened(BRUNO, 500);
    expect((await feed(ANA)).read.has(later)).toBe(false);
    expect(ids).toHaveLength(PAGE + 10);
  });

  it("pages without repeating or skipping a row, even at the same timestamp", async () => {
    const seen = new Set<string>();
    let cursor: string | undefined;
    let guard = 0;
    do {
      const p = await feed(ANA, cursor, 7);
      for (const r of p.rows) {
        expect(seen.has(r.id), `row ${r.id} came back twice`).toBe(false);
        seen.add(r.id);
      }
      cursor = p.older ?? undefined;
    } while (cursor && ++guard < 50);

    const total = Number((await db.execute("SELECT COUNT(*) n FROM events")).rows[0].n);
    expect(seen.size).toBe(total);
  });
});
