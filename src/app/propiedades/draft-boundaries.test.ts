import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it, vi } from "vitest";
import { EMPTY } from "@/lib/opinion-input";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-draft-actions-"));
const person = vi.hoisted(() => ({ id: "b", email: "b@example.com" }));
vi.mock("@/lib/auth", () => ({ currentUser: async () => person }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { db, applySchema, inProject } = await import("@/lib/db");
const { publishOpinionAction, saveDraftAction, conversationAction } = await import("./actions");
beforeAll(async () => {
  await applySchema();
  await db.execute("INSERT INTO users (id,email,name,capture_token,created_at) VALUES ('b','b@example.com','B','test-token','2026-01-01')");
  await db.execute("INSERT INTO properties (id,title,stage,created_at,updated_at) VALUES ('home','Synthetic home','nueva','2026-01-01','2026-01-01')");
});
it("cannot publish or save a stale account's unsent opinion as the newly signed-in user", async () => {
  const input = { ...EMPTY, stance: "me_interesa" as const, reasoning: "A private draft", basis: "listing" as const };
  const expected = { accountId: "a@example.com", projectId: "default", version: 0, revision: 0 };
  await inProject("default", async () => {
    expect(await publishOpinionAction("home", input, expected)).toMatchObject({ ok: false, reason: "conflict" });
    expect(await saveDraftAction("home", input, expected)).toMatchObject({ ok: false, reason: "conflict" });
    expect((await db.execute("SELECT COUNT(*) AS n FROM opinions")).rows[0].n).toBe(0);
    expect((await db.execute("SELECT COUNT(*) AS n FROM opinion_drafts")).rows[0].n).toBe(0);
    expect((await publishOpinionAction("home", input, { ...expected, accountId: person.email })).ok).toBe(true);
  });
});
it("rejects unsent comment text from another account or selected project", async () => {
  const f = new FormData();
  f.set("propertyId", "home"); f.set("verbo", "crear"); f.set("body", "A private comment");
  f.set("commentId", crypto.randomUUID()); f.set("draftAccount", "a@example.com"); f.set("draftProject", "default");
  await inProject("default", async () => {
    expect(await conversationAction(null, f)).toMatchObject({ ok: false, text: "" });
    f.set("draftAccount", person.email); f.set("draftProject", "different-project");
    expect(await conversationAction(null, f)).toMatchObject({ ok: false, text: "" });
    expect((await db.execute("SELECT COUNT(*) AS n FROM comments")).rows[0].n).toBe(0);
    f.set("draftProject", "default");
    expect(await conversationAction(null, f)).toMatchObject({ ok: true });
  });
});
