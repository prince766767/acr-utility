// Bring an ACR over from the earlier utility (v0.4) into this version
// (spec docs/superpowers/specs/2026-10-04-import-v04-design.md). Pure: it reads v0.4 data and returns a new record
// plus a report of what could not be carried over. v0.4's own data is never changed.
import { ENCLOSURE_DEFAULTS } from './acr_fields.js';

const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const arr = x => (Array.isArray(x) ? x : []);
const s = x => (x === undefined || x === null ? '' : String(x)).trim();
// A number from text such as "95%" or "150"; '' when there is none (the form's number boxes).
const n = x => { const m = /-?\d+(?:\.\d+)?/.exec(s(x)); return m ? Number(m[0]) : ''; };
const yesNo = x => { const w = s(x).toLowerCase(); return /^yes\b/.test(w) ? 'Yes' : /^no\b/.test(w) ? 'No' : ''; };
const coauthors = x => { const a = n(x); return a === '' ? '' : String(Math.max(0, a - 1)); };
const main = x => (s(x) === 'yes' ? 'Yes' : s(x) === 'no' ? 'No' : '');
const STATUS = ['Permanent', 'Quasi-permanent', 'Temporary', 'Contract'];
const BOOK_TYPES = { intl_sole: 'International — sole/co-author', intl_chapter: 'International — chapter', natl_sole: 'National — sole/co-author',
  natl_chapter: 'National — chapter', local_sole: 'Local — sole/co-author', local_chapter: 'Local — chapter' };

export function isV04Doc(x) {
  return !!x && typeof x === 'object' && typeof x.schemaVersion === 'number' && !!x.p1 && typeof x.p1 === 'object';
}
// A v0.4 draft, or a v0.4 backup ({kind:'acr-backup', docs:[...]}).
export function isV04(x) {
  return isV04Doc(x) || (!!x && x.kind === 'acr-backup' && Array.isArray(x.docs) && x.docs.some(isV04Doc));
}
export function v04Docs(x) {
  if (isV04Doc(x)) return [x];
  return isV04(x) ? x.docs.filter(isV04Doc) : [];
}

// v0.4 drafts saved in this browser (plain, or under a signed-in account's "acct.<id>." prefix), newest first.
export function findV04Docs(store) {
  const out = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!/^(acct\.[^.]+\.)?acr\.doc\./.test(key || '')) continue;
    let doc;
    try { doc = JSON.parse(store.getItem(key)); } catch { continue; }
    if (!isV04Doc(doc)) continue;
    out.push({ key, id: doc.id || '', session: s(doc.session), name: s(obj(doc.p1).fullName), updatedAt: doc.updatedAt || '', doc });
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function dob(x) {
  const v = s(x);
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
  return v;
}

function ongoingRow(amount, stream) {
  const a = n(amount);
  if (a === '') return '';
  if (stream === 'arts') return a > 5 ? 'C1a' : a > 3 ? 'C1b' : a >= 0.25 ? 'C1c' : '';
  return a > 30 ? 'C1a' : a > 5 ? 'C1b' : a >= 0.5 ? 'C1c' : '';
}

