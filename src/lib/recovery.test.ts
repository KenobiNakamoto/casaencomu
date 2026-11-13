import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'casa-recovery-'));
const c = await import('./control');
const a = await import('./accounts');
const { issueRecoveryCode, recoverAccount, changeOwnPassword } = await import('./recovery');
const pass = 'the original password';
const who = 'person@example.com';
beforeEach(async () => {
  await c.controlReady;
  await c.control.executeMultiple('DELETE FROM recovery_codes; DELETE FROM sessions; DELETE FROM accounts;');
  await a.createAccount(who, 'Person', pass);
});
it('requires the current password and stores only a code digest', async () => {
  expect(await issueRecoveryCode(who, 'wrong password')).toBeNull();
  const r = (await issueRecoveryCode(who, pass))!;
  expect(r.code.replaceAll('-', '')).toHaveLength(64);
  expect(JSON.stringify((await c.control.execute('SELECT * FROM recovery_codes')).rows)).not.toContain(r.code.replaceAll('-', ''));
});
it('recovers once, revokes every session, and leaves other accounts alone', async () => {
  await a.createAccount('other@example.com', 'Other', pass);
  const [one, two, other] = await Promise.all([a.startSession(who), a.startSession(who), a.startSession('other@example.com')]);
  const { code } = (await issueRecoveryCode(who, pass))!;
  expect(await recoverAccount('other@example.com', code, 'replacement password')).toBe(false);
  expect(await recoverAccount(who, code, 'replacement password')).toBe(true);
  expect(await recoverAccount(who, code, 'another replacement')).toBe(false);
  expect(await a.sessionEmail(one)).toBeNull(); expect(await a.sessionEmail(two)).toBeNull();
  expect(await a.sessionEmail(other)).toBe('other@example.com');
  expect((await a.checkPassword(who, pass)).ok).toBe(false);
  expect((await a.checkPassword(who, 'replacement password')).ok).toBe(true);
});
it('refuses expired and replaced codes without changing a password', async () => {
  const first = (await issueRecoveryCode(who, pass))!;
  const second = (await issueRecoveryCode(who, pass))!;
  expect(await recoverAccount(who, first.code, 'replacement password')).toBe(false);
  await c.control.execute("UPDATE recovery_codes SET expires_at='2000-01-01'");
  expect(await recoverAccount(who, second.code, 'replacement password')).toBe(false);
  expect((await a.checkPassword(who, pass)).ok).toBe(true);
});
it('only one concurrent redemption changes credentials', async () => {
  const { code } = (await issueRecoveryCode(who, pass))!;
  expect((await Promise.all([recoverAccount(who, code, 'first replacement'), recoverAccount(who, code, 'second replacement')])).filter(Boolean)).toHaveLength(1);
});
it('rechecks revocation after password hashing', async () => {
  const { code } = (await issueRecoveryCode(who, pass))!;
  const original = a.hashPassword;
  const spy = vi.spyOn(a, 'hashPassword').mockImplementationOnce(async p => {
    await c.control.execute('DELETE FROM recovery_codes');
    return original(p);
  });
  try { expect(await recoverAccount(who, code, 'replacement password')).toBe(false); }
  finally { spy.mockRestore(); }
  expect((await a.checkPassword(who, pass)).ok).toBe(true);
});
it('normal password changes atomically revoke codes and sessions', async () => {
  const { code } = (await issueRecoveryCode(who, pass))!;
  const session = await a.startSession(who);
  expect(await changeOwnPassword(who, 'incorrect password', 'replacement password')).toBe(false);
  expect(await changeOwnPassword(who, pass, 'replacement password')).toBe(true);
  expect(await a.sessionEmail(session)).toBeNull();
  expect(await recoverAccount(who, code, 'another replacement')).toBe(false);
});
