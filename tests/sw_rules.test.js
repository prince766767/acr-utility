import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ URL });
vm.runInContext(readFileSync(new URL('../sw_rules.js', import.meta.url), 'utf8'), ctx);
const shouldCache = ctx.shouldCache;
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
