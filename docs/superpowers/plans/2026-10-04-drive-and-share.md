# Save to Google Drive and Share / Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the Review tab, a teacher can save the filled ACR (DOCX + PDF) to their own Google Drive, or share/email both files to themselves through the system share sheet.

**Architecture:** Three new small ES modules:

- `file_names.js`: file names.
- `share.js`: Web Share API with a download fallback.
- `google_drive.js`:
  - a GIS token source with the `drive.file` scope, token kept in memory
  - Drive REST helpers that take an injected `fetch` and `getToken`
  - the PDF is made by uploading the DOCX as a temporary Google Doc, exporting it, then deleting it

`app.js` wires them to two new buttons. `sw.js` stops caching cross-origin requests, except the Firebase SDK, through a pure `shouldCache` rule in `sw_rules.js`.

**Tech Stack:** Vanilla JS ES modules, Google Identity Services (`https://accounts.google.com/gsi/client`), Google Drive REST API v3, Web Share API Level 2, `node --test` (Node 24: `fetch`, `Response`, `Blob`, `File` are globals).

**Spec:** `docs/superpowers/specs/2026-10-04-drive-and-share-design.md`

## Global Constraints

- No server of ours. Everything runs in the browser.
- OAuth scope is exactly `https://www.googleapis.com/auth/drive.file`. No other scope.
- The access token is kept in memory only. It is never written to localStorage, sessionStorage, IndexedDB or the SW cache.
- Drive folder name: `ACR Utility`. Saving the same file name again **replaces** the file in that folder.
- Temporary Google Doc name: `ACR temp (safe to delete)`. It is always deleted after export, including when the export fails.
- File name for all three buttons: `ACR_<name>_<session>.<ext>`. Fallbacks are `noname` and `draft`.
- Hosting: GitHub Pages. Test origin: `http://localhost:8765`.
- The new buttons are not shown while `google-config.js` holds the placeholder Client ID (`YOUR_CLIENT_ID...`).
- The new buttons follow the same "problems" disable rule as Download.
- The header Firebase sign-in/out buttons are hidden. Their code is kept behind `SHOW_FIREBASE_SIGNIN=false`.
- `generate_acr.py` and `docx_engine.js` are not changed.
- Existing suites must stay green: `npm test` (81 JS) and `python -m unittest discover -s tests` (55 Python).
- Ask the user before starting the local web server (`python -m http.server 8765`). Stop it and close the browser when done. Clear the service worker and caches in the test browser after editing app files.
- Commit after each task, on branch `feature/drive-share`. Merge to master only when the user says so.

## Deviation from spec, found while planning (tell the user)

**Browsers only open popups and share sheets right after a tap.** Google's sign-in popup and `navigator.share` both need a recent tap ("transient user activation", about 5 s in Chrome).

- **Sign-in:** the handlers ask for the token **first**, before the slow DOCX and PDF work, and the GIS script is preloaded at page start.
- **Sharing:** making the PDF can take longer than 5 s. If `navigator.share` throws `NotAllowedError`, the app shows an **"Open share menu"** button, and the user taps it to share the files already made.
- **One button for both cases:** the same button doubles as **"Share the Word file only"** when the PDF fails.
- **Cache name:** the spec's `CACHE` bump to `acr-utility-v0-8` happens in Task 2. Task 5 bumps it again to `v0-9` when the new modules join `ASSETS`. `addAll` fails the SW install if a listed file does not exist yet.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `file_names.js` | new | `acrFileName(d, ext)` |
| `sw_rules.js` | new (classic script) | `shouldCache(url, origin)` |
| `sw.js` | modify | use `shouldCache`, update `ASSETS`, bump `CACHE` |
| `google_drive.js` | new | `SCOPE`, `FOLDER_NAME`, `DriveError`, `loadGis()`, `createTokenSource()`, `createDrive()` |
| `share.js` | new | `downloadFile(file)`, `shareFiles(files, {title}, env)` |
| `google-config.js` | new | `{ clientId }` placeholder |
| `app.js` | modify | `makeDocx`, button handlers, busy/blocked state, hide header buttons |
| `index.html` | modify | new buttons, help line, hide header buttons |
| `styles.css` | modify | `.docx-actions` row |
| `docs/google-drive-setup.md` | new | Google Cloud setup steps for the user |
| `tests/file_names.test.js`, `tests/sw_rules.test.js`, `tests/google_drive.test.js`, `tests/share.test.js` | new | unit tests |

---

### Task 1: Branch, file names, Download uses the new name

**Files:**
- Create: `file_names.js`, `tests/file_names.test.js`
- Modify: `app.js` (imports at top; Download handler at about line 186-200)

**Interfaces:**
- Produces: `acrFileName(d: {session?:string, profile?:{fullName?:string}}, ext: string): string`

- [ ] **Step 1: Create the branch and commit the spec and plan**

```bash
cd C:/Users/princ/Downloads/ACR_Utility_v0_3/ACR_Utility_v0_3
git checkout -b feature/drive-share
git add docs/superpowers/specs/2026-10-04-drive-and-share-design.md docs/superpowers/plans/2026-10-04-drive-and-share.md
git commit -m "docs: spec and plan for Save to Google Drive and Share / Email"
```

