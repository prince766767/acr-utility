// Date of birth in words, entry checks and old-draft migration for the cover page, Part I and Part II.
// parseDob, dobWords and fieldProblems mirror acr_fields.py; both are checked against tests/fixtures/field_cases.json.
import { isEmptyEntry } from './api_tally.js';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
  'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth',
  'Nineteenth', 'Twentieth'];
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const DOB_RE = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/;
const NUM_RE = /^-?[0-9]+(\.[0-9]+)?$/;

export function parseDob(v) {
  if (v === undefined || v === null) return { state: 'empty' };
  if (typeof v !== 'string') return { state: 'bad' };
  const s = v.trim();
  if (s === '') return { state: 'empty' };
  const m = DOB_RE.exec(s);
  if (!m) return { state: 'bad' };
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (y < 1900 || y > 2099 || mo < 1 || mo > 12) return { state: 'bad' };
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d < 1 || d > days) return { state: 'bad' };
  return { state: 'ok', d, m: mo, y };
}

function twoDigitWords(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}

function ordinal(d) {
  if (d <= 20) return ORDINALS[d];
  if (d === 30) return 'Thirtieth';
  return TENS[Math.floor(d / 10)] + '-' + ORDINALS[d % 10].toLowerCase();
}

export function dobWords({ d, m, y }) {
  const head = y < 2000 ? 'Nineteen Hundred' : 'Two Thousand';
  const rest = twoDigitWords(y % 100);
  return `${ordinal(d)} ${MONTHS[m]} ${head}` + (rest ? ` ${rest}` : '');
}

function numberState(v) {
  if (v === undefined || v === null) return 'empty';
  if (typeof v === 'boolean') return 'bad';
  const s = String(v).trim();
  if (s === '') return 'empty';
  return NUM_RE.test(s) ? 'ok' : 'bad';
}

const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

export function fieldProblems(data) {
  const problems = [];
  const dob = obj(obj(data).profile).dob;
  if (parseDob(dob).state === 'bad') {
    problems.push({ code: 'BAD_DOB', where: 'Point 10', message: `Point 10: date of birth "${dob}" is not a real date (use DD/MM/YYYY).` });
  }
  const results = Array.isArray(obj(data).results) ? obj(data).results : [];
  results.forEach((raw, idx) => {
    const r = obj(raw);
    for (const [key, label] of [['collegePct', 'college pass %'], ['universityPct', 'university pass %']]) {
      if (numberState(r[key]) === 'bad') {
        const where = `Point 20, row ${idx + 1}`;
        problems.push({ code: 'BAD_NUMBER', where, message: `${where}: ${label} "${r[key]}" is not a number.` });
      }
    }
  });
  return problems;
}

const OLD_TEXT = [
  ['p19d', '19(d) old text (please re-enter it as rows of the 19(d) table)'],
  ['p21ii', '21(ii) old text (please re-enter it as rows of the 21(ii) table)'],
  ['p24', '24 old text (please re-enter it as the Yes/No answer and the reasons)'],
];
const OLD_RESEARCH = [['researchTitle', 'title'], ['researchInstitution', 'institution'], ['researchNature', 'nature'], ['researchStatus', 'status']];

// Brings a draft saved by an older version to the current shape. Returns a copy; the input is not changed.
export function migrateDraft(raw) {
  const data = JSON.parse(JSON.stringify(raw && typeof raw === 'object' ? raw : {}));
  if (!data.part2 || typeof data.part2 !== 'object') data.part2 = {};
  const part2 = data.part2;
  const notices = [];
  for (const [key, label] of OLD_TEXT) {
    const v = typeof part2[key] === 'string' ? part2[key].trim() : '';
    if (v) notices.push(`${label}: ${v}`);
    delete part2[key];
  }
  const old = {};
  let anyOld = false;
  for (const [key, col] of OLD_RESEARCH) {
    const v = typeof part2[key] === 'string' ? part2[key].trim() : '';
    if (v) { old[col] = v; anyOld = true; }
    delete part2[key];
  }
  for (const k of ['activities', 'orientation', 'research', 'otherInfo']) if (!Array.isArray(data[k])) data[k] = [];
  if (anyOld) {
    if (data.research.length === 0) {
      data.research.push({ title: old.title || '', institution: old.institution || '', nature: old.nature || '', status: old.status || '' });
      notices.push('22: your research details were moved into the first row of the 22 table; please check them.');
    } else {
      notices.push(`22 old details (please check the 22 table): ${OLD_RESEARCH.map(([, c]) => old[c] || '').join(' | ')}`);
    }
  }
  return { data, notices };
}

// ---- Word-file values: ports of acr_fields.py (token_values, part_tables, variation) ----

