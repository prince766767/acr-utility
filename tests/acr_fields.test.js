import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDob, dobWords, fieldProblems, migrateDraft } from '../acr_fields.js';

const CASES = JSON.parse(readFileSync(new URL('./fixtures/field_cases.json', import.meta.url), 'utf8'));

for (const c of CASES.dob) {
  test(`dob ${JSON.stringify(c.in)}`, () => {
    const r = parseDob(c.in);
    assert.strictEqual(r.state, c.state);
    if (r.state === 'ok') assert.strictEqual(dobWords(r), c.words);
  });
}

for (const c of CASES.problems) {
  test(`problems: ${c.name}`, () => assert.deepStrictEqual(fieldProblems(c.data), c.expected));
}

test('migrateDraft reports old boxes and moves research into row 1', () => {
  const raw = { part2: { p19d: 'Seminar on X', p21ii: 'RC at Shimla', p24: 'Yes satisfied', researchTitle: 'T',
    researchInstitution: 'HPU', researchNature: 'Minor', researchStatus: 'Ongoing', p17: 'keep' } };
  const { data, notices } = migrateDraft(raw);
  assert.deepStrictEqual(data.part2, { p17: 'keep' });
  assert.deepStrictEqual(data.research, [{ title: 'T', institution: 'HPU', nature: 'Minor', status: 'Ongoing' }]);
  assert.deepStrictEqual(data.activities, []);
  assert.deepStrictEqual(notices, [
    '19(d) old text (please re-enter it as rows of the 19(d) table): Seminar on X',
    '21(ii) old text (please re-enter it as rows of the 21(ii) table): RC at Shimla',
    '24 old text (please re-enter it as the Yes/No answer and the reasons): Yes satisfied',
    '22: your research details were moved into the first row of the 22 table; please check them.',
  ]);
  assert.strictEqual(raw.part2.p19d, 'Seminar on X', 'input is not changed');
});

test('migrateDraft keeps an existing research table and only reports old details', () => {
  const { data, notices } = migrateDraft({ part2: { researchTitle: 'Old' }, research: [{ title: 'New' }] });
  assert.deepStrictEqual(data.research, [{ title: 'New' }]);
  assert.deepStrictEqual(notices, ['22 old details (please check the 22 table): Old |  |  | ']);
});

test('migrateDraft on a new-style draft changes nothing', () => {
  const { data, notices } = migrateDraft({ part2: { p17: 'a' }, research: [], activities: [{ title: 'x' }] });
  assert.deepStrictEqual(notices, []);
  assert.deepStrictEqual(data.activities, [{ title: 'x' }]);
});
