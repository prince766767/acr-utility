import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../enclosure_ui.js';

const f = (id, size, order) => ({ id, name: id + '.pdf', type: 'application/pdf', size, order });

test('formatSize and sizeSummary count ticked enclosures only', () => {
  assert.equal(U.formatSize(500), '1 KB');
  assert.equal(U.formatSize(300 * 1024), '300 KB');
  assert.equal(U.formatSize(4.8 * 1024 * 1024), '4.8 MB');
  const encl = [
    { label: 'A', checked: true, files: [f('a', 3 * 1024 * 1024, 0), f('b', 1.8 * 1024 * 1024, 1)] },
    { label: 'B', checked: false, files: [f('c', 50 * 1024 * 1024, 0)] },
  ];
  assert.deepEqual(U.sizeSummary(encl), { text: '2 files, 4.8 MB attached', warn: '' });
  encl[1].checked = true;
  assert.deepEqual(U.sizeSummary(encl), { text: '3 files, 54.8 MB attached', warn: 'Email may refuse a file this large; saving to Google Drive still works.' });
  assert.deepEqual(U.sizeSummary([{ label: 'A', checked: true }]), { text: '', warn: '' });
  assert.equal(U.WARN_BYTES, 20 * 1024 * 1024);
});

test('addFiles, moveFile and removeFile keep a clean order', () => {
  const entry = { label: 'A', checked: true, files: [f('a', 1, 0), f('b', 1, 1)] };
  entry.files = U.addFiles(entry, [{ id: 'c', name: 'c.jpg', type: 'image/jpeg', size: 1 }]);
  assert.deepEqual(entry.files.map(x => [x.id, x.order]), [['a', 0], ['b', 1], ['c', 2]]);
  entry.files = U.moveFile(entry, 'c', -1);
  assert.deepEqual(entry.files.map(x => [x.id, x.order]), [['a', 0], ['c', 1], ['b', 2]]);
  assert.deepEqual(U.moveFile(entry, 'a', -1).map(x => x.id), ['a', 'c', 'b']);   // already first: unchanged
  entry.files = U.removeFile(entry, 'a');
  assert.deepEqual(entry.files.map(x => [x.id, x.order]), [['c', 0], ['b', 1]]);
  assert.equal(U.MISSING_NOTE, 'This file is on another device — attach it again, or turn on Keep my draft in Google Drive.');
});
