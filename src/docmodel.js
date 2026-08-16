/* ===================== DOCUMENT MODEL =====================
   buildDoc(d) -> flat array of blocks.
   Consumed by renderHTML() (preview + print/PDF) and buildDocx() (Word).
   Part-I and Part-II carry the teacher's data.
   Part-III and Part-IV are reproduced blank, word-for-word, in the official
   order and layout, but cleanly typeset.
=========================================================== */

const B = {
  pb: () => ({ t: 'pb' }),
  p: (text, o) => ({ t: 'p', text: text ?? '', o: o || {} }),
  note: (text) => ({ t: 'p', text, o: { italic: true, size: 9.5 } }),
  parthead: (text, sub) => ({ t: 'parthead', text, sub }),
  sechead: (text) => ({ t: 'sechead', text }),
  q: (n, text) => ({ t: 'q', n, text }),
  ans: (text, opt) => ({ t: 'ans', text: text ?? '', ...(opt || {}) }),
  kv: (rows) => ({ t: 'kv', rows }),
  table: (cols, head, rows, o) => ({ t: 'table', cols, head: head || [], rows: rows || [], o: o || {} }),
  ol: (items, start) => ({ t: 'ol', items, start: start || 1 }),
  sig: (left, right) => ({ t: 'sig', left, right }),
  /* point 10: a compact eight-box strip, not a full-width table */
  dob: (label, digits, words) => ({ t: 'dob', label, digits, words }),
  rule: () => ({ t: 'rule' }),
  box: (h) => ({ t: 'box', h: h || 'med' }),
  choices: (items) => ({ t: 'choices', items }),
  sp: (h) => ({ t: 'sp', h: h || 6 })
};

const dash = (v, fill) => (String(v ?? '').trim() === '' ? (fill || '') : String(v));
const DOT = '…………………………………………………';

function dobCells(dob) {
  const s = String(dob || '').replace(/\D/g, '').padEnd(8, ' ').slice(0, 8);
  return s.split('').map((c) => c.trim());
}

