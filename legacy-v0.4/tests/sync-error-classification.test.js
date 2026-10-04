const assert = require('assert');
const { classifySyncError } = require('../src/drivesync.js');

// Regression test for the bug reported live: after a successful, fully-online Google
// sign-in, the status chip showed "Offline" because every non-auth error was mapped to
// 'offline' regardless of cause. A Drive API error that reached Google (has .status) must
// never be classified as offline — only a request that never got a response at all may be.

// Case 1: a real Drive API error (e.g. 403 Forbidden) reached Google — must NOT be "offline".
{
  const e = Object.assign(new Error('Drive request failed (403): The user does not have sufficient permissions'), { status: 403 });
  const r = classifySyncError(e);
  assert.equal(r.status, 'attention', '403 with a real HTTP response must not be classified as offline');
  assert.ok(r.toastMessage && r.toastMessage.includes('403'), 'the real error detail must be surfaced, not hidden');
}

// Case 2: a 401 from Drive itself is flagged needsSignIn by driveApiFetch — must map to "attention", no offline.
{
  const e = Object.assign(new Error('Drive request failed (401)'), { status: 401, needsSignIn: true });
  const r = classifySyncError(e);
  assert.equal(r.status, 'attention');
}

// Case 3: a genuine connectivity failure — fetch itself threw, no HTTP response, no .status — IS offline.
{
  const e = new TypeError('Failed to fetch');
  const r = classifySyncError(e);
  assert.equal(r.status, 'offline', 'an error with no HTTP status at all (never reached the server) is the only real offline case');
  assert.equal(r.toastMessage, null, 'offline is communicated via the status chip only, not an extra toast');
}

console.log('sync-error-classification tests passed');
