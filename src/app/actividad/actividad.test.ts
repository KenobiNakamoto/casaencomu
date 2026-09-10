import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
/** The file with its prose taken out. A comment explaining why something is gone is not it back. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const page = read("./page.tsx");
const actions = read("./actions.ts");
const refresh = read("./refresh.tsx");
const feedView = read("../../components/activity-feed.tsx");

/**
 * V25. Next prefetches a link on hover and in the viewport, so anything a render writes is
 * written for pages nobody opened. `markSeen()` used to be called here, at the top of the
 * component, and it cleared the badge (F27).
 */
describe("rendering the page marks nothing", () => {
  it("writes no read state while rendering", () => {
    const body = code("./page.tsx");
    expect(body).not.toContain("markSeen");
    expect(body).not.toContain("await markRead");
    // The bell keeps its own timestamp, and the feed no longer reads it.
    expect(body).not.toContain("last_seen_at");
  });

  it("marks read only from a form a person submits", () => {
    expect(page).toContain("<form action={markReadAction}>");
    expect(actions).toContain("formData.getAll(\"visto\")");
  });

  it("sends the ids that were drawn, not a count and not a timestamp", () => {
    expect(page).toContain('const pending = rows.filter((r) => !read.has(r.id) && r.actor_id !== user.id).map((r) => r.id)');
    expect(page).toContain('<input key={id} type="hidden" name="visto" value={id} readOnly />');
  });

  it("leaves the feed component unable to write anything at all", () => {
    expect(feedView).not.toContain("db.execute");
    expect(feedView).not.toContain('from "@/lib/db"');
  });
});

describe("freshness is asked for, never guessed", () => {
  it("refreshes on a press and on nothing else", () => {
    expect(refresh).toContain("router.refresh()");
    for (const banned of ["setInterval", "setTimeout", "visibilitychange", "focus", "EventSource", "WebSocket"]) {
      expect(refresh, banned).not.toContain(banned);
    }
    expect(code("./page.tsx")).not.toContain("setInterval");
  });
});

describe("the history is reachable", () => {
  it("pages with a cursor and offers the way back to the top", () => {
    expect(page).toContain("/actividad?antes=${encodeURIComponent(older)}");
    expect(page).toContain("Más antiguas");
    expect(page).toContain("Volver arriba");
  });

  it("gives every line an anchor a link can land on", () => {
    expect(feedView).toContain("id={`e-${e.id}`}");
    expect(feedView).toContain("scroll-mt-[calc(var(--header-h)+16px)]");
  });
});

/**
 * The other half of the deep links (#153). A line about a comment should land on the comment,
 * not at the top of a page the person then has to scan.
 */
describe("a line lands on the part of the page it is about", () => {
  const detail = read("../propiedades/[id]/page.tsx");

  it("sends each kind of event to an anchor the detail page actually carries", () => {
    const where = feedView.slice(feedView.indexOf("const WHERE"), feedView.indexOf("};", feedView.indexOf("const WHERE")));
    const anchors = [...where.matchAll(/"#([a-z]+)"/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(5);
    for (const a of new Set(anchors)) expect(detail, a).toContain(`id="${a}"`);
  });

  it("leaves an event with no obvious place at the top of the page", () => {
    expect(feedView).toContain("${WHERE[e.kind] ?? \"\"}");
  });
});