function buildDoc(d) {
  const t = totals(d);
  const o = [];
  const P = d.p1, S = d.s1, C = d.s2;
  const encl = d.enclosures || [];
  const eref = (n) => {
    const s = String(n || '').trim();
    return s ? 'Encl. ' + s : '';
  };

  /* ---------------- COVER + PART I ---------------- */
  o.push(B.p('Appendix-IV', { align: 'r', italic: true, size: 10 }));
  o.push({
    t: 'banner',
    lines: [
      { text: 'HIMACHAL PRADESH GOVERNMENT', bold: true, size: 13 },
      { text: 'EDUCATION DEPARTMENT', bold: true, size: 12 },
      { text: '', size: 6 },
      { text: 'ANNUAL PERFORMANCE BASED APPRAISAL', bold: true, size: 14 },
      { text: '(with API scores based on PBAS as per UGC Regulations 2010)', size: 10.5 },
      { text: '(FOR ASSISTANT PROFESSORS / ASSOCIATE PROFESSORS IN COLLEGE CADRE)', size: 10.5, italic: true }
    ]
  });
  o.push(B.kv([
    ['Name of the College through which ACR is submitted',
      [d.college.name, [d.college.district, d.college.pin].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
    ['Appraisal of work and conduct of Dr./Shri/Smt/Kumari', P.fullName],
    ['Submitted for the year / session', d.session]
  ]));
  o.push(B.parthead('PART-I  ·  PERSONAL DATA', '(To be filled up by the Assistant Professor / Associate Professor)'));
  o.push(B.kv([
    ['1.  Full Name (in capital letters)', P.fullName],
    ['2.  Father / Husband name', P.fatherHusband],
    ['3.  Employee Code', P.empCode],
    ['4.  Subject for which appointed', P.subject],
    ['5.  Date of appointment (in College Cadre)', P.dateAppointment],
    ['6.  Current Designation', P.designation],
    ['7.  Present Pay Band with Grade Pay', P.payBand],
    ['8.  Date of promotion (if any, during past one year)', P.promotion],
    ['9.  Qualification — (a) Academic / Division', [P.qualAcademic, P.qualDivision].filter(Boolean).join('  —  ')],
    ['      (b) Professional', P.qualProfessional],
    ['      (c) Research Degree', P.qualResearch]
  ]));
  o.push(B.dob('10.  Date of Birth', dobCells(P.dob), P.dobWords));
  o.push(B.kv([
    ['11.  Permanent / Quasi-permanent / Temporary / Contract', P.status]
  ]));
  o.push(B.p('12.  College / Colleges in which served during the year, with specific duration', { bold: true }));
  o.push(B.table([8, 57, 35], [[{ text: 'Sr.', align: 'c' }, 'College', 'Duration']],
    (P.served && P.served.length ? P.served : [{ name: '', duration: '' }])
      .map((r, i) => [{ text: String(i + 1), align: 'c' }, r.name, r.duration]), { ansBody: true }));
  o.push(B.kv([
    ['13. (a)  Roll No. (with session) & date of passing of Departmental Exam.',
      [P.deptExamRoll, P.deptExamSession].filter(Boolean).join('   ·   ')],
    ['      (b)  Hindi subject: cleared / exempted (mention details)', P.hindi],
    ['14.  Any other major assignment in addition to teaching (e.g. Offg. Principal, etc.)', P.otherAssignment],
    ['15.  Permanent Address (with PIN code)', P.permAddress],
    ['16.  Landline telephone No.', P.landline],
    ['        Mobile No.', P.mobile],
    ['        Email', P.email]
  ]));
  o.push(B.pb());

  /* ---------------- PART II SECTION I ---------------- */
  o.push(B.parthead('PART-II  :  SECTION-I', '( SELF APPRAISAL )'));
  o.push(B.note('Brief resume should bring out any significant achievement during the period under report.'));
  o.push(B.q(17, 'What do you think has been your most important contribution this year?'));
  o.push(B.ans(S.q17));
  o.push(B.q(18, 'Have you made any contribution in the area of work not assigned to you?'));
  o.push(B.ans(S.q18));

  o.push(B.q('19 (a)', 'Weekly time table (whole academic year)'));
  o.push(B.table([5, 27, 16, 15, 17, 20],
    [[{ text: 'Sr.', align: 'c' }, 'Class', 'Name of the College',
      'No. of lectures allocated (per week)', 'Total lectures actually delivered during session',
      '% age of syllabus completed for each class / course']],
    (S.q19a || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.cls, r.college,
      { text: r.allocated, align: 'c' }, { text: r.delivered, align: 'c' }, { text: r.syllabus, align: 'c' }])
      .concat([[{ text: 'Total periods per week', span: 3, bold: true },
      { text: dash(S.q19aTotal), align: 'c', bold: true },
      { text: dash(S.q19aNote), span: 2, italic: true }]]),
    { totLast: true, ansBody: true }));
  o.push(B.q('19 (b)', 'Any special effort made to improve classroom instruction.'));
  o.push(B.ans(S.q19b));
  o.push(B.q('19 (c)', 'How many assignments and class tests did you give this year?'));
  o.push(B.table([5, 26, 15, 22, 32],
    [[{ text: 'Sr.', align: 'c' }, 'Class', 'No. of assignments given to students',
      'No. of class tests given to students', 'Refer the verifiable record available in the College Office']],
    (S.q19c || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.cls,
      { text: r.assignments, align: 'c' }, r.tests, r.remark]), { ansBody: true }));
  o.push(B.q('19 (d)', 'Details of academic activities organised in the college.'));
  o.push(B.table([30, 70], [['Title of the activity', 'Brief detail of activity']],
    (S.q19d || []).map((r) => [r.title, r.detail]), { ansBody: true }));
  o.push(B.q('19 (f)', 'Which new books relating to your subject did you read during the year?'));
  o.push(B.note('A brief extract of about 50 words on the value content of each book is given below.'));
  (S.q19f || []).forEach((bk, i) => {
    o.push(B.p((i + 1) + '.  ' + dash(bk.title), { bold: true, ans: true }));
    o.push(B.kv([
      ['      Author / Editor', bk.author, true],
      ['      Publisher', [bk.publisher, bk.pages ? bk.pages + ' pages' : ''].filter(Boolean).join('  ·  '), true]
    ]));
    o.push(B.p('      Brief extract: ' + dash(bk.extract), { size: 10, ans: true }));
  });
  o.push(B.q('19 (g)', 'What are the vital problems of teaching before you, in order of importance?'));
  o.push(B.ans(S.q19g));

  o.push(B.q(20, 'Details of last year’s annual examination results'));
  o.push(B.table([13, 8, 7, 6, 7, 8, 7, 6, 6, 6, 6, 20],
    [[{ text: 'Class', rspan: 2 }, { text: 'Duration for which taught', rspan: 2 },
    { text: 'Total students appeared', rspan: 2 }, { text: 'Passed', rspan: 2 },
    { text: 'College pass %', rspan: 2 }, { text: 'University pass %', rspan: 2 },
    { text: 'Variation (+/–) (col. 5–6)', rspan: 2 }, { text: 'Details of pass students', span: 4 },
    { text: 'Reasons for low %age, if any', rspan: 2 }],
    [{ text: 'Div. I', align: 'c' }, { text: 'Div. II', align: 'c' },
    { text: 'Div. III', align: 'c' }, { text: 'Failed', align: 'c' }]],
    (S.q20 || []).map((r) => [r.cls, r.duration, { text: r.appeared, align: 'c' }, { text: r.passed, align: 'c' },
    { text: r.collegePct, align: 'c' }, { text: r.univPct, align: 'c' }, { text: r.variation, align: 'c' },
    { text: r.d1, align: 'c' }, { text: r.d2, align: 'c' }, { text: r.d3, align: 'c' },
    { text: r.failed, align: 'c' }, r.reason]),
    { tiny: true, ansBody: true }));

  o.push(B.q('21 (i)', 'Whether you acquired any degree or fresh academic / professional qualification during the year? If “YES”, mention the name of the degree, year of passing, institution etc.'));
  o.push(B.ans(S.q21i));
  o.push(B.q('21 (ii)', 'Academic Staff College Orientation / Refresher Course / Summer School attended during the year'));
  o.push(B.table([34, 22, 20, 24],
    [['Name of the Summer School / Refresher / Orientation Course with sponsoring agency',
      'Place of Summer School / ASC where the course was attended', 'Duration of school / course', 'RC / OC No. with title']],
    (S.q21ii || []).map((r) => [r.name, r.place, r.duration, r.rc]), { ansBody: true }));
  o.push(B.q(22, 'Are you doing any research work? If “YES”, provide the following details.'));
  if (String(S.q22 || '').trim()) o.push(B.ans(S.q22));
  o.push(B.table([34, 22, 20, 24],
    [['Topic / title of research project', 'Name of the University / Institution registered with',
      'Nature of project (Minor / Major / Doctoral / Post-Doctoral)', 'Present status of research work / project']],
    (S.q22rows || []).map((r) => [r.topic, r.univ, r.nature, r.status]), { ansBody: true }));
  o.push(B.q(23, 'Did you receive any honour, prize or award during the year? If “YES”, give details.'));
  o.push(B.ans(S.q23));
  o.push(B.q(24, 'Are you satisfied with your present position / pay? If not, do you want to change the profession? Give reasons.'));
  o.push(B.ans([S.q24, S.q24b].filter((x) => String(x || '').trim()).join('\n')));
  o.push(B.q(25, 'Any other significant point which is not covered above.'));
  o.push(B.ans(S.q25));
  o.push(B.pb());

  /* ---------------- PART II SECTION II ---------------- */
  o.push(B.parthead('PART-II  :  SECTION-II',
    'ANNUAL SELF-ASSESSMENT FOR THE PERFORMANCE BASED APPRAISAL SYSTEM (PBAS)'));
  o.push(B.kv([['For the session / year', d.session]]));
  o.push(B.note('(To be completed and submitted at the end of each academic year.)'));
  o.push(B.sechead('PART-A : ACADEMIC PERFORMANCE INDICATORS'));
  o.push(B.note('Please see the detailed instructions of this PBAS Proforma before filling out this section.'));

  o.push(B.p('26.  CATEGORY-I : TEACHING, LEARNING AND EVALUATION RELATED ACTIVITIES', { bold: true, size: 11.5 }));
  o.push(B.p('(i)  Lectures, seminars, tutorials, practicals, contact hours (give semester-wise details where necessary)', { bold: true }));
  o.push(B.table([5, 25, 12, 25, 11, 10, 12],
    [[{ text: 'S. No.', align: 'c' }, 'Course / Paper', 'Level', 'Mode of teaching',
      'No. of classes per week allotted', 'No. of classes conducted', '% of classes / practicals taken as per documented record']],
    (C.c1.rows || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.course, r.level, r.mode,
      { text: r.allotted, align: 'c' }, { text: r.conducted, align: 'c' },
      { text: r.pct === '' ? '' : r.pct + '%', align: 'c' }]), { ansBody: true }));
  o.push(B.note('Lecture (L), Seminar (S), Tutorial (T), Practical (P), Contact Hours (C).'));
  o.push(B.table([7, 78, 15], [[{ text: '', align: 'c' }, '', { text: 'API Score', align: 'c' }]], [
    [{ text: '(a)', align: 'c' }, 'Classes taken (max. 50 for 100% performance and proportionate score up to 80% performance, below which no score may be given)', { text: fmt(t.c1.a), align: 'c', bold: true, a: true }],
    [{ text: '(b)', align: 'c' }, 'Teaching load in excess of UGC norm (max. score: 10)', { text: fmt(t.c1.b), align: 'c', bold: true, a: true }]
  ]));

  o.push(B.p('(ii)  Reading / instructional material consulted and additional knowledge resources provided to students', { bold: true }));
  o.push(B.table([5, 24, 25, 22, 24],
    [[{ text: 'Sr.', align: 'c' }, 'Course / Paper', 'Consulted', 'Prescribed', 'Additional resource provided']],
    (C.c1.ii.rows || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.course, r.consulted, r.prescribed, r.additional]),
    { ansBody: true }));
  if (String(C.c1.ii.note || '').trim()) o.push({ t: 'p', text: '** ' + C.c1.ii.note, o: { italic: true, size: 9.5, ans: true } });
  o.push(B.table([85, 15], [], [[
    { text: 'API score based on preparation and imparting of knowledge / instruction as per curriculum and syllabus enrichment by providing additional resources to students (max. score: 20)', bold: true },
    { text: fmt(t.c1.ii), align: 'c', bold: true, a: true }
  ]], { totLast: true }));

  o.push(B.p('(iii)  Use of participatory and innovative teaching-learning methodologies, updating of subject content, course improvement etc.', { bold: true }));
  o.push(B.table([6, 79, 15], [[{ text: 'S. No.', align: 'c' }, 'Short description', { text: 'API Score', align: 'c' }]],
    (C.c1.iii.rows || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.desc, { text: dash(r.score), align: 'c' }])
      .concat([[{ text: 'Total Score  (Max. 20)', span: 2, bold: true, a: false }, { text: fmt(t.c1.iii), align: 'c', bold: true }]]),
    { totLast: true, ansBody: true }));

  o.push(B.p('(iv)  Examination duties assigned and performed', { bold: true }));
  o.push(B.table([6, 47, 16, 16, 15],
    [[{ text: 'S. No.', align: 'c' }, 'Type of examination duties', 'Duties assigned', 'Extent to which carried out (%)', { text: 'API Score', align: 'c' }]],
    (C.c1.iv.rows || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.type, { text: r.assigned, align: 'c' },
      { text: r.extent, align: 'c' }, { text: dash(r.score), align: 'c' }])
      .concat([[{ text: 'Total Score  (Max. 25)', span: 4, bold: true, a: false }, { text: fmt(t.c1.iv), align: 'c', bold: true }]]),
    { totLast: true, ansBody: true }));
  o.push(B.table([85, 15], [], [[{ text: 'CATEGORY-I  TOTAL  (Max. 125 · Min. required 75)', bold: true },
  { text: fmt(t.c1.total), align: 'c', bold: true, a: true }]], { totLast: true }));

  o.push(B.pb());
  o.push(B.p('27.  CATEGORY-II : CO-CURRICULAR, EXTENSION AND PROFESSIONAL DEVELOPMENT RELATED ACTIVITIES', { bold: true, size: 11.5 }));
  o.push(B.note('Please mention your contribution to any of the following.'));
  const c2tbl = (label, rows, maxScore, colB, tot) => {
    o.push(B.table([6, 55, 24, 15],
      [[{ text: 'S. No.', align: 'c' }, label, colB, { text: 'API Score', align: 'c' }]],
      (rows || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.activity, r.hours, { text: dash(r.score), align: 'c' }])
        .concat([[{ text: 'Total  (Max. ' + maxScore + ')', span: 3, bold: true, a: false }, { text: fmt(tot), align: 'c', bold: true }]]),
      { totLast: true, ansBody: true }));
  };
  c2tbl('(i)  Extension, co-curricular and field-based activities', C.c2.i, 20, 'Average hours / week', t.c2.i);
  c2tbl('(ii)  Contribution to corporate life and management of the institution', C.c2.ii, 15, 'Yearly / semester-wise responsibilities', t.c2.ii);
  c2tbl('(iii)  Professional development activities', C.c2.iii, 15, 'Details', t.c2.iii);
  o.push(B.table([85, 15], [], [[{ text: 'CATEGORY-II  TOTAL (i + ii + iii)  (Max. 25 · Min. required 15)', bold: true },
  { text: fmt(t.c2.total), align: 'c', bold: true, a: true }]], { totLast: true }));

  o.push(B.pb());
  o.push(B.p('28.  CATEGORY-III : RESEARCH, PUBLICATIONS AND ACADEMIC CONTRIBUTIONS', { bold: true, size: 11.5 }));
  o.push(B.note('Note 1 — To be filled as per Appendix-III, Table-I, Category-III of the UGC Regulations 2010. Wherever the research contribution is jointly made, API scores are shared between contributors as per the formula provided in Table-I.'));
  o.push(B.note('Note 2 — The minimum API score required from this category differs by level of promotion. The self-assessment score is based on verifiable criteria and is finalised by the screening / selection committee.'));
  o.push(B.note('Note 3 — The minimum point norms of the APIs are as provided in Appendix-III, Table-II (B).'));

  const NILROW = (n) => [[{ text: 'NIL', span: n, align: 'c', italic: true }]];
  const c3 = C.c3;

  const blk = (heading, cols, head, rows, key) => {
    o.push(B.p(heading, { bold: true }));
    const body = rows.length ? rows : NILROW(cols.length);
    const tot = sumRows(c3[key], 'score');
    o.push(B.table(cols, head, body.concat([[
      { text: 'Sub-total', span: cols.length - 1, bold: true, align: 'r', a: false },
      { text: fmt(key === 'Ei' ? Math.min(tot, 30) : tot), align: 'c', bold: true }
    ]]), { totLast: true, tiny: true, ansBody: true }));
  };

  blk('A.  Published papers in journals', [5, 27, 17, 11, 14, 8, 8, 10],
    [[{ text: 'S. No.', align: 'c' }, 'Title with page nos.', 'Journal', 'ISSN / ISBN No.',
      'Whether peer reviewed / Impact Factor', 'No. of co-authors', 'Whether you are the main author', { text: 'API Score', align: 'c' }]],
    (c3.A || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.title, r.journal, r.issn,
      [r.kind === 'refereed' ? 'Refereed' : 'Recognised / reputed', r.impact ? 'IF ' + r.impact : ''].filter(Boolean).join(', '),
      { text: dash(r.authors), align: 'c' }, { text: r.main === 'yes' ? 'Yes' : 'No', align: 'c' },
      { text: dash(r.score), align: 'c' }]), 'A');

  blk('B (i).  Articles / chapters published in books', [5, 26, 22, 10, 12, 8, 8, 9],
    [[{ text: 'S. No.', align: 'c' }, 'Title with page nos.', 'Book title, editor & publisher', 'ISSN / ISBN No.',
      'Whether peer reviewed', 'No. of co-authors', 'Whether you are the main author', { text: 'API Score', align: 'c' }]],
    (c3.Bi || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.title, r.book, r.issn,
      r.kind === 'international' ? 'International publisher' : 'National / Indian publisher',
      { text: dash(r.authors), align: 'c' }, { text: r.main === 'yes' ? 'Yes' : 'No', align: 'c' },
      { text: dash(r.score), align: 'c' }]), 'Bi');

  blk('B (ii).  Full papers in conference proceedings', [5, 30, 28, 12, 9, 8, 8],
    [[{ text: 'S. No.', align: 'c' }, 'Title with page nos.', 'Details of conference publication', 'ISSN / ISBN No.',
      'No. of co-authors', 'Whether you are the main author', { text: 'API Score', align: 'c' }]],
    (c3.Bii || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.title, r.conf, r.issn,
      { text: dash(r.authors), align: 'c' }, { text: r.main === 'yes' ? 'Yes' : 'No', align: 'c' },
      { text: dash(r.score), align: 'c' }]), 'Bii');

  const BOOKKIND = { intl_sole: 'International publisher — sole/co-author', intl_chapter: 'International publisher — chapter', natl_sole: 'National publisher — sole/co-author', natl_chapter: 'National publisher — chapter', local_sole: 'Local publisher — sole/co-author', local_chapter: 'Local publisher — chapter' };
  blk('B (iii).  Books published as single / co-author or as editor', [5, 26, 20, 16, 10, 8, 7, 8],
    [[{ text: 'S. No.', align: 'c' }, 'Title with page nos.', 'Type of book & authorship', 'Publisher & ISSN / ISBN No.',
      'Whether peer reviewed', 'No. of co-authors', 'Main author', { text: 'API Score', align: 'c' }]],
    (c3.Biii || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.title, BOOKKIND[r.kind] || '', r.publisher,
      r.peer || '', { text: dash(r.authors), align: 'c' }, { text: r.main === 'yes' ? 'Yes' : 'No', align: 'c' },
      { text: dash(r.score), align: 'c' }]), 'Biii');

  o.push(B.p('C.  Ongoing and completed research projects and consultancies', { bold: true }));
  blk('C (i & ii).  Ongoing projects / consultancies', [5, 34, 22, 15, 14, 10],
    [[{ text: 'S. No.', align: 'c' }, 'Title', 'Agency', 'Period', 'Grant / amount mobilised (Rs. lakh)', { text: 'API Score', align: 'c' }]],
    (c3.Ci || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.title, r.agency, r.period,
      { text: dash(r.amount), align: 'c' }, { text: dash(r.score), align: 'c' }]), 'Ci');
  if ((c3.Cii || []).length) {
    blk('C (ii).  Consultancy projects', [5, 34, 22, 15, 14, 10],
      [[{ text: 'S. No.', align: 'c' }, 'Title', 'Agency', 'Period', 'Amount mobilised (Rs. lakh)', { text: 'API Score', align: 'c' }]],
      (c3.Cii || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.title, r.agency, r.period,
        { text: dash(r.amount), align: 'c' }, { text: dash(r.score), align: 'c' }]), 'Cii');
  }
  blk('C (iii & iv).  Completed projects / consultancies', [5, 28, 18, 12, 14, 13, 10],
    [[{ text: 'S. No.', align: 'c' }, 'Title', 'Agency', 'Period', 'Grant / amount mobilised (Rs. lakh)',
      'Whether policy document / patent as outcome', { text: 'API Score', align: 'c' }]],
    (c3.Ciii || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.title, r.agency, r.period,
      { text: dash(r.amount), align: 'c' }, r.outcome || (r.kind === 'major' ? 'Major project' : 'Minor project'),
      { text: dash(r.score), align: 'c' }]), 'Ciii');
  if ((c3.Civ || []).length) {
    blk('C (iv).  Project outcome / outputs (patent, technology transfer, policy document)', [5, 55, 25, 15],
      [[{ text: 'S. No.', align: 'c' }, 'Details of output', 'Level', { text: 'API Score', align: 'c' }]],
      (c3.Civ || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.title,
        r.kind === 'international' ? 'International' : 'National', { text: dash(r.score), align: 'c' }]), 'Civ');
  }

  const GK = { mphil_awarded: 'M.Phil. — degree awarded', phd_awarded: 'Ph.D. — degree awarded', phd_submitted: 'Ph.D. — thesis submitted' };
  blk('D.  Research guidance', [5, 40, 18, 22, 15],
    [[{ text: 'S. No.', align: 'c' }, 'Particulars', 'Number', 'Candidate / details', { text: 'API Score', align: 'c' }]],
    (c3.D || []).map((r, i) => [{ text: String(i + 1), align: 'c' }, GK[r.kind] || '', { text: dash(r.count), align: 'c' },
      r.detail, { text: dash(r.score), align: 'c' }]), 'D');

  blk('E (i).  Training courses, teaching-learning-evaluation technology programmes, Faculty Development Programmes (not less than one week duration) — max. 30',
    [5, 38, 16, 26, 15],
    [[{ text: 'S. No.', align: 'c' }, 'Programme', 'Duration', 'Organised by', { text: 'API Score', align: 'c' }]],
    (c3.Ei || []).map((r, i) => [{ text: String(i + 1), align: 'c' },
      r.programme + (eref(r.encl) ? '  [' + eref(r.encl) + ']' : ''), r.duration, r.by, { text: dash(r.score), align: 'c' }]), 'Ei');

  const LVL = { international: 'International', national: 'National', state: 'Regional / State', local: 'College / University' };
  blk('E (ii).  Papers presented in conferences, seminars, workshops, symposia', [5, 32, 26, 20, 9, 8],
    [[{ text: 'S. No.', align: 'c' }, 'Title of the paper presented', 'Title of conference / seminar', 'Organised by',
      'Level', { text: 'API Score', align: 'c' }]],
    (c3.Eii || []).map((r, i) => [{ text: String(i + 1), align: 'c' },
      r.title + (eref(r.encl) ? '  [' + eref(r.encl) + ']' : ''), r.conf, r.by,
      { text: LVL[r.level] || '', align: 'c' }, { text: dash(r.score), align: 'c' }]), 'Eii');

  blk('E (iii).  Invited lectures and chairmanships at national or international conferences / seminars', [5, 32, 26, 20, 9, 8],
    [[{ text: 'S. No.', align: 'c' }, 'Title of lecture / academic session', 'Title of conference / seminar', 'Organised by',
      'Level', { text: 'API Score', align: 'c' }]],
    (c3.Eiii || []).map((r, i) => [{ text: String(i + 1), align: 'c' },
      r.title + (eref(r.encl) ? '  [' + eref(r.encl) + ']' : ''), r.conf, r.by,
      { text: LVL[r.level] || '', align: 'c' }, { text: dash(r.score), align: 'c' }]), 'Eiii');

  o.push(B.table([85, 15], [], [[{ text: 'CATEGORY-III  TOTAL', bold: true },
  { text: fmt(t.c3.total), align: 'c', bold: true, a: true }]], { totLast: true }));

  /* ---- 29 summary ---- */
  o.push(B.sp(10));
  o.push(B.p('29.  SUMMARY OF API SCORES', { bold: true, size: 11.5 }));
  o.push(B.table([6, 58, 18, 18],
    [[{ text: '', align: 'c' }, 'Criteria', 'Last Academic Year', 'Total API Score for Assessment Period']], [
    [{ text: 'I', align: 'c', bold: true }, 'Teaching, Learning and Evaluation related activities.\nTotal Max. Score = 125 ; Min. Score required = 75',
    { text: dash(C.lastYear.c1), align: 'c', a: true }, { text: fmt(t.c1.final), align: 'c', bold: true, a: true }],
    [{ text: 'II', align: 'c', bold: true }, 'Co-curricular, Extension, Professional development etc.\nTotal Max. Score = 25 ; Min. Score required = 15',
    { text: dash(C.lastYear.c2), align: 'c', a: true }, { text: fmt(t.c2.final), align: 'c', bold: true, a: true }],
    [{ text: '', align: 'c' }, { text: 'Total  I + II\nMin. total annual score under Categories I & II = 100', bold: true },
    { text: dash(C.lastYear.c1 || C.lastYear.c2 ? fmt(num(C.lastYear.c1) + num(C.lastYear.c2)) : ''), align: 'c', bold: true, a: true },
    { text: fmt(t.c1.final + t.c2.final), align: 'c', bold: true, a: true }],
    [{ text: 'III', align: 'c', bold: true }, 'Research and Academic Contribution.\nFor stage 1→2: min. 5/year; stage 2→3: min. 10/year; stage 3→4: min. 15/year; stage 4→5: min. 20/year (stages 1–5 correspond to scales with AGP of Rs. 6000, 7000, 8000, 9000 & 10000 respectively).',
    { text: dash(C.lastYear.c3), align: 'c', a: true }, { text: fmt(t.c3.final), align: 'c', bold: true, a: true }]
  ]));

  /* ---- 30 / Part B ---- */
  o.push(B.sp(10));
  o.push(B.p('30.  PART-B : OTHER RELEVANT INFORMATION', { bold: true, size: 11.5 }));
  o.push(B.note('Please give details of any other credential, significant contributions, awards received etc. not mentioned earlier.'));
  o.push(B.table([7, 93], [[{ text: 'S. No.', align: 'c' }, 'Details']],
    ((d.partB || []).length ? d.partB : [{ text: '' }]).map((r, i) => [{ text: String(i + 1), align: 'c' }, r.text]),
    { ansBody: true }));

  o.push(B.sp(8));
  o.push(B.p('LIST OF ENCLOSURES', { bold: true }));
  o.push(B.note('Please attach copies of certificates, sanction orders, papers etc. wherever necessary.'));
  if (encl.length) {
    o.push(B.table([7, 93], [[{ text: 'No.', align: 'c' }, 'Enclosure']],
      encl.map((e, i) => [{ text: String(i + 1), align: 'c' }, e.text]), { ansBody: true }));
  } else {
    o.push(B.table([7, 43, 7, 43], [], [[{ text: '1', align: 'c' }, '', { text: '6', align: 'c' }, ''],
    [{ text: '2', align: 'c' }, '', { text: '7', align: 'c' }, ''],
    [{ text: '3', align: 'c' }, '', { text: '8', align: 'c' }, ''],
    [{ text: '4', align: 'c' }, '', { text: '9', align: 'c' }, ''],
    [{ text: '5', align: 'c' }, '', { text: '10', align: 'c' }, '']]));
  }

  o.push(B.sp(10));
  o.push(B.p('I certify that the information provided is correct as per records available with the college and documents enclosed along with the duly filled PBAS Proforma.'));
  o.push(B.sig(
    ['Place:  ' + dash(d.certify.place, '_____________________'), 'Date:   ' + dash(d.certify.date, '_____________________')],
    ['', '________________________________', 'Signature of the reported-on officer',
      dash(P.fullName), 'Designation: ' + dash(d.certify.designation)]
  ));
  o.push(B.sp(10));
  o.push(B.p('I certify that the information mentioned by the teacher in the self-appraisal (Section-I & II) above is correct and all the relevant records and documents are available and maintained properly in the office of the Principal. It is specifically mentioned that I have personally verified the information recorded at serial numbers 19 (a) to 19 (d) and 20 of Part-II (Section-I), and it is complete and correct as per office record. I am fully satisfied with the reporting of the teacher.'));
  o.push(B.sig(
    ['Place:  ' + dash(d.principalBlock.place, '_____________________'), 'Date:   _____________________'],
    ['', '________________________________', 'Signature (with stamp) of Principal',
      dash(d.principalBlock.college, 'Govt. Degree College ________________'),
      'Name of the Principal: ' + dash(d.principalBlock.name, '____________________')]
  ));
  o.push(B.sp(10));
  o.push(B.p('In case the Principal is not satisfied with the reporting by the teacher in the self-appraisal and is thus not willing to certify as mentioned above, the Principal must record below, in writing, the reasons for not certifying the reported self-appraisal information as mentioned in Part-II (serial numbers 17 to 30).', { italic: true }));
  o.push(B.box('med'));
  o.push(B.sig([''], ['________________________________', 'Signature (with stamp) of Principal',
    'Govt. Degree College ________________', 'Name of the Principal: ____________________']));
  o.push(B.note('N.B. — The Annual Self-Assessment Proforma, duly filled along with all enclosures and submitted for CAS promotions, will be verified by the college and the information filed with the IQAC.'));

  /* ================= PART III onwards — BLANK ================= */
  o.push(B.pb());
  o.push(...partThreeFour(d));
  return o;
}

