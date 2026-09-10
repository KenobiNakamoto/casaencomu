import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/** The budget is one number for the whole family, so it records whose decision it was (PIP-14). */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "casa-budget-"));

const { db, applySchema } = await import("./db");
const { getBudget, setBudget } = await import("./settings");

const ANA = randomUUID();

beforeAll(async () => {
  await applySchema();
  await db.execute({
    sql: "INSERT INTO users (id, email, name, capture_token, created_at) VALUES (?, 'ana@example.com', 'ana', ?, ?)",
    args: [ANA, randomUUID(), new Date().toISOString()],
  });
});

describe("who put the budget there", () => {
  it("starts with no budget and nobody", async () => {
    expect(await getBudget()).toEqual({ budget: null, by: null, at: null });
  });

  it("keeps the author and the moment beside the numbers", async () => {
    await setBudget(200_000, 450_000, ANA);
    const got = await getBudget();
    expect(got.budget).toEqual({ min: 200_000, max: 450_000 });
    expect(got.by).toBe("ana");
    expect(Date.parse(got.at!)).toBeGreaterThan(0);
  });

  // Somebody who renames themselves on /ajustes should not still be the old name here.
  it("reads the name as it is now, not as it was when the budget was set", async () => {
    await db.execute({ sql: "UPDATE users SET name = 'Ana María' WHERE id = ?", args: [ANA] });
    expect((await getBudget()).by).toBe("Ana María");
  });

  it("keeps one bound alone, and still says who (F30)", async () => {
    await setBudget(null, 400_000, ANA);
    const got = await getBudget();
    expect(got.budget).toEqual({ min: null, max: 400_000 });
    expect(got.by).toBe("Ana María");
  });

  it("clears the author with the budget: «puesto por nadie» is not a thing", async () => {
    await setBudget(null, null, ANA);
    expect(await getBudget()).toEqual({ budget: null, by: null, at: null });
  });
});
