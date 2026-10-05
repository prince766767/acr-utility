import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../import_v04.js';

class FakeStore {
  constructor(entries = {}) { this.m = new Map(Object.entries(entries)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

// A v0.4 draft with every field filled, in v0.4's own shape (legacy-v0.4/src/model.js blankDoc).
const DOC = {
  schemaVersion: 5, id: 'acr-x1', createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T12:00:00.000Z', touched: true, rev: 3,
  session: '2025-26', stream: 'science', style: { answerColor: '#1a3a8f', answerBold: true },
  college: { name: 'Govt College Alpha', district: 'District Beta', pin: '171001', principal: 'Dr Principal Gamma', place: 'Alpha' },
  p1: {
    fullName: 'ASHA DEVI', fatherHusband: 'RAM LAL', empCode: 'EC-4321', subject: 'Chemistry', dateAppointment: '01/07/2012',
    designation: 'Associate Professor', payBand: 'Level 13A', promotion: 'No promotion', qualAcademic: 'M.Sc. Chemistry',
    qualDivision: 'First Division', qualProfessional: 'NET', qualResearch: 'Ph.D Chemistry', dob: '05111980', dobWords: 'Fifth November …',
    status: 'permanent', served: [{ name: 'Govt College Alpha', duration: '01/04/2025 to 31/03/2026' }, { name: 'Govt College Delta', duration: 'July 2025' }],
    deptExamRoll: 'Roll 12345', deptExamSession: '2014', hindi: 'Cleared 2013', otherAssignment: 'Bursar',
    permAddress: 'House 12\nWard 3', landline: '01972-222333', mobile: '+919800000001', email: 'asha@example.org',
  },
  s1: {
    q17: 'Contribution', q18: 'Unassigned work',
    q19a: [{ cls: 'B.Sc. I', college: 'GCA', allocated: '6', delivered: '150', syllabus: '95%' }], q19aTotal: '24', q19aNote: 'Practical is two hours.', q19b: 'Special effort',
    q19c: [{ cls: 'B.Sc. I', assignments: '3', tests: '2', remark: 'Register p. 12' }],
    q19d: [{ title: 'Chem Quiz', detail: 'Inter-class quiz' }],
    q19f: [{ title: 'Book A', author: 'X', publisher: 'P', pages: '200', extract: 'About fifty words.' }], q19g: 'Problem 1\nProblem 2',
    q20: [{ cls: 'B.Sc. III', duration: '1 year', appeared: '40', passed: '38', collegePct: '95', univPct: '88.5', variation: '6.5', d1: '10', d2: '20', d3: '8', failed: '2', reason: '--' }],
    q21i: 'None', q21ii: [{ name: 'Refresher Course, UGC', place: 'HRDC Shimla', duration: '21 days', rc: 'RC-1' }],
    q22: 'Yes, minor project', q22rows: [{ topic: 'Green synthesis', univ: 'HPU', nature: 'Minor', status: 'Ongoing' }],
    q23: 'Best teacher award', q24: 'No, promotion pending', q24b: 'Want promotion', q25: 'Other point',
  },
  s2: {
    c1: {
      rows: [{ course: 'B.Sc. I', level: 'UG', mode: 'Lecture', allotted: '6', conducted: '150', pct: '100' }], scoreA: '50', scoreB: '5',
      ii: { rows: [{ course: 'B.Sc. I', consulted: 'Book X', prescribed: 'Book Y', additional: 'Notes' }], note: 'Footnote text', score: '12' },
      iii: { rows: [{ desc: 'ICT teaching', score: '10' }] },
      iv: { rows: [{ type: 'Invigilation', assigned: '10', extent: '100%', score: '15' }] },
    },
    c2: { i: [{ activity: 'NSS', hours: '2', score: '10' }], ii: [{ activity: 'Committee', hours: 'Yearly', score: '5' }], iii: [{ activity: 'Workshop', hours: 'Details', score: '3' }] },
    c3: {
      A: [{ title: 'Paper 1', journal: 'J Chem', issn: '1234', kind: 'refereed', impact: '2.1', authors: '3', main: 'yes', score: '9', encl: '2' },
          { title: 'Paper 2', journal: 'J Two', issn: '', kind: 'recognized', impact: '', authors: '1', main: 'yes', score: '10', encl: '' }],
      Bi: [{ title: 'Chapter 1', book: 'Book B', issn: 'ISBN 1', kind: 'international', authors: '2', main: 'no', score: '2', encl: '' }],
      Bii: [{ title: 'Proc 1', conf: 'Conf C', issn: '', authors: '1', main: 'yes', score: '10', encl: '' }],
      Biii: [{ title: 'Book 1', kind: 'local_chapter', publisher: 'Local Press', peer: 'No', authors: '1', main: 'yes', score: '3', encl: '' }],
      Ci: [{ title: 'Major P', agency: 'UGC', period: '2024-26', amount: '12', score: '15', encl: '' }],
      Cii: [{ title: 'Consult', agency: 'Firm', period: '2025', amount: '20', score: '20', encl: '' }],
      Ciii: [{ title: 'Done P', agency: 'DST', period: '2022-24', amount: '4', kind: 'minor', outcome: 'Report', score: '10', encl: '' }],
      Civ: [{ title: 'Patent X', kind: 'national', score: '30', encl: '' }],
      D: [{ kind: 'phd_awarded', count: '2', detail: 'Candidates A, B', score: '20', encl: '' }, { kind: 'mphil_awarded', count: '1', detail: '', score: '3', encl: '' },
          { kind: 'phd_submitted', count: '1', detail: '', score: '7', encl: '' }, { kind: 'phd_awarded', count: '1', detail: 'C', score: '10', encl: '' }],
      Ei: [{ programme: 'FDP', duration: '2 weeks', weeks: 'two', by: 'HRDC', score: '20', encl: '' }],
      Eii: [{ title: 'Talk', conf: 'Sem', by: 'HPU', level: 'state', score: '5', encl: '' }],
      Eiii: [{ title: 'Invited', conf: 'Conf', by: 'IIT', level: 'international', score: '10', encl: '' }],
    },
    lastYear: { c1: '90', c2: '20', c3: '12.5' }, override: { c1: '100', c2: '', c3: '' },
  },
  partB: [{ text: 'Reviewer for journal X' }],
  enclosures: [{ text: 'Certificate / sanction order' }, { text: 'NSS certificate' }],
  certify: { place: 'Alpha', date: '15/05/2026', designation: 'Associate Professor' },
  principalBlock: { name: 'Dr Principal Gamma', college: 'Govt College Alpha', place: 'Alpha' },
};

const { record: R, report } = V.convertV04(DOC);

test('recognises v0.4 drafts and backups, nothing else', () => {
  assert.equal(V.isV04(DOC), true);
  assert.equal(V.isV04({ kind: 'acr-backup', version: 1, docs: [DOC] }), true);
  assert.equal(V.isV04({ session: '2025-26', profile: {}, part2: {} }), false);
  assert.equal(V.isV04(null), false);
  assert.deepEqual(V.v04Docs({ kind: 'acr-backup', docs: [DOC, { junk: 1 }] }).map(d => d.id), ['acr-x1']);
  assert.deepEqual(V.v04Docs(DOC).map(d => d.id), ['acr-x1']);
});

test('finds v0.4 drafts in this browser, signed-in ones too, and ignores the rest', () => {
  const st = new FakeStore({
    'acr.index.v1': '[]', 'acr.doc.acr-x1': JSON.stringify(DOC),
    'acct.10987.acr.doc.acr-y2': JSON.stringify({ ...DOC, id: 'acr-y2', session: '2024-25', updatedAt: '2026-09-01T00:00:00.000Z' }),
    'acrUtility:session:2025-26': '{}', 'acr.doc.broken': '{not json',
  });
  const found = V.findV04Docs(st);
  assert.deepEqual(found.map(f => [f.key, f.session, f.name]), [
    ['acct.10987.acr.doc.acr-y2', '2024-25', 'ASHA DEVI'], ['acr.doc.acr-x1', '2025-26', 'ASHA DEVI']]);
  assert.equal(st.getItem('acr.doc.acr-x1'), JSON.stringify(DOC)); // untouched
});

test('identity and Part-I', () => {
  assert.equal(R.session, '2025-26');
  assert.deepEqual(R.profile, {
    collegeName: 'Govt College Alpha', collegeDistrict: 'District Beta', collegePin: '171001', principalName: 'Dr Principal Gamma',
    fullName: 'ASHA DEVI', fatherHusband: 'RAM LAL', employeeCode: 'EC-4321', subject: 'Chemistry', appointmentDate: '01/07/2012',
    designation: 'Associate Professor', payBand: 'Level 13A', academicQualification: 'M.Sc. Chemistry First Division',
    professionalQualification: 'NET', researchDegree: 'Ph.D Chemistry', dob: '05/11/1980', serviceStatus: 'Permanent',
    permanentAddress: 'House 12\nWard 3', landline: '01972-222333', mobile: '+919800000001', email: 'asha@example.org', submissionDate: '15/05/2026',
  });
  assert.equal(R.part2.p8, 'No promotion');
  assert.equal(R.part2.p12, 'Govt College Alpha – 01/04/2025 to 31/03/2026\nGovt College Delta – July 2025');
  assert.equal(R.part2.p13a, 'Roll 12345, 2014');
  assert.equal(R.part2.p13b, 'Cleared 2013');
  assert.equal(R.part2.p14, 'Bursar');
  assert.deepEqual(R.style, { color: '1A3A8F', font: '', size: 0, bold: true, italic: false, chosen: true });   // semi-bold was a choice
  const plain = V.convertV04({ ...DOC, style: { answerColor: '#1a3a8f', answerBold: false } }).record.style;
  assert.equal(plain.chosen, false);   // v0.4's untouched default blue: the new default (black) applies
});

test('Part-II and its tables', () => {
  const p = R.part2;
  assert.deepEqual([p.p17, p.p18, p.p19b, p.p19g, p.p21i, p.p23, p.p25], ['Contribution', 'Unassigned work', 'Special effort', 'Problem 1\nProblem 2', 'None', 'Best teacher award', 'Other point']);
  assert.equal(p.totalPeriodsPerWeek, '24');
  assert.equal(p.p19f, 'Book A – X, P, 200 pages\nAbout fifty words.');
  assert.deepEqual([p.researchYesNo, p.p24Satisfied, p.p24Reasons], ['Yes', 'No', 'Want promotion']);
  assert.deepEqual(R.teaching, [{ srNo: 1, classCourse: 'B.Sc. I', college: 'GCA', allocated: '6', delivered: '150', syllabusPct: '95%' }]);
  assert.deepEqual(R.assignments, [{ classCourse: 'B.Sc. I', assignments: 3, tests: 2 }]);
  assert.deepEqual(R.activities, [{ title: 'Chem Quiz', detail: 'Inter-class quiz' }]);
  assert.deepEqual(R.results, [{ className: 'B.Sc. III', duration: '1 year', appeared: 40, passed: 38, collegePct: 95, universityPct: 88.5, divI: 10, divII: 20, divIII: 8, failed: 2, reason: '--' }]);
  assert.deepEqual(R.orientation, [{ course: 'Refresher Course, UGC', place: 'HRDC Shimla', duration: '21 days', rcoc: 'RC-1' }]);
  assert.deepEqual(R.research, [{ title: 'Green synthesis', institution: 'HPU', nature: 'Minor', status: 'Ongoing' }]);
  assert.deepEqual(R.otherInfo, [{ text: 'Reviewer for journal X' }]);
  assert.deepEqual(R.enclosures, [{ label: 'Certificate / sanction order', checked: true }, { label: 'NSS certificate', checked: true, custom: true }]);
});

test('API scores 26-29, with point-44 rows', () => {
  const a = R.api;
  assert.deepEqual([a.c1.classes, a.c1.excess, a.c1.resourcesScore], ['50', '5', '12']);
  assert.deepEqual(a.c1.lectures, [{ course: 'B.Sc. I', level: 'UG', mode: 'Lecture', allotted: '6', conducted: '150', pct: '100' }]);
  assert.deepEqual(a.c1.resources, [{ course: 'B.Sc. I', consulted: 'Book X', prescribed: 'Book Y', additional: 'Notes' }]);
  assert.deepEqual(a.c1.innovative, [{ description: 'ICT teaching', score: '10' }]);
  assert.deepEqual(a.c1.exam, [{ type: 'Invigilation', assigned: '10', extent: '100%', score: '15' }]);
  assert.deepEqual(a.c2.extension, [{ activity: 'NSS', hours: '2', score: '10' }]);
  assert.deepEqual(a.c2.management, [{ activity: 'Committee', responsibility: 'Yearly', score: '5' }]);
  assert.deepEqual(a.c2.professional, [{ activity: 'Workshop', details: 'Details', score: '3' }]);
  const c3 = a.c3;
  assert.deepEqual(c3.journals[0], { title: 'Paper 1', journal: 'J Chem', issn: '1234', peer: '2.1', coauthors: '2', mainAuthor: 'Yes', row: 'A1', score: '9' });
  assert.equal(c3.journals[1].row, 'A2');
  assert.equal(c3.journals[1].coauthors, '0');
  assert.deepEqual(c3.chapters[0], { title: 'Chapter 1', book: 'Book B', issn: 'ISBN 1', peer: '', coauthors: '1', mainAuthor: 'No', row: 'B1a', score: '2' });
  assert.deepEqual(c3.proceedings[0], { title: 'Proc 1', conference: 'Conf C', issn: '', coauthors: '0', mainAuthor: 'Yes', score: '10' });
  assert.deepEqual(c3.books[0], { title: 'Book 1', type: 'Local — chapter', publisher: 'Local Press', peer: 'No', coauthors: '0', mainAuthor: 'Yes', row: 'B3c', score: '3' });
  assert.deepEqual(c3.ongoing.map(r => [r.title, r.row, r.score]), [['Major P', 'C1b', '15'], ['Consult', 'C2', '20']]);
  assert.deepEqual(c3.completed.map(r => [r.title, r.row, r.outcome, r.score]), [['Done P', 'C3', 'Report', '10'], ['Patent X', 'C4', '', '30']]);
  assert.deepEqual(c3.guidance, { mphilEnrolled: '', mphilSubmitted: '', mphilAwarded: '1', mphilScore: '3', phdEnrolled: '', phdSubmitted: '1', phdAwarded: '3', phdAwardedScore: '30', phdSubmittedScore: '7' });
  assert.deepEqual(c3.training[0], { programme: 'FDP', duration: '2 weeks', organisedBy: 'HRDC', row: 'E1a', score: '20' });
  assert.deepEqual(c3.papers[0], { title: 'Talk', conference: 'Sem', organisedBy: 'HPU', row: 'E2c', score: '5' });
  assert.deepEqual(c3.lectures[0], { title: 'Invited', conference: 'Conf', organisedBy: 'IIT', row: 'E3a', score: '10' });
  assert.deepEqual(a.lastAcademicYear, { cat1: '90', cat2: '20', cat3: '12.5', source: 'typed' });
});

test('arts slabs for ongoing projects', () => {
  const r = V.convertV04({ ...DOC, stream: 'arts', s2: { ...DOC.s2, c3: { ...DOC.s2.c3, Ci: [{ title: 'P', amount: '4' }, { title: 'Q', amount: '6' }, { title: 'S', amount: '0.3' }] } } }).record;
  assert.deepEqual(r.api.c3.ongoing.filter(x => x.row !== 'C2').map(x => x.row), ['C1b', 'C1a', 'C1c']);
});

test('everything not carried over is in the report, with its text', () => {
  const text = report.join('\n');
  for (const s of ['Practical is two hours.', 'Register p. 12', 'Footnote text', '(override)', '100', 'Encl.', 'Candidates A, B', 'Alpha']) {
    assert.ok(text.includes(s), s);
  }
});

test('odd values: bad DOB kept as typed, unknown status reported, empty v0.4 draft converts cleanly', () => {
  const r = V.convertV04({ ...DOC, p1: { ...DOC.p1, dob: '1980', status: 'ad hoc' } });
  assert.equal(r.record.profile.dob, '1980');
  assert.equal(r.record.profile.serviceStatus, undefined);
  assert.ok(r.report.join('\n').includes('ad hoc'));
  const empty = V.convertV04({ schemaVersion: 5, p1: {}, s1: {}, s2: {} });
  assert.equal(empty.record.session, '');
  assert.deepEqual(empty.record.teaching, []);
});

test('the converted record makes a Word file in the new version, with the answers in it', async () => {
  const { readFileSync } = await import('node:fs');
  const JSZip = (await import('jszip')).default;
  const { DOMParser, XMLSerializer } = await import('@xmldom/xmldom');
  const { generateDocx } = await import('../docx_engine.js');
  const bytes = await generateDocx(R, readFileSync(new URL('../ACR_EMPLOYEE_MASTER.docx', import.meta.url)), { JSZip, DOMParser, XMLSerializer });
  const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
  const text = xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '');
  for (const s of ['ASHA DEVI', 'EC-4321', 'Govt College Delta', 'Green synthesis', 'Paper 1', 'Patent X', 'Reviewer for journal X', 'NSS certificate']) {
    assert.ok(text.includes(s), s);
  }
});
