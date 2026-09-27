// Tally of teacher-entered API scores (points 26-28) into points 29, 42, 43 and 44.
// api_tally.py is a line-for-line mirror; both are checked against tests/fixtures/cases.json.
// Scores are handled in whole hundredths so decimal sums are exact.

export const ROW_CHOICES = {
  journals: ['A1', 'A2'],
  chapters: ['B1a', 'B1b'],
  proceedings: ['B2'],
  books: ['B3a', 'B3b', 'B3c'],
  ongoing: ['C1a', 'C1b', 'C1c', 'C2'],
  completed: ['C3', 'C4'],
  training: ['E1a', 'E1b'],
  papers: ['E2a', 'E2b', 'E2c', 'E2d'],
  lectures: ['E3a', 'E3b'],
};

export const C3_WHERE = {
  journals: '28 A', chapters: '28 B(i)', proceedings: '28 B(ii)', books: '28 B(iii)',
  ongoing: '28 C(i & ii)', completed: '28 C(iii & iv)', training: '28 E(i)', papers: '28 E(ii)', lectures: '28 E(iii)',
};

export const P44_ORDER = ['A1', 'A2', 'B1a', 'B1b', 'B2', 'B3a', 'B3b', 'B3c', 'C1a', 'C1b', 'C1c', 'C2', 'C3', 'C4',
  'D1', 'D2a', 'D2b', 'E1a', 'E1b', 'E2a', 'E2b', 'E2c', 'E2d', 'E3a', 'E3b'];

// Labels copied from point 44 of UGC_ACR_Form.pdf (PDF pages 18-22). Rates are a guide only.
export const ROW_LABELS = {
  A1: 'Refereed journals (15 / publication)',
  A2: 'Non-refereed but recognised journals with ISBN / ISSN (10 / publication)',
  B1a: 'Chapters in books by international publishers (10 / chapter)',
  B1b: 'Chapters in books by Indian / national publishers (5 / chapter)',
  B2: 'Full papers in conference proceedings (10 / publication)',
  B3a: 'Books by international publishers, peer reviewed (50 sole author, 10 per chapter)',
  B3b: 'Books by national / State & Central Govt. publishers (25 sole author, 5 per chapter)',
  B3c: 'Books by other local publishers (15 sole author, 3 per chapter)',
  C1a: 'Major project: above Rs 30 lakh science / Rs 5 lakh arts (20 each)',
  C1b: 'Major project: Rs 5-30 lakh science / Rs 3-5 lakh arts (15 each)',
  C1c: 'Minor project: Rs 50,000-5 lakh science / Rs 25,000-3 lakh arts (10 each)',
  C2: 'Consultancy (10 per Rs 10 lakh science / Rs 2 lakh arts)',
  C3: 'Completed project, report accepted (20 major, 10 minor)',
  C4: 'Project outcome: patent / technology transfer / product (30 national, 50 international)',
  D1: 'M.Phil degree awarded (3 / candidate)',
  D2a: 'Ph.D degree awarded (10 / candidate)',
  D2b: 'Ph.D thesis submitted (7 / candidate)',
  E1a: '(a) Not less than two weeks (20 each)',
  E1b: '(b) One week duration (10 each)',
  E2a: '(a) International conference (10 each)',
  E2b: '(b) National (7.5 each)',
  E2c: '(c) Regional / State level (5 each)',
  E2d: '(d) Local - University / College level (3 each)',
  E3a: 'International (10 each)',
  E3b: 'National level (5 each)',
};

const LEGACY_KEYS = ['apiC1Classes', 'apiC1Excess', 'apiC1Resources', 'apiC1Innovative', 'apiC1Exam',
  'apiC2Extension', 'apiC2Management', 'apiC2Professional', 'apiC3'];

export function emptyApi() {
  return {
    c1: { classes: '', excess: '', resourcesScore: '', resources: [], innovative: [], exam: [] },
    c2: { extension: [], management: [], professional: [] },
    c3: {
      journals: [], chapters: [], proceedings: [], books: [], ongoing: [], completed: [],
      guidance: { mphilEnrolled: '', mphilSubmitted: '', mphilAwarded: '', mphilScore: '',
        phdEnrolled: '', phdSubmitted: '', phdAwarded: '', phdAwardedScore: '', phdSubmittedScore: '' },
      training: [], papers: [], lectures: [],
    },
  };
}

