const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// mergeDocsWithConflicts (drivesync.js) calls mergeDocs() and uid() as free variables —
// correct in the browser's single concatenated scope (build.py), but a Node require()
// needs those real globals wired up the same way. Load the actual source files (not a
// re-implementation of them) into the global context, exactly what the browser bundle does.
['model.js', 'sync.js'].forEach((f) => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), { filename: f });
});

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
