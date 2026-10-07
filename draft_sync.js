// Keeping the draft in the teacher's Google Drive so they can continue on another device
// (spec docs/superpowers/specs/2026-10-04-draft-in-drive-design.md). No browser code here: the Drive calls and the
// "which copy?" question come in from the caller, so every decision can be unit-tested.

const PREFIX = 'ACR draft ';
const SYNC_KEY = 'acrUtility:sync:';
// Selects that always have a value, so they say nothing about whether the teacher has filled anything in.
const DEFAULT_SELECTS = new Set(['title', 'relation', 'serviceStatus', 'researchYesNo', 'p24Satisfied']);
const NOT_CONTENT = new Set(['savedAt', 'ui', 'deviceLabel', 'contentHash']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function stable(x) {
  if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}';
  return JSON.stringify(x === undefined ? null : x);
}

// Fingerprint of the answers: the time it was saved and the open tab do not count as changes.
export function contentHash(record) {
  const r = { ...(record || {}) };
  for (const k of NOT_CONTENT) delete r[k];
  const s = stable(r);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function anyLeaf(x) {
  if (Array.isArray(x)) return x.length > 0;
  if (x && typeof x === 'object') return Object.values(x).some(anyLeaf);
  if (typeof x === 'string') return x.trim() !== '';
  if (typeof x === 'number') return x !== 0;
  return x === true;
}

// Does this record hold anything the teacher typed or ticked?
export function hasData(record) {
  if (!record || typeof record !== 'object') return false;
  for (const [k, v] of Object.entries(record)) {
    if (NOT_CONTENT.has(k) || k === 'session' || k === 'style') continue;
    if (k === 'enclosures') { if (Array.isArray(v) && v.some(e => e && (e.checked || e.custom))) return true; continue; }
    if (k === 'profile' || k === 'part1' || k === 'part2') {
      if (v && typeof v === 'object' && Object.entries(v).some(([f, x]) => !DEFAULT_SELECTS.has(f) && anyLeaf(x))) return true;
      continue;
    }
    if (anyLeaf(v)) return true;
  }
  return false;
}

export const driveName = session => `${PREFIX}${session ? session : '(no session)'}.acr.json`;

export function sessionFromName(name) {
  if (name === `${PREFIX}(no session).acr.json`) return '';
  const m = /^ACR draft ([0-9]{4}-[0-9]{2})\.acr\.json$/.exec(name);
  return m ? m[1] : null;
}

// Seconds and the device it came from keep two kept copies from ever sharing a name (and replacing each other).
export function otherCopyName(session, when, from = '') {
  const d = new Date(when);
  const p2 = n => String(n).padStart(2, '0');
  const t = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p2(d.getUTCHours())}-${p2(d.getUTCMinutes())}-${p2(d.getUTCSeconds())} UTC`;
  const safe = String(from).replace(/[\/:*?"<>|]/g, '-').trim();
  return `${PREFIX}${session ? session : '(no session)'} (other copy, ${t}${safe ? ', ' + safe : ''}).acr.json`;
}

// Enclosure files sit in the same Drive folder, one Drive file per attached file; the record lists them.
export const FILE_PREFIX = 'ACR enclosure ';
const sessionLabel = session => (session ? session : '(no session)');
export const fileDriveName = (session, id, name) => `${FILE_PREFIX}${sessionLabel(session)} - ${id} - ${name}`;

export function fileIdFromName(name, session) {
  const p = `${FILE_PREFIX}${sessionLabel(session)} - `;
  if (!String(name).startsWith(p)) return null;
  const m = /^([0-9a-z]{12}) - /.exec(name.slice(p.length));
  return m ? m[1] : null;
}

export const recordFiles = record => (Array.isArray(record?.enclosures) ? record.enclosures : [])
  .flatMap(e => (e && Array.isArray(e.files) ? e.files : []))
  .filter(f => f && typeof f === 'object' && /^[0-9a-z]{12}$/.test(String(f.id)))
  .map(f => ({ id: f.id, name: String(f.name || 'file'), type: String(f.type || 'application/octet-stream') }));

// What to do for one session. localSync = { hash } from the last time this device and Drive agreed.
export function decide({ local, localSync, remote }) {
  if (!remote) return local && hasData(local) ? 'upload' : 'nothing';
  if (!local || !hasData(local)) return 'load';
  const lh = contentHash(local), rh = contentHash(remote.record);
  if (lh === rh) return 'nothing';
  const deviceChanged = !localSync || localSync.hash !== lh;
  const driveChanged = !localSync || localSync.hash !== rh;
  if (!deviceChanged && driveChanged) return 'ask-load';
  if (deviceChanged && !driveChanged) return 'upload';
  return 'ask-conflict';
}

const strip = json => { const r = { ...json }; delete r.deviceLabel; delete r.contentHash; return r; };

// deps: store (localStorage-like), sessions (sessions.js), drive ({ensureFolder, listFiles, downloadText, upsertFile,
// downloadBytes, deleteFile}), files (optional enclosure file store: ids, get, put), ask(kind, {session, local, remote})
// -> 'drive' | 'device', deviceLabel, now.
export function createDraftSync({ store, sessions, drive, files = null, ask, deviceLabel = '', now = () => new Date() }) {
  const syncKey = session => SYNC_KEY + (session || '(no session)');
  const getSync = session => { try { return JSON.parse(store.getItem(syncKey(session)) || 'null'); } catch { return null; } };
  const setSync = (session, hash, fileId) => store.setItem(syncKey(session), JSON.stringify({ hash, fileId }));

  async function put(folderId, name, record) {
    const body = { ...record, savedAt: record.savedAt || now().toISOString(), deviceLabel, contentHash: contentHash(record) };
    return drive.upsertFile({ name, bytes: new TextEncoder().encode(JSON.stringify(body)), mime: 'application/json', folderId });
  }

  async function syncOne(session, folderId, files) {
    const file = files.find(f => f.name === driveName(session));
    const remoteJson = file ? JSON.parse(await drive.downloadText(file.id)) : null;
    const remote = remoteJson ? { record: strip(remoteJson), savedAt: remoteJson.savedAt, deviceLabel: remoteJson.deviceLabel || '' } : null;
    const local = sessions.readRecord(store, session);
    const action = decide({ local, localSync: getSync(session), remote });
    const load = () => { const r = { ...remote.record, session }; sessions.saveRecord(store, r); setSync(session, contentHash(r), file.id); return r; };
    const upload = async () => { const up = await put(folderId, driveName(session), local); setSync(session, contentHash(local), up.id); };
    if (action === 'nothing') {
      if (remote && local) setSync(session, contentHash(local), file.id);
      return { session, action };
    }
    if (action === 'upload') { await upload(); return { session, action }; }
    if (action === 'load') return { session, action, loaded: load() };
    const choice = await ask(action, { session, local, remote });
    if (choice === 'drive') {
      await put(folderId, otherCopyName(session, now(), deviceLabel), local);   // the device copy is kept in Drive
      return { session, action, choice, loaded: load() };
    }
    await put(folderId, otherCopyName(session, remote.savedAt || now(), remote.deviceLabel), remote.record);   // the Drive copy is kept
    await upload();
    return { session, action, choice };
  }

  // After the record has synced: the record is the truth for which files exist.
  async function syncFiles(session, folderId, listed) {
    if (!files) return {};
    const want = recordFiles(sessions.readRecord(store, session));
    const here = new Set(await files.ids(session));
    const there = new Map();
    for (const f of listed) { const id = fileIdFromName(f.name, session); if (id) there.set(id, f); }
    let failed = 0;
    for (const f of want) {
      try {
        if (here.has(f.id) && !there.has(f.id)) {
          const rec = await files.get(session, f.id);
          await drive.upsertFile({ name: fileDriveName(session, f.id, f.name), bytes: rec.bytes, mime: rec.type, folderId });
        } else if (!here.has(f.id) && there.has(f.id)) {
          const bytes = await drive.downloadBytes(there.get(f.id).id);
          await files.put({ session, id: f.id, name: f.name, type: f.type, size: bytes.length, bytes, addedAt: now().toISOString() });
        }
      } catch (err) { console.warn('Enclosure file not synced:', err); failed++; }
    }
    const keep = new Set(want.map(f => f.id));
    for (const [id, f] of there) {
      if (keep.has(id)) continue;
      try { await drive.deleteFile(f.id); } catch (err) { console.warn('Enclosure file not deleted:', err); failed++; }
    }
    return failed ? { filesFailed: failed } : {};
  }
  const listFileCopies = folderId => (files ? drive.listFiles(folderId, FILE_PREFIX) : []);

  async function sessionsHere() {
    const list = sessions.listSessions(store);
    if (sessions.readRecord(store, '')) list.push('');
    return list;
  }

  return {
    async syncSession(session) {
      const folderId = await drive.ensureFolder();
      const result = await syncOne(session, folderId, await drive.listFiles(folderId, PREFIX));
      return { ...result, ...(await syncFiles(session, folderId, await listFileCopies(folderId))) };
    },
    async syncAll() {
      const folderId = await drive.ensureFolder();
      const drafts = await drive.listFiles(folderId, PREFIX);
      const copies = await listFileCopies(folderId);
      const names = new Set(await sessionsHere());
      for (const f of drafts) { const s = sessionFromName(f.name); if (s !== null) names.add(s); }
      const out = [];
      for (const s of [...names].sort()) out.push({ ...(await syncOne(s, folderId, drafts)), ...(await syncFiles(s, folderId, copies)) });
      return out;
    },
  };
}
