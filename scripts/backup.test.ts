import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, expect, it } from 'vitest';
// Standalone operational module, deliberately independent of the app bundle.
import { snapshot, pack, restore, verify } from '../air/ops/backup-tool.mjs';
const root = await mkdtemp(join(tmpdir(), 'casa-backup-test-'));
const source = join(root, 'source'), snap = join(root, 'snapshot'), pass = join(root, 'pass');
await mkdir(join(source, 'p/test/photos/home'), {recursive:true});
await writeFile(pass, 'fictional-test-backup-passphrase', {mode:0o600});
const sqlite = (file: string, sql: string) => execFileSync('sqlite3', [file, sql]);
sqlite(join(source, 'control.db'), "CREATE TABLE projects(id TEXT PRIMARY KEY); INSERT INTO projects VALUES('test'); CREATE TABLE accounts(email TEXT, password_hash TEXT);");
sqlite(join(source, 'p/test/casa.db'), "CREATE TABLE properties(id TEXT); INSERT INTO properties VALUES('home'); CREATE TABLE photos(property_id TEXT, sha256 TEXT); INSERT INTO photos VALUES('home','abc'); PRAGMA user_version=10;");
await writeFile(join(source, 'p/test/photos/home/abc.jpg'), 'fictional photo bytes');
afterAll(() => rm(root, {recursive:true,force:true}));
it('restores every database, schema version, row count and photo byte', async () => {
  await snapshot(source, snap, 'test-image');
  const archive=join(root,'good.casa2'), target=join(root,'restored');
  await pack(snap, archive, pass);
  const manifest=await restore(archive,target,pass);
  expect(manifest.image).toBe('test-image');
  expect(manifest.databases['p/test/casa.db'].version).toBe(10);
  expect(manifest.databases['p/test/casa.db'].tables.properties).toBe(1);
  expect(await readFile(join(target,'p/test/photos/home/abc.jpg'),'utf8')).toBe('fictional photo bytes');
  await expect(restore(archive,target,pass)).rejects.toThrow('already exists');
});
it('rejects changed ciphertext and a wrong passphrase before creating restored files', async () => {
  const bytes=await readFile(join(root,'good.casa2')); bytes[90]^=1;
  const damaged=join(root,'damaged.casa2'); await writeFile(damaged,bytes);
  await expect(restore(damaged,join(root,'bad'),pass)).rejects.toThrow();
  const wrong=join(root,'wrong'); await writeFile(wrong,'another-test-passphrase',{mode:0o600});
  await expect(restore(join(root,'good.casa2'),join(root,'wrong-target'),wrong)).rejects.toThrow();
});
it('detects a missing retained photo and refuses to publish an incomplete snapshot', async () => {
  await rm(join(source,'p/test/photos/home/abc.jpg'));
  await expect(snapshot(source,join(root,'missing'))).rejects.toThrow('retained photo');
  await rm(join(snap,'p/test/photos/home/abc.jpg'));
  await expect(verify(snap)).rejects.toThrow('file set');
});
