# Google Account Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in Google Sign-In + Google Drive sync (Option A: no backend, no database) to the existing local-first ACR Utility, so a teacher's ACR archive follows them across Windows/Android/iPhone, while every existing feature (offline editing, linked-file sync, export/import, Word/PDF/print, calculations) keeps working unchanged for teachers who never sign in.

**Architecture:** Three new browser-global modules (`auth.js`, `drive.js`, `drivesync.js`) are added to the existing concatenation build (`build.py`) alongside the current `model.js` / `sync.js` / `app.js`. They reuse the existing per-year JSON document model and the existing debounce/merge pattern from `sync.js`, swapping the transport from "one linked file via File System Access" to "one file per year via the Drive REST API." Sign-in is fully opt-in: with no sign-in, storage keys, behavior, and network traffic (zero) are byte-identical to today.

**Tech Stack:** Vanilla JS (no framework, no bundler — matches existing code), Google Identity Services (loaded lazily from `accounts.google.com` only after a teacher opts in), Google Drive REST API v3 (plain `fetch`, no client library), Python 3 (`build.py`, unchanged tool), Node's built-in `assert` + built-in `fetch` for tests (matches `tests/api-rules.test.js`'s existing no-framework convention).

**Spec:** `docs/superpowers/specs/2026-08-16-google-account-sync-design.md`

## Global Constraints

- No new npm/pip dependency of any kind — matches spec §2's "no backend" and the codebase's existing zero-dependency posture (`src/docx.js`'s hand-rolled ZIP is the house style to match).
- Drive OAuth scope requested is exactly `https://www.googleapis.com/auth/drive.file` plus `email`/`profile` identity claims — never a broader scope (spec §5).
- No teacher's ACR content is ever sent anywhere except `https://www.googleapis.com/...` (Drive/Google's own endpoints) — never to any server this project controls, because none exists (spec §2/§15).
- The GIS script (`https://accounts.google.com/gsi/client`) and every Drive API call must be **lazy** — never requested unless a teacher has signed in or is actively signing in. A teacher who never signs in must see zero network activity, exactly as today (spec §10 offline-first guarantee).
- Access tokens live in memory only — never in `localStorage`, `IndexedDB`, or any log (spec §15).
- Status text shown to a teacher is limited to exactly these four strings, verbatim: `☁ Synced`, `↻ Syncing…`, `⚠ Offline — saved locally`, `⚠ Sync needs attention` (spec §10).
- Developer attribution text is exactly: `Utility developed by: Dr. Prince Thakur (Assistant Professor Botany)` — no email or other personal identifier anywhere in the UI (spec §3).
- Conflict-copy records are labelled with the exact pattern `<session> — Conflict Copy` (spec §12).
- `build.py`'s concatenation order is load order for a shared global scope (no modules) — new files must be inserted in an order where every function they call is already defined.
- Preserve all current functionality unchanged for a teacher who never signs in: linked-file sync (`src/sync.js`), export/import, calculations, preview, print, Word generation, year management.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/auth.js` *(new)* | Google Identity Services wiring only: lazy script load, token client, sign-in/out, in-memory token, `acr.auth.account` marker, `AUTH` state object, `onAuthChange` listeners. Knows nothing about Drive or ACR documents. |
| `src/drive.js` *(new)* | Drive REST v3 wrapper: low-level `driveApiFetch`, folder find/create, year-file list/read/write/trash, backup-snapshot writer. Takes an access token as a plain argument on every call — knows nothing about `AUTH` or sign-in flow. |
| `src/drivesync.js` *(new)* | Orchestration layer: account namespacing activation, first-sign-in migration prompt, the automatic sync loop (debounce/triggers/metadata-diff), conflict detection (`rev`-based) and conflict-copy creation, status-chip painting, Export→Backups wiring. Depends on `auth.js` and `drive.js` and on `app.js`'s existing storage primitives. |
| `src/model.js` *(modify)* | Add `rev: 0` to `blankDoc()`. Remove `seedDoc()`/`SEED_ID` and the personal data they contained. |
| `src/app.js` *(modify)* | `lsGet`/`lsSet`/`lsDel` become namespace-aware (6-line change, zero call-site changes). `persist()` increments `rev`. `boot()`/drop-fallback use `blankDoc('')` instead of `seedDoc()`. New header UI hooks (`signIn`/`signOut`) in `bindGlobal()`. `years()` page gains an "Account & cloud sync" card above the existing (now relabelled) linked-file card. `help()` page gains one attribution line. |
| `src/shell.html` *(modify)* | `<meta name="google-client-id">` config seam. Header sign-in/account UI. Footer with attribution. |
| `build.py` *(modify)* | Insert `auth.js`, `drive.js`, `drivesync.js` into the build order. |
| `tests/no-personal-data.test.js` *(new)* | Regression guard: asserts none of your personal identifiers appear anywhere under `src/`. |
| `tests/drive-api.test.js` *(new)* | Request-shaping tests for `drive.js` against a stubbed `fetch`. |
| `tests/merge-conflict.test.js` *(new)* | Pure-logic tests for the `rev`-based conflict detection added in `drivesync.js`. |
| `tools/personal-seed.acrbak.json` *(new, gitignored)* | Your real 2024-25 ACR, extracted out of source before `seedDoc()` is deleted, importable any time via the existing **Import a backup** button. Never shipped. |
| `.gitignore` *(new)* | Excludes `tools/personal-seed.acrbak.json`. |
| `HOW-TO-USE.md` *(modify)* | Documents Google Sign-In as the default path; existing linked-file section retitled "Advanced." |
| `.github/workflows/deploy-pages.yml` *(new)* | Builds `ACR-Utility.html` via `build.py` and publishes it as the GitHub Pages site on every push to `main`. |

---

### Task 1: Remove personal seed data, add developer attribution, guard both with a regression test

**Files:**
- Modify: `src/model.js:1-215` (remove `seedDoc()`/`SEED_ID`, add `rev: 0` to `blankDoc()`)
- Modify: `src/app.js:958-971` (`boot()`), `src/app.js:885-891` (drop-fallback)
- Modify: `src/shell.html` (footer)
- Modify: `src/app.js:645-650` (`help()` page — About line)
- Create: `tools/personal-seed.acrbak.json`
- Create: `.gitignore`
- Test: `tests/no-personal-data.test.js`

**Interfaces:**
- Produces: `blankDoc(session)` now includes `rev: 0` in its returned object — every later task that reads/writes a document's `rev` field relies on this.
- Produces: `boot()` and the year-delete fallback no longer reference `seedDoc`/`SEED_ID` — later tasks must not reintroduce a call to either name.

- [ ] **Step 1: Capture the current seed content before deleting it**

Create `tools/personal-seed.acrbak.json` with this exact content (the current `seedDoc()` output, wrapped in the app's own backup format so it can be restored later with **Import a backup** — no new tooling needed):

```json
{
  "kind": "acr-backup",
  "version": 1,
  "exportedAt": "2026-08-16T00:00:00.000Z",
  "docs": [
    { "__SEED__": "Copy the full object currently returned by seedDoc() in src/model.js (lines 72-215) here verbatim, changing only the top-level key names to match: id -> \"acr-seed-2024-25\", and adding \"rev\": 0 at the top level alongside \"schemaVersion\"." }
  ]
}
```

Do this by literally copying the object `seedDoc()` builds (read `src/model.js` lines 72–215) into `docs[0]`, then setting `docs[0].rev = 0`. This file is your personal recovery copy — it is about to be deleted from source.

- [ ] **Step 2: Add `.gitignore` so the seed backup is never committed**

```
tools/personal-seed.acrbak.json
```

- [ ] **Step 3: Write the regression test first (will fail until Step 4)**

```js
// tests/no-personal-data.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FORBIDDEN = [
  // Redacted here — see the real, exact list committed in tests/no-personal-data.test.js
  // itself. Do not copy the developer's actual personal data into this planning
  // document; it only needs to exist once, in the test file that enforces it.
];

