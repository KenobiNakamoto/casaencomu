/** Destructive only to a dedicated restored TEST instance with the fixed test setup key below. */
import assert from 'node:assert/strict';
const origin = process.env.CASA_TEST_ORIGIN;
if (process.env.CASA_SMOKE_TEST !== '1' || !origin?.startsWith('https://')) throw new Error('Set CASA_SMOKE_TEST=1 and CASA_TEST_ORIGIN to an isolated HTTPS instance');
const email = 'release-test@example.com';
const original = 'fictional release test password';
let cookies = '';
const decode = s => s.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const attrs = s => Object.fromEntries([...s.matchAll(/([^\s=]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
async function request(path, options = {}) {
  const r = await fetch(origin + path, { redirect: 'manual', ...options, headers: { origin, ...(cookies ? { cookie: cookies } : {}), ...options.headers } });
  const set = r.headers.getSetCookie();
  if (set.length) {
    for (const item of set) if (item.startsWith('casa_s=')) {
      if (item.split(';')[0] !== 'casa_s=') assert.match(item, /; Secure/i);
      cookies = item.split(';')[0];
    }
  }
  return { status: r.status, location: r.headers.get('location'), html: await r.text(), set };
}
async function post(path, label, values) {
  const page = await request(path);
  assert.equal(page.status, 200);
  const form = [...page.html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m => m[0]).find(s => s.includes(label));
  assert.ok(form, `Missing test form: ${label}`);
  const data = new FormData();
  for (const match of form.matchAll(/<input\b[^>]*>/g)) {
    const a = attrs(match[0]);
    if (a.type === 'hidden' && a.name) data.append(a.name, a.value ?? '');
  }
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return request(path, { method: 'POST', body: data });
}
const health = await request('/api/health'); assert.equal(health.status, 200); assert.equal(JSON.parse(health.html).ok, true);
const signup = await post('/entrar', 'instalacion', { instalacion: 'synthetic-release-test-setup-key-32-characters', nombre: 'Release test', correo: email, clave: original });
assert.equal(signup.status, 303, 'Test-only setup key refused: stop; never use this on the live installation');
assert.match(cookies, /^casa_s=.{32}/);
assert.equal((await request('/propiedades')).status, 200);
console.log('PASS setup, Secure session cookie, restored properties');
const generated = await post('/ajustes', 'Crear código de recuperación', { clave: original });
assert.equal(generated.status, 200);
const code = generated.html.match(/<textarea[^>]*>([a-f0-9]{8}(?:-[a-f0-9]{8}){7})<\/textarea>/)?.[1];
assert.ok(code, 'Recovery code displayed once');
const oldCookie = cookies;
await request('/salir'); cookies = '';
const recovered = await post('/recuperar', 'Cambiar la clave', { correo: email, codigo: code, clave: 'new fictional release password' });
assert.equal(recovered.status, 200); assert.match(recovered.html, /Clave cambiada/);
assert.match((await request('/propiedades', { headers: { cookie: oldCookie } })).location ?? '', /\/entrar/);
const reused = await post('/recuperar', 'Cambiar la clave', { correo: email, codigo: code, clave: 'another fictional release password' });
assert.match(reused.html, /no son válidos/);
const oldLogin = await post('/entrar', '>Entrar<', { correo: email, clave: original, a: '/' });
assert.equal(oldLogin.status, 200); assert.match(oldLogin.html, /no son correctos/);
const login = await post('/entrar', '>Entrar<', { correo: email, clave: 'new fictional release password', a: '/ajustes' });
assert.equal(login.status, 303); assert.equal(login.location, '/ajustes');
assert.equal((await request('/ajustes')).status, 200);
console.log('PASS recovery, code reuse refusal, old password refusal, revoked session, new login');
await request('/salir'); cookies = '';
const forged = await request('/entrar', { headers: { 'x-user-email': email } });
assert.doesNotMatch(forged.html, /Entras como/);
console.log('PASS logout and anonymous identity stripping');
