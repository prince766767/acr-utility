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
