import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/**
 * The top bar ran out of room: six controls, and two of them spent on things nobody wanted there
 * — a `?` and an icon of several people that looked like a members list (#148).
 */
describe("the right-hand end of the top bar", () => {
  const nav = read("./nav.tsx");

  it("has no help control at all", () => {
    expect(nav).not.toContain("/ayuda");
    expect(nav).not.toContain('aria-label="Ayuda"');
  });

  it("no longer links straight to the projects page", () => {
    expect(nav).not.toContain('href="/proyectos"');
  });

  it("is the bell, the theme, and you", () => {
    expect(nav).toContain("<NotificationsMenu");
    expect(nav).toContain("<ThemeToggle />");
    expect(nav).toContain("<AccountMenu name={user.name} email={user.email} />");
  });

  it("drops the greeting, which the menu now says in full", () => {
    expect(nav).not.toContain("Hola {user.name}");
  });
});

describe("the account menu", () => {
  const menu = read("./account-menu.tsx");

  it("goes to three places and no more", () => {
    expect(menu).toContain('href: "/ajustes", label: "Ajustes"');
    expect(menu).toContain('href: "/proyectos", label: "Proyectos"');
    expect(menu).toContain('href="/salir"');
    expect(menu).toContain("Cerrar sesión");
  });

  // A `<Link>` would prefetch it, and prefetching the way out signs you out on hover.
  it("leaves by a plain anchor, never a router link", () => {
    expect(menu).toMatch(/<a role="menuitem" href="\/salir"/);
  });

  it("closes on Escape and on a press outside it, like the bell", () => {
    expect(menu).toContain('e.key === "Escape"');
    expect(menu).toContain('document.addEventListener("pointerdown", away)');
  });
});

describe("signing out", () => {
  it("hands a Cloudflare deployment to Cloudflare, which owns the session", () => {
    const route = read("../app/salir/route.ts");
    expect(route).toContain("process.env.CF_ACCESS_TEAM_DOMAIN");
    expect(route).toContain("/cdn-cgi/access/logout");
  });

  it("makes the preview forget the password it has been repeating", async () => {
    delete process.env.CF_ACCESS_TEAM_DOMAIN;
    const { GET } = await import("../app/salir/route");
    const res = GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });
});
