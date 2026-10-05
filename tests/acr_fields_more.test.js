import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { variation, tokenValues, partTables, TOKENS } from '../acr_fields.js';

const read = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const FULL = read('full_record.acr.json');

for (const [c, u, expected] of read('variation_cases.json')) {
  test(`variation ${JSON.stringify(c)} - ${JSON.stringify(u)}`, () => assert.strictEqual(variation(c, u), expected));
}

test('tokenValues on the full record (same as test_acr_fields.py)', () => {
  const v = tokenValues(FULL);
  assert.deepStrictEqual(Object.keys(v), TOKENS);
  assert.strictEqual(v.COLLEGE_PLACE, 'District Beta, State Epsilon, 171001');
  assert.strictEqual(v.PAY_INFO, 'Level 13A; Basic Pay 131400');
  assert.strictEqual(v.PROMOTION, 'No promotion');
  assert.strictEqual(v.DOB_WORDS, 'Fifth November Nineteen Hundred Eighty');
  assert.deepStrictEqual([v.ADDR1, v.ADDR2, v.ADDR3], ['House 12', 'Ward 3', 'Town Delta, PIN 176001']);
  assert.strictEqual(v.PLACE, 'Govt College Alpha, 171001');
  assert.strictEqual(v.P17, 'Contribution line 1\nContribution line 2');
});

test('tokenValues on an empty record and partial joins', () => {
  assert.ok(Object.values(tokenValues({})).every(x => x === ''));
  const v = tokenValues({ profile: { basicPay: '5000', collegePin: '171001', promotionDate: 'P' } });
  assert.deepStrictEqual([v.PAY_INFO, v.COLLEGE_PLACE, v.PLACE, v.PROMOTION], ['Basic Pay 5000', '171001', '171001', 'P']);
});

test('partTables on the full record (same as test_acr_fields.py)', () => {
  const t = partTables(FULL);
  assert.strictEqual(t.dob_digits, '05111980');
  assert.deepStrictEqual(t.teaching, [['1', 'B.Sc. I', 'GCA', '6', '150', '100%'], ['2', 'B.Sc. II', 'GCA', '6', '140', '95%']]);
  assert.strictEqual(t.total_periods, '24');
  assert.deepStrictEqual(t.assignments, [['1', 'B.Sc. I', '4', '2', '']]);
  assert.deepStrictEqual(t.results, [['B.Sc. III', '1 year', '40', '38', '95', '88.5', '+6.5', '+6.5', '10', '20', '8', '2', '']]);
  assert.deepStrictEqual(t.other_info, [['1', 'Reviewer for journal X']]);
  const e = partTables({ teaching: [{}, { classCourse: 'X', syllabusPct: '80%' }], otherInfo: [{ text: ' ' }, { text: 'Y' }] });
  assert.deepStrictEqual([e.teaching, e.other_info, e.dob_digits], [[['1', 'X', '', '', '', '80%']], [['1', 'Y']], '']);
});
