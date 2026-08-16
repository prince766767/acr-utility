/* ===================== DRIVE SYNC ORCHESTRATION =====================
   Ties auth.js + drive.js to the existing local document store. This file
   owns: which account namespace is active, the first-sign-in migration
   offer, and (from here on down) the automatic sync loop.
========================================================================= */

function driveNamespaceFor(account) { return 'acct.' + account.sub + '.'; }

/* Only offer to migrate local data that was actually edited — a fresh, never-touched
   starter document is not real work, so there is nothing worth carrying over. */
function offerMigrationIfNeeded(account) {
  const hadLocalWork = loadIndex().some((r) => {
    const d = loadDocById(r.id);
    return d && d.touched;
  });
  if (!hadLocalWork) return false;
  return confirm('Existing ACR data found on this device. Would you like to add it to your Google account?');
}

/* ---------- conflict-aware merge, layered on top of the existing per-year rule ----------
   mergeDocs() (sync.js) already gets the common cases right: newest updatedAt wins, and an
   untouched starter copy never beats real work. The only new case Drive introduces is two
   *touched* copies that diverged independently since they last agreed — that can only happen
   if both devices edited the same year while both were offline.

   Why "equal rev" is the divergence signal: persist() increments rev by exactly 1 on every
   real edit, and a successful sync always writes both sides back at the SAME rev (via
   {touch:false}, which does not bump it). So immediately after any sync, local.rev ===
   remote.rev by construction. From that shared point, if only one side is edited further,
   its rev pulls strictly ahead while the other stays behind — an ordinary, safely-resolved
   case (the behind side simply hasn't changed since the two last agreed). But if BOTH sides
   are edited independently before reconnecting, each advances by its own +1 steps from that
   same shared rev — landing back on the *same* rev number with genuinely different content.
   Equal revs with different content is therefore exactly the fingerprint of two independent
   offline edits, and unequal revs is exactly the fingerprint of one side simply being behind. */
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
    if ((loser.rev || 0) !== (winner.rev || 0)) return; // ranks differ — the loser is simply behind, not a real conflict
    if (JSON.stringify(loser) === JSON.stringify(winner)) return; // identical content — nothing to reconcile
    const clone = JSON.parse(JSON.stringify(loser));
    clone.id = uid();
    clone.session = winner.session + ' — Conflict Copy';
    conflicts.push(clone);
  });

  return { docs, conflicts, report };
}

/* ---------- error classification for the sync status chip ----------
   A request that reached Google and got back a real HTTP response (.status set, either
   by driveApiFetch's Drive API calls or by auth.js's own token-endpoint calls) proves the
   device is online — whatever went wrong is a real API/auth problem, not connectivity, and
   must never be shown to the teacher as "Offline". Only an error with no .status at all
   (fetch failed before any response came back — DNS/network/CORS-level) is a genuine
   connectivity failure. This was the root cause of "Offline" showing right after a
   successful, fully-online sign-in: every non-connectivity error used to be mislabelled
   the same way. */
function classifySyncError(e) {
  if (e && e.needsSignIn) return { status: 'attention', toastMessage: null };
  const reachedServer = typeof (e && e.status) === 'number';
  if (!reachedServer) return { status: 'offline', toastMessage: null };
  return {
    status: 'attention',
    toastMessage: 'Sync could not complete (' + (e && e.message ? e.message : 'unknown Drive error') + '). Your work is still saved on this device.'
  };
}

