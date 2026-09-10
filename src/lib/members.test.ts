import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Who is in a project, who may change that, and what an invitation link is worth on its own.
 * `docs/SCALE.md` § 6.
 */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-people-"));

const {
  acceptInvite,
  control,
  createInvite,
  createProject,
  DESCRIPTION_MAX,
  membersOf,
  pendingInvites,
  projectForCaptureToken,
  projectsOf,
  PURPOSE_MAX,
  rememberCaptureToken,
  removeMember,
  revokeInvite,
  roleOf,
  updateProject,
} = await import("./control");

const ANA = "ana@example.com";
const BRUNO = "bruno@example.com";
const CARLA = "carla@example.com";

let casa = "";

/** The token, or the reason there is none. Keeps every call site to one line. */
const invite = async (by: string, to: string) => {
  const r = await createInvite(casa, by, to);
  return "refused" in r ? r.refused : r.token;
};

beforeAll(async () => {
  casa = await createProject("Casa de Ana", ANA);
});

describe("who owns a project", () => {
  it("gives it to whoever started it", async () => {
    expect(await roleOf(ANA, casa)).toBe("owner");
    expect(await roleOf(BRUNO, casa)).toBeNull();
    expect((await projectsOf(ANA))[0].role).toBe("owner");
  });

  it("lets nobody but the owner invite or remove", async () => {
    await expect(createInvite(casa, BRUNO, CARLA)).rejects.toThrow("forbidden");
    await expect(removeMember(casa, BRUNO, ANA)).rejects.toThrow("forbidden");
  });
});

describe("an invitation", () => {
  it("is refused for somebody already in the project, and for a broken address", async () => {
    expect(await invite(ANA, ANA)).toBe("member");
    expect(await invite(ANA, "no-es-un-correo")).toBe("invalid");
  });

  it("is the same link the second time the button is pressed", async () => {
    const first = await invite(ANA, BRUNO);
    expect(await invite(ANA, BRUNO)).toBe(first);
    expect((await pendingInvites(casa)).map((i) => i.email)).toEqual([BRUNO]);
  });

  it("proves nothing on its own: the signed-in address is what is checked", async () => {
    const token = await invite(ANA, BRUNO);
    // Carla has the link — it was sent through a chat, so anybody in it does.
    expect(await acceptInvite(token, CARLA)).toEqual({ ok: false, reason: "other" });
    expect(await roleOf(CARLA, casa)).toBeNull();
  });

  it("lets the person it names in, once, as a member", async () => {
    const token = await invite(ANA, BRUNO);
    expect(await acceptInvite(token, BRUNO)).toMatchObject({ ok: true, projectId: casa });
    expect(await roleOf(BRUNO, casa)).toBe("member");
    expect(await acceptInvite(token, BRUNO)).toEqual({ ok: false, reason: "used" });
    expect(await pendingInvites(casa)).toHaveLength(0);
  });

  it("does not care how the address was typed", async () => {
    const token = await invite(ANA, "Carla@Example.COM");
    expect(await acceptInvite(token, "CARLA@example.com")).toMatchObject({ ok: true });
    expect(await roleOf(CARLA, casa)).toBe("member");
  });

  it("stops working after its date", async () => {
    const token = await invite(ANA, "diego@example.com");
    await control.execute({
      sql: "UPDATE invites SET expires_at = '2020-01-01T00:00:00.000Z' WHERE token = ?",
      args: [token],
    });
    expect(await acceptInvite(token, "diego@example.com")).toEqual({ ok: false, reason: "expired" });
    expect(await pendingInvites(casa)).toHaveLength(0);
  });

  it("stops working when the owner anulls it", async () => {
    const token = await invite(ANA, "elena@example.com");
    await revokeInvite(casa, ANA, token);
    expect(await acceptInvite(token, "elena@example.com")).toEqual({ ok: false, reason: "unknown" });
  });

  it("is refused with no link at all", async () => {
    expect(await acceptInvite("", BRUNO)).toEqual({ ok: false, reason: "unknown" });
    expect(await acceptInvite("corto", BRUNO)).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("removing somebody", () => {
  it("takes the bookmarklet with them, not only the membership", async () => {
    await rememberCaptureToken("token-of-bruno-01234567", casa, BRUNO);
    expect(await projectForCaptureToken("token-of-bruno-01234567")).toBe(casa);

    expect(await removeMember(casa, ANA, BRUNO)).toBe(true);
    expect(await roleOf(BRUNO, casa)).toBeNull();
    // Otherwise their bookmark keeps posting listings into a project they were taken out of.
    expect(await projectForCaptureToken("token-of-bruno-01234567")).toBeNull();
  });

  it("never removes an owner: the project would be left with nobody who can manage it", async () => {
    expect(await removeMember(casa, ANA, ANA)).toBe(false);
    expect(await roleOf(ANA, casa)).toBe("owner");
    expect((await membersOf(casa))[0]).toMatchObject({ email: ANA, role: "owner" });
  });
});

/** The card is the project, so what a card shows has to survive the round trip (#148). */
describe("what a project says about itself", () => {
  const only = async (email: string, id: string) => (await projectsOf(email)).find((p) => p.id === id)!;

  it("starts with nothing written and keeps what is written", async () => {
    const fresh = await createProject("Piso para el verano", ANA);
    expect((await only(ANA, fresh)).purpose).toBe("");
    expect((await only(ANA, fresh)).description).toBe("");

    expect(
      await updateProject(fresh, ANA, {
        name: "Verano en Gràcia",
        purpose: "Alquiler para septiembre",
        description: "Dos habitaciones, ascensor, cerca del metro.",
      }),
    ).toBe(true);

    const after = await only(ANA, fresh);
    expect(after.name).toBe("Verano en Gràcia");
    expect(after.purpose).toBe("Alquiler para septiembre");
    expect(after.description).toBe("Dos habitaciones, ascensor, cerca del metro.");
  });

  it("counts the people in it, so the card never has to ask a second time", async () => {
    expect((await only(ANA, casa)).people).toBe((await membersOf(casa)).length);
  });

  it("refuses a project with no name at all, and keeps the one it had", async () => {
    expect(await updateProject(casa, ANA, { name: "   ", purpose: "x", description: "y" })).toBe(false);
    expect((await only(ANA, casa)).name).toBe("Casa de Ana");
  });

  it("cuts what is too long instead of refusing it", async () => {
    await updateProject(casa, ANA, { name: "Casa de Ana", purpose: "p".repeat(500), description: "d".repeat(5000) });
    const after = await only(ANA, casa);
    expect(after.purpose).toHaveLength(PURPOSE_MAX);
    expect(after.description).toHaveLength(DESCRIPTION_MAX);
  });

  it("lets nobody but the owner rewrite it", async () => {
    await expect(
      updateProject(casa, BRUNO, { name: "Casa de Bruno", purpose: "", description: "" }),
    ).rejects.toThrow("forbidden");
    expect((await only(ANA, casa)).name).toBe("Casa de Ana");
  });
});
