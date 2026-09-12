import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Taking over a server that ran before accounts existed. This is the Air's own case: six
 * membership rows written by the preview door, and an owner row that is the string `--reset`,
 * left by a script that passed a flag where an address belonged. Not one of them can sign in.
 */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-adopt166-"));

const { addMember, adoptProjects, control, createProject, membersOf, projectsOf, roleOf } =
  await import("./control");

describe("the first account takes over what is already there", () => {
  it("becomes the owner of every project, and clears the rows that are not addresses", async () => {
    const p = await createProject("Casa", "ana@casa.local");
    const q = await createProject("Otra", "ana@casa.local");
    // The rows the old doors really left behind: names the preview password invented, and one
    // owner row that is a command-line flag.
    await addMember(p, "k@casa.local");
    await control.execute({
      sql: "INSERT INTO memberships (project_id, email, created_at, role) VALUES (?, '--reset', ?, 'owner')",
      args: [p, new Date().toISOString()],
    });

    expect(await adoptProjects("KENOBI@example.com")).toBe(2);

    expect(await roleOf("kenobi@example.com", p)).toBe("owner");
    expect(await roleOf("kenobi@example.com", q)).toBe("owner");
    expect((await projectsOf("kenobi@example.com")).length).toBe(2);
    // `--reset` is gone: no account can ever be made for it, so it could only confuse the list.
    expect((await membersOf(p)).map((m) => m.email)).not.toContain("--reset");
    // An address-shaped member from the preview door is left alone — their ratings are real, and
    // nobody is demoted by somebody else arriving.
    expect(await roleOf("k@casa.local", p)).toBe("member");
    expect(await roleOf("ana@casa.local", p)).toBe("owner");
  });

  it("promotes rather than duplicates when the address is already a member", async () => {
    const [first] = await projectsOf("k@casa.local");
    await adoptProjects("k@casa.local");
    expect(await roleOf("k@casa.local", first.id)).toBe("owner");
    expect((await membersOf(first.id)).filter((m) => m.email === "k@casa.local")).toHaveLength(1);
  });
});
