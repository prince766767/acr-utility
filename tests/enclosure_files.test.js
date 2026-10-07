import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createFileStore, newFileId, isQuotaError, FULL_MESSAGE, NO_STORE_MESSAGE } from '../enclosure_files.js';

const rec = (session, id, n = 3) => ({ session, id, name: id + '.pdf', type: 'application/pdf', size: n, bytes: new Uint8Array(n).fill(7), addedAt: '2026-10-07T10:00:00.000Z' });

test('put, get, ids and remove, kept apart per session', async () => {
  const s = createFileStore({ indexedDB: new IDBFactory() });
  assert.equal(await s.available(), true);
  await s.put(rec('2025-26', 'aaaaaaaaaaaa'));
  await s.put(rec('2025-26', 'bbbbbbbbbbbb', 5));
  await s.put(rec('2024-25', 'cccccccccccc'));
  await s.put(rec('', 'dddddddddddd'));
  assert.deepEqual((await s.ids('2025-26')).sort(), ['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
  assert.deepEqual(await s.ids(''), ['dddddddddddd']);
  const got = await s.get('2025-26', 'bbbbbbbbbbbb');
  assert.equal(got.name, 'bbbbbbbbbbbb.pdf');
  assert.deepEqual([...got.bytes], [7, 7, 7, 7, 7]);
  assert.equal(await s.get('2024-25', 'bbbbbbbbbbbb'), undefined);
  await s.remove('2025-26', 'aaaaaaaaaaaa');
  assert.deepEqual(await s.ids('2025-26'), ['bbbbbbbbbbbb']);
});

test('no IndexedDB: not available, with the message for the tab', async () => {
  assert.equal(await createFileStore({ indexedDB: undefined }).available(), false);
  assert.equal(NO_STORE_MESSAGE, 'This browser cannot keep files (private window?).');
});

test('quota errors are recognised; ids look right', () => {
  assert.equal(isQuotaError(Object.assign(new Error('x'), { name: 'QuotaExceededError' })), true);
  assert.equal(isQuotaError({ code: 22 }), true);
  assert.equal(isQuotaError(new Error('other')), false);
  assert.equal(FULL_MESSAGE, 'This browser has no room left for the file. Remove some files or use another device.');
  const id = newFileId();
  assert.match(id, /^[0-9a-z]{12}$/);
  assert.notEqual(newFileId(), id);
});
