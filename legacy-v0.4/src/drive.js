/* ===================== GOOGLE DRIVE REST MODULE =====================
   Pure functions of (token, ...). Knows nothing about sign-in state or
   the app's document model beyond the small subset of fields it reads
   (id, session, schemaVersion, rev) to tag files for later lookup.
   Scope used everywhere this module is called: drive.file — every request
   below only ever touches files/folders this app itself created.
======================================================================== */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

async function driveApiFetch(token, url, opts) {
  const r = await fetch(url, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + token }, (opts && opts.headers) || {})
  }));
  if (!r.ok) {
    /* Capture Google's own error message so a real API failure (wrong scope, Drive API
       not enabled, malformed request, etc.) is distinguishable from "no network reached
       Google at all" — never includes the token or any ACR content, only Drive's own
       short error description. */
    let reason = '';
    try { const body = await r.json(); reason = (body && body.error && body.error.message) || ''; } catch (e) {}
    const err = new Error('Drive request failed (' + r.status + ')' + (reason ? ': ' + reason : ''));
    err.status = r.status;                 // presence of .status proves a real HTTP response came back — i.e. we are not offline
    if (r.status === 401) err.needsSignIn = true; // token invalid/expired — re-signing in resolves this specifically
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
  const root = await driveFindByProperty(token, 'appTag', 'acr-utility-root');
  const rootId = root ? root.id : await driveCreateFolder(token, 'ACR Utility', { appTag: 'acr-utility-root' });

  const backups = await driveFindByProperty(token, 'appTag', 'acr-utility-backups', ["'" + rootId + "' in parents"]);
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
