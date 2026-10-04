import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareFiles } from '../share.js';

const files = [new File([new Uint8Array([1])], 'a.docx'), new File([new Uint8Array([2])], 'a.pdf')];
const err = name => Object.assign(new Error(name), { name });
function env({ canShare = true, share = async () => {} } = {}) {
  const downloaded = [], shared = [], asked = [];
  return {
    downloaded, shared, asked,
    navigator: canShare === null ? {} : { canShare: d => { asked.push(d.files.map(f => f.name)); return typeof canShare === 'function' ? canShare(d) : canShare; }, share: async data => { shared.push(data); return share(data); } },
    download: f => downloaded.push(f.name),
  };
}

test('shares the files with the title', async () => {
  const e = env();
  assert.equal(await shareFiles(files, { title: 'ACR' }, e), 'shared');
  assert.deepEqual(e.shared[0].files.map(f => f.name), ['a.docx', 'a.pdf']);
  assert.equal(e.shared[0].title, 'ACR');
  assert.deepEqual(e.downloaded, []);
  assert.deepEqual(e.asked[0], ['a.docx', 'a.pdf']);
});
test('user closing the share sheet is "cancelled", not an error', async () => {
  const e = env({ share: async () => { throw err('AbortError'); } });
  assert.equal(await shareFiles(files, {}, e), 'cancelled');
  assert.deepEqual(e.downloaded, []);
});
test('share refused for lack of a recent tap is "needs-tap"', async () => {
  const e = env({ share: async () => { throw err('NotAllowedError'); } });
  assert.equal(await shareFiles(files, {}, e), 'needs-tap');
  assert.deepEqual(e.downloaded, []);
});
const pdfOnly = d => d.files.every(f => f.name.endsWith('.pdf'));
test('browser that only shares some types: shares those, downloads the rest', async () => {
  const e = env({ canShare: pdfOnly });
  assert.equal(await shareFiles(files, { title: 'ACR' }, e), 'partial');
  assert.deepEqual(e.shared.map(d => d.files.map(f => f.name)), [['a.pdf']]);
  assert.deepEqual(e.downloaded, ['a.docx']);
});
test('partial share: closing the sheet downloads nothing', async () => {
  const e = env({ canShare: pdfOnly, share: async () => { throw err('AbortError'); } });
  assert.equal(await shareFiles(files, {}, e), 'cancelled');
  assert.deepEqual(e.downloaded, []);
});
test('partial share: needing a tap downloads nothing', async () => {
  const e = env({ canShare: pdfOnly, share: async () => { throw err('NotAllowedError'); } });
  assert.equal(await shareFiles(files, {}, e), 'needs-tap');
  assert.deepEqual(e.downloaded, []);
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