/* ---------- account-switch wiring (browser only — see the guard at the bottom of this file) ---------- */
function drivesyncOnAuthChange(auth) {
  console.log('[ACR-sync] auth changed:', auth.state);
  if (auth.state === 'signed-in' && auth.account) {
    const wasNs = ACTIVE_NS;
    const targetNs = driveNamespaceFor(auth.account);
    if (wasNs === targetNs) { console.log('[ACR-sync] already on this account\'s workspace, nothing to do'); return; }
    // Read local (pre-sign-in or previous-account) data BEFORE switching namespace.
    ACTIVE_NS = '';
    const migrateLocal = wasNs === '' && offerMigrationIfNeeded(auth.account);
    const toCopy = migrateLocal ? loadIndex().map((r) => loadDocById(r.id)).filter(Boolean) : [];
    ACTIVE_NS = targetNs;
    if (migrateLocal) {
      toCopy.forEach((d) => persist(migrate(d)));
      toast(toCopy.length + ' year(s) added to your Google account.');
    }
    reloadWorkspace();
    console.log('[ACR-sync] starting first sync after sign-in');
    drivesyncRun();
  } else if (auth.state === 'signed-out') {
    ACTIVE_NS = '';
    DRIVESYNC.workspace = null;
    reloadWorkspace();
  }
}

/* ---------- automatic sync loop ---------- */
const DRIVESYNC = { status: 'idle', workspace: null, timer: null, busy: false, lastError: null };

function drivesyncPaint() {
  const el = $('#syncStatus'); if (!el) return;
  if (AUTH.state !== 'signed-in') { el.style.display = 'none'; return; }
  const M = {
    idle: ['☁ Synced', 'saved'],
    syncing: ['↻ Syncing…', 'dirty'],
    offline: ['⚠ Offline — saved locally', 'dirty'],
    attention: ['⚠ Sync needs attention', 'dirty']
  };
  const [text, cls] = M[DRIVESYNC.status] || M.idle;
  el.textContent = text; el.className = 'btn ghost sm status ' + cls; el.style.display = '';
}

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
  if (DRIVESYNC.busy) { console.log('[ACR-sync] skipped: a sync is already in progress'); return; }
  if (AUTH.state !== 'signed-in') { console.log('[ACR-sync] skipped: not signed in (state=' + AUTH.state + ')'); return; }
  if (!navigator.onLine) { console.log('[ACR-sync] skipped: navigator.onLine is false'); DRIVESYNC.status = 'offline'; drivesyncPaint(); return; }
  console.log('[ACR-sync] run: starting');
  DRIVESYNC.busy = true; DRIVESYNC.status = 'syncing'; drivesyncPaint();
  try {
    const token = await authGetToken();
    console.log('[ACR-sync] run: access token acquired, requesting ACR Utility folder (first Drive API call)…');
    const { rootId, backupsId } = await drivesyncEnsureWorkspace(token);
    console.log('[ACR-sync] run: workspace ready, folder id present:', !!rootId, 'backups id present:', !!backupsId);
    DRIVESYNC.workspace = { rootId, backupsId };

    const remoteFiles = await driveListYearFiles(token, rootId);
    console.log('[ACR-sync] run: year-files currently in Drive:', remoteFiles.length);
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
      console.log('[ACR-sync] run: wrote year file to Drive, id present:', !!fileId);
      drivesyncSetMeta(d.id, { driveFileId: fileId, driveModifiedTime: new Date().toISOString(), lastSyncedRev: d.rev });
    }

    if (mergedDocs.some((d) => !remoteFiles.find((f) => f.properties && f.properties.acrDocId === d.id)) || conflicts.length) {
      reloadWorkspace();
    }

    console.log('[ACR-sync] run: completed successfully');
    DRIVESYNC.status = 'idle'; DRIVESYNC.lastError = null;
  } catch (e) {
    console.error('[ACR-sync] run: failed —', e && e.status ? 'HTTP ' + e.status + ': ' : '', e && e.message);
    DRIVESYNC.lastError = e;
    const cls = classifySyncError(e);
    DRIVESYNC.status = cls.status;
    if (cls.toastMessage) toast(cls.toastMessage, 7000);
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

/* Real-browser-only wiring. Guarded so this file stays require()-able under Node for
   testing the pure logic above (mergeDocsWithConflicts) without a DOM. */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof onAuthChange === 'function') {
  onAuthChange(drivesyncOnAuthChange);
  window.addEventListener('online', () => drivesyncRun());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') drivesyncRun(); });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mergeDocsWithConflicts, classifySyncError };
}
