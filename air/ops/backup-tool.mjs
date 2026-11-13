/** Offline snapshot/restore tool. The caller MUST stop every app writer before snapshot(). */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, cp, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const MAGIC = Buffer.from('CASABACKUP2\n');
const HEADER = MAGIC.length + 32 + 12;
const safe = (p) => typeof p === 'string' && /^[a-zA-Z0-9_./-]+$/.test(p) && !p.startsWith('/') && !p.split('/').some(x => x === '..' || x === '');
const sql = (file, query) => JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', file, query], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }) || '[]');
async function hash(file) { const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex'); }
async function files(root, prefix = '') {
  const result = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (!safe(p)) throw new Error('Unsafe backup path');
    const s = await lstat(join(root, p));
    if (s.isDirectory()) result.push(...await files(root, p));
    else if (s.isFile()) result.push(p);
    else throw new Error('Backup refuses symlinks and special files');
  }
  return result;
}
function describeDB(file) {
  if (sql(file, 'PRAGMA integrity_check;')[0]?.integrity_check !== 'ok') throw new Error('Database integrity check failed');
  if (sql(file, 'PRAGMA foreign_key_check;').length) throw new Error('Database foreign key check failed');
  const tables = {};
  for (const { name } of sql(file, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
    tables[name] = sql(file, `SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`)[0].n;
  }
  return { version: sql(file, 'PRAGMA user_version;')[0].user_version, tables };
}
async function exists(path) { try { await stat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }

export async function snapshot(source, target, image = 'unknown') {
  if (await exists(target)) throw new Error('Snapshot target already exists');
  await mkdir(target, { recursive: true, mode: 0o700 });
  const dbs = ['control.db'];
  for (const { id } of sql(join(source, 'control.db'), 'SELECT id FROM projects ORDER BY id')) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Unsafe project id');
    dbs.push(`p/${id}/casa.db`);
  }
  for (const p of dbs) {
    await mkdir(dirname(join(target, p)), { recursive: true, mode: 0o700 });
    // VACUUM operates on the source with SQLite locks; the stopped app also makes photos consistent.
    execFileSync('sqlite3', [join(source, p), `VACUUM INTO '${join(target, p).replaceAll("'", "''")}'`]);
    if (p !== 'control.db') {
      const photos = join(dirname(p), 'photos');
      if (await exists(join(source, photos))) {
        await files(join(source, photos)); // Refuse links before copying anything.
        await cp(join(source, photos), join(target, photos), { recursive: true, errorOnExist: true, force: false });
      }
    }
  }
  const manifest = { format: 2, createdAt: new Date().toISOString(), image, databases: {}, files: {} };
  for (const p of dbs) manifest.databases[p] = describeDB(join(target, p));
  for (const p of await files(target)) manifest.files[p] = { sha256: await hash(join(target, p)), bytes: (await stat(join(target, p))).size };
  await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  await verify(target);
  return manifest;
}

export async function verify(root) {
  const m = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (m.format !== 2 || !m.databases?.['control.db'] || !m.files?.['control.db']) throw new Error('Unknown or incomplete manifest');
  const actual = (await files(root)).filter(p => p !== 'manifest.json').sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(m.files).sort())) throw new Error('Backup file set mismatch');
  for (const p of actual) {
    if ((await stat(join(root, p))).size !== m.files[p].bytes || await hash(join(root, p)) !== m.files[p].sha256) throw new Error('Backup file checksum mismatch');
  }
  const expected = ['control.db', ...sql(join(root, 'control.db'), 'SELECT id FROM projects ORDER BY id').map(({ id }) => `p/${id}/casa.db`)].sort();
  if (JSON.stringify(Object.keys(m.databases).sort()) !== JSON.stringify(expected)) throw new Error('Missing project database');
  for (const p of expected) {
    if (!safe(p) || !m.files[p] || JSON.stringify(describeDB(join(root, p))) !== JSON.stringify(m.databases[p])) throw new Error('Database contents mismatch');
    if (p === 'control.db') continue;
    for (const row of sql(join(root, p), 'SELECT property_id, sha256 FROM photos')) {
      const photo = `${dirname(p)}/photos/${row.property_id}/${row.sha256}.jpg`;
      if (!safe(photo) || !m.files[photo]) throw new Error('A retained photo is missing');
    }
  }
  return m;
}

