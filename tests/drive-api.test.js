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

(async () => {
  global.fetch = makeFetchStub([{ body: { files: [] } }, { body: { id: 'root123' } }, { body: { files: [] } }, { body: { id: 'backups456' } }]);
  delete require.cache[require.resolve('../src/drive.js')];
  const drive = require('../src/drive.js');

  const ws = await drive.driveEnsureWorkspace('tok');
  assert.equal(ws.rootId, 'root123');
  assert.equal(ws.backupsId, 'backups456');
  assert.ok(global.fetch.calls[0].url.includes('appTag'), 'root lookup must query the appTag property');

  global.fetch = makeFetchStub([{ body: { id: 'file789' } }]);
  const fileId = await drive.driveUpsertYearFile('tok', 'root123', { id: 'doc1', session: '2025-26', schemaVersion: 5, rev: 0 }, null);
  assert.equal(fileId, 'file789');
  const createCall = global.fetch.calls[0];
  assert.ok(createCall.url.includes('/upload/drive/v3/files'), 'creating a new year file must POST to the upload endpoint');
  assert.equal(createCall.opts.method, 'POST');

  global.fetch = makeFetchStub([{ body: {} }, { body: {} }]);
  const fileId2 = await drive.driveUpsertYearFile('tok', 'root123', { id: 'doc1', session: '2025-26', schemaVersion: 5, rev: 1 }, 'file789');
  assert.equal(fileId2, 'file789');
  assert.equal(global.fetch.calls[0].opts.method, 'PATCH', 'updating an existing year file must PATCH, not POST');

  global.fetch = makeFetchStub([{ ok: false, status: 401, body: {} }]);
  let threw = false;
  try { await drive.driveListYearFiles('tok', 'root123'); } catch (e) { threw = true; assert.equal(e.status, 401); }
  assert.ok(threw, 'a non-2xx Drive response must throw with .status set');

  global.fetch = makeFetchStub([{ body: { id: 'bk1' } }]);
  const bkId = await drive.driveWriteBackupSnapshot('tok', 'backups456', [{ id: 'doc1', session: '2025-26' }]);
  assert.equal(bkId, 'bk1');
  assert.ok(global.fetch.calls[0].url.includes('/upload/drive/v3/files'));

  console.log('drive-api tests passed');
})();