- [ ] **Step 2: Write the failing test** `tests/file_names.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acrFileName } from '../file_names.js';

test('name and session', () => {
  assert.strictEqual(acrFileName({ session: '2025-26', profile: { fullName: 'Ravi Kumar' } }, 'docx'), 'ACR_Ravi_Kumar_2025-26.docx');
});
test('runs of other characters become one underscore, ends trimmed', () => {
  assert.strictEqual(acrFileName({ session: '2025-26', profile: { fullName: '  Dr. A/B   Singh, ' } }, 'pdf'), 'ACR_Dr._A_B_Singh_2025-26.pdf');
});
test('Devanagari names are kept (letters + combining marks)', () => {
  assert.strictEqual(acrFileName({ session: '2025-26', profile: { fullName: 'रवि कुमार' } }, 'docx'), 'ACR_रवि_कुमार_2025-26.docx');
});
test('empty parts fall back', () => {
  assert.strictEqual(acrFileName({}, 'docx'), 'ACR_noname_draft.docx');
  assert.strictEqual(acrFileName({ session: '', profile: { fullName: '///' } }, 'pdf'), 'ACR_noname_draft.pdf');
  assert.strictEqual(acrFileName(undefined, 'pdf'), 'ACR_noname_draft.pdf');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/file_names.test.js`
Expected: FAIL with `Cannot find module ... file_names.js`

- [ ] **Step 4: Implement** `file_names.js`

```js
// File names for the Word file and PDF: ACR_<name>_<session>.<ext>.
const part = (s, fallback) => String(s ?? '').replace(/[^\p{L}\p{M}\p{N}.-]+/gu, '_').replace(/^_+|_+$/g, '') || fallback;

export function acrFileName(d, ext) {
  return `ACR_${part(d?.profile?.fullName, 'noname')}_${part(d?.session, 'draft')}.${ext}`;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test tests/file_names.test.js`
Expected: 4 tests PASS

- [ ] **Step 6: Make the Download button use it**

In `app.js`, add after the `docx_engine.js` import line:

```js
import { acrFileName } from './file_names.js';
```

In the `downloadDocxBtn` handler, replace

```js
    const name=`ACR_${d.session||'draft'}.docx`;
```

with

```js
    const name=acrFileName(d,'docx');
```

- [ ] **Step 7: Run all JS tests**

Run: `npm test`
Expected: all pass (81 old + 4 new)

- [ ] **Step 8: Commit**

```bash
git add file_names.js tests/file_names.test.js app.js
git commit -m "feat: Word file named ACR_<name>_<session>"
```

---

### Task 2: Service worker caches only the app's own files (+ Firebase SDK)

**Files:**
- Create: `sw_rules.js`, `tests/sw_rules.test.js`
- Modify: `sw.js` (all 5 lines)

**Interfaces:**
- Produces: the global `shouldCache(url: string, origin: string): boolean` (classic script, loaded by `importScripts`)

