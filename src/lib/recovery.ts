import { createHash, randomBytes } from "node:crypto";
import { checkPassword, hashPassword, PASSWORD_MIN } from "./accounts";
import { control, controlReady } from "./control";

const norm = (email: string) => email.trim().toLowerCase();
const digest = (code: string) => createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");
const now = () => new Date().toISOString();

/** Saved offline by the account holder. Owners cannot issue codes for other members. */
export async function issueRecoveryCode(email: string, password: string): Promise<{ code: string; expires: string } | null> {
  await controlReady;
  const who = norm(email);
  const before = (await control.execute({ sql: "SELECT password_hash FROM accounts WHERE email = ?", args: [who] })).rows[0];
  if (!before || password.length > 1024 || !(await checkPassword(who, password)).ok) return null;
  const code = randomBytes(32).toString("hex").match(/.{8}/g)!.join("-");
  const expires = new Date(Date.now() + 365 * 86400_000).toISOString();
  const tx = await control.transaction("write");
  try {
    const current = (await tx.execute({ sql: "SELECT password_hash FROM accounts WHERE email = ?", args: [who] })).rows[0];
    // A concurrent reset must not authorize a code using the previous password.
    if (current?.password_hash !== before.password_hash) return null;
    await tx.execute({
      sql: `INSERT INTO recovery_codes (email, digest, created_at, expires_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET digest=excluded.digest, created_at=excluded.created_at, expires_at=excluded.expires_at`,
      args: [who, digest(code), now(), expires],
    });
    await tx.commit();
    return { code, expires };
  } finally { tx.close(); }
}

/** Consume, change the password and revoke sessions in one write transaction. No automatic login. */
export async function recoverAccount(email: string, code: string, password: string): Promise<boolean> {
  if (password.length < PASSWORD_MIN || password.length > 1024 || email.length > 254 || !/^[a-f0-9]{64}$/i.test(code.replace(/[\s-]/g, ""))) return false;
  await controlReady;
  const who = norm(email);
  const key = digest(code);
  const match = () => ({ sql: "SELECT 1 FROM recovery_codes WHERE email = ? AND digest = ? AND expires_at > ?", args: [who, key, now()] });
  if (!(await control.execute(match())).rows.length) return false;
  const hash = await hashPassword(password);
  const tx = await control.transaction("write");
  try {
    if (!(await tx.execute(match())).rows.length) return false;
    const changed = await tx.execute({ sql: "UPDATE accounts SET password_hash = ?, failed_count = 0, failed_at = NULL WHERE email = ?", args: [hash, who] });
    if (!changed.rowsAffected) return false;
    await tx.execute({ sql: "DELETE FROM recovery_codes WHERE email = ?", args: [who] });
    await tx.execute({ sql: "DELETE FROM sessions WHERE email = ?", args: [who] });
    await tx.commit();
    return true;
  } finally { tx.close(); }
}

/** Normal password changes revoke the recovery code too. All credential writes are atomic. */
export async function changeOwnPassword(email: string, oldPassword: string, password: string): Promise<boolean> {
  if (password.length < PASSWORD_MIN || password.length > 1024 || oldPassword.length > 1024) return false;
  await controlReady;
  const who = norm(email);
  const before = (await control.execute({ sql: "SELECT password_hash FROM accounts WHERE email = ?", args: [who] })).rows[0];
  if (!before || !(await checkPassword(who, oldPassword)).ok) return false;
  const hash = await hashPassword(password);
  const tx = await control.transaction("write");
  try {
    const changed = await tx.execute({ sql: "UPDATE accounts SET password_hash = ?, failed_count = 0, failed_at = NULL WHERE email = ? AND password_hash = ?", args: [hash, who, before.password_hash] });
    if (!changed.rowsAffected) return false;
    await tx.execute({ sql: "DELETE FROM recovery_codes WHERE email = ?", args: [who] });
    await tx.execute({ sql: "DELETE FROM sessions WHERE email = ?", args: [who] });
    await tx.commit();
    return true;
  } finally { tx.close(); }
}
