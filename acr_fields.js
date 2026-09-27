// Date of birth in words, entry checks and old-draft migration for the cover page, Part I and Part II.
// parseDob, dobWords and fieldProblems mirror acr_fields.py; both are checked against tests/fixtures/field_cases.json.

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