const srcDir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js') || f.endsWith('.html'));

files.forEach((f) => {
  const text = fs.readFileSync(path.join(srcDir, f), 'utf8');
  FORBIDDEN.forEach((needle) => {
    assert.ok(!text.includes(needle), `${f} contains personal data: "${needle}"`);
  });
});

console.log('no-personal-data test passed (' + files.length + ' files checked)');
```

- [ ] **Step 4: Run it to confirm it currently fails**

Run: `node tests/no-personal-data.test.js`
Expected: `AssertionError` naming `model.js` and one of the forbidden strings — confirms the test actually detects the data that's still there.

- [ ] **Step 5: Delete `seedDoc()` and `SEED_ID` from `src/model.js`**

Remove lines 67–215 in full (the `/* ===== SEED ... ===== */` comment block through the end of `seedDoc()`). Add `rev: 0` to the object `blankDoc()` returns, next to `touched: false`:

```js
function blankDoc(session) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    touched: false,
    rev: 0,               // <-- new: monotonic per-document edit counter, used by drivesync.js conflict detection
    session: session || '',
    // ...unchanged below this line
```

- [ ] **Step 6: Update `boot()` and the drop-fallback in `src/app.js` to stop calling `seedDoc()`**

`src/app.js:958-971`, change:
```js
  if (!d) { d = seedDoc(); }
```
to:
```js
  if (!d) { d = blankDoc(''); }
```

`src/app.js:889`, change:
```js
      if (S.doc.id === ds.drop) { const ix = loadIndex(); S.doc = ix.length ? migrate(loadDocById(ix[0].id)) : seedDoc(); persist(S.doc); }
```
to:
```js
      if (S.doc.id === ds.drop) { const ix = loadIndex(); S.doc = ix.length ? migrate(loadDocById(ix[0].id)) : blankDoc(''); persist(S.doc); }
```

- [ ] **Step 7: Run the regression test again to confirm it passes**

Run: `node tests/no-personal-data.test.js`
Expected: `no-personal-data test passed (N files checked)`

- [ ] **Step 8: Add the developer attribution footer**

`src/shell.html`, immediately before the closing `</body>`:
```html
<footer class="appfooter">Utility developed by: Dr. Prince Thakur (Assistant Professor Botany)</footer>
```

Add a matching, unobtrusive style to `src/styles.css` (small, centered, muted — not competing with the form):
```css
.appfooter{padding:10px 16px;text-align:center;font-size:12px;color:#6b7785;border-top:1px solid #e3e8ef}
```

- [ ] **Step 9: Add the same line to the in-app Help page**

`src/app.js`, in `help()` (around line 649), immediately before the closing `</div>\`;`:
```js
      <h3 class="grp">About</h3>
      <p>Utility developed by: Dr. Prince Thakur (Assistant Professor Botany).</p>
      </div>`;
```

- [ ] **Step 10: Rebuild and manually verify**

Run: `python3 build.py`
Then open the rebuilt `ACR-Utility.html` in a browser with `localStorage` cleared (or a fresh private window) and confirm: the form opens **blank** (no personal name, no pre-filled college), the footer shows the attribution line exactly as specified, and the Help page shows the same line under "About."

- [ ] **Step 11: Commit**

```bash
git add src/model.js src/app.js src/shell.html src/styles.css tests/no-personal-data.test.js .gitignore tools/personal-seed.acrbak.json
git commit -m "Remove personal seed data, add developer attribution, guard with regression test"
```

---

### Task 2: Google Identity Services wiring (`auth.js`)

**Files:**
- Create: `src/auth.js`
- Modify: `src/shell.html` (config meta tag, header sign-in/account markup)
- Modify: `src/app.js:893-926` (`bindGlobal()` click switch — add `signIn`/`signOut` cases)
- Modify: `build.py:7` (add `auth.js` to build order, after `sync.js` and before `app.js`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by Tasks 3–7):
  - `AUTH` object: `{ state, token, tokenExpiry, account }` — `state` is one of `'signed-out' | 'signing-in' | 'signed-in' | 'error'`; `account` is `null` or `{ sub, email, name }`.
  - `authBoot()` — call once at app boot; restores `AUTH.account` from the local marker (no network) and, only if a marker exists, attempts a silent token reacquisition.
  - `authSignIn()` → `Promise<void>` — runs the interactive sign-in flow; resolves once `AUTH.account`/`AUTH.token` are set, rejects on failure/cancel.
  - `authSignOut()` → `Promise<void>` — revokes the token, clears `AUTH.token`/`AUTH.account`, clears the local marker.
  - `authGetToken()` → `Promise<string>` — returns a currently-valid access token, silently refreshing first if needed; rejects with an `Error` whose `.needsSignIn = true` if silent refresh fails (later tasks use this flag to show "⚠ Sync needs attention" rather than a hard error).
  - `onAuthChange(fn)` — registers `fn(AUTH)` to be called after every state change (Task 4 uses this to trigger workspace reload).
  - `authAvailable()` → `boolean` — `false` when `location.protocol === 'file:'` (no Google origin registered for local files) or the config meta tag is empty.

- [ ] **Step 1: Add the configuration seam to `src/shell.html`**

In `<head>`, near the other `<meta>` tags:
```html
<meta name="google-client-id" content="">
```
This ships empty. You fill in the real OAuth Client ID (from the one-time Google Cloud Console setup in spec §19) directly in this file before deploying the hosted build — it is never hardcoded in JS.

- [ ] **Step 2: Write `src/auth.js`**

```js
/* ===================== GOOGLE SIGN-IN (Google Identity Services) =====================
   Lazy by design: nothing here runs, and no request to accounts.google.com is made,
   until a teacher has previously signed in (authBoot) or clicks Sign in (authSignIn).
========================================================================================= */

const AUTH_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const AUTH_MARKER_KEY = 'acr.auth.account';

const AUTH = { state: 'signed-out', token: null, tokenExpiry: 0, account: null };
let AUTH_LISTENERS = [];
let AUTH_TOKEN_CLIENT = null;
let AUTH_GIS_PROMISE = null;

function onAuthChange(fn) { AUTH_LISTENERS.push(fn); }
function authFireChange() { AUTH_LISTENERS.forEach((fn) => { try { fn(AUTH); } catch (e) {} }); }

function authClientId() {
  const m = document.querySelector('meta[name="google-client-id"]');
  return (m && m.content || '').trim();
}
function authAvailable() { return location.protocol !== 'file:' && !!authClientId(); }

function authLoadGis() {
  if (AUTH_GIS_PROMISE) return AUTH_GIS_PROMISE;
  AUTH_GIS_PROMISE = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google Sign-In. Check your internet connection.'));
    document.head.appendChild(s);
  });
  return AUTH_GIS_PROMISE;
}

function authEnsureTokenClient() {
  if (AUTH_TOKEN_CLIENT) return AUTH_TOKEN_CLIENT;
  AUTH_TOKEN_CLIENT = google.accounts.oauth2.initTokenClient({
    client_id: authClientId(),
    scope: AUTH_SCOPES,
    callback: () => {} // overridden per-call in authRequestToken
  });
  return AUTH_TOKEN_CLIENT;
}

