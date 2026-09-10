import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source guards for #146 — the conversation. Every defect here is structural: an author check
 * written in the browser still renders, a second level of replies still compiles, and a composer
 * that draws a new identifier on every keystroke still works until two people click twice.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const talk = read("./conversation.tsx");
const actions = read("../../app/propiedades/actions.ts");
const lib = read("../../lib/comments.ts");
const shape = read("../../lib/comment-shape.ts");
const page = read("../../app/propiedades/[id]/page.tsx");

describe("who is allowed to change what", () => {
  it("the action takes the author from the session and never from a field", () => {
    const body = actions.slice(actions.indexOf("export async function conversationAction"));
    expect(body.slice(0, body.indexOf("\n}\n"))).toContain("const user = await currentUser();");
    expect(body).not.toContain('formData.get("userId")');
    // Every write is handed `user.id`; nothing else reaches `lib/comments`.
    for (const call of ["post(", "edit(commentId, user.id", "remove(commentId, user.id"]) expect(body).toContain(call);
  });

  it("the author and the version are both in the WHERE, so a refused write writes nothing", () => {
    for (const verb of ["UPDATE comments SET body = ?", "UPDATE comments SET body = ''"]) {
      const stmt = lib.slice(lib.indexOf(verb));
      expect(stmt.slice(0, stmt.indexOf("`,"))).toContain("WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL");
    }
  });

  it("the buttons the browser hides are a courtesy, not the rule", () => {
    // They are hidden behind the same id the server checks, and the server check is the one above.
    expect(talk).toContain("const mine = comment.user_id === viewerId;");
    expect(talk).toContain("{mine && (");
  });
});

describe("one level, and one comment per send", () => {
  it("a reply carries no reply button of its own", () => {
    // The reply's own bubble is rendered without the prop that draws the button.
    expect(talk).toContain("<Bubble propertyId={propertyId} comment={r} viewerId={viewerId} small />");
  });

  it("the server refuses a parent that is itself a reply, or lives elsewhere", () => {
    expect(lib).toContain("if (!r || r.property_id !== propertyId || r.parent_id !== null || r.deleted_at !== null) return no(\"bad_parent\");");
  });

  it("the identifier is drawn once and kept across a refusal", () => {
    // Not in the markup React renders on the server: the two sides would disagree about it.
    expect(talk).toContain('<input ref={idRef} type="hidden" name="commentId" defaultValue="" />');
    expect(talk).toContain("idRef.current.value = crypto.randomUUID()");
    // A new one only after something was actually written.
    const after = talk.slice(talk.indexOf("if (!state?.ok) return;"));
    expect(after.slice(0, after.indexOf("}, [state]"))).toContain("draw();");
  });

  it("the version is taken when the control opens, not on every render", () => {
    // `PendingPoll` refreshes this page every five seconds while an advertisement is unread.
    // Reading `comment.version` in the markup would let one of those re-point the form at the
    // current row, and the check would never refuse anything.
    expect(talk).toContain("const useDrawnFrom = (version: number) => useState(version)[0];");
    expect(talk).toContain('<input type="hidden" name="version" value={drawnFrom} readOnly />');
    expect(talk).not.toContain('name="version" value={comment.version}');
  });

  it("the same identifier twice writes nothing the second time", () => {
    expect(lib).toContain("if (again.rows.length) return { ok: true };");
  });
});

describe("what a person typed is never lost (F24)", () => {
  it("a refusal hands the words back from the server", () => {
    expect(actions).toContain("const back = { text: raw };");
    expect(talk).toContain('defaultValue={failed?.text ?? ""}');
  });

  it("an unsent box survives a reload, in this browser and nowhere else", () => {
    expect(talk).toContain("sessionStorage.getItem(storeAs)");
    expect(talk).toContain("sessionStorage.removeItem(storeAs)");
    // Never localStorage: an unsent comment should not outlive the tab it was typed in.
    expect(talk).not.toContain("localStorage");
    // Every touch is guarded: a browser that refuses storage still has a working box.
    expect(talk.match(/try \{/g) ?? []).toHaveLength(3);
  });

  it("every control in a line of text still has a 44 px target", () => {
    // The words stay the size of the words; `touch-target` grows only what a thumb hits.
    expect(talk).toContain('const quiet = "touch-target text-xs');
    expect(talk).toContain('className="touch-target text-xs font-medium text-error');
  });

  it("asks before removing, in the page and not in a browser box", () => {
    expect(talk).toContain("¿Quitar lo que escribiste?");
    expect(talk).not.toMatch(/\bconfirm\(/);
    // The form that removes is reached only from the branch the question opens.
    expect(talk).toContain('{doing === "borrar" ? (\n          <Removing');
  });
});

describe("nothing anybody wrote enters the history (V21)", () => {
  it("the event carries an identifier and a flag, never the words", () => {
    const insert = lib.slice(lib.indexOf("INSERT INTO events"));
    expect(insert.slice(0, insert.indexOf("});"))).toContain("JSON.stringify({ comment_id: id, reply: parentId !== null })");
    expect(lib).not.toContain("body: said.text");
  });

  it("the detail page's line for a comment event says no words either", () => {
    const line = page.slice(page.indexOf('case "comment":') + 15);
    expect(line.slice(0, line.indexOf("case "))).toContain('p.reply ? "Respuesta en la conversación" : "Comentario nuevo"');
    expect(page).not.toContain("String(p.body ?? \"\").slice(0, 80)");
  });

  it("removing clears the words from the row as well", () => {
    expect(lib).toContain("UPDATE comments SET body = '', deleted_at = ?");
  });
});

describe("the shape a reader sees", () => {
  it("a removed comment stays only while somebody is answering it", () => {
    expect(shape).toContain("return nodes.filter((n) => !removed(n) || n.replies.length > 0);");
    expect(talk).toContain("Comentario retirado por quien lo escribió.");
  });

  it("the tombstone offers no reply: there is nothing there to answer", () => {
    expect(talk).toContain("onReply={removed(n) ? undefined : ()");
  });

  it("line breaks survive and nothing else is trusted", () => {
    expect(shape).toContain('body.replace(/\\r\\n/g, "\\n").trim()');
    // React escapes the text; `whitespace-pre-line` is what keeps the shape of it (V23).
    expect(talk).toContain("whitespace-pre-line");
    expect(talk).not.toContain("dangerouslySetInnerHTML");
  });
});
