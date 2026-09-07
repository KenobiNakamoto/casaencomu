import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { previewEmail, verifyAccessToken } from "./auth";

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

describe("previewEmail", () => {
  const password = "clave-de-la-casa";
  const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;
  const check = (header: string | null) => previewEmail(header, password);

  it("accepts the shared password and makes the user half the identity", async () => {
    await expect(check(basic("ana", password))).resolves.toBe("ana@casa.local");
  });

  it("keeps a full email address as it is, lowercased", async () => {
    await expect(check(basic("Ana@Example.com", password))).resolves.toBe("ana@example.com");
  });

  it("splits on the first colon, so a password may contain one", async () => {
    await expect(check(basic("ana", "a:b"))).resolves.toBeNull();
    await expect(previewEmail(basic("ana", "a:b"), "a:b")).resolves.toBe("ana@casa.local");
  });

  it("rejects a wrong password", async () => {
    await expect(check(basic("ana", "otra"))).resolves.toBeNull();
  });

  it("rejects a missing or non-Basic header", async () => {
    await expect(check(null)).resolves.toBeNull();
    await expect(check("Bearer abc")).resolves.toBeNull();
    await expect(check("Basic")).resolves.toBeNull();
  });

  it("rejects an empty user half", async () => {
    await expect(check(basic("", password))).resolves.toBeNull();
  });

  it("rejects a username that is not a plain local part", async () => {
    for (const user of ["ana bonita", "../etc", "a@b@c", "ana@localhost", "-ana", "ana@casa"]) {
      await expect(check(basic(user, password))).resolves.toBeNull();
    }
  });

  it("rejects undecodable base64", async () => {
    await expect(check("Basic !!!not-base64!!!")).resolves.toBeNull();
  });

  it("refuses every credential when no password is configured", async () => {
    await expect(previewEmail(basic("ana", ""), "")).resolves.toBeNull();
  });
});
