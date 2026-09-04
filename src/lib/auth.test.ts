import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyAccessToken } from "./auth";

const issuer = "https://example.cloudflareaccess.com";
const audience = "test-aud";
const email = "ana@example.com";

let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "t" }] });
});

const sign = (claims: { iss?: string; aud?: string; exp?: number } = {}) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "t" })
    .setIssuer(claims.iss ?? issuer)
    .setAudience(claims.aud ?? audience)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? "5m")
    .sign(privateKey);

const verify = (token: string) => verifyAccessToken(token, { jwks, issuer, audience });

describe("verifyAccessToken", () => {
  it("rejects a wrong audience", async () => {
    await expect(verify(await sign({ aud: "other-aud" }))).rejects.toThrow(/"aud"/);
  });

  it("rejects a wrong issuer", async () => {
    await expect(verify(await sign({ iss: "https://other.example.com" }))).rejects.toThrow(/"iss"/);
  });

  it("rejects an expired token", async () => {
    const twoMinutesAgo = Math.floor(Date.now() / 1000) - 120;
    await expect(verify(await sign({ exp: twoMinutesAgo }))).rejects.toThrow(/"exp"/);
  });

  it("accepts a valid token and returns the email", async () => {
    await expect(verify(await sign())).resolves.toBe(email);
  });
});
