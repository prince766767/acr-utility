import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tally, fmt, toCents, normalizeApi, P44_ORDER, ROW_CHOICES, ROW_LABELS } from '../api_tally.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/cases.json', import.meta.url), 'utf8'));
const pick = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);

for (const c of cases) {
  test(c.name, () => {
    const r = tally(c.api);
    if (c.values) assert.deepStrictEqual(r.values, c.values);
    for (const [path, expected] of Object.entries(c.checks || {})) assert.strictEqual(pick(r.values, path), expected, path);
    assert.deepStrictEqual(r.problems, c.problems);
  });
}

test('invariants: point 29 equals the 42/43/44 totals', () => {
  for (const c of cases) {
    const v = tally(c.api).values;
    assert.strictEqual(v.p29.I, v.p42.total);
    assert.strictEqual(v.p29.II, v.p43.total);
    assert.strictEqual(v.p29.III, v.p44.total);
  }
});

test('fmt drops trailing zeros', () => {
  assert.strictEqual(fmt(2000), '20');
  assert.strictEqual(fmt(750), '7.5');
  assert.strictEqual(fmt(1225), '12.25');
  assert.strictEqual(fmt(5), '0.05');
  assert.strictEqual(fmt(0), '0');
});

test('toCents', () => {
  assert.deepStrictEqual(toCents(''), { state: 'missing' });
  assert.deepStrictEqual(toCents(undefined), { state: 'missing' });
  assert.deepStrictEqual(toCents('7.50'), { state: 'ok', cents: 750 });
  assert.deepStrictEqual(toCents(0.1), { state: 'ok', cents: 10 });
  assert.deepStrictEqual(toCents('1.234'), { state: 'bad' });
  assert.deepStrictEqual(toCents(-1), { state: 'bad' });
  assert.deepStrictEqual(toCents(true), { state: 'bad' });
});

test('every row code has a label and is in P44_ORDER', () => {
  for (const codes of Object.values(ROW_CHOICES)) for (const code of codes) {
    assert.ok(ROW_LABELS[code], code);
    assert.ok(P44_ORDER.includes(code), code);
  }
  for (const code of ['D1', 'D2a', 'D2b']) assert.ok(ROW_LABELS[code]);
  assert.strictEqual(P44_ORDER.length, 25);
});

test('normalizeApi reports old flat fields and keeps other keys', () => {
  const { api, legacy } = normalizeApi({ apiC3: 12, apiC1Exam: '', lastAcademicYear: { cat1: '90' }, c1: { classes: 40 } });
  assert.deepStrictEqual(legacy, [['apiC3', 12]]);
  assert.deepStrictEqual(api.lastAcademicYear, { cat1: '90' });
  assert.strictEqual(api.c1.classes, 40);
  assert.deepStrictEqual(api.c3.journals, []);
  assert.strictEqual(api.apiC3, undefined);
});