export function convertV04(doc) {
  const d = obj(doc), p1 = obj(d.p1), s1 = obj(d.s1), s2 = obj(d.s2), c1 = obj(s2.c1), c2 = obj(s2.c2), c3 = obj(s2.c3);
  const college = obj(d.college), certify = obj(d.certify), pb = obj(d.principalBlock);
  const report = [];
  const note = (what, text) => { if (s(text)) report.push(`${what}: ${s(text)}`); };

  const profile = {};
  const put = (k, v) => { if (s(v)) profile[k] = typeof v === 'string' ? v.trim() : v; };
  put('collegeName', college.name); put('collegeDistrict', college.district); put('collegePin', college.pin);
  put('principalName', s(college.principal) || pb.name);
  put('fullName', p1.fullName); put('fatherHusband', p1.fatherHusband); put('employeeCode', p1.empCode); put('subject', p1.subject);
  put('appointmentDate', p1.dateAppointment); put('designation', p1.designation); put('payBand', p1.payBand);
  put('academicQualification', [s(p1.qualAcademic), s(p1.qualDivision)].filter(Boolean).join(' '));
  put('professionalQualification', p1.qualProfessional); put('researchDegree', p1.qualResearch); put('dob', dob(p1.dob));
  const status = STATUS.find(x => x.toLowerCase() === s(p1.status).toLowerCase());
  if (status) profile.serviceStatus = status; else note('11. Service status (not one of Permanent / Quasi-permanent / Temporary / Contract; choose it again)', p1.status);
  put('permanentAddress', p1.permAddress); put('landline', p1.landline); put('mobile', p1.mobile); put('email', p1.email);
  put('submissionDate', certify.date);

  const part2 = {};
  const p = (k, v) => { if (s(v)) part2[k] = typeof v === 'string' ? v.trim() : v; };
  p('p8', p1.promotion);
  p('p12', arr(p1.served).map(r => [s(r.name), s(r.duration)].filter(Boolean).join(' – ')).filter(Boolean).join('\n'));
  p('p13a', [s(p1.deptExamRoll), s(p1.deptExamSession)].filter(Boolean).join(', '));
  p('p13b', p1.hindi); p('p14', p1.otherAssignment);
  p('p17', s1.q17); p('p18', s1.q18); p('p19b', s1.q19b); p('p19g', s1.q19g); p('p21i', s1.q21i); p('p23', s1.q23); p('p25', s1.q25);
  if (n(s1.q19aTotal) !== '') part2.totalPeriodsPerWeek = n(s1.q19aTotal);
  p('p19f', arr(s1.q19f).map(b => {
    const head = [s(b.title), [s(b.author), s(b.publisher), s(b.pages) ? `${s(b.pages)} pages` : ''].filter(Boolean).join(', ')].filter(Boolean).join(' – ');
    return [head, s(b.extract)].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n'));
  p('researchYesNo', yesNo(s1.q22));
  if (s(s1.q22) && !yesNo(s1.q22)) note('22. Research work answer (choose Yes / No again)', s1.q22);
  p('p24Satisfied', yesNo(s1.q24)); p('p24Reasons', s1.q24b);
  if (s(s1.q24) && !yesNo(s1.q24)) note('24. Satisfied? answer (choose Yes / No again)', s1.q24);

  const teaching = arr(s1.q19a).map((r, i) => ({ srNo: i + 1, classCourse: s(r.cls), college: s(r.college), allocated: n(r.allocated), delivered: n(r.delivered), syllabusPct: n(r.syllabus) }));
  const assignments = arr(s1.q19c).map(r => ({ classCourse: s(r.cls), assignments: n(r.assignments), tests: n(r.tests) }));
  const activities = arr(s1.q19d).map(r => ({ title: s(r.title), detail: s(r.detail) }));
  const results = arr(s1.q20).map(r => {
    const up = n(r.univPct);
    if (up === '' && s(r.univPct) && !/^not available$/i.test(s(r.univPct))) note(`20. University pass % for ${s(r.cls)}`, r.univPct);
    return { className: s(r.cls), duration: s(r.duration), appeared: n(r.appeared), passed: n(r.passed), collegePct: n(r.collegePct), universityPct: up,
      divI: n(r.d1), divII: n(r.d2), divIII: n(r.d3), failed: n(r.failed), reason: s(r.reason) };
  });
  const orientation = arr(s1.q21ii).map(r => ({ course: s(r.name), place: s(r.place), duration: s(r.duration), rcoc: s(r.rc) }));
  const research = arr(s1.q22rows).map(r => ({ title: s(r.topic), institution: s(r.univ), nature: s(r.nature), status: s(r.status) }));
  const otherInfo = arr(d.partB).map(r => ({ text: s(r.text) })).filter(r => r.text);
  const enclosures = arr(d.enclosures).map(e => s(e.text)).filter(Boolean)
    .map(label => (ENCLOSURE_DEFAULTS.includes(label) ? { label, checked: true } : { label, checked: true, custom: true }));

  // ---- API (points 26-29): scores copied as typed ----
  const ii = obj(c1.ii);
  const api = {
    c1: { classes: s(c1.scoreA), excess: s(c1.scoreB), resourcesScore: s(ii.score),
      resources: arr(ii.rows).map(r => ({ course: s(r.course), consulted: s(r.consulted), prescribed: s(r.prescribed), additional: s(r.additional) })),
      innovative: arr(obj(c1.iii).rows).map(r => ({ description: s(r.desc), score: s(r.score) })),
      exam: arr(obj(c1.iv).rows).map(r => ({ type: s(r.type), assigned: s(r.assigned), extent: s(r.extent), score: s(r.score) })) },
    c2: { extension: arr(c2.i).map(r => ({ activity: s(r.activity), hours: s(r.hours), score: s(r.score) })),
      management: arr(c2.ii).map(r => ({ activity: s(r.activity), responsibility: s(r.hours), score: s(r.score) })),
      professional: arr(c2.iii).map(r => ({ activity: s(r.activity), details: s(r.hours), score: s(r.score) })) },
    c3: {
      journals: arr(c3.A).map(r => ({ title: s(r.title), journal: s(r.journal), issn: s(r.issn), peer: s(r.impact), coauthors: coauthors(r.authors), mainAuthor: main(r.main), row: r.kind === 'recognized' ? 'A2' : 'A1', score: s(r.score) })),
      chapters: arr(c3.Bi).map(r => ({ title: s(r.title), book: s(r.book), issn: s(r.issn), peer: '', coauthors: coauthors(r.authors), mainAuthor: main(r.main), row: r.kind === 'international' ? 'B1a' : 'B1b', score: s(r.score) })),
      proceedings: arr(c3.Bii).map(r => ({ title: s(r.title), conference: s(r.conf), issn: s(r.issn), coauthors: coauthors(r.authors), mainAuthor: main(r.main), score: s(r.score) })),
      books: arr(c3.Biii).map(r => ({ title: s(r.title), type: BOOK_TYPES[r.kind] || '', publisher: s(r.publisher), peer: s(r.peer), coauthors: coauthors(r.authors), mainAuthor: main(r.main),
        row: String(r.kind || '').startsWith('intl') ? 'B3a' : String(r.kind || '').startsWith('local') ? 'B3c' : 'B3b', score: s(r.score) })),
      ongoing: [...arr(c3.Ci).map(r => ({ title: s(r.title), agency: s(r.agency), period: s(r.period), amount: s(r.amount), row: ongoingRow(r.amount, d.stream), score: s(r.score) })),
        ...arr(c3.Cii).map(r => ({ title: s(r.title), agency: s(r.agency), period: s(r.period), amount: s(r.amount), row: 'C2', score: s(r.score) }))],
      completed: [...arr(c3.Ciii).map(r => ({ title: s(r.title), agency: s(r.agency), period: s(r.period), amount: s(r.amount), outcome: s(r.outcome), row: 'C3', score: s(r.score) })),
        ...arr(c3.Civ).map(r => ({ title: s(r.title), agency: '', period: '', amount: '', outcome: '', row: 'C4', score: s(r.score) }))],
      guidance: { mphilEnrolled: '', mphilSubmitted: '', mphilAwarded: '', mphilScore: '', phdEnrolled: '', phdSubmitted: '', phdAwarded: '', phdAwardedScore: '', phdSubmittedScore: '' },
      training: arr(c3.Ei).map(r => ({ programme: s(r.programme), duration: s(r.duration), organisedBy: s(r.by), row: r.weeks === 'two' ? 'E1a' : 'E1b', score: s(r.score) })),
      papers: arr(c3.Eii).map(r => ({ title: s(r.title), conference: s(r.conf), organisedBy: s(r.by), row: { international: 'E2a', national: 'E2b', state: 'E2c', local: 'E2d' }[r.level] || '', score: s(r.score) })),
      lectures: arr(c3.Eiii).map(r => ({ title: s(r.title), conference: s(r.conf), organisedBy: s(r.by), row: r.level === 'international' ? 'E3a' : 'E3b', score: s(r.score) })),
    },
  };
  // research guidance: counts and scores summed per kind
  const g = api.c3.guidance;
  const add = (k, v) => { const x = n(v); if (x !== '') g[k] = String((n(g[k]) || 0) + x); };
  for (const r of arr(c3.D)) {
    const [cnt, sc] = { mphil_awarded: ['mphilAwarded', 'mphilScore'], phd_awarded: ['phdAwarded', 'phdAwardedScore'], phd_submitted: ['phdSubmitted', 'phdSubmittedScore'] }[r.kind] || [];
    if (!cnt) continue;
    add(cnt, s(r.count) || '1'); add(sc, r.score);
    note('28 D. Research guidance details (the new version has counts only)', r.detail);
  }
  const ly = obj(s2.lastYear);
  if (s(ly.c1) || s(ly.c2) || s(ly.c3)) api.lastAcademicYear = { cat1: s(ly.c1), cat2: s(ly.c2), cat3: s(ly.c3), source: 'typed' };

  // ---- what could not come over ----
  for (const r of arr(c1.rows)) note('26(i) table row (the new version has only the (a) and (b) scores)', [r.course, r.level, r.mode, r.allotted, r.conducted, r.pct].map(s).filter(Boolean).join(' – '));
  note('19(a) note beside the total', s1.q19aNote);
  for (const r of arr(s1.q19c)) note(`19(c) verifiable record note for ${s(r.cls)}`, r.remark);
  note('26(ii) footnote', ii.note);
  const ov = obj(s2.override);
  for (const [k, label] of [['c1', 'I'], ['c2', 'II'], ['c3', 'III']]) note(`29. Category ${label} "Reported (override)" figure (the new version reports its own totals)`, ov[k]);
  const encl = Object.values(c3).flatMap(arr).filter(r => s(r.encl)).length;
  if (encl) report.push(`28. Enclosure numbers ("Encl. #") on ${encl} Category-III entr${encl === 1 ? 'y' : 'ies'} are not shown in the new version.`);
  note('Place (college)', college.place); note('Place (your certificate)', certify.place); note('Designation as signed', certify.designation);
  note("Principal's place", pb.place); note("Principal's college line", pb.college);
  report.push('API scores were copied as typed; the new version totals them under its own rules, so a total can differ slightly from the earlier version.');

  const style = { color: (/^#?[0-9a-f]{6}$/i.test(s(obj(d.style).answerColor)) ? s(d.style.answerColor).replace('#', '').toUpperCase() : '0000CC'),
    font: '', size: 0, bold: obj(d.style).answerBold === true, italic: false };

  const record = { session: s(d.session), profile, part1: {}, part2, teaching, assignments, results, activities, orientation, research, otherInfo,
    api, enclosures, style, ui: { section: 'profile' } };
  return { record, report };
}