- [ ] **Step 1: Write the failing test** `tests/sw_rules.test.js`

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/sw_rules.test.js`
Expected: FAIL with `ENOENT ... sw_rules.js`

- [ ] **Step 3: Implement** `sw_rules.js`

```js
// Which GET requests the service worker answers from its cache (sw.js; tests/sw_rules.test.js).
// Only the app's own files and the Firebase SDK; Google API replies hold the teacher's data and must never be cached.
function shouldCache(url, origin) {
  const u = new URL(url);
  return u.origin === origin || u.href.startsWith('https://www.gstatic.com/firebasejs/');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/sw_rules.test.js`
Expected: 3 tests PASS

- [ ] **Step 5: Use it in** `sw.js`

Replace the whole file with:

```js
importScripts('./sw_rules.js');
const CACHE='acr-utility-v0-8';
const ASSETS=['./','./index.html','./styles.css','./app.js','./api_tally.js','./api_ui.js','./acr_fields.js','./sessions.js','./last_year_ui.js','./docx_engine.js','./file_names.js','./sw_rules.js','./vendor/jszip.min.js','./ACR_EMPLOYEE_MASTER.docx','./firebase-config.js','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||!shouldCache(event.request.url,self.location.origin))return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(resp=>{const clone=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));return resp;}).catch(()=>caches.match('./index.html'))));});
```

After replacing, run `git diff sw.js`. The only changes must be the `importScripts` line, the `CACHE` value, the two new `ASSETS` entries, and the `||!shouldCache(...)` guard in the fetch handler. The install, activate and the rest of fetch must be unchanged.

- [ ] **Step 6: Run all JS tests**

Run: `npm test`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add sw_rules.js tests/sw_rules.test.js sw.js
git commit -m "fix: service worker no longer caches other sites' replies (keeps Firebase SDK offline)"
```

---

### Task 3: `google_drive.js` (token source + Drive helpers)

**Files:**
- Create: `google_drive.js`, `tests/google_drive.test.js`

**Interfaces:**
- Produces:
  - `SCOPE = 'https://www.googleapis.com/auth/drive.file'`
  - `FOLDER_NAME = 'ACR Utility'`
  - `class DriveError extends Error { status: number }`
  - `loadGis(): Promise<google.accounts.oauth2>`: browser only, not unit tested
  - `createTokenSource({clientId, gis: () => Promise<oauth2>, now?: () => number}) → { getToken({fresh?:boolean}={}): Promise<string>, preload(): Promise<void> }`
  - `createDrive({fetch, getToken}) → { ensureFolder(): Promise<string /*folderId*/>, upsertFile({name, bytes: Blob|Uint8Array, mime, folderId}): Promise<{id,name}>, docxToPdf(docx: Blob|Uint8Array): Promise<Uint8Array> }`

- [ ] **Step 1: Write the failing tests** `tests/google_drive.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDrive, createTokenSource, DriveError, SCOPE, FOLDER_NAME } from '../google_drive.js';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// Replies are handed out in order; every request is recorded.
function fakeFetch(replies) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if (!replies.length) throw new Error('unexpected request ' + url);
    return replies.shift();
  };
  f.calls = calls;
  return f;
}
function tokens(...list) {
  const asked = [];
  const getToken = async (opts = {}) => { asked.push(opts); return list[Math.min(asked.length - 1, list.length - 1)]; };
  getToken.asked = asked;
  return getToken;
}
const query = url => new URL(url).searchParams.get('q');
const bodyText = async b => (b instanceof Blob ? await b.text() : String(b));

test('ensureFolder reuses an existing folder', async () => {
  const fetch = fakeFetch([json({ files: [{ id: 'F1', name: FOLDER_NAME }] })]);
  const id = await createDrive({ fetch, getToken: tokens('T1') }).ensureFolder();
  assert.equal(id, 'F1');
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].method, 'GET');
  assert.equal(fetch.calls[0].headers.Authorization, 'Bearer T1');
  assert.equal(query(fetch.calls[0].url), "name='ACR Utility' and mimeType='application/vnd.google-apps.folder' and trashed=false");
});

test('ensureFolder creates the folder when none is found', async () => {
  const fetch = fakeFetch([json({ files: [] }), json({ id: 'F2' })]);
  const id = await createDrive({ fetch, getToken: tokens('T1') }).ensureFolder();
  assert.equal(id, 'F2');
  assert.equal(fetch.calls[1].method, 'POST');
  assert.ok(fetch.calls[1].url.startsWith(API));
  assert.deepEqual(JSON.parse(fetch.calls[1].body), { name: 'ACR Utility', mimeType: 'application/vnd.google-apps.folder' });
});

test('upsertFile replaces an existing file and trashes duplicates', async () => {
  const fetch = fakeFetch([json({ files: [{ id: 'A' }, { id: 'B' }] }), json({ id: 'A', name: 'x.docx' }), json({ id: 'B' })]);
  const out = await createDrive({ fetch, getToken: tokens('T1') }).upsertFile({ name: 'x.docx', bytes: new Uint8Array([1, 2]), mime: 'application/x-test', folderId: 'F1' });
  assert.deepEqual(out, { id: 'A', name: 'x.docx' });
  assert.equal(query(fetch.calls[0].url), "name='x.docx' and 'F1' in parents and trashed=false");
  assert.equal(fetch.calls[1].method, 'PATCH');
  assert.ok(fetch.calls[1].url.startsWith(`${UPLOAD}/A?uploadType=media`));
  assert.equal(fetch.calls[1].headers['Content-Type'], 'application/x-test');
  assert.equal(fetch.calls[2].method, 'PATCH');
  assert.ok(fetch.calls[2].url.startsWith(`${API}/B`));
  assert.deepEqual(JSON.parse(fetch.calls[2].body), { trashed: true });
});

test('upsertFile creates a new file in the folder', async () => {
  const fetch = fakeFetch([json({ files: [] }), json({ id: 'N', name: 'x.pdf' })]);
  const out = await createDrive({ fetch, getToken: tokens('T1') }).upsertFile({ name: 'x.pdf', bytes: new Uint8Array([37, 80]), mime: 'application/pdf', folderId: 'F1' });
  assert.deepEqual(out, { id: 'N', name: 'x.pdf' });
  assert.equal(fetch.calls[1].method, 'POST');
  assert.ok(fetch.calls[1].url.startsWith(`${UPLOAD}?uploadType=multipart`));
  assert.match(fetch.calls[1].headers['Content-Type'], /^multipart\/related; boundary=/);
  const text = await bodyText(fetch.calls[1].body);
  assert.ok(text.includes('"name":"x.pdf"') && text.includes('"parents":["F1"]'), text);
  assert.ok(text.includes('Content-Type: application/pdf'), text);
});

test('quotes and backslashes in names are escaped in the query', async () => {
  const fetch = fakeFetch([json({ files: [] }), json({ id: 'N', name: "O'Brien\\x.docx" })]);
  await createDrive({ fetch, getToken: tokens('T1') }).upsertFile({ name: "O'Brien\\x.docx", bytes: new Uint8Array([1]), mime: 'a/b', folderId: 'F1' });
  assert.equal(query(fetch.calls[0].url), "name='O\\'Brien\\\\x.docx' and 'F1' in parents and trashed=false");
});

test('docxToPdf converts, exports, and deletes the temporary Doc', async () => {
  const pdf = new Uint8Array([37, 80, 68, 70]);
  const fetch = fakeFetch([json({ id: 'T' }), new Response(pdf), new Response(null, { status: 204 })]);
  const out = await createDrive({ fetch, getToken: tokens('T1') }).docxToPdf(new Uint8Array([80, 75]));
  assert.deepEqual([...out], [...pdf]);
  const meta = await bodyText(fetch.calls[0].body);
  assert.ok(meta.includes('"mimeType":"application/vnd.google-apps.document"') && meta.includes('"name":"ACR temp (safe to delete)"'), meta);
  assert.ok(fetch.calls[0].url.startsWith(`${UPLOAD}?uploadType=multipart`));
  assert.equal(fetch.calls[1].url, `${API}/T/export?mimeType=application%2Fpdf`);
  assert.equal(fetch.calls[2].method, 'DELETE');
  assert.equal(fetch.calls[2].url, `${API}/T`);
});

test('docxToPdf deletes the temporary Doc when the export fails', async () => {
  const fetch = fakeFetch([json({ id: 'T' }), json({ error: { message: 'Export too large' } }, 500), new Response(null, { status: 204 })]);
  await assert.rejects(createDrive({ fetch, getToken: tokens('T1') }).docxToPdf(new Uint8Array([1])),
    e => e instanceof DriveError && e.status === 500 && e.message === 'Export too large');
  assert.equal(fetch.calls[2].method, 'DELETE');
});

test('a failed delete does not hide the export error', async () => {
  const fetch = fakeFetch([json({ id: 'T' }), json({ error: { message: 'Export too large' } }, 500), json({ error: { message: 'nope' } }, 500)]);
  const warn = console.warn; console.warn = () => {};
  try {
    await assert.rejects(createDrive({ fetch, getToken: tokens('T1') }).docxToPdf(new Uint8Array([1])), { message: 'Export too large' });
  } finally { console.warn = warn; }
});

test('a 401 gets one retry with a fresh token', async () => {
  const fetch = fakeFetch([json({ error: { message: 'Invalid Credentials' } }, 401), json({ files: [{ id: 'F' }] })]);
  const getToken = tokens('T1', 'T2');
  assert.equal(await createDrive({ fetch, getToken }).ensureFolder(), 'F');
  assert.deepEqual(getToken.asked, [{}, { fresh: true }]);
  assert.equal(fetch.calls[1].headers.Authorization, 'Bearer T2');
});

test('a second 401 is reported, not retried again', async () => {
  const fetch = fakeFetch([json({ error: { message: 'Invalid Credentials' } }, 401), json({ error: { message: 'Invalid Credentials' } }, 401)]);
  await assert.rejects(createDrive({ fetch, getToken: tokens('T1', 'T2') }).ensureFolder(), e => e instanceof DriveError && e.status === 401);
  assert.equal(fetch.calls.length, 2);
});

test('non-JSON error replies still give a message', async () => {
  const fetch = fakeFetch([new Response('Bad Gateway', { status: 502 })]);
  await assert.rejects(createDrive({ fetch, getToken: tokens('T1') }).ensureFolder(), e => e instanceof DriveError && e.status === 502 && /502/.test(e.message));
});

// --- token source ---
function fakeOauth(replies) {
  const o = { requests: [], config: null };
  o.initTokenClient = cfg => {
    o.config = cfg;
    return {
      requestAccessToken: opts => {
        o.requests.push(opts);
        const r = replies.shift();
        queueMicrotask(() => (r.type ? cfg.error_callback(r) : cfg.callback(r)));
      },
    };
  };
  return o;
}

test('token source asks for drive.file and caches the token until 60 s before expiry', async () => {
  let t = 1_000_000;
  const oauth = fakeOauth([{ access_token: 'A', expires_in: 3600 }, { access_token: 'B', expires_in: 3600 }]);
  const src = createTokenSource({ clientId: 'CID', gis: async () => oauth, now: () => t });
  assert.equal(await src.getToken(), 'A');
  assert.equal(oauth.config.client_id, 'CID');
  assert.equal(oauth.config.scope, SCOPE);
  t += 3500_000; // 100 s before expiry: still cached
  assert.equal(await src.getToken(), 'A');
  t += 50_000; // 50 s before expiry: renewed
  assert.equal(await src.getToken(), 'B');
  assert.equal(oauth.requests.length, 2);
});

test('fresh: true always asks Google again', async () => {
  const oauth = fakeOauth([{ access_token: 'A', expires_in: 3600 }, { access_token: 'B', expires_in: 3600 }]);
  const src = createTokenSource({ clientId: 'CID', gis: async () => oauth });
  assert.equal(await src.getToken(), 'A');
  assert.equal(await src.getToken({ fresh: true }), 'B');
});

test('two calls at once share one sign-in', async () => {
  const oauth = fakeOauth([{ access_token: 'A', expires_in: 3600 }]);
  const src = createTokenSource({ clientId: 'CID', gis: async () => oauth });
  assert.deepEqual(await Promise.all([src.getToken(), src.getToken()]), ['A', 'A']);
  assert.equal(oauth.requests.length, 1);
});

test('closed popup, blocked popup and refusal give clear messages and allow a retry', async () => {
  const oauth = fakeOauth([{ type: 'popup_closed' }, { type: 'popup_failed_to_open' }, { error: 'access_denied' }, { access_token: 'A', expires_in: 3600 }]);
  const src = createTokenSource({ clientId: 'CID', gis: async () => oauth });
  await assert.rejects(src.getToken(), /closed before it finished/);
  await assert.rejects(src.getToken(), /pop-up was blocked/);
  await assert.rejects(src.getToken(), /refused \(access_denied\)/);
  assert.equal(await src.getToken(), 'A');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/google_drive.test.js`
Expected: FAIL with `Cannot find module ... google_drive.js`

- [ ] **Step 3: Implement** `google_drive.js`

```js
// Google sign-in (GIS token client, drive.file only) and the Drive calls the app needs.
// The access token lives in memory only. Network functions take fetch/getToken so tests can fake them.
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_NAME = 'ACR Utility';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GDOC_MIME = 'application/vnd.google-apps.document';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEMP_NAME = 'ACR temp (safe to delete)';

export class DriveError extends Error {
  constructor(status, message) { super(message); this.name = 'DriveError'; this.status = status; }
}

// Loads Google's sign-in script once (browser only).
let gisPromise = null;
export function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const done = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google sign-in could not be loaded (are you online?)')));
    const timer = setTimeout(() => reject(new Error('Google sign-in could not be loaded (are you online?)')), 15000);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => { clearTimeout(timer); done(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('Google sign-in could not be loaded (are you online?)')); };
    document.head.appendChild(s);
  }).catch(err => { gisPromise = null; throw err; });
  return gisPromise;
}

const SIGNIN_ERRORS = {
  popup_closed: 'Google sign-in was closed before it finished.',
  popup_failed_to_open: 'The Google sign-in pop-up was blocked; allow pop-ups for this site and try again.',
};

export function createTokenSource({ clientId, gis, now = () => Date.now() }) {
  let client = null, token = null, expiresAt = 0, pending = null, waiter = null;
  async function ready() {
    if (client) return;
    const oauth2 = await gis();
    client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: r => {
        if (r.error) return waiter?.reject(new Error(`Google sign-in was refused (${r.error}).`));
        token = r.access_token;
        expiresAt = now() + Number(r.expires_in || 0) * 1000;
        waiter?.resolve(token);
      },
      error_callback: e => waiter?.reject(new Error(SIGNIN_ERRORS[e?.type] || `Google sign-in failed (${e?.type || 'unknown'}).`)),
    });
  }
  function getToken({ fresh = false } = {}) {
    if (fresh) token = null;
    if (token && now() < expiresAt - 60000) return Promise.resolve(token);
    if (pending) return pending;
    pending = (async () => {
      await ready();
      return await new Promise((resolve, reject) => { waiter = { resolve, reject }; client.requestAccessToken({ prompt: '' }); });
    })().finally(() => { pending = null; waiter = null; });
    return pending;
  }
  return { getToken, preload: () => ready().catch(err => console.warn(err)) };
}

const escapeQ = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function multipart(meta, bytes, mime) {
  const b = 'acr' + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${b}\r\nContent-Type: ${mime}\r\n\r\n`, bytes, `\r\n--${b}--`,
  ]);
  return { body, type: `multipart/related; boundary=${b}` };
}

