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

test("college under the Principal's signature: the college name, or the form's own words", () => {
  assert.strictEqual(tokenValues({ profile: { collegeName: ' Govt College Alpha ' } }).CERT_COLLEGE, 'Govt College Alpha');
  assert.strictEqual(tokenValues({}).CERT_COLLEGE, 'Govt. Degree College.');
});

test('tokenValues on an empty record and partial joins', () => {
  assert.ok(Object.entries(tokenValues({})).every(([k, x]) => x === '' || k === 'CERT_COLLEGE'));
  const v = tokenValues({ profile: { basicPay: '5000', collegePin: '171001', promotionDate: 'P' } });
  assert.deepStrictEqual([v.PAY_INFO, v.COLLEGE_PLACE, v.PLACE, v.PROMOTION], ['Basic Pay 5000', '171001', '171001', 'P']);
});

test('partTables on the full record (same as test_acr_fields.py)', () => {
  const t = partTables(FULL);
  assert.strictEqual(t.dob_digits, '05111980');
  assert.deepStrictEqual(t.teaching, [['1', 'B.Sc. I', 'GCA', '6', '150', '100%'], ['2', 'B.Sc. II', 'GCA', '6', '140', '95%']]);
  assert.strictEqual(t.total_periods, '24');
  assert.deepStrictEqual(t.assignments, [['1', 'B.Sc. I', '4', '2', 'Register p. 12']]);
  assert.deepStrictEqual(t.results, [['B.Sc. III', '1 year', '40', '38', '95', '88.5', '+6.5', '+6.5', '10', '20', '8', '2', '']]);
  assert.deepStrictEqual(t.other_info, [['1', 'Reviewer for journal X']]);
  const e = partTables({ teaching: [{}, { classCourse: 'X', syllabusPct: '80%' }], otherInfo: [{ text: ' ' }, { text: 'Y' }] });
  assert.deepStrictEqual([e.teaching, e.other_info, e.dob_digits], [[['1', 'X', '', '', '', '80%']], [['1', 'Y']], '']);
});

test('19(c): text entries, each row its own record, or one common record in a merged cell', () => {
  const rows = [{ classCourse: 'B.Sc. I', assignments: '4 (2 oral)', tests: '2', record: 'Reg A' }, { classCourse: 'B.Sc. II', assignments: '3', tests: '1', record: 'Reg B' }];
  const own = partTables({ assignments: rows });
  assert.deepStrictEqual(own.assignments, [['1', 'B.Sc. I', '4 (2 oral)', '2', 'Reg A'], ['2', 'B.Sc. II', '3', '1', 'Reg B']]);
  assert.strictEqual(own.assignments_merged, false);
  const same = partTables({ assignments: rows, part2: { p19cSame: 'yes', p19cRecord: 'Assignment & Test Register' } });
  assert.deepStrictEqual(same.assignments, [['1', 'B.Sc. I', '4 (2 oral)', '2', 'Assignment & Test Register'], ['2', 'B.Sc. II', '3', '1', '']]);
  assert.strictEqual(same.assignments_merged, true);
  const one = partTables({ assignments: rows.slice(0, 1), part2: { p19cSame: 'yes', p19cRecord: 'Common' } });
  assert.deepStrictEqual([one.assignments, one.assignments_merged], [[['1', 'B.Sc. I', '4 (2 oral)', '2', 'Common']], false]);
});

test('19(a) boxes take text; % is added only to a plain number', () => {
  const t = partTables({ teaching: [{ allocated: '4L + 2P', delivered: '60 (Theory)', syllabusPct: 'Completed' }, { syllabusPct: '90.5' }, { syllabusPct: '90% (Theory)' }],
    part2: { totalPeriodsPerWeek: '18 + 6 (Practical)' } });
  assert.deepStrictEqual(t.teaching, [['1', '', '', '4L + 2P', '60 (Theory)', 'Completed'], ['2', '', '', '', '', '90.5%'], ['3', '', '', '', '', '90% (Theory)']]);
  assert.strictEqual(t.total_periods, '18 + 6 (Practical)');
});
