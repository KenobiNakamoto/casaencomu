import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { randomBytes, randomUUID } from "node:crypto";

export type VerifyOptions = { jwks: JWTVerifyGetKey; issuer: string; audience: string };

/**
 * Pure: signature (against `jwks`), issuer, audience and expiry are all enforced by jose.
 * The proxy passes `createRemoteJWKSet`; the test passes `createLocalJWKSet`.
 * Returns the `email` claim or throws.
 */
export async function verifyAccessToken(token: string, { jwks, issuer, audience }: VerifyOptions) {
  const { payload } = await jwtVerify(token, jwks, { issuer, audience });
  if (typeof payload.email !== "string" || !payload.email) throw new Error("token has no email claim");
  return payload.email;
}

export type User = {
  id: string;
  email: string;
  name: string;
  capture_token: string;
  last_seen_at: string | null;
};

const TOUCH_INTERVAL_MS = 60_000;

/** Reads `x-user-email` (set only by the proxy), upserts the `users` row and returns it. */
export async function currentUser(): Promise<User> {
  // ponytail: lazy imports so this module loads in vitest without a Next request scope or a db file
  const { headers } = await import("next/headers");
  const email = (await headers()).get("x-user-email");
  if (!email) throw Object.assign(new Error("unauthorized"), { status: 401 });

  const { db } = await import("./db");
  const now = new Date().toISOString();
  await db.execute({
    sql: "INSERT OR IGNORE INTO users (id, email, name, capture_token, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [randomUUID(), email, email.split("@")[0], randomBytes(24).toString("base64url"), now],
  });
  const { rows } = await db.execute({
    sql: "SELECT id, email, name, capture_token, last_seen_at FROM users WHERE email = ?",
    args: [email],
  });
  const user = rows[0] as unknown as User;
  // Returned as selected (pre-touch): the Actividad unread badge needs the previous visit.
  if (!user.last_seen_at || Date.parse(user.last_seen_at) < Date.now() - TOUCH_INTERVAL_MS) {
    await db.execute({ sql: "UPDATE users SET last_seen_at = ? WHERE id = ?", args: [now, user.id] });
  }
  return user;
}
