import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/** The bell: what reaches one person, what is still new, and what is waiting to be looked at. */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-notif-"));
const { applySchema, db } = await import("./db");
const { bellFor, DIGEST_DAYS, markReviewed, markSeen, unreviewed } = await import("./notifications");

const ANA = "u-ana";
const BRUNO = "u-bruno";
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** One home, created `n` days ago by `by`. */
const home = (id: string, by: string | null, n: number) =>
  db.execute({
    sql: `INSERT INTO properties (id, title, stage, created_by, created_at, updated_at)
          VALUES (?, ?, 'nueva', ?, ?, ?)`,
    args: [id, "Piso " + id, by, day(n), day(n)],
  });

const event = (id: string, kind: string, propertyId: string, actor: string | null, n: number) =>
  db.execute({
    sql: "INSERT INTO events (id, property_id, kind, actor_id, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, propertyId, kind, actor, day(n)],
  });

const user = (id: string, lastSeen: string | null) =>
  db.execute({
    sql: `INSERT INTO users (id, email, name, capture_token, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, `${id}@example.com`, id, `token-${id}-0123456789`, day(30), lastSeen],
  });

beforeAll(async () => {
  await applySchema();
  await user(ANA, day(2));
  await user(BRUNO, null);

  await home("a1", ANA, 5); // Ana pasted it, and it was read at once
  await home("a2", ANA, 1); // Ana pasted it; the browser reader finished it later
  await home("b1", BRUNO, 3); // Bruno's
  await home("b2", BRUNO, 20); // Bruno's, older than the digest window
  await home("x1", null, 1); // nobody's: an import with no actor

  await event("e1", "import", "a1", ANA, 5);
  await event("e2", "import", "a2", ANA, 1);
  // The reader on the host finished it, so the actor is not Ana — but the link was hers.
  await event("e3", "completed", "a2", BRUNO, 1);
  await event("e4", "import", "b1", BRUNO, 3);
  await event("e5", "price_change", "b1", null, 1);
});

describe("what reaches one person", () => {
  it("is their own links, and nobody else's", async () => {
    const bell = await bellFor({ id: ANA, last_seen_at: day(2) });
    expect(bell.items.map((i) => i.id)).toEqual(["e3", "e2", "e1"]);
    expect(bell.items.map((i) => i.kind)).toEqual(["completed", "import", "import"]);
  });

  it("credits a reading to whoever pasted the link, not to whoever finished it", async () => {
    // `e3` was written by Bruno's process. Bruno must not be told about Ana's link.
    const bruno = await bellFor({ id: BRUNO, last_seen_at: null });
    expect(bruno.items.map((i) => i.id)).toEqual(["e4"]);
  });

  it("never puts the family's own activity in the bell", async () => {
    // A price change is activity. It belongs in «Actividad», which is the other tab.
    const bell = await bellFor({ id: BRUNO, last_seen_at: null });
    expect(bell.items.some((i) => i.id === "e5")).toBe(false);
  });

  it("splits new from old at the moment the menu was last opened", async () => {
    const bell = await bellFor({ id: ANA, last_seen_at: day(2) });
    expect(bell.items.filter((i) => !i.seen).map((i) => i.id)).toEqual(["e3", "e2"]);
    expect(bell.items.filter((i) => i.seen).map((i) => i.id)).toEqual(["e1"]);
  });

  it("treats a person who has never opened it as having seen nothing", async () => {
    const bell = await bellFor({ id: BRUNO, last_seen_at: null });
    expect(bell.items.every((i) => !i.seen)).toBe(true);
  });
});

describe("what is waiting to be looked at", () => {
  it("is everything this person has not opened and did not add", async () => {
    // Ana added a1 and a2. b2 is older than the digest window but still unreviewed.
    expect([...(await unreviewed(ANA))].sort()).toEqual(["b1", "b2", "x1"]);
    expect([...(await unreviewed(BRUNO))].sort()).toEqual(["a1", "a2", "x1"]);
  });

  it("counts only the last few days in the bell, and every one of them in the list", async () => {
    const bell = await bellFor({ id: ANA, last_seen_at: day(2) });
    expect(DIGEST_DAYS).toBe(7);
    expect(bell.digest).toBe(2); // b1 (3 days) and x1 (1 day); b2 is 20 days old
    expect(bell.waiting).toBe(3); // the tab counts b2 as well
    expect((await unreviewed(ANA)).size).toBe(3);
  });

  it("drops a home the moment its page is opened", async () => {
    await markReviewed(ANA, "b1");
    expect((await unreviewed(ANA)).has("b1")).toBe(false);
    expect((await bellFor({ id: ANA, last_seen_at: day(2) })).digest).toBe(1);
    // Twice is once: opening a page again must not fail, and must not move the date.
    await markReviewed(ANA, "b1");
    expect((await unreviewed(ANA)).has("b1")).toBe(false);
    // Bruno is unaffected: reviewing is one person's business.
    expect((await unreviewed(BRUNO)).has("b1")).toBe(false);
    expect((await unreviewed(BRUNO)).has("x1")).toBe(true);
  });

  it("counts as one unread thing, however many homes are in it", async () => {
    const bell = await bellFor({ id: ANA, last_seen_at: day(2) });
    // two unseen items, plus one because x1 arrived yesterday and Ana has not been told
    expect(bell.unseen).toBe(3);
  });

  it("stops lighting the bell once she has been told, however long the list stays", async () => {
    // Nothing new has arrived since she looked. The list is still 2 long, and that is what the
    // «Revisar» tab is for — a badge that never goes out is a badge nobody reads.
    const bell = await bellFor({ id: ANA, last_seen_at: new Date().toISOString() });
    expect(bell.waiting).toBeGreaterThan(0);
    expect(bell.unseen).toBe(0);
  });
});

describe("opening the menu", () => {
  it("makes everything in it old, and leaves the waiting list alone", async () => {
    await markSeen(ANA);
    const bell = await bellFor({
      id: ANA,
      last_seen_at: String(
        (await db.execute({ sql: "SELECT last_seen_at FROM users WHERE id = ?", args: [ANA] })).rows[0].last_seen_at,
      ),
    });
    expect(bell.items.every((i) => i.seen)).toBe(true);
    // The digest is a live count, not a row, so being seen does not make the line go away — but
    // it stops adding to the badge, because she has now been told about everything in it.
    expect(bell.digest).toBe(1);
    expect(bell.unseen).toBe(0);
  });
});
