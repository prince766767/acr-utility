import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ URL });
vm.runInContext(readFileSync(new URL('../sw_rules.js', import.meta.url), 'utf8'), ctx);
const shouldCache = ctx.shouldCache;
const networkFirst = ctx.networkFirst;
const ORIGIN = 'https://someone.github.io';

test('own files are cached', () => {
  assert.equal(shouldCache('https://someone.github.io/acr/app.js', ORIGIN), true);
  assert.equal(shouldCache('https://someone.github.io/acr/', ORIGIN), true);
});
test('Firebase SDK is cached (app.js imports it at load)', () => {
  assert.equal(shouldCache('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js', ORIGIN), true);
});
test('Google APIs and sign-in are never cached', () => {
  for (const u of [
    'https://www.googleapis.com/drive/v3/files?q=x',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    'https://accounts.google.com/gsi/client',
    'https://www.gstatic.com/other/thing.js',
    'https://someone.github.io.evil.example/app.js',
  ]) assert.equal(shouldCache(u, ORIGIN), false, u);
});

test('the earlier v0.4 utility is never cached (it always loads fresh, as before)', () => {
  assert.equal(shouldCache('https://someone.github.io/acr-utility/v0.4/', ORIGIN), false);
  assert.equal(shouldCache('https://someone.github.io/acr-utility/v0.4/index.html', ORIGIN), false);
  assert.equal(shouldCache('https://someone.github.io/acr-utility/v0.4', ORIGIN), false); // GitHub redirects this to v0.4/
  assert.equal(shouldCache('https://someone.github.io/acr-utility/v0.45.js', ORIGIN), true);
});

test('only the Client ID file is fetched network-first', () => {
  assert.equal(networkFirst('https://someone.github.io/acr/google-config.js', ORIGIN), true);
  assert.equal(networkFirst('https://someone.github.io/google-config.js', ORIGIN), true);
  for (const u of [
    'https://someone.github.io/acr/app.js',
    'https://other.example/acr/google-config.js',
    'https://someone.github.io/acr/google-config.js.bak',
  ]) assert.equal(networkFirst(u, ORIGIN), false, u);
});
test('sw.js: every precached asset exists and both rules are used', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const list = /const ASSETS=\[([^\]]*)\]/.exec(sw)[1].match(/'[^']*'/g).map(x => x.slice(1, -1));
  assert.ok(list.length > 5);
  for (const a of list.filter(a => a !== './')) assert.ok(existsSync(new URL('../' + a, import.meta.url)), a);
  assert.ok(sw.includes('shouldCache(') && sw.includes('networkFirst('));
});

test('a new version takes over at once and the page reloads once, only on updates', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /addEventListener\('install',event=>\{self\.skipWaiting\(\);/);
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  // reload only when a previous version was in control (an update), and only once
  assert.match(app, /const hadController=Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(app, /controllerchange',\(\)=>\{if\(!hadController\|\|reloaded\)return;reloaded=true;location\.reload\(\);\}/);
});
