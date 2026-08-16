/* ===================== LINKED-FILE SYNC =====================
   Points the utility at one file the user chooses — normally inside a
   Google Drive / OneDrive folder that the desktop client keeps in the cloud.
   Every save is written into that file; every start reads it back and merges.
   Needs the File System Access API: Chrome and Edge on Windows, macOS and
   Android. Safari and Firefox fall back to manual export / import.
============================================================== */

const SYNC_SUPPORTED = typeof window !== 'undefined' &&
  typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';

const SYNC = { handle: null, name: '', state: 'off', last: null, busy: false, timer: null };
/* state: off | linked | needs-permission | syncing | error | unsupported */

/* ---------- the handle has to live in IndexedDB; localStorage cannot hold it ---------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('acr-sync', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('handles');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(v, k);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('handles');
    const q = tx.objectStore('handles').get(k);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
async function idbDel(k) {
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete(k); tx.oncomplete = res;
  });
}

/* ---------- merge: newest edit of each year wins ----------
   Pure and side-effect free so it can be tested on its own.            */
function mergeDocs(localDocs, remoteDocs) {
  const map = new Map();
  const stamp = (d) => Date.parse(d && d.updatedAt) || 0;
  const report = { added: [], updated: [], kept: [], dropped: [], total: 0 };

  const remote = (remoteDocs || []).filter((d) => d && d.id);
  const remoteIds = new Set(remote.map((d) => d.id));
  /* A year this device created but never edited is not data — it is the app's
     own starting point. If the sync file already holds years, drop it rather
     than pushing a duplicate into the shared file. */
  (localDocs || []).forEach((d) => {
    if (!d || !d.id) return;
    if (remote.length && d.touched === false && !remoteIds.has(d.id)) { report.dropped.push(d.session || d.id); return; }
    map.set(d.id, d);
  });
  remote.forEach((d) => {
    if (!d || !d.id) return;
    const mine = map.get(d.id);
    if (!mine) { map.set(d.id, d); report.added.push(d.session || d.id); return; }
    /* Work always beats a never-edited copy, whatever the clock says: a device
       that has only just been set up carries a fresh timestamp but no content. */
    const t1 = !!d.touched, t2 = !!mine.touched;
    const remoteWins = t1 !== t2 ? t1 : stamp(d) > stamp(mine);
    if (remoteWins) { map.set(d.id, d); report.updated.push(d.session || d.id); }
    else report.kept.push(d.session || d.id);
  });

  const docs = Array.from(map.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  report.total = docs.length;
  return { docs, report };
}

/* ---------- permission ---------- */
async function syncPermission(request) {
  if (!SYNC.handle || typeof SYNC.handle.queryPermission !== 'function') return 'denied';
  const opt = { mode: 'readwrite' };
  try {
    let p = await SYNC.handle.queryPermission(opt);
    if (p !== 'granted' && request) p = await SYNC.handle.requestPermission(opt);
    return p;
  } catch (e) { return 'denied'; }
}

/* ---------- read / write ---------- */
async function syncRead() {
  const file = await SYNC.handle.getFile();
  const text = await file.text();
  if (!text.trim()) return [];
  const raw = JSON.parse(text);
  if (raw.kind !== 'acr-backup' || !Array.isArray(raw.docs)) throw new Error('That file is not an ACR backup.');
  return raw.docs;
}
async function syncWrite(docs) {
  const w = await SYNC.handle.createWritable();
  await w.write(JSON.stringify({ kind: 'acr-backup', version: 1, exportedAt: nowISO(), docs }, null, 2));
  await w.close();
}

/* ---------- link / unlink ---------- */
async function syncLink(mode) {
  if (!SYNC_SUPPORTED) { toast('This browser cannot link a file. Use Export / Import instead.', 5000); return; }
  try {
    const opts = {
      suggestedName: 'ACR-sync.acrbak.json',
      types: [{ description: 'ACR backup', accept: { 'application/json': ['.json'] } }]
    };
    SYNC.handle = mode === 'open'
      ? (await window.showOpenFilePicker({ ...opts, multiple: false }))[0]
      : await window.showSaveFilePicker(opts);
    SYNC.name = SYNC.handle.name;
    SYNC.state = 'linked';
    lsSet('acr.sync.name', SYNC.name);

    /* remembering the handle is a convenience, not a precondition — if the
       browser refuses to store it, sync still works for this session */
    let remembered = true;
    try { await idbPut('syncFile', SYNC.handle); } catch (e) { remembered = false; }

    await syncRun(true);
    toast(remembered
      ? 'Linked to ' + SYNC.name + '. It will now update itself on every save.'
      : 'Linked to ' + SYNC.name + ' for this session. This browser would not remember the link, so you will need to link it again next time.',
      remembered ? 4500 : 7000);
  } catch (e) {
    if (e && e.name === 'AbortError') return;          // user closed the picker
    SYNC.state = 'error'; syncPaint();
    toast('Could not link that file: ' + e.message, 5000);
  }
}
async function syncUnlink() {
  SYNC.handle = null; SYNC.name = ''; SYNC.state = 'off'; SYNC.last = null;
  await idbDel('syncFile'); lsDel('acr.sync.name');
  syncPaint(); render();
  toast('Sync file unlinked. Your years stay on this device.');
}

/* ---------- the sync cycle: read, merge, write ---------- */
async function syncRun(loud) {
  if (!SYNC.handle || SYNC.busy) return;
  const perm = await syncPermission(false);
  if (perm !== 'granted') { SYNC.state = 'needs-permission'; syncPaint(); return; }

  SYNC.busy = true; SYNC.state = 'syncing'; syncPaint();
  try {
    const localDocs = loadIndex().map((r) => loadDocById(r.id)).filter(Boolean);
    let remoteDocs = [];
    try { remoteDocs = await syncRead(); }
    catch (e) { if (!/not an ACR backup/.test(e.message)) remoteDocs = []; else throw e; }

    const { docs, report } = mergeDocs(localDocs, remoteDocs.map(migrate));

    /* adopt anything the other device edited more recently */
    const openId = S.doc && S.doc.id;
    const keep = new Set(docs.map((d) => d.id));
    let changed = false;
    /* mergeDocs already decided every winner — do not second-guess it here,
       just store whatever differs from what this device currently holds */
    docs.forEach((d) => {
      const next = JSON.stringify(d);
      if (lsGet(LS_DOC(d.id)) === next) return;
      lsSet(LS_DOC(d.id), next);
      if (d.id === openId) S.doc = migrate(d);
      changed = true;
    });
    /* clear out pristine starter years the merge discarded */
    loadIndex().forEach((r) => { if (!keep.has(r.id)) { lsDel(LS_DOC(r.id)); changed = true; } });
    saveIndex(docs.map((d) => ({ id: d.id, session: d.session, name: d.p1.fullName, updatedAt: d.updatedAt })));

    /* the year on screen may have just been discarded — open the newest instead */
    if (!keep.has(openId) && docs.length) { S.doc = migrate(docs[0]); lsSet(LS_CUR, S.doc.id); changed = true; }

    await syncWrite(docs);
    SYNC.last = new Date(); SYNC.state = 'linked';

    if (changed) render();
    const n = report.added.length + report.updated.length;
    if (n) toast('Pulled in ' + n + ' newer year' + (n > 1 ? 's' : '') + ' from ' + SYNC.name + '.', 4000);
    else if (loud) toast('Synced with ' + SYNC.name + '.');
  } catch (e) {
    SYNC.state = 'error';
    toast('Sync failed: ' + e.message + ' — your work is still safe on this device.', 6000);
  } finally {
    SYNC.busy = false; syncPaint();
  }
}

/* write-behind: a save every few keystrokes should not hammer the disk */
function syncSchedule() {
  if (!SYNC.handle || SYNC.state === 'needs-permission') return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(() => syncRun(false), 4000);
}

/* ---------- status chip ---------- */
function syncPaint() {
  const el = $('#syncStatus'); if (!el) return;
  const time = SYNC.last ? SYNC.last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const M = {
    off: ['', ''],
    unsupported: ['', ''],
    linked: ['synced' + (time ? ' · ' + time : ''), 'saved'],
    syncing: ['syncing…', 'dirty'],
    'needs-permission': ['sync paused — tap to reconnect', 'dirty'],
    error: ['sync error — tap to retry', 'dirty']
  };
  const [text, cls] = M[SYNC.state] || ['', ''];
  el.textContent = text;
  el.className = 'btn ghost sm status ' + cls;
  el.style.display = text ? '' : 'none';
  el.style.cursor = (SYNC.state === 'needs-permission' || SYNC.state === 'error') ? 'pointer' : 'default';
  const note = $('#syncNote');
  if (note) note.innerHTML = syncNoteHTML();
}

function syncNoteHTML() {
  if (!SYNC_SUPPORTED) {
    return '<div class="notice">This browser cannot link a file — that needs Chrome or Edge. ' +
      'Use <b>Export backup</b> and <b>Import a backup</b> above to move years between devices.</div>';
  }
  if (!SYNC.handle) {
    return '<p class="hint">Not linked. Pick a file inside your Google Drive or OneDrive folder and ' +
      'this device will keep it up to date by itself.</p>';
  }
  const t = SYNC.last ? 'Last synced at ' + SYNC.last.toLocaleTimeString() + '.' : 'Not synced yet this session.';
  if (SYNC.state === 'needs-permission') {
    return '<div class="notice">Linked to <b>' + esc(SYNC.name) + '</b>, but the browser needs your ' +
      'permission again for this session. Press <b>Sync now</b> and allow access.</div>';
  }
  return '<p class="hint">Linked to <b>' + esc(SYNC.name) + '</b>. ' + esc(t) +
    ' Saves are written to it a few seconds after you stop typing.</p>';
}

/* ---------- boot ---------- */
async function syncBoot() {
  if (!SYNC_SUPPORTED) { SYNC.state = 'unsupported'; syncPaint(); return; }
  try {
    const h = await idbGet('syncFile');
    if (!h) { syncPaint(); return; }
    SYNC.handle = h; SYNC.name = h.name || lsGet('acr.sync.name') || 'sync file';
    const perm = await syncPermission(false);
    SYNC.state = perm === 'granted' ? 'linked' : 'needs-permission';
    syncPaint();
    if (perm === 'granted') await syncRun(false);
  } catch (e) { SYNC.state = 'error'; syncPaint(); }
}
