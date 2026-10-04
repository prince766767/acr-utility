import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../draft_sync.js';
import * as S from '../sessions.js';

class FakeStore {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const rec = (session, name, extra = {}) => ({ session, profile: { fullName: name }, part2: {}, ui: { section: 'profile' }, savedAt: '2026-10-04T10:00:00.000Z', ...extra });

// A Drive with files held in memory; records every upload.
function fakeDrive(files = {}) {
  const store = new Map(Object.entries(files).map(([name, json], i) => [name, { id: 'F' + i, name, text: JSON.stringify(json) }]));
  let n = 100;
  const uploads = [];
  return {
    uploads, store,
    ensureFolder: async () => 'FOLDER',
    listFiles: async (folderId, prefix) => [...store.values()].filter(f => f.name.startsWith(prefix)).map(({ id, name }) => ({ id, name })),
    downloadText: async id => [...store.values()].find(f => f.id === id).text,
    upsertFile: async ({ name, bytes, folderId }) => {
      assert.equal(folderId, 'FOLDER');
      const text = new TextDecoder().decode(bytes);
      const old = store.get(name);
      const f = { id: old ? old.id : 'N' + n++, name, text };
      store.set(name, f);
      uploads.push(name);
      return { id: f.id, name };
    },
  };
}

test('contentHash ignores savedAt and the open tab, not the answers', () => {
  const a = rec('2025-26', 'A');
  assert.equal(D.contentHash(a), D.contentHash({ ...a, savedAt: 'later', ui: { section: 'review' } }));
  assert.notEqual(D.contentHash(a), D.contentHash(rec('2025-26', 'B')));
  assert.equal(D.contentHash({ b: 1, a: { y: 2, x: 1 } }), D.contentHash({ a: { x: 1, y: 2 }, b: 1 }));
});

test('hasData: only real answers count (not default selects, unchecked enclosures, empty API)', () => {
  assert.equal(D.hasData({ session: '2025-26', profile: { title: 'Smt', relation: 'Husband' }, enclosures: [{ label: 'x', checked: false }],
    api: { c1: { classes: '', resources: [] } }, ui: {}, savedAt: 'x', style: { color: '000000' } }), false);
  assert.equal(D.hasData(rec('', 'A')), true);
  assert.equal(D.hasData({ enclosures: [{ label: 'x', checked: true }] }), true);
  assert.equal(D.hasData({ teaching: [{ classCourse: 'B.Sc' }] }), true);
  assert.equal(D.hasData(null), false);
});

test('Drive file names', () => {
  assert.equal(D.driveName('2025-26'), 'ACR draft 2025-26.acr.json');
  assert.equal(D.driveName(''), 'ACR draft (no session).acr.json');
  assert.equal(D.sessionFromName('ACR draft 2025-26.acr.json'), '2025-26');
  assert.equal(D.sessionFromName('ACR draft (no session).acr.json'), '');
  assert.equal(D.sessionFromName('ACR draft 2025-26 (other copy, 4 Oct 17-20).acr.json'), null);
  assert.equal(D.otherCopyName('2025-26', '2026-10-04T11:50:07.000Z', 'Windows – Chrome'), 'ACR draft 2025-26 (other copy, 4 Oct 2026 11-50-07 UTC, Windows – Chrome).acr.json');
  assert.equal(D.otherCopyName('', '2026-10-04T11:50:07.000Z', ''), 'ACR draft (no session) (other copy, 4 Oct 2026 11-50-07 UTC).acr.json');
});

test('decide: every case', () => {
  const a = rec('2025-26', 'A'), b = rec('2025-26', 'B'), empty = { session: '2025-26', profile: {}, ui: {} };
  const h = D.contentHash;
  assert.equal(D.decide({ local: null, localSync: null, remote: null }), 'nothing');
  assert.equal(D.decide({ local: a, localSync: null, remote: null }), 'upload');
  assert.equal(D.decide({ local: empty, localSync: null, remote: null }), 'nothing');
  assert.equal(D.decide({ local: null, localSync: null, remote: { record: a } }), 'load');
  assert.equal(D.decide({ local: empty, localSync: null, remote: { record: a } }), 'load');
  assert.equal(D.decide({ local: a, localSync: null, remote: { record: { ...a, savedAt: 'other' } } }), 'nothing');
  // device unchanged since last sync, Drive changed elsewhere: ask before loading (device has data)
  assert.equal(D.decide({ local: a, localSync: { hash: h(a) }, remote: { record: b } }), 'ask-load');
  // device changed, Drive still as last synced: upload
  assert.equal(D.decide({ local: b, localSync: { hash: h(a) }, remote: { record: a } }), 'upload');
  // both changed since they last agreed
  assert.equal(D.decide({ local: b, localSync: { hash: 'old' }, remote: { record: { ...b, profile: { fullName: 'C' } } } }), 'ask-conflict');
  // never synced on this device, both have different data
  assert.equal(D.decide({ local: a, localSync: null, remote: { record: b } }), 'ask-conflict');
});

test('sync: fill on device A, continue on device B', async () => {
  const drive = fakeDrive();
  const storeA = new FakeStore();
  S.writeRecord(storeA, rec('2025-26', 'A'));
  const ask = async () => { throw new Error('should not ask'); };
  const a = D.createDraftSync({ store: storeA, sessions: S, drive, ask, deviceLabel: 'PC' });
  const r1 = await a.syncAll();
  assert.deepEqual(r1.map(x => [x.session, x.action]), [['2025-26', 'upload']]);
  const saved = JSON.parse(drive.store.get('ACR draft 2025-26.acr.json').text);
  assert.equal(saved.deviceLabel, 'PC');
  assert.equal(saved.profile.fullName, 'A');

  const storeB = new FakeStore();
  const b = D.createDraftSync({ store: storeB, sessions: S, drive, ask, deviceLabel: 'Phone' });
  const r2 = await b.syncAll();
  assert.deepEqual(r2.map(x => [x.session, x.action]), [['2025-26', 'load']]);
  assert.equal(S.readRecord(storeB, '2025-26').profile.fullName, 'A');
  assert.equal(S.readRecord(storeB, '2025-26').deviceLabel, undefined); // Drive-only fields are not kept on the device
  // B edits, saves: uploads; A then sees Drive changed and is asked before loading
  S.saveRecord(storeB, rec('2025-26', 'A2'));
  assert.equal((await b.syncSession('2025-26')).action, 'upload');
  const asked = [];
  const a2 = D.createDraftSync({ store: storeA, sessions: S, drive, deviceLabel: 'PC', ask: async (kind, info) => { asked.push([kind, info.remote.deviceLabel]); return 'drive'; } });
  assert.equal((await a2.syncSession('2025-26')).action, 'ask-load');
  assert.deepEqual(asked, [['ask-load', 'Phone']]);
  assert.equal(S.readRecord(storeA, '2025-26').profile.fullName, 'A2');
  // the device copy that was replaced is kept in Drive
  assert.ok([...drive.store.keys()].some(n => n.startsWith('ACR draft 2025-26 (other copy')));
});

test('sync: conflict keeps the copy that was not chosen', async () => {
  const drive = fakeDrive({ 'ACR draft 2025-26.acr.json': { ...rec('2025-26', 'DRIVE'), deviceLabel: 'Phone', contentHash: 'x' } });
  const store = new FakeStore();
  S.writeRecord(store, rec('2025-26', 'DEVICE'));
  const s = D.createDraftSync({ store, sessions: S, drive, deviceLabel: 'PC', ask: async kind => { assert.equal(kind, 'ask-conflict'); return 'device'; } });
  const r = await s.syncSession('2025-26');
  assert.equal(r.action, 'ask-conflict');
  assert.equal(r.choice, 'device');
  assert.equal(JSON.parse(drive.store.get('ACR draft 2025-26.acr.json').text).profile.fullName, 'DEVICE');
  const other = [...drive.store.values()].find(f => f.name.includes('(other copy'));
  assert.equal(JSON.parse(other.text).profile.fullName, 'DRIVE');
  assert.equal(S.readRecord(store, '2025-26').profile.fullName, 'DEVICE');
  // now in agreement: the next sync does nothing and asks nothing
  const again = D.createDraftSync({ store, sessions: S, drive, deviceLabel: 'PC', ask: async () => { throw new Error('asked'); } });
  assert.equal((await again.syncSession('2025-26')).action, 'nothing');
});

test('sync: an unnamed draft is kept too; other-copy files are ignored when listing', async () => {
  const drive = fakeDrive({ 'ACR draft 2025-26 (other copy, 1 Oct 2026 10-00 UTC).acr.json': rec('2025-26', 'OLD') });
  const store = new FakeStore();
  S.writeRecord(store, rec('', 'NONAME'));
  const s = D.createDraftSync({ store, sessions: S, drive, deviceLabel: 'PC', ask: async () => 'drive' });
  const r = await s.syncAll();
  assert.deepEqual(r.map(x => [x.session, x.action]), [['', 'upload']]);
  assert.ok(drive.store.has('ACR draft (no session).acr.json'));
});