async function errorFrom(resp) {
  let msg = '';
  try { msg = (await resp.json())?.error?.message || ''; } catch { /* not JSON */ }
  return new DriveError(resp.status, msg || `Google Drive replied ${resp.status}.`);
}

export function createDrive({ fetch, getToken }) {
  // One authorised call; a 401 gets exactly one retry with a fresh token.
  async function call(url, { method = 'GET', headers = {}, body } = {}) {
    let resp = await fetch(url, { method, headers: { ...headers, Authorization: `Bearer ${await getToken()}` }, body });
    if (resp.status === 401) resp = await fetch(url, { method, headers: { ...headers, Authorization: `Bearer ${await getToken({ fresh: true })}` }, body });
    if (!resp.ok) throw await errorFrom(resp);
    return resp;
  }
  const list = async q => (await (await call(`${API}?${new URLSearchParams({ q, fields: 'files(id,name)', spaces: 'drive' })}`)).json()).files || [];

  async function ensureFolder() {
    const found = await list(`name='${escapeQ(FOLDER_NAME)}' and mimeType='${FOLDER_MIME}' and trashed=false`);
    if (found.length) return found[0].id;
    const r = await call(`${API}?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }) });
    return (await r.json()).id;
  }

  async function upsertFile({ name, bytes, mime, folderId }) {
    const found = await list(`name='${escapeQ(name)}' and '${escapeQ(folderId)}' in parents and trashed=false`);
    let out;
    if (found.length) {
      const r = await call(`${UPLOAD}/${found[0].id}?uploadType=media&fields=id,name`, { method: 'PATCH', headers: { 'Content-Type': mime }, body: new Blob([bytes]) });
      out = await r.json();
      for (const extra of found.slice(1)) {
        await call(`${API}/${extra.id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      }
    } else {
      const m = multipart({ name, parents: [folderId] }, bytes, mime);
      out = await (await call(`${UPLOAD}?uploadType=multipart&fields=id,name`, { method: 'POST', headers: { 'Content-Type': m.type }, body: m.body })).json();
    }
    return { id: out.id, name: out.name };
  }

  async function docxToPdf(docx) {
    const m = multipart({ name: TEMP_NAME, mimeType: GDOC_MIME }, docx, DOCX_MIME);
    const { id } = await (await call(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': m.type }, body: m.body })).json();
    try {
      const r = await call(`${API}/${id}/export?${new URLSearchParams({ mimeType: 'application/pdf' })}`);
      return new Uint8Array(await r.arrayBuffer());
    } finally {
      try { await call(`${API}/${id}`, { method: 'DELETE' }); } catch (err) { console.warn('Temporary Google Doc not deleted:', err); }
    }
  }

  return { ensureFolder, upsertFile, docxToPdf };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test tests/google_drive.test.js`
Expected: 15 tests PASS.

If an assertion about an exact URL fails only because of query-parameter order or encoding, fix the **implementation** so the URL matches the test. The tests pin the URLs on purpose.

- [ ] **Step 5: Run all JS tests**

Run: `npm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add google_drive.js tests/google_drive.test.js
git commit -m "feat: Google sign-in (drive.file) and Drive helpers: folder, replace-upload, PDF via Google Docs"
```

---

### Task 4: `share.js` (share sheet with download fallback)

**Files:**
- Create: `share.js`, `tests/share.test.js`

**Interfaces:**
- Produces:
  - `downloadFile(file: File, doc = document): void`
  - `shareFiles(files: File[], {title}?, env?: {navigator?, download?}): Promise<'shared'|'cancelled'|'needs-tap'|'downloaded'>`

- [ ] **Step 1: Write the failing test** `tests/share.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareFiles } from '../share.js';

const files = [new File([new Uint8Array([1])], 'a.docx'), new File([new Uint8Array([2])], 'a.pdf')];
const err = name => Object.assign(new Error(name), { name });
function env({ canShare = true, share = async () => {} } = {}) {
  const downloaded = [], shared = [];
  return {
    downloaded, shared,
    navigator: canShare === null ? {} : { canShare: () => canShare, share: async data => { shared.push(data); return share(data); } },
    download: f => downloaded.push(f.name),
  };
}

test('shares the files with the title', async () => {
  const e = env();
  assert.equal(await shareFiles(files, { title: 'ACR' }, e), 'shared');
  assert.deepEqual(e.shared[0].files.map(f => f.name), ['a.docx', 'a.pdf']);
  assert.equal(e.shared[0].title, 'ACR');
  assert.deepEqual(e.downloaded, []);
});
test('user closing the share sheet is "cancelled", not an error', async () => {
  assert.equal(await shareFiles(files, {}, env({ share: async () => { throw err('AbortError'); } })), 'cancelled');
});
test('share refused for lack of a recent tap is "needs-tap"', async () => {
  assert.equal(await shareFiles(files, {}, env({ share: async () => { throw err('NotAllowedError'); } })), 'needs-tap');
});
test('no file sharing: both files are downloaded', async () => {
  for (const e of [env({ canShare: false }), env({ canShare: null })]) {
    assert.equal(await shareFiles(files, {}, e), 'downloaded');
    assert.deepEqual(e.downloaded, ['a.docx', 'a.pdf']);
  }
});
test('other share errors are passed on', async () => {
  await assert.rejects(shareFiles(files, {}, env({ share: async () => { throw err('DataError'); } })), { name: 'DataError' });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/share.test.js`
Expected: FAIL with `Cannot find module ... share.js`

- [ ] **Step 3: Implement** `share.js`

```js
// Hand files to the system share sheet (Gmail, Outlook, ...) or, where a browser can't share files, download them.
export function downloadFile(file, doc = document) {
  const a = doc.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  doc.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export async function shareFiles(files, { title } = {}, env = {}) {
  const nav = env.navigator ?? globalThis.navigator;
  const download = env.download ?? (f => downloadFile(f));
  if (nav?.canShare?.({ files })) {
    try { await nav.share({ files, title }); return 'shared'; }
    catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      if (err?.name === 'NotAllowedError') return 'needs-tap';
      throw err;
    }
  }
  for (const f of files) download(f);
  return 'downloaded';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/share.test.js`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add share.js tests/share.test.js
git commit -m "feat: share files through the system share sheet, download where unsupported"
```

---

### Task 5: Wire it into the app (buttons, config, header, SW assets)

**Files:**
- Create: `google-config.js`
- Modify: `index.html` (header lines 18-21; `.docx-box` lines 300-309), `styles.css` (after line 20), `app.js` (imports; `renderFieldProblems` line 155; Download handler line 186-200; Firebase auth line 207), `sw.js` (`CACHE`, `ASSETS`)

**Interfaces:**
- Consumes:
  - `acrFileName(d, ext)` (Task 1)
  - `loadGis`, `createTokenSource`, `createDrive`, `FOLDER_NAME` (Task 3)
  - `shareFiles`, `downloadFile` (Task 4)
  - `generateDocx`, `ProblemsError` (existing `docx_engine.js`)
  - `saveLocal()` (existing; returns the record)

- [ ] **Step 1: Create** `google-config.js`

```js
// Replace with the OAuth Client ID from Google Cloud (see docs/google-drive-setup.md).
// A Client ID is not a secret; Google only accepts it from the web addresses registered for it.
export default { clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com' };
```

- [ ] **Step 2: Update** `index.html`

Header: add `hidden` to the sign-in button:

```html
      <button id="signInBtn" class="secondary hidden">Sign in with Google</button>
      <button id="signOutBtn" class="secondary hidden">Sign out</button>
```

Replace the start of `.docx-box` (the `downloadDocxBtn` button through `docxStatus`) with:

```html
          <div class="docx-box">
            <div class="docx-actions">
              <button type="button" id="downloadDocxBtn">Download Word file (.docx)</button>
              <button type="button" id="shareBtn" class="hidden">Share / Email (DOCX + PDF)</button>
              <button type="button" id="driveBtn" class="hidden">Save to Google Drive</button>
            </div>
            <span id="docxReason" class="muted"></span>
            <p id="docxStatus" class="muted" role="status"></p>
            <button type="button" id="shareNowBtn" class="secondary hidden">Open share menu</button>
```

Inside `<details>`, after the Google Docs paragraph, add:

```html
              <p id="googleRouteHelp" class="hidden">Or use <em>Share / Email</em> or <em>Save to Google Drive</em> above (needs internet and a Google account; the PDF is made by Google Docs and may differ slightly from Word).</p>
```

- [ ] **Step 3: Update** `styles.css`. Add after `.docx-box details{margin-top:8px}`:

```css
.docx-actions{display:flex;gap:8px;flex-wrap:wrap}
#shareNowBtn{margin-top:4px}
```

- [ ] **Step 4: Update** `app.js` **imports and setup**

After the `file_names.js` import, add:

```js
import googleConfig from './google-config.js';
import { loadGis, createTokenSource, createDrive, FOLDER_NAME } from './google_drive.js';
import { shareFiles, downloadFile } from './share.js';
```

After the line `const form=$('acrForm');`, add:

```js
const SHOW_FIREBASE_SIGNIN=false; // header Google/Firebase sign-in is kept for the later cloud-sessions work
const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const googleReady=Boolean(googleConfig?.clientId)&&!googleConfig.clientId.startsWith('YOUR_');
const googleTokens=googleReady?createTokenSource({clientId:googleConfig.clientId,gis:loadGis}):null;
const drive=googleReady?createDrive({fetch:(...a)=>fetch(...a),getToken:o=>googleTokens.getToken(o)}):null;
let docxBlocked=false, docxBusy=false, pendingShare=null;
```

- [ ] **Step 5: Update** `renderFieldProblems`

Replace

```js
  $('downloadDocxBtn').disabled=probs.length>0; $('docxReason').textContent=probs.length?'Fix the problems listed above first.':'';
```

with

```js
  docxBlocked=probs.length>0; syncDocxButtons(); $('docxReason').textContent=probs.length?'Fix the problems listed above first.':'';
```

- [ ] **Step 6: Replace the Download handler** (the whole `$('downloadDocxBtn').addEventListener(...)` block) with the shared helpers and all handlers:

```js
function syncDocxButtons(){for(const id of ['downloadDocxBtn','shareBtn','driveBtn','shareNowBtn'])$(id).disabled=docxBlocked||docxBusy;}
async function makeDocx(d){
  const resp=await fetch('ACR_EMPLOYEE_MASTER.docx');
  if(!resp.ok) throw new Error('The Word template could not be loaded.');
  const bytes=new Uint8Array(await resp.arrayBuffer());
  const out=await generateDocx(d,bytes,{JSZip:window.JSZip,DOMParser,XMLSerializer});
  return new File([out],acrFileName(d,'docx'),{type:DOCX_MIME});
}
const errText=err=>err instanceof ProblemsError?'Fix the problems listed above first.':(err?.message||String(err));
// Runs one job at a time; job(say) returns the final status text, or a DOM node for it.
async function runDocxJob(job){
  if(docxBusy) return;
  const status=$('docxStatus'); docxBusy=true; syncDocxButtons(); $('shareNowBtn').classList.add('hidden'); pendingShare=null;
  try{const out=await job(t=>{status.textContent=t;}); status.replaceChildren(out);}
  catch(err){console.error(err); status.textContent=errText(err);}
  finally{docxBusy=false; syncDocxButtons();}
}
function offerShareTap(files,label){pendingShare=files; $('shareNowBtn').textContent=label; $('shareNowBtn').classList.remove('hidden');}
function shareResultText(result,files){
  if(result==='shared') return 'Share menu opened; the files went to the app you chose.';
  if(result==='cancelled') return 'Sharing was cancelled.';
  if(result==='needs-tap'){offerShareTap(files,'Open share menu'); return 'The files are ready. Tap "Open share menu".';}
  return files.length>1?"This browser can't attach files to a share; both files were downloaded. Attach them to an email yourself.":"This browser can't attach files to a share; the file was downloaded. Attach it to an email yourself.";
}
async function pdfFor(d,docx){return new File([await drive.docxToPdf(docx)],acrFileName(d,'pdf'),{type:'application/pdf'});}

$('downloadDocxBtn').addEventListener('click',()=>runDocxJob(async say=>{
  const d=saveLocal(); say('Making the Word file…');
  const docx=await makeDocx(d); downloadFile(docx);
  return `Word file ready: ${docx.name}`;
}));

$('shareBtn').addEventListener('click',()=>runDocxJob(async say=>{
  const d=saveLocal(); let signInError=null;
  say('Signing in to Google…');
  try{await googleTokens.getToken();}catch(err){signInError=err;} // first, while the tap still allows a pop-up
  say('Making the Word file…');
  const docx=await makeDocx(d);
  let pdf=null;
  if(!signInError){try{say('Making the PDF…'); pdf=await pdfFor(d,docx);}catch(err){signInError=err;}}
  if(!pdf){console.error(signInError); offerShareTap([docx],'Share the Word file only'); return `The PDF could not be made: ${errText(signInError)} You can share the Word file only.`;}
  const files=[docx,pdf];
  return shareResultText(await shareFiles(files,{title:docx.name.replace(/\.docx$/,'')}),files);
}));

$('shareNowBtn').addEventListener('click',()=>{const files=pendingShare; if(!files) return; runDocxJob(async()=>shareResultText(await shareFiles(files,{title:files[0].name.replace(/\.docx$/,'')}),files));});

$('driveBtn').addEventListener('click',()=>runDocxJob(async say=>{
  const d=saveLocal();
  say('Signing in to Google…'); await googleTokens.getToken();
  say('Making the Word file…'); const docx=await makeDocx(d);
  say('Making the PDF…'); const pdf=await pdfFor(d,docx);
  say('Uploading…'); const folderId=await drive.ensureFolder();
  await drive.upsertFile({name:docx.name,bytes:docx,mime:DOCX_MIME,folderId});
  await drive.upsertFile({name:pdf.name,bytes:pdf,mime:'application/pdf',folderId});
  const p=document.createElement('span'); p.append(`Saved ${docx.name} and ${pdf.name} to Google Drive. `);
  const a=document.createElement('a'); a.href=`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`; a.target='_blank'; a.rel='noopener'; a.textContent=`Open the "${FOLDER_NAME}" folder`;
  p.append(a); return p;
}));

if(googleReady){for(const id of ['shareBtn','driveBtn','googleRouteHelp'])$(id).classList.remove('hidden'); googleTokens.preload();}
```

Note: `status.replaceChildren(out)` accepts a string or a node, so returned strings render as text and are never parsed as HTML.

- [ ] **Step 7: Keep the Firebase header buttons hidden**

In the long Firebase line (the one starting `if(firebaseReady){$('signInBtn').addEventListener(...`), replace

```js
$('signInBtn').classList.add('hidden');$('signOutBtn').classList.remove('hidden');
```

with

```js
if(SHOW_FIREBASE_SIGNIN){$('signInBtn').classList.add('hidden');$('signOutBtn').classList.remove('hidden');}
```

and replace

```js
$('signInBtn').classList.remove('hidden');$('signOutBtn').classList.add('hidden');
```

with

```js
if(SHOW_FIREBASE_SIGNIN){$('signInBtn').classList.remove('hidden');$('signOutBtn').classList.add('hidden');}
```

Check with `grep -n "classList.*signInBtn\|signInBtn.*classList" app.js` that no other line un-hides them.

- [ ] **Step 8: Update** `sw.js`

Set `const CACHE='acr-utility-v0-9';` and add `'./google-config.js','./google_drive.js','./share.js'` to `ASSETS`, after `'./sw_rules.js'`.

- [ ] **Step 9: Write** `docs/google-drive-setup.md`

```markdown
# Setting up Save to Google Drive and Share / Email

The two buttons stay hidden until `google-config.js` holds your own OAuth Client ID. This is a one-time setup and it is free.

1. Open https://console.cloud.google.com/ and create a project (for example "ACR Utility").
2. **APIs & Services → Library**: search for **Google Drive API** and click **Enable**.
3. **APIs & Services → OAuth consent screen** (also called "Google Auth Platform → Branding / Audience"):
   - User type **External**.
   - App name "ACR Utility", your support email, and the developer contact email.
   - **Data access / Scopes**: add `.../auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app"). It is a non-sensitive scope, so Google needs no review.
   - **Audience**: click **Publish app** (status "In production"). While it is in "Testing", only the test users you list can sign in.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - **Authorized JavaScript origins**: `https://<your-github-username>.github.io` and `http://localhost:8765`. Give only the scheme and host, with no path and no trailing slash.
   - No redirect URIs are needed.
5. Copy the Client ID (`....apps.googleusercontent.com`) into `google-config.js`:
   `export default { clientId: '1234-abc.apps.googleusercontent.com' };`
6. Publish to GitHub Pages as usual.

**What a teacher sees the first time:** a Google window asking to let "ACR Utility" see, edit, create and delete only the Drive files it uses. After they allow it:

- **Save to Google Drive** creates the folder "ACR Utility" in their Drive with `ACR_<name>_<session>.docx` and `.pdf`. Saving again replaces them.
- **Share / Email** opens the phone's share menu with both files attached. They pick Gmail and send it to themselves.

**Privacy:** the files go only to the teacher's own Drive and their own share target. The app can see only files it created. The temporary Google Doc used to make the PDF is deleted straight away, and no data passes through any other server.
```

- [ ] **Step 10: Run all tests**

Run: `npm test` and `python -m unittest discover -s tests`
Expected: all JS pass (81 + 27 new) and 55 Python pass

- [ ] **Step 11: Browser check, unconfigured state** (ask the user before starting the server)

```bash
python -m http.server 8765
```

Use the playwright-cli skill. Open `http://localhost:8765/`, clear the service worker and caches, then reload. Check:

- The header shows no "Sign in with Google" button.
- In the Review tab, the Share and Drive buttons are not visible, and Download still produces `ACR_<name>_<session>.docx` for the demo record.
- Offline (in devtools network): reload, and Download still works.
- No console errors.

- [ ] **Step 12: Browser check, configured state (layout only)**

1. Temporarily set `clientId: 'test.apps.googleusercontent.com'`, clear the SW and caches, and reload.
2. Check:
   - Share and Drive buttons and the help line appear.
   - With a problem on the form, all three buttons are disabled.
   - Phone width (375 px): the buttons wrap without horizontal scroll.
   - Take a screenshot for the user.
3. **Revert** `google-config.js` to the placeholder. Confirm with `git diff google-config.js`, which should show no change after the revert.
4. Stop the server and close the browser.

- [ ] **Step 13: Commit**

```bash
git add google-config.js index.html styles.css app.js sw.js docs/google-drive-setup.md
git commit -m "feat: Share / Email and Save to Google Drive buttons; header sign-in hidden"
```

---

### Task 6: Real end-to-end check and PDF layout check (needs the user's Client ID)

**Files:**
- Modify: `google-config.js` (the user's real Client ID; commit only if the user agrees)

- [ ] **Step 1: Ask the user** to follow `docs/google-drive-setup.md` and send the Client ID. Stop here until they have it.

- [ ] **Step 2: Localhost run** (ask before starting the server)

1. Put in the Client ID, start the server, and clear the SW and caches. Load the demo record (`tests/fixtures` or an exported `.acr.json`).
2. **Save to Google Drive**, completing the Google popup by hand (the user signs in). Expect "Saved … to Google Drive" with a folder link.
3. **Save to Google Drive** again.
4. In Drive, check that the folder "ACR Utility" holds exactly one `.docx` and one `.pdf`, and that no "ACR temp (safe to delete)" file remains, including in Bin.
5. **Share / Email** in Chrome or Edge on Windows: the Windows share dialog shows both files. If "Open share menu" appears instead, tap it and confirm it works.
6. Firefox: Share → both files download, with the "can't attach" message.
7. Cancel the Google popup: the "Share the Word file only" button appears and works.

- [ ] **Step 3: PDF layout check**

1. Download the Google-made PDF from Drive and render it with `pdftoppm -r 60 -png`.
2. Make the Word-made PDF with `tools/docx_to_pdf.ps1` from the same `.docx` and render it the same way.
3. Compare the page count (Word: 30) and every page, side by side, with `UGC_ACR_Form.pdf`.
4. Write down every difference (page breaks, table splits, fonts, missing text).
5. **If any page is broken or text is missing, stop and report to the user before going further.**

- [ ] **Step 4: Phone run (GitHub Pages)**

After the user publishes, they test on Android (Chrome) and iPhone (Safari):

- Share → Gmail with both attachments
- Save to Drive
- the link opens the folder

Record the results and any wording the user wants changed.

- [ ] **Step 5: Commit any fixes** found in steps 2-4, each with a test where it can be unit-tested. Then ask the user whether to merge `feature/drive-share` into master (fast-forward).
