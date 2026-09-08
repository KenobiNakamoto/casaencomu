import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The importing user is read from `--user`. `indexOf` returns -1 when the flag is absent, and
 * `args[-1 + 1]` is `args[0]` — the first positional argument. So `ingest.mts --reset` recorded
 * `--reset` as the person who imported all 23 homes (issue #74).
 */
const src = readFileSync(fileURLToPath(new URL("./ingest.mts", import.meta.url)), "utf8");

/**
 * A copy of the expression in `ingest.mts`, because that file runs the whole import on load and
 * cannot be imported. The last assertion below is what keeps the copy and the original together.
 */
function emailFrom(args: string[], fallback = "kenobi@example.com") {
  const at = args.indexOf("--user");
  return (at === -1 ? undefined : args[at + 1]) ?? fallback;
}

describe("who the ingest script credits", () => {
  it("takes the value after --user", () => {
    expect(emailFrom(["--user", "ana@example.com"])).toBe("ana@example.com");
    expect(emailFrom(["_local/captures", "--user", "ana@example.com", "--reset"])).toBe("ana@example.com");
  });

  it("falls back when the flag is absent, whatever else is on the line", () => {
    expect(emailFrom(["--reset"])).toBe("kenobi@example.com");
    expect(emailFrom(["_local/captures"])).toBe("kenobi@example.com");
    expect(emailFrom([])).toBe("kenobi@example.com");
  });

  it("falls back when --user is last and has no value", () => {
    expect(emailFrom(["--user"])).toBe("kenobi@example.com");
  });

  it("the script no longer indexes straight off indexOf", () => {
    expect(src).not.toContain('args[args.indexOf("--user") + 1]');
    expect(src).toContain("at === -1");
  });
});