/* -------- Part-III / Part-IV / instructions : reproduced blank -------- */
function partThreeFour(d) {
  const o = [];
  const P = d.p1;
  const line = (label) => [label, ''];

  o.push(B.parthead('PART-III  (Section-I)', 'ASSESSMENT OF REPORTING OFFICER'));
  o.push(B.note('To be completed by the Reporting Officer. This section is intentionally left blank by the teacher.'));
  o.push(B.p('With reference to the reporting made by the teacher in the self-appraisal (Part-I & II) as well as the record maintained in the college office and the API scores based on the PBAS system. (The Reporting Officer must acquaint himself / herself fully with the UGC Regulations 2010 as adopted by the Government of Himachal Pradesh.)'));
  o.push(B.note('Note — Assessment in this part should not be indicated by tick-marking, but should be clearly expressed in suitable words.'));

  o.push(B.q(31, 'Do you agree with the resume of work as indicated by the officer in Part-II of the report, and in particular regarding the special achievement, if any, mentioned by the officer? If not, indicate briefly the reasons for disagreeing with it and the extent of your disagreement.'));
  o.push(B.box('tall'));

  o.push(B.q(32, 'STAGE OF HEALTH'));
  o.push(B.choices(['(a)  Physical:   (i) Energetic', '        (ii) Major ailment, if any']));
  o.push(B.kv([line('        Remarks')]));
  o.push(B.choices(['(b)  Mental:   (i) Alert', '        (ii) Ailment, if any']));
  o.push(B.kv([line('        Remarks')]));
  o.push(B.choices(['(c)  Emotional balance:', '        (i) Is he/she calm and retains poise?',
    '        (ii) Does he/she get provoked easily?', '        (iii) Is he/she able to tolerate difference of opinion?']));
  o.push(B.kv([line('        Remarks')]));

  o.push(B.q(33, 'INTELLIGENCE AND UNDERSTANDING'));
  o.push(B.choices(['(a)  Exceptional, has clear grasp of any matter',
    '(b)  Intelligent and grasps a point correctly', '(c)  Just good enough']));
  o.push(B.kv([line('        Remarks')]));

  o.push(B.q(34, 'QUALITY OF WORK'));
  o.push(B.p('(i)  Attention to details — accuracy in presentation, thoroughness in analysis', { bold: true }));
  o.push(B.choices(['(a)  Most reliable and comprehensive', '(b)  Considers all relevant details', '(c)  Just good enough']));
  o.push(B.kv([line('        Remarks')]));
  o.push(B.p('(ii)  Ability in discussion and conversation', { bold: true }));
  o.push(B.choices(['(a)  Very effective and convincing', '(b)  Good and puts across his/her points clearly', '(c)  Just good enough']));
  o.push(B.kv([line('        Remarks')]));

  o.push(B.q(35, 'ZEAL, DILIGENCE AND SENSE OF RESPONSIBILITY'));
  o.push(B.choices(['(a)  Shows exceptional zeal and devotion with excellent initiative',
    '(b)  Hard working and conscientious', '(c)  Reasonably diligent with average initiative']));
  o.push(B.kv([line('        Remarks')]));

  o.push(B.q(36, 'ABILITY TO INSPIRE CONFIDENCE AND TO GET THE BEST OUT OF HIS / HER STUDENTS'));
  o.push(B.choices(['(a)  Very good', '(b)  Good', '(c)  Average']));
  o.push(B.kv([line('        Remarks')]));

  o.push(B.q(37, 'PUNCTUALITY, ATTENDANCE AND ABSENCE FROM DUTY'));
  o.push(B.kv([
    line('(a)  Punctuality and attendance'),
    line('(b) (i)  Period of EOL (if any) during the year (with dates)'),
    line('      (ii)  Period of all other leave except casual leave, excluding EOL (with dates)'),
    line('      (iii)  Period of wilful absence (if any) (with dates)')
  ]));

  o.push(B.q(38, 'OTHER OBSERVATIONS'));
  o.push(B.note('This space may be utilised for remarks which complete, corroborate or supplement what has been indicated above. It should not be used for merely repeating in vague terms what has already been stated. Specific points such as special accomplishments during the period under report, and any other aspects not covered in the Proforma above which the Reporting Officer considers worth mentioning, may also be indicated here.'));
  o.push(B.box('tall'));

  o.push(B.q(39, 'INTEGRITY'));
  o.push(B.choices(['(a)  Nothing has come to my knowledge which casts any reflection on his/her integrity. His/her general reputation for honesty is good and I certify his/her integrity.',
    '(b)  His/her reputation is of doubtful nature.', '(c)  He/she has yet to establish his/her reputation.']));
  o.push(B.kv([line('        Remarks')]));
  o.push(B.q(40, 'Does he / she take interest in the use of the Hindi language in official work?'));
  o.push(B.kv([line('        Remarks')]));
  o.push(B.q(41, 'His / her attitude towards the members of the S.C. and S.T. community.'));
  o.push(B.kv([line('        Remarks')]));
  o.push(B.sig([''], ['________________________________', 'Signature of Reporting Officer',
    'Name in block letters: ____________________', 'Designation: ____________________', 'Date: ____________________']));
  o.push(B.note('N.B. — The overall assessment of Part-III: Section-I is to be reported after the assessment of Part-III: Section-II.'));

  /* ---- Part III Section II ---- */
  o.push(B.pb());
  o.push(B.parthead('PART-III  (Section-II : API Score Evaluation)', 'ASSESSMENT OF REPORTING OFFICER'));
  const remarkHead = (agreeText) => [
    [{ text: 'Criteria Sl. No.', rspan: 3, align: 'c' }, { text: 'Criteria Heading', rspan: 3 },
    { text: 'Max. Score', rspan: 3, align: 'c' }, { text: 'API score reported in self-appraisal by the teacher', rspan: 3, align: 'c' },
    { text: 'REMARKS — the Principal will clearly “agree” or “dis-agree” with the API score reported in the self-appraisal by the teacher in Part-II (Section-II), also mentioned in the previous column.', span: 3, align: 'c' }],
    [{ text: 'If agreed', rspan: 2, align: 'c' }, { text: 'If dis-agreed', span: 2, align: 'c' }],
    [{ text: 'Mention reasons', align: 'c' }, { text: 'API score of the teacher as assessed by the Principal after due verification of documentary record', align: 'c' }]
  ];
  const blankCells = 3;
  const rowOf = (a, b, c) => [{ text: a, align: 'c' }, b, { text: c, align: 'c' }, '', '', '', ''];

  o.push(B.p('42.  CATEGORY-I  (of Part-II Section-II, Part-A)', { bold: true }));
  o.push(B.note('If agreed, the Principal must reproduce the score reported by the teacher in the previous column as the self-assessment.'));
  o.push(B.table([8, 32, 8, 12, 12, 14, 14], remarkHead(), [
    rowOf('(i) a', 'Classes taken (max. 50 for 100% performance and proportionate score up to 80% performance, below which no score may be given)', '50'),
    rowOf('(i) b', 'Teaching load in excess of UGC norm (max. score: 10)', '10'),
    rowOf('(ii)', 'Imparting of knowledge / instruction as per curriculum and syllabus enrichment by providing additional resources to students', '20'),
    rowOf('(iii)', 'Use of participatory and innovative teaching-learning methodologies, updating of subject content, course improvement etc.', '20'),
    rowOf('(iv)', 'Examination duties assigned and performed', '25'),
    [{ text: '', align: 'c' }, { text: 'Total Score  (Minimum API score required is 75)', bold: true },
    { text: '125', align: 'c', bold: true }, '', '', '', '']
  ], { tiny: true }));

  o.push(B.p('43.  CATEGORY-II  (of Part-II Section-II, Part-A)', { bold: true }));
  o.push(B.note('If agreed, simply write “agree” — no API score is to be assessed by the Principal.'));
  o.push(B.table([8, 32, 8, 12, 12, 14, 14], remarkHead(), [
    rowOf('(i)', 'Extension, co-curricular and field-based activities', '20'),
    rowOf('(ii)', 'Contribution to corporate life and management of the institution', '15'),
    rowOf('(iii)', 'Professional development activities', '15'),
    [{ text: '', align: 'c' }, { text: 'Total Score (i + ii + iii) — Max. 25  (Minimum API score required is 15)', bold: true },
    { text: '25', align: 'c', bold: true }, '', '', '', '']
  ], { tiny: true }));

  o.push(B.pb());
  o.push(B.p('44.  CATEGORY-III  (of Part-II Section-II, Part-A)', { bold: true }));
  const c3head = [
    [{ text: 'Criteria Sl. No.', rspan: 3, align: 'c' }, { text: 'Criteria head', rspan: 3 },
    { text: 'Criteria head details', rspan: 3 }, { text: 'Max. Score', rspan: 3, align: 'c' },
    { text: 'API score reported in self-appraisal', rspan: 3, align: 'c' },
    { text: 'REMARKS — the Principal will clearly “agree” or “dis-agree” with the API score reported in the self-appraisal by the teacher in Part-II (Section-II).', span: 3, align: 'c' }],
    [{ text: 'Agree (simply write “agree”)', rspan: 2, align: 'c' }, { text: 'Dis-agree', span: 2, align: 'c' }],
    [{ text: 'Mention reasons', align: 'c' }, { text: 'API score assessed by the Principal after due verification', align: 'c' }]
  ];
  const r3 = (a, b, c, m) => [{ text: a, align: 'c' }, b, c, { text: m, align: 'c' }, '', '', '', ''];
  o.push(B.table([7, 14, 27, 10, 10, 8, 12, 12], c3head, [
    r3('A', 'Research papers published in', 'Refereed journals (*)', '15 / publication'),
    r3('A', 'Research papers published in', 'Non-refereed but recognised and reputed journals and periodicals having ISBN / ISSN numbers', '10 / publication'),
    r3('B (i)', 'Articles / chapters published in books', 'Chapters contributed to edited knowledge-based volumes published by international publishers', '10 / chapter'),
    r3('B (i)', 'Articles / chapters published in books', 'Chapters in knowledge-based volumes by Indian / national-level publishers with ISBN / ISSN numbers and with numbers of national and international directories', '5 / chapter'),
    r3('B (ii)', 'Full papers in conference proceedings', 'Conference proceedings as full papers (abstracts not to be included)', '10 / publication'),
    r3('B (iii)', 'Books published as single / co-author or as editor', 'Text or reference books published by international publishers with an established peer-review system', '50 / sole author; 10 / chapter in an edited book'),
    r3('B (iii)', 'Books published as single / co-author or as editor', 'Subject books by national-level publishers / State and Central Government publications with ISBN / ISSN numbers', '25 / sole author; 5 / chapter in edited books'),
    r3('B (iii)', 'Books published as single / co-author or as editor', 'Subject books by other local publishers with ISBN / ISSN numbers', '15 / sole author; 3 / chapter in edited books')
  ], { tiny: true }));
  o.push(B.pb());
  o.push(B.p('44.  CATEGORY-III  (continued)', { bold: true }));
  o.push(B.table([7, 14, 27, 10, 10, 8, 12, 12], c3head, [
    r3('C (i)', 'Sponsored projects carried out / ongoing', 'Major projects — amount mobilised with grants above Rs. 30 lakh for science and above Rs. 5 lakh for arts / humanities / social sciences', '20 / each project'),
    r3('C (i)', 'Sponsored projects carried out / ongoing', 'Major projects — amount mobilised with grants above Rs. 5 lakh up to Rs. 30 lakh for science and Rs. 3 lakh up to Rs. 5 lakh for arts / humanities', '15 / each project'),
    r3('C (i)', 'Sponsored projects carried out / ongoing', 'Minor projects — amount mobilised with grants above Rs. 50,000 up to Rs. 5 lakh for science and Rs. 25,000 up to Rs. 3 lakh for arts / humanities / social sciences', '10 / each project'),
    r3('C (ii)', 'Consultancy projects carried out / ongoing', 'Amount mobilised with a minimum of Rs. 10 lakh for science and Rs. 2 lakh for arts / humanities / social sciences', '10 / every Rs. 10 lakh and Rs. 2 lakh respectively'),
    r3('C (iii)', 'Completed projects — quality evaluation', 'Completed project report (acceptance from funding agency)', '20 / each major project; 10 / each minor project'),
    r3('C (iv)', 'Projects outcome / outputs', 'Patent / technology transfer / product / process', '30 / each national-level output or patent; 50 / each for international level'),
    r3('D (i)', 'Research guidance — M.Phil.', 'Degree awarded only', '3 / each candidate'),
    r3('D (ii)', 'Research guidance — Ph.D.', 'Degree awarded', '10 / each candidate'),
    r3('D (ii)', 'Research guidance — Ph.D.', 'Thesis submitted', '7 / each candidate')
  ], { tiny: true }));
  o.push(B.pb());
  o.push(B.p('44.  CATEGORY-III  (continued)', { bold: true }));
  o.push(B.table([7, 14, 27, 10, 10, 8, 12, 12], c3head, [
    r3('E (i)', 'Training courses and conference / seminar / workshop papers — refresher courses, methodology workshops, training, teaching-learning-evaluation technology programmes, soft-skills development programmes, Faculty Development Programmes (max. 30 points)', '(a) Not less than two weeks', '20 / each'),
    r3('E (i)', 'Training courses and conference / seminar / workshop papers (max. 30 points)', '(b) One week duration', '10 / each'),
    r3('E (ii)', 'Papers in conferences / seminars / workshops etc. (**) — participation and presentation of research papers (oral / poster)', '(a) International conference', '10 / each'),
    r3('E (ii)', 'Papers in conferences / seminars / workshops etc. (**)', '(b) National level', '7.5 / each'),
    r3('E (ii)', 'Papers in conferences / seminars / workshops etc. (**)', '(c) Regional / State level', '5 / each'),
    r3('E (ii)', 'Papers in conferences / seminars / workshops etc. (**)', '(d) Local — University / College level', '3 / each'),
    r3('E (iii)', 'Invited lectures or presentations for conferences / symposia', 'International', '10 / each'),
    r3('E (iii)', 'Invited lectures or presentations for conferences / symposia', 'National level', '5 / each'),
    [{ text: '', align: 'c' }, { text: 'Total', span: 3, bold: true, align: 'r' }, '', '', '', '']
  ], { tiny: true }));

  o.push(B.p('45.  SUMMARY OF API SCORES BY PRINCIPAL', { bold: true }));
  o.push(B.table([6, 46, 14, 17, 17],
    [[{ text: '', align: 'c' }, 'Criteria', 'Last Academic Year',
      'Total API score for assessment period reported in self-appraisal',
      'Total API score reported by Principal (total of agreed score + total score assessed by Principal after disagreeing)']], [
    [{ text: 'I', align: 'c', bold: true }, 'Teaching, Learning and Evaluation related activities.\nTotal Max. Score = 125 ; Min. Score required = 75', '', '', ''],
    [{ text: 'II', align: 'c', bold: true }, 'Co-curricular, Extension, Professional development etc.\nTotal Max. Score = 25 ; Min. Score required = 15', '', '', ''],
    [{ text: '', align: 'c' }, { text: 'Total  I + II\nMin. total annual score under Categories I & II = 100', bold: true }, '', '', ''],
    [{ text: 'III', align: 'c', bold: true }, 'Research and Academic Contribution.\nFor stage 1→2: min. 5/year; 2→3: min. 10/year; 3→4: min. 15/year; 4→5: min. 20/year (AGP Rs. 6000, 7000, 8000, 9000 & 10000 respectively).', '', '', '']
  ], { tiny: true }));
  o.push(B.note('N.B. — The minimum API score required from this category is different for different levels of promotion and between university and colleges. The self-assessment score is based on verifiable criteria and will be finalised by the screening / selection committee.'));

  o.push(B.pb());
  o.push(B.p('46.  OVERALL ASSESSMENT OF PART-III', { bold: true, size: 11.5 }));
  o.push(B.kv([
    ['Name of Employee / Teacher', ''],
    ['Designation', ''],
    ['Subject for which approved', ''],
    ['Employee Code', '']
  ]));
  o.push(B.p('The remarks are made on the basis of the self-appraisal reported by the teacher in Part-II and the subsequent assessment recorded by me in Part-III: Section-II of this ACR. I especially certify that I am fully aware of the reporting made by the teacher in the self-appraisal as well as the certifications made by me in Part-B (of Part-II: Section-II) of this ACR, and have genuinely assessed it with full attention to every aspect that has been reported.'));
  o.push(B.kv([['In my assessment the overall grading of the teacher is', '']]));
  o.push(B.note('(Below Average / Average / Good / Very Good / Excellent)'));
  o.push(B.sig([''], ['________________________________', 'Signature of Reporting Officer',
    'Name in block letters: ____________________', 'Designation: ____________________', 'Date: ____________________']));

  /* ---- Part IV Section I ---- */
  o.push(B.pb());
  o.push(B.parthead('PART-IV  (Section-I)', 'REVIEWING REMARKS OF THE SCREENING-CUM-EVALUATION COMMITTEE'));
  o.push(B.p('47.  On the API score of the teacher, after screening and evaluation of the self-appraisal (under Part-II Sec.-I & Sec.-II) as well as the assessment of the Principal (under Part-III Sec.-I & Sec.-II).'));
  o.push(B.p('FINAL SUMMARY OF API SCORE AFTER SCREENING AND EVALUATION', { bold: true }));
  o.push(B.table([6, 40, 12, 14, 14, 14],
    [[{ text: '', align: 'c' }, 'Criteria', 'Last Academic Year',
      'Total API score for assessment period reported in self-appraisal',
      'Total API score reported by the Principal',
      'Total API score for assessment period by Screening-cum-Evaluation Committee']], [
    [{ text: 'I', align: 'c', bold: true }, 'Teaching, Learning and Evaluation related activities.\nTotal Max. Score = 125 ; Min. Score required = 75', '', '', '', ''],
    [{ text: 'II', align: 'c', bold: true }, 'Co-curricular, Extension, Professional development etc.\nTotal Max. Score = 25 ; Min. Score required = 15', '', '', '', ''],
    [{ text: '', align: 'c' }, { text: 'Total  I + II\nMin. total annual score under Categories I & II = 100', bold: true }, '', '', '', ''],
    [{ text: 'III', align: 'c', bold: true }, 'Research and Academic Contribution.\nFor stage 1→2: min. 5/year; 2→3: min. 10/year; 3→4: min. 15/year; 4→5: min. 20/year (AGP Rs. 6000, 7000, 8000, 9000 & 10000 respectively).', '', '', '', '']
  ], { tiny: true }));
  o.push(B.note('Any performance of the teacher with an API score which is more than what is mentioned in Note 3 above but less than what is mentioned in Note 2 above shall be considered as performance of more than 60%. Any performance with an API score less than what is mentioned in Note 3 above shall be considered as performance of less than 60%.'));
  o.push(B.p('Report of the Screening-cum-Evaluation Committee', { bold: true }));
  o.push(B.table([58, 42], [], [
    ['1)  The API score of the teacher in Categories I, II & III …………………', { text: 'QUALIFIES  /  FAILS TO QUALIFY\nthe minimum standard of UGC Regulations 2010', align: 'c' }],
    ['2)  The Committee ……………………………………… with the self-assessment report (in Part-II Sec.-II) by the teacher.\n(If “do not agree”, reasons may be recorded below.)', { text: 'AGREE  /  PARTIALLY AGREE  /  DO NOT AGREE', align: 'c' }],
    ['3)  The assessment (in Part-III Sec.-II) by the Principal has been considered and the Committee ………………………………', { text: 'AGREE  /  PARTIALLY AGREE  /  DO NOT AGREE', align: 'c' }]
  ]));
  o.push(B.p('Reasons / remarks, if any:', { bold: true }));
  o.push(B.box('tall'));
  o.push(B.sig([''], ['________________________________', 'Members of the Screening-cum-Evaluation Committee',
    '1.  ____________________', '2.  ____________________', '3.  ____________________', 'Date: ____________________']));

  /* ---- Part IV Section II ---- */
  o.push(B.pb());
  o.push(B.parthead('PART-IV  (Section-II)', 'REMARKS OF THE REVIEWING OFFICER'));
  o.push(B.kv([['48.  Length of service under the Reviewing Officer', '']]));
  o.push(B.q(49, 'Do you agree with the Reporting Officer in regard to his / her remarks in the resume of the work done by the officer as contained in Part-II of the report? If not, indicate briefly the reasons for disagreeing with the Reporting Officer and the extent of your disagreement.'));
  o.push(B.box('tall'));
  o.push(B.q(50, 'OVERALL PERFORMANCE AND QUALITIES'));
  o.push(B.note('(Excellent / Very Good / Good / Average / Below Average)'));
  o.push(B.kv([
    ['        Overall grading', ''],
    ['        On the basis of — (i) Performance on the basis of Part-II (Sec.-I) and Part-III (Sec.-I)', ''],
    ['        (ii) Performance on the PBAS system (with API score) as per the review report of the screening-cum-evaluation committee', '']
  ]));
  o.push(B.q(51, 'Has the officer special characteristics and / or any outstanding merits or abilities which would justify his / her advancement and special selection for higher appointment out of turn? If so, mention these characteristics briefly.'));
  o.push(B.box('tall'));
  o.push(B.sig([''], ['________________________________', 'Signature of Reviewing Officer',
    'Name in block letters: ____________________', 'Designation: ____________________', 'Date: ____________________']));
  o.push(B.sp(12));
  o.push(B.p('52.  Countersignature by the next higher officer, with remarks if any.', { bold: true }));
  o.push(B.box('med'));
  o.push(B.sig([''], ['________________________________', 'Signature of Countersigning Officer',
    'Name in block letters: ____________________', 'Designation: ____________________', 'Date: ____________________']));

  /* ---- Instructions annexe ---- */
  o.push(B.pb());
  o.push(B.parthead('INSTRUCTIONS FOR FILLING UP PART-B OF THE PBAS PROFORMA'));
  o.push(B.p('Part-B of the Proforma is based on Appendix-III, Table-1 of the UGC Regulations 2010. It is to be filled out for the recently completed academic year. The Proforma is to be filled as per these tables and self-assessment scores given. For each category, the maximum score that can be given or carried forward is indicated in the table.'));
  o.push(B.p('The self-assessment scores are further to be based on the indicators / activities given below. Universities may modify the detailed indicators and related scores based on their experience and requirement, without changing the score requirements assigned to categories and sub-categories in Appendix-III, Table-I.'));
  o.push(B.note('N.B. — The self-assessment scores are subject to verification by the College and by the Screening-cum-Verification Committee or Selection Committee, as the case may be.'));

  o.push(B.p('1.  Teaching and evaluation related performances', { bold: true }));
  o.push(B.table([85, 15], [], [
    ['(i) a — Lectures / practicals / tutorials / contact classes taken should be based on verifiable records. No score should be assigned if a teacher has taken less than (say) 80% of assigned teaching. Universities may give allowance for periods of leave where alternatives were arranged. Maximum score if there is 100% achievement.', { text: 'Max. Score: 50', align: 'c' }],
    ['(i) b — If a teacher has taken classes exceeding the UGC norm, then two points are to be assigned for each extra hour of classes.', { text: 'Max. Score: 10', align: 'c' }],
    ['(ii) — Imparting of knowledge / instruction vis-à-vis the prescribed material (textbook / manual etc.) and methodology of the curriculum (100% compliance = 20 points).', { text: 'Max. Score: 20', align: 'c' }]
  ], { tiny: true }));
  o.push(B.p('(iii)  Use of participatory and innovative teaching-learning methodologies, updating of subject content, course improvement etc.', { bold: true }));
  o.push(B.table([85, 15], [['Indicators / Activities', { text: 'Maximum Score', align: 'c' }]], [
    ['Updating of courses, design of curriculum (5 — single course)', { text: '10', align: 'c' }],
    ['Preparation of resource material, fresh reading materials, laboratory manuals etc.', { text: '10', align: 'c' }],
    ['Use of innovative teaching-learning methodologies; use of ICT; updated subject content and course improvement. (a) ICT-based teaching material: 10 points each. (b) Interactive course: 5 points each. (c) Participatory learning modules: 5 points each.', { text: '10', align: 'c' }],
    ['Developing and imparting remedial / bridge courses and counselling modules (each activity: 5 points)', { text: '10', align: 'c' }],
    ['Developing and imparting soft skills / communication skills / personality development courses / modules (each activity: 5 points)', { text: '10', align: 'c' }],
    ['Developing and imparting specialised teaching-learning programmes in physical education, library; innovative compositions and creations in music, performing and visual arts and other traditional areas (each activity: 5 points)', { text: '10', align: 'c' }],
    ['Organising and conducting popularisation programmes / training courses in computer-assisted teaching / web-based learning and e-library skills for students. Workshop / training course: 10 points each; popularisation programme: 5 points each.', { text: '10', align: 'c' }],
    [{ text: 'Maximum Aggregate Limit', bold: true }, { text: '20', align: 'c', bold: true }]
  ], { tiny: true, totLast: true }));
  o.push(B.p('(iv)  Examination related work', { bold: true }));
  o.push(B.table([85, 15], [['Indicators', { text: 'Maximum Score', align: 'c' }]], [
    ['College / University end-semester / annual examination work as per duties allotted (invigilation 10 points, evaluation of answer scripts 5 points, question paper setting 5 points). 100% compliance = 20 points.', { text: '20', align: 'c' }],
    ['College / University examination / evaluation responsibilities for internal / continuous assessment work as allotted (100% compliance = 10 points)', { text: '10', align: 'c' }],
    ['Examination work such as coordination, or flying squad etc. (maximum of 5 or 10 depending upon intensity of duty; 100% compliance = 10 points)', { text: '10', align: 'c' }],
    [{ text: 'Maximum Aggregate Limit B (iv)', bold: true }, { text: '25', align: 'c', bold: true }]
  ], { tiny: true, totLast: true }));

  o.push(B.p('II.  Co-curricular, extension and profession-related activities and participation in the corporate life of the institution', { bold: true }));
  o.push(B.p('(i)  Extension and co-curricular related activities', { bold: true }));
  o.push(B.table([85, 15], [], [
    ['Institutional co-curricular activities for students such as field studies / educational tours, industry-implant training and placement activity (5 points each)', { text: '10', align: 'c' }],
    ['Positions held / leadership role played in organisations linked with extension work and the National Service Scheme (NSS), NCC or any other similar activity (each activity 10 points)', { text: '10', align: 'c' }],
    ['Students and staff related socio-cultural and sports programmes, campus publications (departmental level 2 points, institutional level 5 points)', { text: '10', align: 'c' }],
    ['Community work such as values of national integration, secularism, democracy, socialism, humanism, peace, scientific temper; flood or drought relief, small family norms etc. (5 points each)', { text: '10', align: 'c' }],
    [{ text: 'Maximum Aggregate Limit', bold: true }, { text: '20', align: 'c', bold: true }]
  ], { tiny: true, totLast: true }));
  o.push(B.p('(ii)  Contribution to corporate life and management of the institution', { bold: true }));
  o.push(B.table([85, 15], [], [
    ['Contribution to corporate life in universities / colleges through meetings, popular lectures, subject-related events, articles in the college magazine and university volumes (2 points each)', { text: '10', align: 'c' }],
    ['Institutional governance responsibilities such as Vice Principal, Warden, Bursar, IQAC coordinator (10 points each)', { text: '10', align: 'c' }],
    ['Participation in committees concerned with any aspect of departmental or institutional management such as admission committee, campus development, library committee (5 points each)', { text: '10', align: 'c' }],
    ['Responsibility for, or participation in, committees for students’ welfare, counselling and discipline (5 points each)', { text: '10', align: 'c' }],
    ['Organisation of conference / training: International (10 points); National / regional (5 points)', { text: '10', align: 'c' }],
    [{ text: 'Maximum Aggregate Limit', bold: true }, { text: '15', align: 'c', bold: true }]
  ], { tiny: true, totLast: true }));
  o.push(B.p('(iii)  Professional development related activities', { bold: true }));
  o.push(B.table([85, 15], [['Indicators / Activities', { text: 'Maximum Score', align: 'c' }]], [
    ['Membership in profession-related committees at state and national level. At national level: 3 points each; at state level: 2 points each.', { text: '10', align: 'c' }],
    ['Participation in subject associations, conferences, seminars without paper presentation (each activity: 2 points)', { text: '10', align: 'c' }],
    ['Participation in short-term training courses of less than one week duration in educational technology, curriculum development, professional development, examination reforms, institutional governance (each activity: 5 points)', { text: '10', align: 'c' }],
    ['Membership / participation in bodies / committees on education and national development (5 points each)', { text: '10', align: 'c' }],
    ['Publication of articles in newspapers, magazines or other publications (not covered in Category III); radio talks etc. (1 point each)', { text: '10', align: 'c' }],
    [{ text: 'Maximum Aggregate Limit', bold: true }, { text: '15', align: 'c', bold: true }]
  ], { tiny: true, totLast: true }));
  o.push(B.p('CATEGORY-III.  Research, publications and academic contributions', { bold: true }));
  o.push(B.p('This is to be filled as per Appendix-III, Table-1, Category-III of the UGC Regulations 2010 as adopted by the Government of Himachal Pradesh. Wherever the research contribution is jointly made, the API scores should be shared between the contributors as per the formula provided in Table-1.'));
  o.push(B.p('* * * * * * * * * * * * * *', { align: 'c' }));
  return o;
}