function authRequestToken(promptMode) {
  return authLoadGis().then(() => new Promise((resolve, reject) => {
    const client = authEnsureTokenClient();
    client.callback = (resp) => {
      if (resp && resp.access_token) resolve(resp);
      else reject(Object.assign(new Error('Sign-in was not completed.'), { needsSignIn: true }));
    };
    client.error_callback = (err) => reject(Object.assign(new Error((err && err.message) || 'Sign-in failed.'), { needsSignIn: true }));
    client.requestAccessToken({ prompt: promptMode });
  }));
}

async function authFetchUserinfo(token) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Could not read the signed-in account.');
  const j = await r.json();
  return { sub: j.sub, email: j.email || '', name: j.name || '' };
}

async function authSignIn() {
  if (!authAvailable()) throw new Error(location.protocol === 'file:'
    ? 'Google sign-in needs the hosted version of this app.'
    : 'Google sign-in is not configured for this deployment yet.');
  AUTH.state = 'signing-in'; authFireChange();
  try {
    const resp = await authRequestToken('consent');
    AUTH.token = resp.access_token;
    AUTH.tokenExpiry = Date.now() + (Number(resp.expires_in) || 3300) * 1000;
    AUTH.account = await authFetchUserinfo(AUTH.token);
    lsSet(AUTH_MARKER_KEY, JSON.stringify(AUTH.account));
    AUTH.state = 'signed-in'; authFireChange();
  } catch (e) {
    AUTH.state = 'error'; authFireChange();
    throw e;
  }
}

async function authSignOut() {
  const token = AUTH.token;
  AUTH.token = null; AUTH.tokenExpiry = 0; AUTH.account = null; AUTH.state = 'signed-out';
  lsDel(AUTH_MARKER_KEY);
  authFireChange();
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
  }
}

async function authGetToken() {
  if (AUTH.token && Date.now() < AUTH.tokenExpiry - 30000) return AUTH.token;
  try {
    const resp = await authRequestToken('');
    AUTH.token = resp.access_token;
    AUTH.tokenExpiry = Date.now() + (Number(resp.expires_in) || 3300) * 1000;
    if (!AUTH.account) AUTH.account = await authFetchUserinfo(AUTH.token);
    AUTH.state = 'signed-in'; authFireChange();
    return AUTH.token;
  } catch (e) {
    AUTH.state = 'error'; authFireChange();
    throw Object.assign(e, { needsSignIn: true });
  }
}

function authBoot() {
  const raw = lsGet(AUTH_MARKER_KEY);
  if (!raw) return; // never signed in on this device — make zero network calls
  try { AUTH.account = JSON.parse(raw); AUTH.state = 'signed-in'; } catch (e) { return; }
  authFireChange();
  // attempt a silent token refresh in the background so sync can start without a click
  authGetToken().catch(() => { AUTH.state = 'error'; authFireChange(); });
}
```

- [ ] **Step 3: Add header UI to `src/shell.html`**

Replace the existing `syncStatus` button's neighbouring markup — insert immediately after `<button class="btn ghost status" id="syncStatus" style="display:none"></button>` (from the current header, `src/shell.html:20`):
```html
<button class="btn ghost sm status" id="authArea"></button>
```

- [ ] **Step 4: Paint the `#authArea` control and wire clicks in `src/app.js`**

Add near `syncPaint`-style functions (any convenient spot above `bindGlobal`):
```js
function authPaint() {
  const el = $('#authArea'); if (!el) return;
  if (location.protocol === 'file:') { el.textContent = ''; el.style.display = 'none'; return; }
  if (!authAvailable()) { el.textContent = 'Sign-in not configured'; el.style.display = ''; el.onclick = null; return; }
  el.style.display = '';
  if (AUTH.state === 'signed-in' && AUTH.account) {
    el.textContent = 'Signed in as ' + AUTH.account.email + ' · Sign out';
    el.dataset.authAction = 'signOut';
  } else if (AUTH.state === 'signing-in') {
    el.textContent = 'Signing in…';
    el.dataset.authAction = '';
  } else {
    el.textContent = 'Sign in with Google';
    el.dataset.authAction = 'signIn';
  }
}
onAuthChange(authPaint);
```

In `bindGlobal()`'s click handler (`src/app.js`, inside the existing `switch (b.id) { ... }` block, `src/app.js:893-926`), add two cases:
```js
      case 'authArea':
        if (b.dataset.authAction === 'signIn') {
          authSignIn().catch((e) => toast(e.message, 5000));
        } else if (b.dataset.authAction === 'signOut') {
          authSignOut();
        }
        break;
```

At the end of `render()` (`src/app.js:726-733`, alongside the existing `if (typeof syncPaint === 'function') syncPaint();`), add:
```js
  if (typeof authPaint === 'function') authPaint();
```

In `boot()` (`src/app.js:958-971`), add `authBoot();` right after `bindGlobal();`:
```js
  bindGlobal();
  authBoot();
  render();
```

- [ ] **Step 5: Add `auth.js` to the build**

`build.py:7`, change:
```python
order = ["model.js", "docmodel.js", "render.js", "docx.js", "sync.js", "app.js"]
```
to:
```python
order = ["model.js", "docmodel.js", "render.js", "docx.js", "sync.js", "auth.js", "app.js"]
```

- [ ] **Step 6: Rebuild and manually verify the two safe-to-test-now states**

Run: `python3 build.py`

With the `google-client-id` meta tag still empty: open the rebuilt file in a browser — the header shows "Sign-in not configured" and clicking it does nothing (no network request, check the browser Network tab to confirm zero requests to `accounts.google.com`).

Open the plain downloadable file via `file://` directly (double-click it): the sign-in control does not appear at all.

*(The full interactive popup flow — filling in a real `google-client-id` and completing consent — can only be verified after the Google Cloud Console setup in spec §19, which is a manual step outside this plan. Note this explicitly rather than faking a credential: re-run this step's verification once a real Client ID is available, before Task 8's deployment.)*

- [ ] **Step 7: Commit**

```bash
git add src/auth.js src/app.js src/shell.html build.py
git commit -m "Add Google Identity Services sign-in wiring (auth.js)"
```

---

### Task 3: Drive REST module (`drive.js`)

**Files:**
- Create: `src/drive.js`
- Modify: `build.py:7` (insert `drive.js` after `auth.js`)
- Test: `tests/drive-api.test.js`