// Returns a complete api object plus any values found in the old flat fields.
export function normalizeApi(raw) {
  const api = emptyApi();
  const src = raw && typeof raw === 'object' ? raw : {};
  const legacy = [];
  for (const [k, v] of Object.entries(src)) {
    if (LEGACY_KEYS.includes(k)) {
      if (v !== '' && v !== null && v !== undefined && Number(v) !== 0) legacy.push([k, v]);
    } else if (k !== 'c1' && k !== 'c2' && k !== 'c3') {
      api[k] = v;
    }
  }
  for (const g of ['c1', 'c2', 'c3']) {
    const s = src[g];
    if (!s || typeof s !== 'object') continue;
    for (const k of Object.keys(api[g])) {
      const def = api[g][k];
      if (Array.isArray(def)) {
        if (Array.isArray(s[k])) api[g][k] = s[k].map(e => (e && typeof e === 'object' ? { ...e } : {}));
      } else if (def && typeof def === 'object') {
        if (s[k] && typeof s[k] === 'object') api[g][k] = { ...def, ...s[k] };
      } else if (s[k] !== undefined && s[k] !== null) {
        api[g][k] = s[k];
      }
    }
  }
  return { api, legacy };
}

const SCORE_RE = /^[0-9]+(\.[0-9]{1,2})?$/;

export function toCents(v) {
  if (v === undefined || v === null) return { state: 'missing' };
  let s;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { state: 'bad' };
    s = String(v);
  } else if (typeof v === 'string') {
    s = v.trim();
  } else {
    return { state: 'bad' };
  }
  if (s === '') return { state: 'missing' };
  if (!SCORE_RE.test(s)) return { state: 'bad' };
  const [whole, frac = ''] = s.split('.');
  return { state: 'ok', cents: Number(whole) * 100 + Number((frac + '00').slice(0, 2)) };
}

