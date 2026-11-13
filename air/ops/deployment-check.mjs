import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function readEnv(file) {
  const env = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error('Unsupported env syntax');
    const [, key, value] = match;
    env[key] = value.replace(/^(["'])(.*)\1$/, '$2');
  }
  return env;
}
export function checkDeployment(env) {
  const origin = new URL(env.PUBLIC_URL ?? '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('PUBLIC_URL must be the exact HTTPS origin');
  for (const key of ['AUTH_DEV_EMAIL','PREVIEW_OPEN_AS','PREVIEW_PASSWORD','CASA_PROJECT']) if (env[key]) throw new Error(`${key} must be empty for deployment`);
  if (!!env.CF_ACCESS_TEAM_DOMAIN !== !!env.CF_ACCESS_AUD) throw new Error('Cloudflare Access requires both values or neither');
  if (env.CF_ACCESS_AUD === 'replace-me' || env.CF_ACCESS_TEAM_DOMAIN === 'example.cloudflareaccess.com') throw new Error('Replace the Cloudflare placeholders or clear both fields');
  if (env.CASA_SETUP_TOKEN && env.CASA_SETUP_TOKEN.length < 32) throw new Error('CASA_SETUP_TOKEN is too short');
  return origin.origin;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { checkDeployment(readEnv(process.argv[2])); console.log('Deployment environment: ok'); }
  catch (e) { console.error(`Deployment refused: ${e.message}`); process.exitCode=1; }
}
