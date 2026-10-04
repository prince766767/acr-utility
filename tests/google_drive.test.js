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
  assert.equal(query(fetch.calls[0].url), "name='ACR Utility - Word and PDF' and mimeType='application/vnd.google-apps.folder' and trashed=false");
});

test('ensureFolder creates the folder when none is found', async () => {
  const fetch = fakeFetch([json({ files: [] }), json({ id: 'F2' })]);
  const id = await createDrive({ fetch, getToken: tokens('T1') }).ensureFolder();
  assert.equal(id, 'F2');
  assert.equal(fetch.calls[1].method, 'POST');
  assert.ok(fetch.calls[1].url.startsWith(API));
  assert.deepEqual(JSON.parse(fetch.calls[1].body), { name: 'ACR Utility - Word and PDF', mimeType: 'application/vnd.google-apps.folder' });
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
  const o = { requests: [], config: null, hasGrantedAllScopes: (r, scope) => r.granted !== false };
  o.initTokenClient = cfg => {
    o.config = cfg;
    return {
      requestAccessToken: opts => {
        o.requests.push(opts);
        const r = replies.shift();
        if (!r) return; // never calls back
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

test('a sign-in that never answers times out and allows a retry', async () => {
  const replies = [null, { access_token: 'A', expires_in: 3600 }];
  const oauth = fakeOauth(replies);
  const src = createTokenSource({ clientId: 'CID', gis: async () => oauth, signInTimeoutMs: 20 });
  await assert.rejects(src.getToken(), { message: 'Google sign-in did not finish. Please try again.' });
  assert.equal(await src.getToken(), 'A');
  assert.equal(oauth.requests.length, 2);
});

test('a token without Drive access is refused and not kept', async () => {
  const oauth = fakeOauth([{ access_token: 'X', expires_in: 3600, granted: false }, { access_token: 'A', expires_in: 3600 }]);
  const src = createTokenSource({ clientId: 'CID', gis: async () => oauth });
  await assert.rejects(src.getToken(), { message: 'Google Drive access was not allowed. Please try again and tick the Google Drive box.' });
  assert.equal(await src.getToken(), 'A');
});
