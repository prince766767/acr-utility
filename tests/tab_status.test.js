import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabStatus, progressBand, progressPercent } from '../tab_status.js';
import { tally, emptyApi } from '../api_tally.js';

const blank = () => ({ profile: { collegeState: 'Himachal Pradesh', collegeDistrict: 'Shimla', serviceStatus: 'Permanent', fullName: '' },
  part2: { p8: '', p12: '', p17: '', researchYesNo: '', p19cSame: '' }, api: emptyApi(),
  enclosures: [{ label: 'Certificate / sanction order', checked: false }], teaching: [], assignments: [], results: [], activities: [], orientation: [], research: [], otherInfo: [] });
const status = (d, problems = 0) => tabStatus(d, tally(d.api), problems);

test('a new form: every tab is empty, and Review is not green although nothing is wrong', () => {
  assert.deepEqual(status(blank()), { profile: 'empty', part1: 'empty', part2: 'empty', api: 'empty', enclosures: 'empty', review: 'empty' });
});

test('the pre-set State, District and Status do not count as an entry', () => {
  const d = blank(); d.profile.collegeState = 'Punjab';
  assert.equal(status(d).profile, 'empty');
});

test('Profile: any entry is partly filled; name, code, subject and designation make it filled', () => {
  const d = blank(); d.profile.mobile = '98160';
  assert.equal(status(d).profile, 'part');
  Object.assign(d.profile, { fullName: 'ASHA DEVI', employeeCode: 'E1', subject: 'Physics', designation: 'Assistant Professor' });
  assert.equal(status(d).profile, 'done');
});

test('Part I: points 8 and 12 make it filled; its boxes do not colour Part II', () => {
  const d = blank(); d.part2.p13a = 'Passed';
  assert.deepEqual([status(d).part1, status(d).part2], ['part', 'empty']);
  d.part2.p8 = 'No promotion'; d.part2.p12 = 'Govt. College Alpha';
  assert.equal(status(d).part1, 'done');
});

test('Part II: filled needs 17, 18, 19(b), 21(i), 25 and the 19(a), 19(c), 20 tables', () => {
  const d = blank(); d.activities.push({ title: 'Quiz' });
  assert.equal(status(d).part2, 'part');
  Object.assign(d.part2, { p17: 'a', p18: 'b', p19b: 'c', p21i: 'd', p25: 'e' });
  d.teaching.push({ classCourse: 'B.Sc. I' }); d.assignments.push({ classCourse: 'B.Sc. I' });
  assert.equal(status(d).part2, 'part');
  d.results.push({ className: 'B.Sc. I' });
  assert.equal(status(d).part2, 'done');
});

test('API: filled when Categories I and II both have a score and nothing is wrong', () => {
  const d = blank(); d.api.c1.classes = '40';
  assert.equal(status(d).api, 'part');
  d.api.c2.extension.push({ activity: 'NSS', score: '10' });
  assert.equal(tally(d.api).values.p29.II, '10');
  assert.equal(status(d).api, 'done');
  d.api.c1.excess = 'abc';
  assert.equal(status(d).api, 'part');
});

test('Enclosures: a ticked enclosure is filled; only point 30 rows is partly filled', () => {
  const d = blank(); d.otherInfo.push({ text: 'Award' });
  assert.equal(status(d).enclosures, 'part');
  d.enclosures[0].checked = true;
  assert.equal(status(d).enclosures, 'done');
});

test('Review: green once something is entered and no problem stops the Word file', () => {
  const d = blank(); d.profile.fullName = 'ASHA DEVI';
  assert.equal(status(d, 0).review, 'done');
  assert.equal(status(d, 2).review, 'empty');
});

test('progress line bands: red to 33, orange 34-66, blue 67-99, green at 100', () => {
  assert.deepEqual([0, 33, 34, 66, 67, 99, 100].map(progressBand), ['red', 'red', 'orange', 'orange', 'blue', 'blue', 'green']);
});

test('progress percentage: 0 on a new form, 100 only when every data tab is green', () => {
  const d = blank();
  assert.equal(progressPercent(d, tally(d.api)), 0);
  Object.assign(d.profile, { fullName: 'ASHA DEVI', employeeCode: 'E1', subject: 'Physics', designation: 'Assistant Professor' });
  Object.assign(d.part2, { p17: 'a', p18: 'b', p19b: 'c', p21i: 'd', p25: 'e' });
  d.teaching.push({}); d.assignments.push({}); d.results.push({}); d.enclosures[0].checked = true;
  assert.equal(progressPercent(d, tally(d.api)), 76);   // 13 of 17: Part I and the API scores are still missing
  d.part2.p8 = 'No promotion'; d.part2.p12 = 'Govt. College Alpha';
  d.api.c1.classes = '40'; d.api.c2.extension.push({ activity: 'NSS', score: '10' });
  assert.equal(progressPercent(d, tally(d.api)), 100);
  const s = status(d);
  assert.deepEqual([s.profile, s.part1, s.part2, s.api, s.enclosures], ['done', 'done', 'done', 'done', 'done']);
});
