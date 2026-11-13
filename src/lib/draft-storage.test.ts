import { beforeEach, expect, it, vi } from "vitest";
import { clearDraft, draftKey, readDraft, syncDraftAccount, writeDraft, type DraftOwner } from "./draft-storage";
const a: DraftOwner = { accountId: "a@example.com", projectId: "shared" };
const b: DraftOwner = { accountId: "b@example.com", projectId: "shared" };
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal("sessionStorage", {
    get length() { return store.size; }, key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key),
  });
});
it.each(["opinion", "comment"])("keeps a %s private across accounts and projects", (kind) => {
  const key = draftKey(a, kind, "property");
  writeDraft(a, key, "private unsent words");
  expect(readDraft(a, key)).toBe("private unsent words");
  const other = { ...a, projectId: "other" };
  expect(readDraft(other, draftKey(other, kind, "property"))).toBeNull();
  expect(readDraft(other, key)).toBeNull();
  expect(readDraft(b, key)).toBeNull();
  expect(readDraft(b, draftKey(b, kind, "property"))).toBeNull();
  expect(store.has(key)).toBe(false);
});
it("discards unsigned legacy text and clears drafts on logout without deleting preferences", () => {
  store.set("casa:opinion:property", "legacy private opinion");
  store.set("casa:comentario:property:", "legacy private comment");
  store.set("tema", "dark");
  writeDraft(a, draftKey(a, "comment", "property"), "new draft");
  expect(store.has("casa:opinion:property")).toBe(false);
  expect(store.has("casa:comentario:property:")).toBe(false);
  syncDraftAccount(null);
  expect([...store]).toEqual([["tema", "dark"]]);
});
it("keeps distinct replies and clears only a submitted draft", () => {
  const root = draftKey(a, "comment", "property");
  const reply = draftKey(a, "comment", "property", "parent");
  writeDraft(a, root, "root"); writeDraft(a, reply, "reply"); clearDraft(reply);
  expect(readDraft(a, root)).toBe("root"); expect(readDraft(a, reply)).toBeNull();
});
it("continues without recovery if storage is disabled or corrupt", () => {
  const key = draftKey(a, "comment", "property"); store.set(key, "invalid JSON");
  expect(readDraft(a, key)).toBeNull();
  vi.stubGlobal("sessionStorage", { get length() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); } });
  expect(() => writeDraft(a, key, "draft")).not.toThrow(); expect(readDraft(a, key)).toBeNull();
});
