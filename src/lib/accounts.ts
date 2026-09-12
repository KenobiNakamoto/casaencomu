import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { control, controlReady } from "./control";

/**
 * Accounts and sessions: the app's own front door.
 *
 * Before this, `proxy.ts` trusted whatever put `x-user-email` on the request — Cloudflare Access,
 * a shared preview password, a development variable. Each of those ties a deployment to one host.
 * The app now knows who is asking on its own, and Access becomes an outer gate rather than the
 * only door.
 *
 * **The cookie carries nothing.** It is 256 random bits naming a row in `sessions`. Nothing is
 * encoded, so nothing can be forged or read, and ending a session is deleting one row. Next 16
 * runs `proxy.ts` on Node, so the proxy reads that row itself; an Edge proxy would have forced a
 * signed token, a signing secret and a second check in the application.
 */

/**
 * ponytail: one family, one number. Ten is the ceiling Kenobi asked for, and the only thing that
 * stops a stranger who finds the address from taking disk on the host. Make it a per-project
 * setting when a second family uses this, not before.
 */
export const MAX_ACCOUNTS = 10;

/** Long enough to survive guessing at scrypt's speed. Length beats punctuation; see NIST 800-63B. */
export const PASSWORD_MIN = 10;

const NAME_MAX = 40;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Two months. A family app that asks for a password every week teaches people to write it down. */
const SESSION_DAYS = 60;

/** Named beside the project cookie `casa_p`, and set in exactly one place: `entrar/actions.ts`. */
export const SESSION_COOKIE = "casa_s";
export const SESSION_MAX_AGE = SESSION_DAYS * 86400;

/** Five wrong tries, then a minute of nothing. Slow enough to stop guessing, short enough to forgive. */
const TRIES = 5;
const LOCKED_MS = 60_000;

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, k: number) => Promise<Buffer>;

/** `scrypt$<salt hex>$<key hex>`. The salt travels with the key, so nothing else must be stored. */
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function samePassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = await scrypt(password, Buffer.from(salt, "hex"), expected.length || KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const norm = (email: string) => email.trim().toLowerCase();
const now = () => new Date().toISOString();

const rowsOf = async (sql: string, args: unknown[] = []) => {
  await controlReady;
  return (await control.execute({ sql, args: args as never })).rows;
};

export type Account = { email: string; name: string; created_at: string };

const account = (r: Record<string, unknown>): Account => ({
  email: String(r.email),
  name: String(r.name),
  created_at: String(r.created_at),
});

export async function accountCount(): Promise<number> {
  return Number((await rowsOf("SELECT COUNT(*) AS n FROM accounts"))[0].n);
}

export async function accountBy(email: string): Promise<Account | null> {
  const rows = await rowsOf("SELECT email, name, created_at FROM accounts WHERE email = ?", [
    norm(email),
  ]);
  return rows.length ? account(rows[0]) : null;
}

export async function listAccounts(): Promise<Account[]> {
  return (await rowsOf("SELECT email, name, created_at FROM accounts ORDER BY created_at, email")).map(
    account,
  );
}

export type Refusal = "invalid" | "weak" | "taken" | "full" | "nameless";

/** Every rule a new account must pass, in one place, so the page and the action cannot disagree. */
export function accountProblem(email: string, name: string, password: string): Refusal | null {
  if (!EMAIL.test(norm(email))) return "invalid";
  if (!name.trim() || name.trim().length > NAME_MAX) return "nameless";
  if (password.length < PASSWORD_MIN) return "weak";
  return null;
}

/**
 * Make an account. The caller has already decided this address is allowed in — it is the first
 * account on an empty install, or it holds an invitation. This function only counts and writes.
 */
export async function createAccount(
  email: string,
  name: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: Refusal }> {
  const problem = accountProblem(email, name, password);
  if (problem) return { ok: false, reason: problem };
  if (await accountBy(email)) return { ok: false, reason: "taken" };
  // Counted after the existence check, so a person who already has an account is never told the
  // server is full. Two people signing up at the same moment can both pass this; the eleventh row
  // is then refused by the trigger below, which is the only place that can be sure.
  if ((await accountCount()) >= MAX_ACCOUNTS) return { ok: false, reason: "full" };

  try {
    await control.execute({
      sql: `INSERT INTO accounts (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)`,
      args: [norm(email), name.trim(), await hashPassword(password), now()],
    });
  } catch {
    // The trigger, or a second signup that won the race. Either way: no room, or already there.
    return { ok: false, reason: (await accountBy(email)) ? "taken" : "full" };
  }
  return { ok: true };
}

export async function setPassword(email: string, password: string): Promise<boolean> {
  if (password.length < PASSWORD_MIN) return false;
  const r = await control.execute({
    sql: "UPDATE accounts SET password_hash = ?, failed_count = 0, failed_at = NULL WHERE email = ?",
    args: [await hashPassword(password), norm(email)],
  });
  return r.rowsAffected > 0;
}

export type Signin = { ok: true; email: string } | { ok: false; reason: "no" | "locked" };

/**
 * **The answer is the same for a wrong password and an address nobody owns.** Anything else turns
 * the login form into a list of who is in this family.
 */
export async function checkPassword(email: string, password: string): Promise<Signin> {
  await controlReady;
  const rows = await rowsOf(
    "SELECT email, password_hash, failed_count, failed_at FROM accounts WHERE email = ?",
    [norm(email)],
  );
  if (!rows.length) {
    // Hash anyway. Returning early here would make an unknown address answer faster than a known
    // one, and the difference is readable over the network.
    await hashPassword(password);
    return { ok: false, reason: "no" };
  }

  const row = rows[0];
  const failedAt = row.failed_at == null ? 0 : Date.parse(String(row.failed_at));
  if (Number(row.failed_count) >= TRIES && Date.now() - failedAt < LOCKED_MS) {
    return { ok: false, reason: "locked" };
  }

  if (!(await samePassword(password, String(row.password_hash)))) {
    const fresh = Date.now() - failedAt < LOCKED_MS ? Number(row.failed_count) + 1 : 1;
    await control.execute({
      sql: "UPDATE accounts SET failed_count = ?, failed_at = ? WHERE email = ?",
      args: [fresh, now(), norm(email)],
    });
    return { ok: false, reason: "no" };
  }

  await control.execute({
    sql: "UPDATE accounts SET failed_count = 0, failed_at = NULL WHERE email = ?",
    args: [norm(email)],
  });
  return { ok: true, email: String(row.email) };
}

/** The session id itself is the credential, so it is as long as a key and never derived. */
export async function startSession(email: string): Promise<string> {
  await controlReady;
  const id = randomBytes(32).toString("base64url");
  const at = new Date();
  await control.execute({
    sql: "INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
    args: [
      id,
      norm(email),
      at.toISOString(),
      new Date(at.getTime() + SESSION_DAYS * 86400_000).toISOString(),
    ],
  });
  return id;
}

/** What `proxy.ts` asks on every request. Null means: not signed in, whatever the cookie says. */
export async function sessionEmail(id: string | undefined): Promise<string | null> {
  if (!id || id.length < 32) return null;
  const rows = await rowsOf("SELECT email FROM sessions WHERE id = ? AND expires_at > ?", [id, now()]);
  return rows.length ? String(rows[0].email) : null;
}

export async function endSession(id: string | undefined) {
  if (!id) return;
  await controlReady;
  await control.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [id] });
}

/** Every session of one person. Used when a password changes: the old ones must not survive it. */
export async function endAllSessions(email: string) {
  await controlReady;
  await control.execute({ sql: "DELETE FROM sessions WHERE email = ?", args: [norm(email)] });
}
