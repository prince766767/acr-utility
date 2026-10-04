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
  try { await drive.driveListYearFiles('tok', 'root123'); } catch (e) {
    threw = true;
    assert.equal(e.status, 401);
    assert.equal(e.needsSignIn, true, 'a 401 must be flagged needsSignIn — an expired/invalid token is fixed by signing in again, not by waiting for connectivity');
  }
  assert.ok(threw, 'a non-2xx Drive response must throw with .status set');

  // A real Drive error body (e.g. insufficient scope) must have its message surfaced, not swallowed —
  // this is what makes a genuine API problem distinguishable from "no connectivity" (root cause of the
  // live "Offline right after sign-in" bug).
  global.fetch = makeFetchStub([{ ok: false, status: 403, body: { error: { message: 'The user does not have sufficient permissions for this file.' } } }]);
  try { await drive.driveListYearFiles('tok', 'root123'); assert.fail('expected a throw'); } catch (e) {
    assert.equal(e.status, 403);
    assert.ok(!e.needsSignIn, 'a 403 is not necessarily fixed by re-signing in, so must not be flagged needsSignIn');
    assert.ok(e.message.includes('sufficient permissions'), 'Drive\'s own error message must be included, not discarded');
  }

  global.fetch = makeFetchStub([{ body: { id: 'bk1' } }]);
  const bkId = await drive.driveWriteBackupSnapshot('tok', 'backups456', [{ id: 'doc1', session: '2025-26' }]);
  assert.equal(bkId, 'bk1');
  assert.ok(global.fetch.calls[0].url.includes('/upload/drive/v3/files'));

  console.log('drive-api tests passed');
})();
