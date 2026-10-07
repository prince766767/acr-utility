import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../sessions.js';

class FakeStore {
  constructor(entries = {}) { this.m = new Map(Object.entries(entries)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const WORKED = JSON.parse(readFileSync(new URL('./fixtures/cases.json', import.meta.url), 'utf8'))[0].api;
const rec = (session, extra = {}) => ({ session, profile: { fullName: 'X' }, part2: { p17: 'a' }, api: {}, ...extra });

test('session names', () => {
  for (const s of ['2025-26', '1999-00', '2099-00']) assert.ok(S.isSession(s), s);
  for (const s of ['2025-27', '2025/26', '25-26', '', null, '2025-26 ']) assert.ok(!S.isSession(s), String(s));
  assert.strictEqual(S.previousSession('2025-26'), '2024-25');
  assert.strictEqual(S.previousSession('2000-01'), '1999-00');
  assert.strictEqual(S.previousSession('bad'), '');
});

test('write, read, list, current', () => {
  const st = new FakeStore();
  S.writeRecord(st, rec('2025-26'));
  S.writeRecord(st, rec('2024-25'));
  S.writeRecord(st, rec(''));
  assert.deepStrictEqual(S.listSessions(st), ['2024-25', '2025-26']);
  assert.strictEqual(st.getItem(S.CURRENT_KEY), '');
  assert.strictEqual(S.loadCurrent(st).session, '');
  S.saveRecord(st, rec('2023-24'));
  assert.strictEqual(st.getItem(S.CURRENT_KEY), '', 'saveRecord does not move the pointer');
  assert.ok(S.hasRecord(st, '2023-24'));
  assert.ok(!S.hasRecord(st, '2022-23'));
  assert.strictEqual(S.readRecord(st, '2025-26').part2.p17, 'a');
});

test('migrate the old single draft', () => {
  const named = new FakeStore({ [S.OLD_KEY]: JSON.stringify(rec('2025-26')) });
  assert.deepStrictEqual(S.migrate(named), []);
  assert.strictEqual(named.getItem(S.OLD_KEY), null);
  assert.strictEqual(S.loadCurrent(named).session, '2025-26');

  const unnamed = new FakeStore({ [S.OLD_KEY]: JSON.stringify(rec('')) });
  S.migrate(unnamed);
  assert.strictEqual(S.loadCurrent(unnamed).session, '');

  const clash = new FakeStore({ [S.OLD_KEY]: JSON.stringify(rec('2025-26', { part2: { p17: 'old' } })),
    [S.SESSION_PREFIX + '2025-26']: JSON.stringify(rec('2025-26')) });
  assert.deepStrictEqual(S.migrate(clash), ['A saved 2025-26 record already existed, so the older draft was kept as the unnamed draft.']);
  assert.strictEqual(S.readRecord(clash, '').part2.p17, 'old');
  assert.strictEqual(S.readRecord(clash, '2025-26').part2.p17, 'a');

  const busy = new FakeStore({ [S.OLD_KEY]: JSON.stringify(rec('')), [S.DRAFT_KEY]: JSON.stringify(rec('')) });
  assert.deepStrictEqual(S.migrate(busy), ['An older draft is still stored and was not moved, because an unnamed draft already exists.']);
  assert.notStrictEqual(busy.getItem(S.OLD_KEY), null);

  assert.deepStrictEqual(S.migrate(new FakeStore()), []);
});

test('switch decisions (spec 3.3)', () => {
  assert.strictEqual(S.decideSwitch('2025-26', '2025-26', true), 'same');
  assert.strictEqual(S.decideSwitch('', '', false), 'same');
  assert.strictEqual(S.decideSwitch('2025-26', '2025-27', false), 'invalid');
  assert.strictEqual(S.decideSwitch('2025-26', '', false), 'invalid');
  assert.strictEqual(S.decideSwitch('', '2025-26', false), 'name-draft');
  assert.strictEqual(S.decideSwitch('', '2025-26', true), 'ask-open-existing');
  assert.strictEqual(S.decideSwitch('2025-26', '2024-25', true), 'open');
  assert.strictEqual(S.decideSwitch('2025-26', '2026-27', false), 'new');
});

test('a new record keeps only the profile', () => {
  const r = S.newRecordFrom({ ...rec('2024-25'), teaching: [{ a: 1 }], enclosures: [{ label: 'x' }], api: WORKED }, '2025-26');
  assert.deepStrictEqual(r.profile, { fullName: 'X' });
  assert.strictEqual(r.session, '2025-26');
  assert.deepStrictEqual([r.part2, r.teaching, r.enclosures, r.api], [{}, [], [], {}]);
});

test('a new record also keeps the text style (a personal preference)', () => {
  const style = { color: '000000', font: 'Arial', size: 11, bold: false, italic: false };
  assert.deepStrictEqual(S.newRecordFrom({ ...rec('2024-25'), style }, '2025-26').style, style);
  assert.strictEqual(S.newRecordFrom(rec('2024-25'), '2025-26').style, undefined);
});

test('last year lookup: four cases', () => {
  const st = new FakeStore();
  assert.deepStrictEqual(S.lastYear(st, ''), { state: 'no-session', from: '', message: 'Choose the session first.' });
  assert.deepStrictEqual(S.lastYear(st, '2025-26'), { state: 'none', from: '2024-25',
    message: "No 2024-25 record on this device. Type last year's figures, or import last year's file." });
  S.saveRecord(st, rec('2024-25', { api: WORKED }));
  assert.deepStrictEqual(S.lastYear(st, '2025-26'), { state: 'record', from: '2024-25', message: 'From the 2024-25 record.',
    values: { cat1: '106.75', cat2: '25', total12: '131.75', cat3: '193' } });
  S.saveRecord(st, rec('2024-25', { api: { c1: { classes: '6o' } } }));
  const bad = S.lastYear(st, '2025-26');
  assert.strictEqual(bad.state, 'record-problems');
  assert.strictEqual(bad.message, 'The 2024-25 record has problems, so its totals cannot be used. Open 2024-25 to fix them.');
  assert.strictEqual(bad.problems[0].message, '26(i)(a): score must be a number (0 or more) with at most 2 decimals.');
});

test('last year file checks', () => {
  assert.deepStrictEqual(S.checkLastYearFile(rec('2024-25', { api: WORKED }), '2025-26'), { ok: true });
  assert.deepStrictEqual(S.checkLastYearFile(rec('2023-24'), '2025-26'),
    { ok: false, message: 'This file is for 2023-24; last year for 2025-26 is 2024-25.' });
  assert.deepStrictEqual(S.checkLastYearFile(rec(''), '2025-26'),
    { ok: false, message: 'This file is for no session; last year for 2025-26 is 2024-25.' });
  assert.deepStrictEqual(S.checkLastYearFile(rec('2024-25'), ''), { ok: false, message: 'Choose the session first.' });
  const r = S.checkLastYearFile(rec('2024-25', { api: { c1: { classes: '6o' } } }), '2025-26');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.message, 'The 2024-25 file has problems, so its totals cannot be used.');
  assert.strictEqual(r.problems.length, 1);
});
