/* ===================== DATA MODEL ===================== */
const SCHEMA_VERSION = 5;
const uid = () => 'acr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const nowISO = () => new Date().toISOString();

function blankDoc(session) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    touched: false,          // set once the user actually edits; pristine copies lose a merge
    rev: 0,                  // monotonic per-document edit counter, used by drivesync.js conflict detection
    session: session || '',
    stream: 'science',                       // science | arts  (decides project/consultancy slabs)
    style: { answerColor: '#1a3a8f', answerBold: false },   // how filled-in answers are printed
    college: { name: '', district: '', pin: '', principal: '', place: '' },
    p1: {
      fullName: '', fatherHusband: '', empCode: '', subject: '', dateAppointment: '',
      designation: '', payBand: '', promotion: '', qualAcademic: '', qualDivision: '',
      qualProfessional: '', qualResearch: '', dob: '', dobWords: '', status: '',
      served: [], deptExamRoll: '', deptExamSession: '', hindi: '', otherAssignment: '',
      permAddress: '', landline: '', mobile: '', email: ''
    },
    s1: {
      q17: '', q18: '',
      q19a: [], q19aTotal: '', q19aNote: '', q19b: '',
      q19c: [], q19d: [], q19f: [], q19g: '',
      q20: [],
      q21i: '', q21ii: [],
      q22: '', q22rows: [],
      q23: '', q24: '', q24b: '', q25: ''
    },
    s2: {
      c1: {
        rows: [], scoreA: '', scoreB: '',
        ii: { rows: [], note: '', score: '' },
        iii: { rows: [] },
        iv: { rows: [] }
      },
      c2: { i: [], ii: [], iii: [] },
      c3: { A: [], Bi: [], Bii: [], Biii: [], Ci: [], Cii: [], Ciii: [], Civ: [], D: [], Ei: [], Eii: [], Eiii: [] },
      lastYear: { c1: '', c2: '', c3: '' },
      override: { c1: '', c2: '', c3: '' }
    },
    partB: [],
    enclosures: [],
    certify: { place: '', date: '', designation: '' },
    principalBlock: { name: '', college: '', place: '' }
  };
}

/* Fields carried forward when cloning a year (stable identity data). */
function cloneForNewYear(src, session) {
  const d = blankDoc(session);
  d.stream = src.stream;
  d.style = JSON.parse(JSON.stringify(src.style || d.style));
  d.college = JSON.parse(JSON.stringify(src.college));
  d.p1 = JSON.parse(JSON.stringify(src.p1));
  d.certify = { place: src.certify.place || '', date: '', designation: src.certify.designation || '' };
  d.principalBlock = JSON.parse(JSON.stringify(src.principalBlock));
  // carry last year's totals into the "Last Academic Year" column of the summary
  const t = totals(src);
  d.s2.lastYear = { c1: fmt(t.c1.total), c2: fmt(t.c2.total), c3: fmt(t.c3.total) };
  return d;
}

/* A personal seed document used to live here (a real, filled-in 2024-25 ACR used as the
   default starting point for a single-teacher deployment). It has been removed from this
   shared source file so the public, distributable build never ships anyone's real ACR
   content or personal data. A brand-new install now always starts from blankDoc() — see
   boot() in app.js. The developer's own starting data lives only in the gitignored
   tools/personal-seed.acrbak.json and can be restored, if wanted, with the existing
   Import a backup button; no code path in this file depends on it. */

/* ===================== SCORING ===================== */
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const fmt = (n) => (Math.round(n * 100) / 100).toString();
const cap = (n, m) => Math.min(n, m);
const sumRows = (rows, key) => (rows || []).reduce((a, r) => a + num(r[key]), 0);

/* joint-authorship allocation per UGC 2010 Table-I note */
function share(base, row) {
  const authors = Math.max(1, num(row.authors) || 1);
  if (authors <= 1) return base;
  return row.main === 'yes' ? base * 0.6 : (base * 0.4) / (authors - 1);
}