export const TITLES = ['Dr.', 'Shri', 'Smt', 'Kumari'];
export const RELATIONS = ['Father', 'Husband'];
export const TOKENS = ['SESSION', 'COLLEGE_NAME', 'COLLEGE_PLACE', 'FULL_NAME', 'FATHER_HUSBAND', 'EMPLOYEE_CODE', 'SUBJECT',
  'APPOINTMENT_DATE', 'DESIGNATION', 'PAY_INFO', 'PROMOTION', 'ACADEMIC_QUAL', 'PROFESSIONAL_QUAL', 'RESEARCH_DEGREE',
  'DOB_WORDS', 'SERVICE_STATUS', 'COLLEGES_SERVED', 'DEPT_EXAM', 'HINDI_DETAILS', 'OTHER_ASSIGNMENT', 'ADDR1', 'ADDR2',
  'ADDR3', 'LANDLINE', 'MOBILE', 'EMAIL', 'P17', 'P18', 'P19B', 'P19F', 'P19G', 'P21I', 'RESEARCH_YES_NO', 'P23',
  'P24_SATISFIED', 'P24_REASONS', 'P25', 'PLACE', 'REPORT_DATE', 'CERT_DESIGNATION', 'PRINCIPAL_NAME'];

const s = v => (v === undefined || v === null ? '' : String(v).replace(/\r\n/g, '\n').trim());
const joinFilled = (parts, sep = ', ') => parts.map(s).filter(Boolean).join(sep);
const list = x => (Array.isArray(x) ? x : []);

function decimal(v) {
  if (v === undefined || v === null || typeof v === 'boolean') return null;
  const t = String(v).trim();
  if (!NUM_RE.test(t)) return null;
  const neg = t.startsWith('-');
  const [whole, frac = ''] = (neg ? t.slice(1) : t).split('.');
  return { n: BigInt((neg ? '-' : '') + whole + frac), scale: frac.length };
}