**Interfaces:**
- Consumes: nothing (every function takes a `token` string as its first argument — this module never reads `AUTH` directly, so it's independently testable).
- Produces (used by Task 5):
  - `driveEnsureWorkspace(token)` → `Promise<{ rootId, backupsId }>`
  - `driveListYearFiles(token, rootId)` → `Promise<Array<{ id, name, modifiedTime, properties }>>`
  - `driveGetFileContent(token, fileId)` → `Promise<object>`
  - `driveUpsertYearFile(token, rootId, doc, existingFileId)` → `Promise<string>` (the file id)
  - `driveTrashFile(token, fileId)` → `Promise<void>`
  - `driveWriteBackupSnapshot(token, backupsId, allDocs)` → `Promise<string>` (the new file's id)

- [ ] **Step 1: Write the request-shaping tests first**

```js
// tests/drive-api.test.js
const assert = require('assert');

// Minimal fetch stub: records every call, returns canned responses in order.
function makeFetchStub(responses) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const next = responses.shift();
    return { ok: next.ok !== false, status: next.status || 200, json: async () => next.body };
  };
  fn.calls = calls;
  return fn;
}

global.fetch = makeFetchStub([{ body: { files: [] } }, { body: { id: 'root123' } }, { body: { files: [] } }, { body: { id: 'backups456' } }]);
const { driveEnsureWorkspace, driveUpsertYearFile, driveListYearFiles, driveWriteBackupSnapshot } = require('../src/drive.js');

(async () => {
  const ws = await driveEnsureWorkspace('tok');
  assert.equal(ws.rootId, 'root123');
  assert.equal(ws.backupsId, 'backups456');

  // find-root call must filter by the appTag property, not by folder name
  assert.ok(global.fetch.calls[0].url.includes(encodeURIComponent("properties has { key='appTag' and value='acr-utility-root' }")) ||
             global.fetch.calls[0].url.includes("appTag") , 'root lookup must query the appTag property');

  global.fetch = makeFetchStub([{ body: { id: 'file789' } }]);
  Object.assign(require('../src/drive.js'), {}); // no-op, module already loaded with new fetch in scope via global
  const fileId = await driveUpsertYearFile('tok', 'root123', { id: 'doc1', session: '2025-26', schemaVersion: 5, rev: 0 }, null);
  assert.equal(fileId, 'file789');
  const createCall = global.fetch.calls[0];
  assert.ok(createCall.url.includes('/upload/drive/v3/files'), 'creating a new year file must POST to the upload endpoint');
  assert.equal(createCall.opts.method, 'POST');

  global.fetch = makeFetchStub([{ body: {} }]);
  const fileId2 = await driveUpsertYearFile('tok', 'root123', { id: 'doc1', session: '2025-26', schemaVersion: 5, rev: 1 }, 'file789');
  assert.equal(global.fetch.calls[0].opts.method, 'PATCH', 'updating an existing year file must PATCH, not POST');

  global.fetch = makeFetchStub([{ ok: false, status: 401, body: {} }]);
  let threw = false;
  try { await driveListYearFiles('tok', 'root123'); } catch (e) { threw = true; assert.equal(e.status, 401); }
  assert.ok(threw, 'a non-2xx Drive response must throw with .status set');

  console.log('drive-api tests passed');
})();
```

- [ ] **Step 2: Run it to confirm it fails (module doesn't exist yet)**

Run: `node tests/drive-api.test.js`
Expected: `Error: Cannot find module '../src/drive.js'`

- [ ] **Step 3: Write `src/drive.js`**

```js
/* ===================== GOOGLE DRIVE REST MODULE =====================
   Pure functions of (token, ...). Knows nothing about sign-in state or
   the app's document model beyond the small subset of fields it reads
   (id, session, schemaVersion, rev) to tag files for later lookup.
======================================================================== */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

async function driveApiFetch(token, url, opts) {
  const r = await fetch(url, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + token }, (opts && opts.headers) || {})
  }));
  if (!r.ok) {
    const err = new Error('Drive request failed (' + r.status + ')');
    err.status = r.status;
    throw err;
  }
  return r.json();
}

function driveQuery(parts) { return parts.join(' and '); }

async function driveFindByProperty(token, key, value, extra) {
  const q = driveQuery([
    "properties has { key='" + key + "' and value='" + value + "' }",
    'trashed=false'
  ].concat(extra || []));
  const url = DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('files(id,name,modifiedTime,properties)');
  const data = await driveApiFetch(token, url);
  return (data.files && data.files[0]) || null;
}

async function driveCreateFolder(token, name, properties, parentId) {
  const body = { name, mimeType: 'application/vnd.google-apps.folder', properties };
  if (parentId) body.parents = [parentId];
  const data = await driveApiFetch(token, DRIVE_API + '/files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return data.id;
}

async function driveEnsureWorkspace(token) {
  let root = await driveFindByProperty(token, 'appTag', 'acr-utility-root');
  const rootId = root ? root.id : await driveCreateFolder(token, 'ACR Utility', { appTag: 'acr-utility-root' });

  let backups = await driveFindByProperty(token, 'appTag', 'acr-utility-backups', ["'" + rootId + "' in parents"]);
  const backupsId = backups ? backups.id : await driveCreateFolder(token, 'Backups', { appTag: 'acr-utility-backups' }, rootId);

  return { rootId, backupsId };
}

async function driveListYearFiles(token, rootId) {
  const q = driveQuery([
    "'" + rootId + "' in parents",
    'trashed=false',
    "properties has { key='appTag' and value='acr-utility-year-file' }"
  ]);
  const url = DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('files(id,name,modifiedTime,properties)');
  const data = await driveApiFetch(token, url);
  return data.files || [];
}

async function driveGetFileContent(token, fileId) {
  const url = DRIVE_API + '/files/' + fileId + '?alt=media';
  return driveApiFetch(token, url);
}

async function driveUpsertYearFile(token, rootId, doc, existingFileId) {
  const name = 'ACR ' + (doc.session || 'untitled') + '.acr.json';
  const properties = { appTag: 'acr-utility-year-file', acrDocId: doc.id, schemaVersion: String(doc.schemaVersion) };
  const media = JSON.stringify(doc);

  if (!existingFileId) {
    const boundary = 'acrutil' + Date.now();
    const metadata = { name, parents: [rootId], properties };
    const body =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n' +
      '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + media + '\r\n' +
      '--' + boundary + '--';
    const data = await driveApiFetch(token, DRIVE_UPLOAD_API + '/files?uploadType=multipart', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body
    });
    return data.id;
  }

  await driveApiFetch(token, DRIVE_API + '/files/' + existingFileId, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, properties })
  });
  await driveApiFetch(token, DRIVE_UPLOAD_API + '/files/' + existingFileId + '?uploadType=media', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: media
  });
  return existingFileId;
}

async function driveTrashFile(token, fileId) {
  await driveApiFetch(token, DRIVE_API + '/files/' + fileId, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true })
  });
}

async function driveWriteBackupSnapshot(token, backupsId, allDocs) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = 'backup-' + stamp + '.acrbak.json';
  const pack = { kind: 'acr-backup', version: 1, exportedAt: new Date().toISOString(), docs: allDocs };
  const boundary = 'acrutilbk' + Date.now();
  const metadata = { name, parents: [backupsId], properties: { appTag: 'acr-utility-backup-snapshot' } };
  const body =
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(pack) + '\r\n' +
    '--' + boundary + '--';
  const data = await driveApiFetch(token, DRIVE_UPLOAD_API + '/files?uploadType=multipart', {
    method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body
  });
  return data.id;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { driveEnsureWorkspace, driveListYearFiles, driveGetFileContent, driveUpsertYearFile, driveTrashFile, driveWriteBackupSnapshot };
}
```

*(The trailing `module.exports` guard is the same pattern `public/api-rules.js` already uses so the file works unchanged both as a browser `<script>` — via `build.py`'s concatenation — and as a Node-`require`-able module for tests.)*

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `node tests/drive-api.test.js`
Expected: `drive-api tests passed`

- [ ] **Step 5: Add `drive.js` to the build order**

`build.py:7`:
```python
order = ["model.js", "docmodel.js", "render.js", "docx.js", "sync.js", "auth.js", "drive.js", "app.js"]
```

- [ ] **Step 6: Rebuild to confirm no syntax errors reach the browser bundle**

Run: `python3 build.py`
Expected: `wrote ACR-Utility.html (NN.N KB)` with no Python error.

- [ ] **Step 7: Commit**

```bash
git add src/drive.js build.py tests/drive-api.test.js
git commit -m "Add Google Drive REST module (drive.js)"
```

---

### Task 4: Account namespacing, first-sign-in migration prompt, account switching

**Files:**
- Modify: `src/app.js:11-19` (`lsGet`/`lsSet`/`lsDel`)
- Modify: `src/app.js:36` (`S` object)
- Modify: `src/app.js:958-971` (extract `loadActiveDoc()` out of `boot()`)
- Create: (inline in `src/drivesync.js`, started here, completed in Task 5) the `onAuthChange` handler that switches namespace and offers migration

**Interfaces:**
- Consumes: `AUTH` and `onAuthChange` from Task 2.
- Produces (used by Task 5+): `ACTIVE_NS` (module-level string, `''` when signed out), `reloadWorkspace()` (re-reads the current namespace's index/current-doc into `S.doc`/re-renders), `offerMigrationIfNeeded(account)`.

- [ ] **Step 1: Make the storage primitives namespace-aware**

`src/app.js:11-19`, change:
```js
function lsGet(k) {
  try { return localStorage.getItem(k); } catch (e) { storageOK = false; return memStore[k] ?? null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch (e) { storageOK = false; memStore[k] = v; }
}
function lsDel(k) {
  try { localStorage.removeItem(k); } catch (e) { delete memStore[k]; }
}
```
to:
```js
let ACTIVE_NS = '';
function nsKey(k) { return ACTIVE_NS ? ACTIVE_NS + k : k; }
function lsGet(k) {
  try { return localStorage.getItem(nsKey(k)); } catch (e) { storageOK = false; return memStore[nsKey(k)] ?? null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(nsKey(k), v); } catch (e) { storageOK = false; memStore[nsKey(k)] = v; }
}
function lsDel(k) {
  try { localStorage.removeItem(nsKey(k)); } catch (e) { delete memStore[nsKey(k)]; }
}
```
No other line in `app.js` or `sync.js` needs to change — every existing `LS_DOC(id)`, `LS_CUR`, `LS_INDEX`, `AUTH_MARKER_KEY` (from Task 2) call already goes through `lsGet`/`lsSet`/`lsDel`. With `ACTIVE_NS` defaulting to `''`, a teacher who never signs in gets byte-identical storage keys to today.

*(Note: `acr.auth.account`, the sign-in marker itself, must stay reachable regardless of which account namespace is active — it deliberately goes through the same `lsGet`/`lsSet` and is **not** namespaced further, since it's the one piece of state that identifies which namespace to activate in the first place. This is already correct as written in Task 2 — no change needed here, called out for clarity.)*

- [ ] **Step 2: Extract the "load the doc that should be on screen" logic out of `boot()` so it can be reused after a sign-in/sign-out**

`src/app.js:958-971`, replace:
```js
(function boot() {
  const ix = loadIndex();
  const curId = lsGet(LS_CUR);
  let d = null;
  if (curId) d = loadDocById(curId);
  if (!d && ix.length) d = loadDocById(ix[0].id);
  if (!d) { d = blankDoc(''); }
  S.doc = migrate(d);
  persist(S.doc, { touch: false });
  bindGlobal();
  authBoot();
  render();
  if (!storageOK) toast('This browser is blocking local storage. Export a backup before you close the tab.', 6000);
  syncBoot();
})();
```
with:
```js
function loadActiveDoc() {
  const ix = loadIndex();
  const curId = lsGet(LS_CUR);
  let d = null;
  if (curId) d = loadDocById(curId);
  if (!d && ix.length) d = loadDocById(ix[0].id);
  if (!d) d = blankDoc('');
  return migrate(d);
}

(function boot() {
  S.doc = loadActiveDoc();
  persist(S.doc, { touch: false });
  bindGlobal();
  authBoot();
  render();
  if (!storageOK) toast('This browser is blocking local storage. Export a backup before you close the tab.', 6000);
  syncBoot();
})();
```

- [ ] **Step 3: Add the account field to `S` and a `reloadWorkspace()` used when the active namespace changes**

`src/app.js:36`:
```js
const S = { doc: null, section: 'profile', timer: null, dirty: false };
```
becomes:
```js
const S = { doc: null, section: 'profile', timer: null, dirty: false };
function reloadWorkspace() {
  S.doc = loadActiveDoc();
  persist(S.doc, { touch: false });
  S.section = 'profile';
  render();
}
```
(`reloadWorkspace` is placed right after `S`'s declaration; it depends on `loadActiveDoc`, `persist`, and `render`, all already defined elsewhere in the same file, so placement is safe under `build.py`'s single-scope concatenation as long as it isn't *called* before those exist — the browser parses function declarations before running any code, so this is fine.)

- [ ] **Step 4: Start `src/drivesync.js` with the namespace-switching + migration-offer logic (rest of this file is completed in Task 5)**

```js
/* ===================== DRIVE SYNC ORCHESTRATION =====================
   Ties auth.js + drive.js to the existing local document store. This file
   owns: which account namespace is active, the first-sign-in migration
   offer, and (from Task 5 onward) the automatic sync loop.
========================================================================= */

function driveNamespaceFor(account) { return 'acct.' + account.sub + '.'; }

function offerMigrationIfNeeded(account) {
  const hadLocalWork = loadIndex().some((r) => {
    const d = loadDocById(r.id);
    return d && d.touched;
  });
  if (!hadLocalWork) return false;
  return confirm('Existing ACR data found on this device. Would you like to add it to your Google account?');
}

onAuthChange((auth) => {
  if (auth.state === 'signed-in' && auth.account) {
    const wasNs = ACTIVE_NS;
    const targetNs = driveNamespaceFor(auth.account);
    if (wasNs === targetNs) return; // already on this account's workspace — nothing to do
    // Read local (pre-sign-in or previous-account) data BEFORE switching namespace.
    ACTIVE_NS = '';
    const migrate_ = wasNs === '' && offerMigrationIfNeeded(auth.account);
    const toCopy = migrate_ ? loadIndex().map((r) => loadDocById(r.id)).filter(Boolean) : [];
    ACTIVE_NS = targetNs;
    if (migrate_) {
      toCopy.forEach((d) => persist(migrate(d)));
      toast(toCopy.length + ' year(s) added to your Google account.');
    }
    reloadWorkspace();
  } else if (auth.state === 'signed-out') {
    ACTIVE_NS = '';
    reloadWorkspace();
  }
});
```

- [ ] **Step 5: Add `drivesync.js` to the build order**

`build.py:7`:
```python
order = ["model.js", "docmodel.js", "render.js", "docx.js", "sync.js", "auth.js", "drive.js", "drivesync.js", "app.js"]
```

- [ ] **Step 6: Rebuild and manually verify account isolation**

Run: `python3 build.py`, then in a browser with a real (test) Google account and a filled-in `google-client-id`:
1. With `localStorage` cleared, type something into a field (creates local, unsigned-in data).
2. Click **Sign in with Google** → confirm the "Existing ACR data found..." prompt appears; accept it.
3. Confirm the typed data is still visible after sign-in (migrated in, not lost).
4. Sign out → confirm the same data reappears (it's the `''`-namespace copy, untouched by sign-out).
5. Sign in with a **second** Google test account → confirm it opens a blank workspace, not the first account's data.
6. Switch back to the first account → confirm its data is still there.

*(Full verification here depends on a real `google-client-id` from Task 2's deferred step — perform this manual pass together with Task 2's deferred verification, once Cloud Console setup is done.)*

- [ ] **Step 7: Commit**

```bash
git add src/app.js src/drivesync.js build.py
git commit -m "Add account namespacing, first-sign-in migration prompt, account switching"
```

---

### Task 5: Automatic sync engine — folder ensure, debounce/triggers, metadata-diff pull/push, status chip

**Files:**
- Modify: `src/drivesync.js` (append the sync loop)
- Modify: `src/app.js:26-33` (`persist()` — hook the sync scheduler, matching the existing `syncSchedule()` call already there for linked-file sync)
- Modify: `src/shell.html` (status chip already exists at `#syncStatus` for linked-file sync — Task 7 relabels the UI; this task only wires state into it)

**Interfaces:**
- Consumes: `AUTH`, `authGetToken()` (Task 2); `driveEnsureWorkspace`, `driveListYearFiles`, `driveGetFileContent`, `driveUpsertYearFile`, `driveWriteBackupSnapshot` (Task 3); `ACTIVE_NS`, `reloadWorkspace()` (Task 4); `mergeDocs()` (existing, `src/sync.js`).
- Produces: `DRIVESYNC` state object with `.status` ∈ `'idle' | 'syncing' | 'offline' | 'attention'`; `drivesyncPaint()`; `drivesyncSchedule()`; `drivesyncRun()`; `drivesyncExportBackup(allDocs)` (used by Task 7's Export button wiring).

- [ ] **Step 1: Append the sync loop to `src/drivesync.js`**

```js
const DRIVESYNC = { status: 'idle', workspace: null, timer: null, busy: false, lastError: null };

function drivesyncPaint() {
  const el = $('#syncStatus'); if (!el || AUTH.state !== 'signed-in') return;
  const M = {
    idle: ['☁ Synced', 'saved'],
    syncing: ['↻ Syncing…', 'dirty'],
    offline: ['⚠ Offline — saved locally', 'dirty'],
    attention: ['⚠ Sync needs attention', 'dirty']
  };
  const [text, cls] = M[DRIVESYNC.status] || M.idle;
  el.textContent = text; el.className = 'btn ghost sm status ' + cls; el.style.display = '';
}
onAuthChange((auth) => { if (auth.state !== 'signed-in') { const el = $('#syncStatus'); if (el) el.style.display = 'none'; } });

function drivesyncSchedule() {
  if (AUTH.state !== 'signed-in') return;
  clearTimeout(DRIVESYNC.timer);
  DRIVESYNC.timer = setTimeout(() => drivesyncRun(), 4000);
}

async function drivesyncEnsureWorkspace(token) {
  if (DRIVESYNC.workspace) return DRIVESYNC.workspace;
  DRIVESYNC.workspace = await driveEnsureWorkspace(token);
  return DRIVESYNC.workspace;
}

function drivesyncMetaKey(id) { return 'acr.drivemeta.' + id; }
function drivesyncGetMeta(id) { try { return JSON.parse(lsGet(drivesyncMetaKey(id)) || 'null'); } catch (e) { return null; } }
function drivesyncSetMeta(id, meta) { lsSet(drivesyncMetaKey(id), JSON.stringify(meta)); }

async function drivesyncRun() {
  if (DRIVESYNC.busy || AUTH.state !== 'signed-in') return;
  if (!navigator.onLine) { DRIVESYNC.status = 'offline'; drivesyncPaint(); return; }
  DRIVESYNC.busy = true; DRIVESYNC.status = 'syncing'; drivesyncPaint();
  try {
    const token = await authGetToken();
    const { rootId, backupsId } = await drivesyncEnsureWorkspace(token);
    DRIVESYNC.workspace = { rootId, backupsId };

    const remoteFiles = await driveListYearFiles(token, rootId);
    const localDocs = loadIndex().map((r) => loadDocById(r.id)).filter(Boolean);

    // Only fetch full content for files whose modifiedTime moved since our last known sync for that id.
    const remoteDocs = [];
    for (const f of remoteFiles) {
      const id = f.properties && f.properties.acrDocId; if (!id) continue;
      const meta = drivesyncGetMeta(id);
      if (meta && meta.driveModifiedTime === f.modifiedTime) {
        const local = localDocs.find((d) => d.id === id);
        if (local) { remoteDocs.push(local); continue; } // unchanged remotely — reuse our own copy, no download
      }
      const content = await driveGetFileContent(token, f.id);
      drivesyncSetMeta(id, { driveFileId: f.id, driveModifiedTime: f.modifiedTime });
      remoteDocs.push(migrate(content));
    }

    const { docs: mergedDocs, conflicts } = mergeDocsWithConflicts(localDocs, remoteDocs);

    mergedDocs.concat(conflicts).forEach((d) => {
      const cur = loadDocById(d.id);
      if (!cur || JSON.stringify(cur) !== JSON.stringify(d)) persist(d, { touch: false });
    });
    if (conflicts.length) {
      saveIndex(loadIndex().concat(conflicts.map((d) => ({ id: d.id, session: d.session, name: d.p1.fullName, updatedAt: d.updatedAt }))));
      toast('Two devices edited ' + conflicts.map((c) => c.session.replace(' — Conflict Copy', '')).join(', ') + ' at the same time. Both versions were kept — open each and delete the one you don’t need.', 8000);
    }

    // Upload every local doc whose Drive copy is missing or stale.
    for (const d of mergedDocs) {
      const meta = drivesyncGetMeta(d.id);
      const remote = remoteFiles.find((f) => f.properties && f.properties.acrDocId === d.id);
      const upToDate = remote && meta && meta.driveModifiedTime === remote.modifiedTime && meta.lastSyncedRev === d.rev;
      if (upToDate) continue;
      const fileId = await driveUpsertYearFile(token, rootId, d, remote ? remote.id : null);
      drivesyncSetMeta(d.id, { driveFileId: fileId, driveModifiedTime: new Date().toISOString(), lastSyncedRev: d.rev });
    }

    if (mergedDocs.some((d) => !remoteFiles.find((f) => f.properties && f.properties.acrDocId === d.id)) || conflicts.length) {
      reloadWorkspace();
    }

    DRIVESYNC.status = 'idle'; DRIVESYNC.lastError = null;
  } catch (e) {
    DRIVESYNC.lastError = e;
    DRIVESYNC.status = e && e.needsSignIn ? 'attention' : 'offline';
  } finally {
    DRIVESYNC.busy = false; drivesyncPaint();
  }
}

async function drivesyncExportBackup() {
  if (AUTH.state !== 'signed-in') return;
  try {
    const token = await authGetToken();
    const { backupsId } = await drivesyncEnsureWorkspace(token);
    const allDocs = loadIndex().map((r) => loadDocById(r.id)).filter(Boolean);
    await driveWriteBackupSnapshot(token, backupsId, allDocs);
    toast('A backup copy was also saved to Google Drive.');
  } catch (e) { /* Export Backup itself already succeeded locally — this is a bonus, fail quietly */ }
}

window.addEventListener('online', () => drivesyncRun());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') drivesyncRun(); });
```

- [ ] **Step 2: Hook `drivesyncSchedule()` into `persist()`, matching the existing `syncSchedule()` call**

`src/app.js:26-33`:
```js
function persist(d, opts) {
  if (!opts || opts.touch !== false) { d.updatedAt = nowISO(); d.touched = true; d.rev = (d.rev || 0) + 1; }
  lsSet(LS_DOC(d.id), JSON.stringify(d));
  const ix = loadIndex().filter((r) => r.id !== d.id);
  ix.unshift({ id: d.id, session: d.session, name: d.p1.fullName, updatedAt: d.updatedAt });
  saveIndex(ix); lsSet(LS_CUR, d.id);
  if (typeof syncSchedule === 'function') syncSchedule();
  if (typeof drivesyncSchedule === 'function') drivesyncSchedule();
}
```
(`d.rev` increments only on a real edit — `opts.touch === false` calls, used for pristine loads and for writing merge results back locally, deliberately skip it, matching the existing `touched` guard right next to it.)

- [ ] **Step 3: Manual verification (real accounts, deferred parts of Tasks 2/4 now come together)**

1. Sign in on device/browser A, edit a field, wait 4+ seconds — confirm `#syncStatus` shows `↻ Syncing…` then `☁ Synced`.
2. In the Drive web UI, confirm `ACR Utility/ACR <session>.acr.json` exists with the edited content.
3. Sign in with the **same** account in a second browser profile (simulating a second device) — confirm the year appears automatically with the edit, no import needed.
4. Turn off networking, edit a field — confirm `⚠ Offline — saved locally` appears and editing is unaffected; turn networking back on — confirm it syncs within a few seconds without a manual action.

- [ ] **Step 4: Commit**

```bash
git add src/drivesync.js src/app.js
git commit -m "Add automatic Drive sync loop: debounce, metadata-diff, status chip"
```

---

### Task 6: Conflict detection and conflict-copy creation

**Files:**
- Modify: `src/drivesync.js` (add `mergeDocsWithConflicts`, used by Task 5's `drivesyncRun`)
- Test: `tests/merge-conflict.test.js`

**Interfaces:**
- Consumes: nothing beyond plain document objects (pure function, like the existing `mergeDocs()` in `sync.js` it's modelled on).
- Produces: `mergeDocsWithConflicts(localDocs, remoteDocs)` → `{ docs: Array<doc>, conflicts: Array<doc> }` — `docs` is the reconciled set (same shape `mergeDocs()` already returns); `conflicts` holds a clone for every year where both sides were edited independently since they last agreed, each renamed to `<session> — Conflict Copy` with a fresh `id`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/merge-conflict.test.js
const assert = require('assert');
const { mergeDocsWithConflicts } = require('../src/drivesync.js');

function doc(id, session, updatedAt, rev, touched) {
  return { id, session, p1: { fullName: 'X' }, updatedAt, rev, touched: touched !== false, schemaVersion: 5 };
}

// Case 1: only the local side changed since they last agreed (rev advanced on one side only) — no conflict.
{
  const local = [doc('a', '2024-25', '2026-08-16T10:00:00Z', 3, true)];
  const remote = [doc('a', '2024-25', '2026-08-15T09:00:00Z', 2, true)];
  const { docs, conflicts } = mergeDocsWithConflicts(local, remote);
  assert.equal(conflicts.length, 0, 'no conflict when only one side advanced');
  assert.equal(docs[0].rev, 3);
}

// Case 2: both sides advanced past the last-known-agreed rev independently — real conflict.
{
  const local = [doc('a', '2024-25', '2026-08-16T10:00:00Z', 5, true)];
  const remote = [doc('a', '2024-25', '2026-08-16T10:05:00Z', 5, true)]; // same rev number reached independently on both sides
  const { docs, conflicts } = mergeDocsWithConflicts(local, remote);
  assert.equal(conflicts.length, 1, 'independent edits reaching the same rev must be flagged as a conflict');
  assert.ok(conflicts[0].session.endsWith(' — Conflict Copy'));
  assert.notEqual(conflicts[0].id, 'a');
  assert.equal(docs.length, 1, 'the reconciled set still contains exactly one normally-named record for the year');
}

// Case 3: an untouched starter copy never wins and never conflicts, exactly like mergeDocs() today.
{
  const local = [doc('a', '2024-25', '2026-08-16T10:00:00Z', 0, false)];
  const remote = [doc('a', '2024-25', '2026-08-10T10:00:00Z', 4, true)];
  const { docs, conflicts } = mergeDocsWithConflicts(local, remote);
  assert.equal(conflicts.length, 0);
  assert.equal(docs[0].rev, 4);
}

console.log('merge-conflict tests passed');
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node tests/merge-conflict.test.js`
Expected: `Error: Cannot find module '../src/drivesync.js'` reporting a missing export (module has no `module.exports` yet).

- [ ] **Step 3: Implement `mergeDocsWithConflicts` in `src/drivesync.js`**

Add near the top of the file, above `onAuthChange` (it has no dependency on anything else in the file):
```js
/* ---------- conflict-aware merge, layered on top of the existing per-year rule ----------
   mergeDocs() (sync.js) already gets the common cases right: newest updatedAt wins, and an
   untouched starter copy never beats real work. The only new case Drive introduces is two
   *touched* copies whose rev counters advanced independently since they last matched — that
   can only happen if both devices edited the same year while both were offline. That case
   gets a conflict copy instead of a silent winner. */
function mergeDocsWithConflicts(localDocs, remoteDocs) {
  const { docs, report } = mergeDocs(localDocs, remoteDocs);
  const conflicts = [];
  const localById = new Map((localDocs || []).filter((d) => d && d.id).map((d) => [d.id, d]));
  const remoteById = new Map((remoteDocs || []).filter((d) => d && d.id).map((d) => [d.id, d]));

  docs.forEach((winner) => {
    const local = localById.get(winner.id);
    const remote = remoteById.get(winner.id);
    if (!local || !remote) return;                 // one side never had this year — not a conflict
    if (!local.touched || !remote.touched) return;  // an untouched starter copy is never a real edit
    const loser = winner === local ? remote : local;
    const sameLineage = (loser.rev || 0) <= (winner.rev || 0) && Date.parse(loser.updatedAt) <= Date.parse(winner.updatedAt);
    if (sameLineage) return;                        // the loser is a strict ancestor of the winner — ordinary case, no conflict
    const clone = JSON.parse(JSON.stringify(loser));
    clone.id = uid();
    clone.session = winner.session + ' — Conflict Copy';
    conflicts.push(clone);
  });

  return { docs, conflicts, report };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mergeDocsWithConflicts };
}
```

*(`sameLineage` is the key rule: if the losing side's `rev` and `updatedAt` are both no greater than the winner's, it was simply an earlier save in the same edit history — `mergeDocs()`'s ordinary "newest wins" call is correct and nothing is lost. Only when the loser advanced its own `rev` past the point the two sides last agreed — meaning it was edited independently, offline, at the same time as the winner — does this produce a conflict copy.)*

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `node tests/merge-conflict.test.js`
Expected: `merge-conflict tests passed`

- [ ] **Step 5: Rebuild and confirm the browser bundle still parses**

Run: `python3 build.py`
Expected: `wrote ACR-Utility.html (NN.N KB)` with no error.

- [ ] **Step 6: Commit**

```bash
git add src/drivesync.js tests/merge-conflict.test.js
git commit -m "Add rev-based conflict detection and conflict-copy creation"
```

---

### Task 7: UI reorganization — "Account & cloud sync" as the primary path, existing linked-file card relabelled "Advanced"

**Files:**
- Modify: `src/app.js:562-611` (`PAGES.years()`)
- Modify: `src/app.js:893-926` (`bindGlobal()` — wire the existing `expAll` case to also call `drivesyncExportBackup()`)

**Interfaces:**
- Consumes: `AUTH`, `authAvailable()` (Task 2); `DRIVESYNC` (Task 5); everything already produced by earlier tasks.
- Produces: nothing new consumed elsewhere — this is the top of the UI tree for this feature.

- [ ] **Step 1: Add an "Account & cloud sync" card above the existing "Years on this device" card, and relabel the linked-file card**

`src/app.js`, in `PAGES.years()` (`src/app.js:562-611`), insert immediately after the opening of the function, before the `Years on this device` card's markup:
```js
  years() {
    const ix = loadIndex();
    const accountCard = `<div class="card"><h2>Account &amp; cloud sync</h2>
      <p class="sub">Sign in with your Google account to keep every year backed up and available on your other devices, automatically.</p>
      ${!authAvailable()
        ? '<div class="notice">' + (location.protocol === 'file:'
            ? 'Sign in needs the hosted version of this app — open it from its web address rather than this downloaded file.'
            : 'Sign-in is not configured for this deployment yet.') + '</div>'
        : AUTH.state === 'signed-in'
          ? '<p class="hint">Signed in as <b>' + esc(AUTH.account.email) + '</b>. ' +
            (DRIVESYNC.status === 'idle' ? 'Everything is synced.' :
             DRIVESYNC.status === 'syncing' ? 'Syncing now…' :
             DRIVESYNC.status === 'attention' ? 'Sync needs attention — try signing in again.' :
             'Offline — your work is saved on this device and will sync once you’re back online.') + '</p>' +
            '<div class="rowtools"><button class="btn" id="authArea2" data-auth-action="signOut">Sign out</button>' +
            '<button class="btn" id="syncNowDrive">Sync now</button></div>'
          : '<div class="rowtools"><button class="btn primary" id="authArea2" data-auth-action="signIn">Sign in with Google</button></div>'
      }</div>`;
    return accountCard + `<div class="card"><h2>Years on this device</h2>
```
*(the remainder of the existing function body — from `<p class="sub">Each year is stored separately...` through the "Backup & transfer" card — stays exactly as it is)*

Then, still within the same function, retitle the existing "Keep two computers in step automatically" card's heading (`src/app.js:592`):
```js
      <div class="card"><h2>Advanced: keep two computers in step without a Google account</h2>
      <p class="sub">Point this device at one file inside your Google Drive or OneDrive folder — useful if you'd rather not sign in with a Google account. Every save is written into it, and every time you open the utility it reads the file back
      and takes whichever version of each year was edited most recently.</p>
```
(only the `<h2>` text and the first sentence of the `<p class="sub">` change; the rest of that card — the buttons, the `#syncNote` div, the notice block — is unchanged.)

- [ ] **Step 2: Wire the two new buttons in `bindGlobal()`**

`src/app.js`, inside the existing `switch (b.id) { ... }` block (`src/app.js:893-926`), add:
```js
      case 'authArea2':
        if (b.dataset.authAction === 'signIn') authSignIn().catch((e) => toast(e.message, 5000));
        else if (b.dataset.authAction === 'signOut') authSignOut();
        break;
      case 'syncNowDrive': drivesyncRun(); break;
```

- [ ] **Step 3: Make manual Export Backup also drop a copy in Drive when signed in**

`src/app.js:899` — find the existing case:
```js
      case 'expAll': exportAll(); break;
```
change to:
```js
      case 'expAll': exportAll(); if (typeof drivesyncExportBackup === 'function') drivesyncExportBackup(); break;
```

- [ ] **Step 4: Rebuild and manually verify**

Run: `python3 build.py`. Open **Years & backup**: confirm the new "Account & cloud sync" card appears first, shows "Sign in with Google" when signed out, and shows "Signed in as …" plus live status text when signed in (matching whatever `DRIVESYNC.status` currently is). Confirm the old linked-file card now reads "Advanced: keep two computers in step without a Google account" and still works exactly as before (unaffected — only its heading text changed). Press **Export backup (.acrbak.json)** while signed in and confirm a `backup-<timestamp>.acrbak.json` file appears in `ACR Utility/Backups/` in Drive.

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "Reorganize Years & backup: Account & cloud sync as primary path, linked-file sync relabelled Advanced"
```

---

### Task 8: GitHub Pages deployment + dual-build docs

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Modify: `HOW-TO-USE.md`

**Interfaces:** none — this task is packaging/documentation only, no code interfaces.

- [ ] **Step 1: Add the GitHub Actions workflow**

```yaml
# .github/workflows/deploy-pages.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build the single-file app
        run: python3 build.py
      - name: Prepare Pages output
        run: |
          mkdir -p _site
          cp ACR-Utility.html _site/index.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@v4
```

This copies the exact same build output `build.py` already produces to `index.html` — GitHub Pages then serves it at the stable HTTPS origin required for the `google-client-id` in `src/shell.html` to be registered as an authorized JavaScript origin in Google Cloud Console (spec §19). No new build tooling is introduced — `python3 build.py` is the same command used throughout this plan.

- [ ] **Step 2: Enable Pages in the repository (manual, one-time, GitHub UI — not a code change)**

In the repository's Settings → Pages, set Source to "GitHub Actions." This step cannot be scripted from within this plan; note it as a manual action to perform once, alongside the Google Cloud Console setup from spec §19.

- [ ] **Step 3: Update `HOW-TO-USE.md`**

Add a new section near the top, after the introductory paragraph, titled "Signing in with Google (recommended)" describing: the Sign in with Google button in **Years & backup**, that it creates the visible "ACR Utility" folder in the teacher's own Drive automatically, that sync then happens automatically with the four status states, and that Export/Import Backup remain available regardless. Retitle the existing "Keeping two computers in step automatically" section to "Advanced: keeping two computers in step without a Google account," matching Task 7's in-app wording, and add one sentence at its start: "Most teachers should use Sign in with Google instead (see above) — this section is for anyone who would rather not use a Google account."

- [ ] **Step 4: Final full regression pass before calling this feature complete**

Run every existing test plus the new ones:
```bash
node tests/no-personal-data.test.js
node tests/drive-api.test.js
node tests/merge-conflict.test.js
node tests/api-rules.test.js
python3 build.py
```
All must pass/succeed. Then, in a browser, walk through the acceptance criteria in spec §24 end-to-end on real Windows/Android/iPhone devices with the deployed GitHub Pages URL and a real `google-client-id`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-pages.yml HOW-TO-USE.md
git commit -m "Add GitHub Pages deployment workflow and update documentation"
```

---

## Self-Review Notes

- **Spec coverage**: every lettered/numbered item in the spec (§1–§24) maps to a task above — §3 attribution → Task 1; §4/§11 auth → Task 2; §5/§6/§9 Drive scope+folder+sync mechanics → Tasks 3/5; §7/§20 isolation+migration → Task 4; §10 offline states → Task 5; §12 conflicts → Task 6; §13 manual backup → Task 7 Step 3; §14 linked-file coexistence → Task 7; §15/§19 GitHub Pages+OAuth origins → Task 8; §17/§18 verified facts and cost are pre-implementation research, not code, and don't produce a task. §22 "lock completed years" was explicitly deferred in the spec and stays deferred here.
- **Placeholder scan**: no "TBD"/"add appropriate handling" strings appear; the one genuinely-external value (`google-client-id`) ships as an intentionally empty, clearly-explained configuration seam with its own verification step, not a skipped detail.
- **Type/signature consistency checked**: `mergeDocsWithConflicts(localDocs, remoteDocs)` (Task 6) is called with exactly that signature in Task 5's `drivesyncRun`; `driveEnsureWorkspace/driveListYearFiles/driveGetFileContent/driveUpsertYearFile/driveWriteBackupSnapshot` (Task 3) are called in Task 5 with matching argument order and names; `authGetToken/authSignIn/authSignOut/authAvailable/onAuthChange` (Task 2) are called consistently in Tasks 4, 5, and 7; `ACTIVE_NS`/`nsKey`/`reloadWorkspace`/`loadActiveDoc` (Task 4) are used as defined by Task 5 and Task 7.