export function fmt(cents) {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  if (frac === 0) return String(whole);
  if (frac % 10 === 0) return `${whole}.${frac / 10}`;
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

export function isEmptyEntry(e) {
  if (!e || typeof e !== 'object') return true;
  return Object.values(e).every(v => v === undefined || v === null || (typeof v === 'string' && v.trim() === ''));
}

export function tally(rawApi) {
  const { api } = normalizeApi(rawApi);
  const { c1, c2, c3 } = api;
  const problems = [];
  const add = (code, where, message) => problems.push({ code, where, message });
  const bad = where => add('BAD_SCORE', where, `${where}: score must be a number (0 or more) with at most 2 decimals.`);

  const single = (v, where) => {
    const r = toCents(v);
    if (r.state === 'bad') { bad(where); return null; }
    return r.state === 'ok' ? r.cents : null;
  };
  const listSum = (entries, where) => {
    let total = 0;
    entries.forEach((e, idx) => {
      if (isEmptyEntry(e)) return;
      const w = `${where}, entry ${idx + 1}`;
      const r = toCents(e.score);
      if (r.state === 'missing') { add('NO_SCORE', w, `${w}: score is missing.`); return; }
      if (r.state === 'bad') { bad(w); return; }
      total += r.cents;
    });
    return total;
  };

  const a = single(c1.classes, '26(i)(a)');
  const b = single(c1.excess, '26(i)(b)');
  const ii = single(c1.resourcesScore, '26(ii)');
  const iii = listSum(c1.innovative, '26(iii)');
  const iv = listSum(c1.exam, '26(iv)');
  const e1 = listSum(c2.extension, '27(i)');
  const e2 = listSum(c2.management, '27(ii)');
  const e3 = listSum(c2.professional, '27(iii)');

  const p44 = {};
  const fed = {};
  for (const k of P44_ORDER) { p44[k] = 0; fed[k] = false; }
  for (const [name, choices] of Object.entries(ROW_CHOICES)) {
    const where = C3_WHERE[name];
    c3[name].forEach((e, idx) => {
      if (isEmptyEntry(e)) return;
      const w = `${where}, entry ${idx + 1}`;
      let row = null;
      if (choices.length === 1) {
        row = choices[0];
      } else {
        const r = typeof e.row === 'string' ? e.row.trim() : '';
        if (r === '') add('NO_ROW', w, `${w}: choose the point-44 row.`);
        else if (!choices.includes(r)) add('BAD_ROW', w, `${w}: "${r}" is not a valid point-44 row for this table.`);
        else row = r;
      }
      const s = toCents(e.score);
      if (s.state === 'missing') { add('NO_SCORE', w, `${w}: score is missing.`); return; }
      if (s.state === 'bad') { bad(w); return; }
      if (row === null) return;
      p44[row] += s.cents;
      fed[row] = true;
    });
  }
  const g = c3.guidance;
  const d1 = single(g.mphilScore, '28 D M.Phil score');
  const d2a = single(g.phdAwardedScore, '28 D Ph.D awarded score');
  const d2b = single(g.phdSubmittedScore, '28 D Ph.D thesis submitted score');
  for (const [key, c] of [['D1', d1], ['D2a', d2a], ['D2b', d2b]]) {
    if (c !== null) { p44[key] += c; fed[key] = true; }
  }

  const cat1 = (a ?? 0) + (b ?? 0) + (ii ?? 0) + iii + iv;
  const raw2 = e1 + e2 + e3;
  const cat2 = Math.min(raw2, 2500);
  let cat3 = 0;
  for (const k of P44_ORDER) cat3 += p44[k];
  const e1Total = p44.E1a + p44.E1b;

  const over = (c, maxC, where) => {
    if (c !== null && c > maxC) add('OVER_MAX', where, `${where} is ${fmt(c)}; the form's maximum is ${fmt(maxC)}.`);
  };
  over(a, 5000, '26(i)(a)');
  over(b, 1000, '26(i)(b)');
  over(ii, 2000, '26(ii)');
  over(iii, 2000, '26(iii) total');
  over(iv, 2500, '26(iv) total');
  over(cat1, 12500, 'Category I total');
  over(e1, 2000, '27(i) total');
  over(e2, 1500, '27(ii) total');
  over(e3, 1500, '27(iii) total');
  over(e1Total, 3000, '28 E(i) total');

  const opt = c => (c === null ? '' : fmt(c));
  const p44v = {};
  for (const k of P44_ORDER) p44v[k] = fed[k] ? fmt(p44[k]) : '';
  p44v.total = fmt(cat3);

  return {
    values: {
      p42: { i_a: opt(a), i_b: opt(b), ii: opt(ii), iii: fmt(iii), iv: fmt(iv), total: fmt(cat1) },
      p43: { i: fmt(e1), ii: fmt(e2), iii: fmt(e3), total: fmt(cat2), raw: fmt(raw2), capped: raw2 > 2500 },
      p44: p44v,
      p29: { I: fmt(cat1), II: fmt(cat2), I_II: fmt(cat1 + cat2), III: fmt(cat3) },
      p28: { phd: d2a === null && d2b === null ? '' : fmt((d2a ?? 0) + (d2b ?? 0)), e1Total: fmt(e1Total) },
    },
    problems,
  };
}

// Last academic year (points 29 and 45, column 3): I, II and III of last year; I+II is always I + II.
const LY_PARTS = [['cat1', 'I', 12500], ['cat2', 'II', 2500], ['cat3', 'III', null]];

export function lastYearProblems(ly) {
  const src = ly && typeof ly === 'object' ? ly : {};
  const parsed = LY_PARTS.map(([key]) => toCents(src[key]));
  const filled = parsed.filter(p => p.state !== 'missing').length;
  if (filled === 0) return [];
  if (filled < LY_PARTS.length) {
    return [{ code: 'LY_PARTIAL', where: 'Last academic year', message: 'Last academic year: fill I, II and III, or leave all three empty.' }];
  }
  const problems = [];
  LY_PARTS.forEach(([, label], i) => {
    if (parsed[i].state === 'bad') {
      const where = `Last academic year ${label}`;
      problems.push({ code: 'BAD_SCORE', where, message: `${where}: score must be a number (0 or more) with at most 2 decimals.` });
    }
  });
  LY_PARTS.forEach(([, label, max], i) => {
    if (max !== null && parsed[i].state === 'ok' && parsed[i].cents > max) {
      const where = `Last academic year ${label}`;
      problems.push({ code: 'OVER_MAX', where, message: `${where} is ${fmt(parsed[i].cents)}; the form's maximum is ${fmt(max)}.` });
    }
  });
  return problems;
}

export function lastYearCells(ly) {
  const src = ly && typeof ly === 'object' ? ly : {};
  const parsed = LY_PARTS.map(([key]) => toCents(src[key]));
  if (parsed.some(p => p.state !== 'ok')) return { cat1: '', cat2: '', total12: '', cat3: '' };
  const [a, b, c] = parsed.map(p => p.cents);
  return { cat1: fmt(a), cat2: fmt(b), total12: fmt(a + b), cat3: fmt(c) };
}
