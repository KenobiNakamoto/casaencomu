import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const req = (headers: Record<string, string> = {}) => new NextRequest("https://casa.test/propiedades", { headers });
const keys = ["CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD", "PREVIEW_PASSWORD", "PREVIEW_OPEN_AS"] as const;

afterEach(() => keys.forEach((k) => delete process.env[k]));

describe("PREVIEW_OPEN_AS: no prompt on a tailnet-only host", () => {
  it("lets everyone in as the one identity", async () => {
    process.env.PREVIEW_OPEN_AS = "casa@casa.local";
    const res = await proxy(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-request-x-user-email")).toBe("casa@casa.local");
  });

  it("never downgrades a real Access deployment", async () => {
    process.env.CF_ACCESS_TEAM_DOMAIN = "team.cloudflareaccess.com";
    process.env.CF_ACCESS_AUD = "aud";
    process.env.PREVIEW_OPEN_AS = "casa@casa.local";
    // No Access token on the request, so Cloudflare's branch must refuse it.
    expect((await proxy(req())).status).toBe(401);
  });

  it("still asks for the password when it is not set", async () => {
    process.env.PREVIEW_PASSWORD = "clave";
    expect((await proxy(req())).status).toBe(401);
  });
});
