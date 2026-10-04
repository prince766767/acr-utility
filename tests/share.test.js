import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareFiles } from '../share.js';

const files = [new File([new Uint8Array([1])], 'a.docx'), new File([new Uint8Array([2])], 'a.pdf')];
const err = name => Object.assign(new Error(name), { name });
function env({ canShare = true, share = async () => {} } = {}) {
  const downloaded = [], shared = [];
  return {
    downloaded, shared,
    navigator: canShare === null ? {} : { canShare: () => canShare, share: async data => { shared.push(data); return share(data); } },
    download: f => downloaded.push(f.name),
  };
}

test('shares the files with the title', async () => {
  const e = env();
  assert.equal(await shareFiles(files, { title: 'ACR' }, e), 'shared');
  assert.deepEqual(e.shared[0].files.map(f => f.name), ['a.docx', 'a.pdf']);
  assert.equal(e.shared[0].title, 'ACR');
  assert.deepEqual(e.downloaded, []);
});
test('user closing the share sheet is "cancelled", not an error', async () => {
  assert.equal(await shareFiles(files, {}, env({ share: async () => { throw err('AbortError'); } })), 'cancelled');
});
test('share refused for lack of a recent tap is "needs-tap"', async () => {
  assert.equal(await shareFiles(files, {}, env({ share: async () => { throw err('NotAllowedError'); } })), 'needs-tap');
});
test('no file sharing: both files are downloaded', async () => {
  for (const e of [env({ canShare: false }), env({ canShare: null })]) {
    assert.equal(await shareFiles(files, {}, e), 'downloaded');
    assert.deepEqual(e.downloaded, ['a.docx', 'a.pdf']);
  }
});
test('other share errors are passed on', async () => {
  await assert.rejects(shareFiles(files, {}, env({ share: async () => { throw err('DataError'); } })), { name: 'DataError' });
});
