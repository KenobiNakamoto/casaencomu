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

/**
 * Constant-time compare of two secrets. Digesting first fixes the length, so the loop
 * never runs over the password's own bytes and its timing says nothing about them.
 */
async function sameSecret(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const [xs, ys] = [new Uint8Array(x), new Uint8Array(y)];
  let diff = 0;
  for (let i = 0; i < xs.length; i++) diff |= xs[i] ^ ys[i];
  return diff === 0;
}

const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._+-]{0,30}[a-z0-9])?$/;

/**
 * Preview auth: `Basic base64(user:password)`. The password is shared; the user half
 * becomes the identity, so each family member keeps their own ratings and activity.
 * Returns the email, or null for any credential this does not accept.
 *
 * ponytail: Basic auth over a tailnet, not a session cookie. The tailnet is the
 * perimeter; swap in a real login when the app leaves it.
 */
export async function previewEmail(header: string | null, password: string): Promise<string | null> {
  if (!password) return null;
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }

  // Only the first colon splits: a password may contain one.
  const sep = decoded.indexOf(":");
  if (sep < 1) return null;
  const user = decoded.slice(0, sep).toLowerCase();
  if (!(await sameSecret(decoded.slice(sep + 1), password))) return null;

  const [local, domain, ...rest] = user.split("@");
  if (rest.length || !LOCAL_PART.test(local ?? "")) return null;
  if (domain !== undefined && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return domain ? user : `${local}@casa.local`;
}

export type User = {
  id: string;
  email: string;
  name: string;
  capture_token: string;
  last_seen_at: string | null;
};

/**
 * The member whose bookmarklet this is, or null. The capture token identifies the person on its
 * own, which is what lets `/api/capture` sit outside the Access proxy: a capture arrives from a
 * portal's page with no cookie of ours, and the token is the guard the route was always designed
 * around. It also attributes the capture to whoever installed that bookmark, not to whichever
 * session happened to be open.
 */
export async function userByCaptureToken(token: string): Promise<User | null> {
  if (!token || token.length < 16) return null;
  const { db } = await import("./db");
  const { rows } = await db.execute({
    sql: "SELECT id, email, name, capture_token, last_seen_at FROM users WHERE capture_token = ?",
    args: [token],
  });
  return rows.length ? (rows[0] as unknown as User) : null;
}

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
  // ponytail: last_seen_at is written only by /actividad, so the unread badge means
  // "since you last opened Actividad", not "since your last page view"
  return rows[0] as unknown as User;
}