async function passwordKey(passFile, salt) {
  const s = await stat(passFile);
  if ((s.mode & 0o077) !== 0) throw new Error('Passphrase file must have mode 600');
  const pass = (await readFile(passFile, 'utf8')).replace(/\r?\n$/, '');
  if (pass.length < 16) throw new Error('Backup passphrase is too short');
  return scryptSync(pass, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
export async function pack(root, output, passFile) {
  await verify(root);
  const salt = randomBytes(32), iv = randomBytes(12);
  const header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', await passwordKey(passFile, salt), iv);
  cipher.setAAD(header);
  await writeFile(output, header, { flag: 'wx', mode: 0o600 });
  const tar = spawn('tar', ['-czf', '-', '-C', root, '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
  tar.stderr.resume();
  const done = new Promise((res, rej) => { tar.on('error', rej); tar.on('close', code => code === 0 ? res() : rej(new Error('Archive creation failed'))); });
  try {
    await Promise.all([pipeline(tar.stdout, cipher, createWriteStream(output, { flags: 'a' })), done]);
    await appendFile(output, cipher.getAuthTag());
    const f = await open(output, 'r+'); try { await f.sync(); } finally { await f.close(); }
  } catch (e) { tar.kill(); await rm(output, { force: true }); throw e; }
}

/** Authenticate the entire ciphertext BEFORE tar sees plaintext. Restore only into a new directory. */
export async function restore(archive, target, passFile) {
  if (await exists(target)) throw new Error('Restore target already exists');
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const scratch = await mkdtemp(join(dirname(target), '.casa-restore-'));
  const compressed = join(scratch, 'data.tar.gz');
  let created = false;
  try {
    const f = await open(archive, 'r');
    const head = Buffer.alloc(HEADER), tag = Buffer.alloc(16);
    let size;
    try {
      size = (await f.stat()).size;
      if (size <= HEADER + 16) throw new Error('Truncated archive');
      await f.read(head, 0, HEADER, 0); await f.read(tag, 0, 16, size - 16);
    } finally { await f.close(); }
    if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unsupported archive format');
    const decipher = createDecipheriv('aes-256-gcm', await passwordKey(passFile, head.subarray(MAGIC.length, MAGIC.length + 32)), head.subarray(-12));
    decipher.setAAD(head); decipher.setAuthTag(tag);
    await pipeline(createReadStream(archive, { start: HEADER, end: size - 17 }), decipher, createWriteStream(compressed, { mode: 0o600, flags: 'wx' }));
    const entries = execFileSync('tar', ['-tzf', compressed], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim().split('\n');
    const verbose = execFileSync('tar', ['-tvzf', compressed], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim().split('\n');
    const paths = entries.map(p => p.replace(/^\.\//, '').replace(/\/$/, '')).filter(Boolean);
    if (paths.some(p => !safe(p)) || new Set(paths).size !== paths.length || verbose.some(p => !['-', 'd'].includes(p[0]))) throw new Error('Unsafe archive entries');
    await mkdir(target, { mode: 0o700 }); created = true;
    execFileSync('tar', ['-xzf', compressed, '-C', target]);
    return await verify(target);
  } catch (e) { if (created) await rm(target, { recursive: true, force: true }); throw e; }
  finally { await rm(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, a, b, c] = process.argv.slice(2);
  try {
    if (command === 'snapshot') await snapshot(a, b, c);
    else if (command === 'pack') await pack(a, b, c);
    else if (command === 'restore') await restore(a, b, c);
    else if (command === 'verify') await verify(a);
    else if (command === 'verify-archive') {
      const scratch = await mkdtemp(join(process.env.CASA_SCRATCH ?? tmpdir(), 'casa-check-'));
      try { await restore(a, join(scratch, 'data'), b); } finally { await rm(scratch, { recursive: true, force: true }); }
    } else throw new Error('Usage: snapshot data target [image] | pack snapshot archive passfile | restore archive new-directory passfile | verify directory | verify-archive archive passfile');
    console.log(JSON.stringify({ ok: true, operation: command }));
  } catch (e) { console.error(`Backup ${command ?? 'command'} failed: ${e.message}`); process.exitCode = 1; }
}