// Point 20 column 7: college pass % minus university pass %, rounded half up to 2 decimals, '+' when positive.
export function variation(college, university) {
  const a = decimal(college), b = decimal(university);
  if (!a || !b) return '';
  const scale = Math.max(a.scale, b.scale, 2);
  const d = a.n * 10n ** BigInt(scale - a.scale) - b.n * 10n ** BigInt(scale - b.scale);
  const div = 10n ** BigInt(scale - 2);
  let q = d / div;
  const rem = d % div;
  if (rem !== 0n && (rem < 0n ? -rem : rem) * 2n >= div) q += d < 0n ? -1n : 1n;
  if (q === 0n) return '0';
  const neg = q < 0n, abs = neg ? -q : q;
  const frac = (abs % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  const text = (abs / 100n).toString() + (frac ? '.' + frac : '');
  return (neg ? '-' : '+') + text;
}

export function tokenValues(data) {
  const d = obj(data), p = obj(d.profile), a = obj(d.part2);
  const dob = parseDob(p.dob);
  const lines = s(p.permanentAddress).split('\n').map(x => x.trim()).filter(Boolean);
  const basic = s(p.basicPay);
  return {
    SESSION: s(d.session),
    COLLEGE_NAME: s(p.collegeName),
    COLLEGE_PLACE: joinFilled([p.collegeDistrict, p.collegeState, p.collegePin]),
    FULL_NAME: s(p.fullName),
    FATHER_HUSBAND: s(p.fatherHusband),
    EMPLOYEE_CODE: s(p.employeeCode),
    SUBJECT: s(p.subject),
    APPOINTMENT_DATE: s(p.appointmentDate),
    DESIGNATION: s(p.designation),
    PAY_INFO: joinFilled([p.payBand, basic ? `Basic Pay ${basic}` : ''], '; '),
    PROMOTION: s(a.p8) || s(p.promotionDate),
    ACADEMIC_QUAL: s(p.academicQualification),
    PROFESSIONAL_QUAL: s(p.professionalQualification),
    RESEARCH_DEGREE: s(p.researchDegree),
    DOB_WORDS: dob.state === 'ok' ? dobWords(dob) : '',
    SERVICE_STATUS: s(p.serviceStatus),
    COLLEGES_SERVED: numberedLines(s(a.p12)),
    DEPT_EXAM: s(a.p13a),
    HINDI_DETAILS: s(a.p13b),
    OTHER_ASSIGNMENT: s(a.p14),
    ADDR1: lines[0] || '',
    ADDR2: lines[1] || '',
    ADDR3: lines.slice(2).join(', '),
    LANDLINE: s(p.landline),
    MOBILE: s(p.mobile),
    EMAIL: s(p.email),
    P17: s(a.p17),
    P18: s(a.p18),
    P19B: s(a.p19b),
    P19F: s(a.p19f),
    P19G: s(a.p19g),
    P21I: s(a.p21i),
    RESEARCH_YES_NO: s(a.researchYesNo),
    P23: s(a.p23),
    P24_SATISFIED: s(a.p24Satisfied),
    P24_REASONS: s(a.p24Reasons),
    P25: s(a.p25),
    PLACE: joinFilled([p.collegeName, p.collegePin]),
    REPORT_DATE: s(p.submissionDate),
    CERT_DESIGNATION: s(p.designation),
    PRINCIPAL_NAME: s(p.principalName),
  };
}

const rows = (data, key) => list(obj(data)[key]).filter(e => e && typeof e === 'object' && !Array.isArray(e) && !isEmptyEntry(e));

export function partTables(data) {
  const d = obj(data), p = obj(d.profile), a = obj(d.part2);
  const dob = parseDob(p.dob);
  const two = n => String(n).padStart(2, '0');
  return {
    dob_digits: dob.state === 'ok' ? `${two(dob.d)}${two(dob.m)}${String(dob.y).padStart(4, '0')}` : '',
    teaching: rows(d, 'teaching').map((e, i) => {
      const pct = s(e.syllabusPct);
      return [s(e.srNo) || String(i + 1), s(e.classCourse), s(e.college), s(e.allocated), s(e.delivered),
        /^\d+(\.\d+)?$/.test(pct) ? pct + '%' : pct];   // % only after a plain number; text prints as typed
    }),
    total_periods: s(a.totalPeriodsPerWeek),
    assignments: rows(d, 'assignments').map((e, i) => [String(i + 1), s(e.classCourse), s(e.assignments), s(e.tests), '']),
    activities: rows(d, 'activities').map(e => [s(e.title), s(e.detail)]),
    results: rows(d, 'results').map(e => {
      const v = variation(e.collegePct, e.universityPct);
      return [...['className', 'duration', 'appeared', 'passed', 'collegePct', 'universityPct'].map(k => s(e[k])), v, v,
        ...['divI', 'divII', 'divIII', 'failed', 'reason'].map(k => s(e[k]))];
    }),
    orientation: rows(d, 'orientation').map(e => ['course', 'place', 'duration', 'rcoc'].map(k => s(e[k]))),
    research: rows(d, 'research').map(e => ['title', 'institution', 'nature', 'status'].map(k => s(e[k]))),
    other_info: rows(d, 'otherInfo').map((e, i) => [String(i + 1), s(e.text)]),
  };
}

// The ready-made enclosure ticks on the Enclosures tab (app.js; import_v04.js matches v0.4 enclosures to them).
export const ENCLOSURE_DEFAULTS = ['Certificate / sanction order', 'FDP / Orientation / Refresher certificate', 'Conference / seminar certificate',
  'Paper presentation / publication', 'Research project document', 'Degree / qualification certificate', 'Award / honour certificate',
  'Other supporting document'];

// Point 12: one line per college, printed "(1) College:" with its dates on the next line, as teachers write it.
// A single college is not numbered; lines the teacher numbered themselves stay as typed (as numbered_lines in acr_fields.py).
export function numberedLines(text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.some(l => /^\(?\d+[.)]/.test(l))) return String(text || '').trim();
  const split = l => l.replace(': ', ':\n');
  if (lines.length === 1) return split(lines[0]);
  return lines.map((l, i) => `(${i + 1}) ${split(l)}`).join('\n');
}

// Answers may mark **bold**, *italic* and ^superscript^ (the B / I / x² buttons). Returns [[text, letters b, i, s]].
// A mark counts only when closed on the same line with no space just inside it, so "5 * 3" and a lone "*" stay as typed.
// Same rules as inline_marks in acr_fields.py; both are checked against tests/fixtures/mark_cases.json.
const MARKS = [['**', 'b'], ['*', 'i'], ['^', 's']];
const SPACE = ' \t\u00a0';
export function inlineMarks(text) {
  const out = [];
  const add = (s, fmt) => {
    if (!s) return;
    if (out.length && out[out.length - 1][1] === fmt) out[out.length - 1][0] += s;
    else out.push([s, fmt]);
  };
  const walk = (s, fmt) => {
    let buf = '', i = 0;
    outer: while (i < s.length) {
      for (const [mark, f] of MARKS) {
        if (!s.startsWith(mark, i)) continue;
        const j = s.indexOf(mark, i + mark.length);
        const inner = j > 0 ? s.slice(i + mark.length, j) : '';
        if (inner && !SPACE.includes(inner[0]) && !SPACE.includes(inner[inner.length - 1]) && !fmt.includes(f)) {
          add(buf, fmt);
          buf = '';
          walk(inner, (fmt + f).split('').sort().join(''));
          i = j + mark.length;
          continue outer;
        }
      }
      buf += s[i];
      i += 1;
    }
    add(buf, fmt);
  };
  String(text).split('\n').forEach((line, n) => { if (n) add('\n', ''); walk(line, ''); });
  return out;
}