const C3RULES = {
  A: (r) => share(r.kind === 'refereed' ? 15 : 10, r),
  Bi: (r) => share(r.kind === 'international' ? 10 : 5, r),
  Bii: (r) => share(10, r),
  Biii: (r) => {
    const base = { intl_sole: 50, intl_chapter: 10, natl_sole: 25, natl_chapter: 5, local_sole: 15, local_chapter: 3 }[r.kind] || 0;
    return share(base, r);
  },
  Ci: (r, stream) => {
    const a = num(r.amount);
    if (stream === 'arts') return a > 5 ? 20 : a > 3 ? 15 : a >= 0.25 ? 10 : 0;
    return a > 30 ? 20 : a > 5 ? 15 : a >= 0.5 ? 10 : 0;
  },
  Cii: (r, stream) => {
    const per = stream === 'arts' ? 2 : 10;
    return Math.floor(num(r.amount) / per) * 10;
  },
  Ciii: (r) => (r.kind === 'major' ? 20 : 10),
  Civ: (r) => (r.kind === 'international' ? 50 : 30),
  D: (r) => ({ mphil_awarded: 3, phd_awarded: 10, phd_submitted: 7 }[r.kind] || 0) * Math.max(1, num(r.count) || 1),
  Ei: (r) => (r.weeks === 'two' ? 20 : 10),
  Eii: (r) => ({ international: 10, national: 7.5, state: 5, local: 3 }[r.level] || 0),
  Eiii: (r) => (r.level === 'international' ? 10 : 5)
};

function suggested(block, row, stream) {
  const f = C3RULES[block];
  return f ? Math.round(f(row, stream) * 100) / 100 : 0;
}

function totals(d) {
  const c1 = d.s2.c1;
  // (i)(a) proportionate rule: no score below 80% of assigned classes
  const pcts = (c1.rows || []).map((r) => num(r.pct)).filter((n) => n > 0);
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
  const autoA = avg >= 100 ? 50 : avg >= 80 ? Math.round(50 * (avg / 100) * 100) / 100 : 0;
  const a = c1.scoreA === '' ? autoA : cap(num(c1.scoreA), 50);
  const b = cap(num(c1.scoreB), 10);
  const ii = cap(num(c1.ii.score), 20);
  const iiiRaw = sumRows(c1.iii.rows, 'score'), iii = cap(iiiRaw, 20);
  const ivRaw = sumRows(c1.iv.rows, 'score'), iv = cap(ivRaw, 25);
  const c1total = cap(a + b + ii + iii + iv, 125);

  const c2 = d.s2.c2;
  const p1Raw = sumRows(c2.i, 'score'), p1 = cap(p1Raw, 20);
  const p2Raw = sumRows(c2.ii, 'score'), p2 = cap(p2Raw, 15);
  const p3Raw = sumRows(c2.iii, 'score'), p3 = cap(p3Raw, 15);
  const c2total = cap(p1 + p2 + p3, 25);

  const c3 = d.s2.c3;
  const bs = {};
  Object.keys(c3).forEach((k) => { bs[k] = sumRows(c3[k], 'score'); });
  const training = cap(bs.Ei, 30);                       // E(i) capped at 30
  const c3total = bs.A + bs.Bi + bs.Bii + bs.Biii + bs.Ci + bs.Cii + bs.Ciii + bs.Civ + bs.D + training + bs.Eii + bs.Eiii;

  const ov = d.s2.override || {};
  const fin = (k, v) => (ov[k] !== undefined && ov[k] !== '' ? num(ov[k]) : v);

  return {
    c1: { a, autoA, avg, b, ii, iii, iiiRaw, iv, ivRaw, total: c1total, final: fin('c1', c1total) },
    c2: { i: p1, iRaw: p1Raw, ii: p2, iiRaw: p2Raw, iii: p3, iiiRaw: p3Raw, raw: p1 + p2 + p3, total: c2total, final: fin('c2', c2total) },
    c3: { blocks: bs, training, total: c3total, final: fin('c3', c3total) }
  };
}
