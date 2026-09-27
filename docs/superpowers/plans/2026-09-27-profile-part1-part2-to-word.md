# Profile, Part I and Part II into the Word file — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the teacher enters outside the API sections prints in its place on the Word ACR. That covers the cover page, points 1–25, point 30, the enclosures and the teacher's certificate.

**Architecture:** A pure module `acr_fields.py` turns the app's saved file into template token values and table rows. It also works out the date of birth (digits and words) and the point 20 variation, and checks for problems. `acr_fields.js` mirrors the date-of-birth rules and the checks for the app, and also migrates old drafts. Both are tested against one shared fixture. A one-time guarded script puts named `{{TOKENS}}` into the template's blank answer spots, each in its own blue run. `generate_acr.py` fills the tokens (keeping line breaks), the tables and the strike-through of the title and relation choices.

**Tech Stack:** Vanilla ES modules, Node 24 `node:test`, Python 3.12 + python-docx 1.2 + `unittest`, Word COM (`tools/docx_to_pdf.ps1`), poppler `pdftoppm`.

**Spec:** `docs/superpowers/specs/2026-09-27-profile-part1-part2-to-word-design.md`

## Global Constraints

- Paths are relative to `C:\Users\princ\Downloads\ACR_Utility_v0_3\ACR_Utility_v0_3`.
- The generator reads the app's saved file as it is (`profile`, `part2`, top-level lists). Old names (`college.*`, `part2.teaching`, …) are not supported.
- Values print in blue in the form's own place; the form's wording is kept.
- Nothing is silently converted; the only automatic conversion is the four old research fields becoming row 1 of the 22 table, and it is reported in a notice.
- Date of birth: `DD/MM/YYYY`, a real date, years 1900–2099; otherwise it is a blocking problem.
- The Word file is not written when there is any problem (entry problems or API problems).
- Principal / Reporting Officer content is never written; only the Principal's *name* (a profile field) is.
- All existing tests must keep passing.
- Git: work on branch `feature/profile-part-word`; commit after each task (the user asked for commits in this workflow).

---

## File Structure

| File | Responsibility |
|---|---|
| `acr_fields.py` (create) | DOB parse/words/digits, variation, entry problems, token values, table rows. |
| `acr_fields.js` (create) | DOB parse/words and entry problems (mirror), `migrateDraft` for old drafts. |
| `tests/fixtures/field_cases.json` (create) | Shared JS/Python cases: DOB and entry problems. |
| `tests/fixtures/full_record.acr.json` (create) | A complete record with a unique value in every field. |
| `tests/acr_fields.test.js`, `tests/test_acr_fields.py` (create) | Unit tests for the two modules. |
| `tools/tokenise_template.py` (create) | One-time template script (spec §6). |
| `tests/test_template.py` (modify) | Checks for the tokenised template. |
| `generate_acr.py` (modify) | Multi-line tokens, part tables, strike choices, combined problems, new `generate()`. |
| `tests/test_generate_parts.py` (create), `tests/test_generate_api.py` (modify) | Generator read-back tests. |
| `index.html`, `app.js`, `styles.css`, `sw.js`, `package.json` (modify) | New fields, tables, DOB words, notices, review problems. |

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b feature/profile-part-word` (from `master`, clean tree except the spec/plan docs).
- [ ] **Step 2:** Commit the spec and plan:
```bash
git add docs/superpowers/specs/2026-09-27-profile-part1-part2-to-word-design.md docs/superpowers/plans/2026-09-27-profile-part1-part2-to-word.md
git commit -m "docs: spec and plan for profile, Part I and Part II in the Word file"
```

---

### Task 1: `acr_fields` (Python + JS) with shared cases

**Files:** create `acr_fields.py`, `acr_fields.js`, `tests/fixtures/field_cases.json`, `tests/fixtures/full_record.acr.json`, `tests/test_acr_fields.py`, `tests/acr_fields.test.js`; modify `package.json`.

**Interfaces (produced):**
- Python: `parse_dob(v) -> ('empty'|'bad'|'ok', (d, m, y)|None)`, `dob_words(d, m, y) -> str`, `dob_digits(d, m, y) -> 'DDMMYYYY'`, `variation(college, university) -> str`, `field_problems(data) -> [{code, where, message}]`, `token_values(data) -> {TOKEN: str}` (keys without braces), `part_tables(data) -> {'dob_digits', 'teaching', 'total_periods', 'assignments', 'activities', 'results', 'orientation', 'research', 'other_info'}`, `TITLES = ('Dr.', 'Shri', 'Smt', 'Kumari')`, `RELATIONS = ('Father', 'Husband')`, `TOKENS` (the exact key set of `token_values`).
- JS: `parseDob(v) -> {state:'empty'|'bad'} | {state:'ok', d, m, y}`, `dobWords({d, m, y}) -> string`, `fieldProblems(data) -> [...]` (same objects as Python), `migrateDraft(raw) -> {data, notices: string[]}`.

- [ ] **Step 1: Write `tests/fixtures/field_cases.json`**

```json
{
  "dob": [
    {"in": "01/01/1900", "state": "ok", "words": "First January Nineteen Hundred", "digits": "01011900"},
    {"in": "02/02/1905", "state": "ok", "words": "Second February Nineteen Hundred Five", "digits": "02021905"},
    {"in": "03/03/1911", "state": "ok", "words": "Third March Nineteen Hundred Eleven", "digits": "03031911"},
    {"in": "11/04/1912", "state": "ok", "words": "Eleventh April Nineteen Hundred Twelve", "digits": "11041912"},
    {"in": "12/05/1913", "state": "ok", "words": "Twelfth May Nineteen Hundred Thirteen", "digits": "12051913"},
    {"in": "13/06/1920", "state": "ok", "words": "Thirteenth June Nineteen Hundred Twenty", "digits": "13061920"},
    {"in": "21/07/1921", "state": "ok", "words": "Twenty-first July Nineteen Hundred Twenty One", "digits": "21071921"},
    {"in": "22/08/1999", "state": "ok", "words": "Twenty-second August Nineteen Hundred Ninety Nine", "digits": "22081999"},
    {"in": "23/09/2000", "state": "ok", "words": "Twenty-third September Two Thousand", "digits": "23092000"},
    {"in": "30/06/1987", "state": "ok", "words": "Thirtieth June Nineteen Hundred Eighty Seven", "digits": "30061987"},
    {"in": "31/10/2005", "state": "ok", "words": "Thirty-first October Two Thousand Five", "digits": "31102005"},
    {"in": "29/02/2000", "state": "ok", "words": "Twenty-ninth February Two Thousand", "digits": "29022000"},
    {"in": " 20/12/2012 ", "state": "ok", "words": "Twentieth December Two Thousand Twelve", "digits": "20122012"},
    {"in": "29/02/1900", "state": "bad"},
    {"in": "31/04/1990", "state": "bad"},
    {"in": "31/02/1990", "state": "bad"},
    {"in": "1/2/1990", "state": "bad"},
    {"in": "00/01/1990", "state": "bad"},
    {"in": "15/13/1990", "state": "bad"},
    {"in": "15/06/1899", "state": "bad"},
    {"in": "15/06/2100", "state": "bad"},
    {"in": "30-09-1983", "state": "bad"},
    {"in": 30061987, "state": "bad"},
    {"in": "", "state": "empty"},
    {"in": "   ", "state": "empty"},
    {"in": null, "state": "empty"}
  ],
  "problems": [
    {"name": "nothing entered", "data": {}, "expected": []},
    {"name": "valid entries", "data": {"profile": {"dob": "30/06/1987"}, "results": [{"collegePct": 92.5, "universityPct": "88"}]}, "expected": []},
    {"name": "bad dob and percentages",
     "data": {"profile": {"dob": "31/02/1990"}, "results": [{"collegePct": "92.5", "universityPct": "abc"}, {"collegePct": "x%"}, {"collegePct": "", "universityPct": " 70 "}]},
     "expected": [
       {"code": "BAD_DOB", "where": "Point 10", "message": "Point 10: date of birth \"31/02/1990\" is not a real date (use DD/MM/YYYY)."},
       {"code": "BAD_NUMBER", "where": "Point 20, row 1", "message": "Point 20, row 1: university pass % \"abc\" is not a number."},
       {"code": "BAD_NUMBER", "where": "Point 20, row 2", "message": "Point 20, row 2: college pass % \"x%\" is not a number."}
     ]}
  ]
}
```

- [ ] **Step 2: Write `tests/fixtures/full_record.acr.json`**

```json
{
  "session": "2031-32",
  "profile": {
    "collegeName": "Govt College Alpha", "collegeDistrict": "District Beta", "collegePin": "171001", "principalName": "Dr Principal Gamma",
    "collegeAddress": "", "collegeOther": "",
    "title": "Smt", "relation": "Husband", "fullName": "ASHA DEVI", "fatherHusband": "RAM LAL", "employeeCode": "EC-4321",
    "subject": "Chemistry", "appointmentDate": "01/07/2012", "designation": "Associate Professor", "payBand": "Level 13A",
    "basicPay": "131400", "promotionDate": "old-promotion-date", "academicQualification": "M.Sc. Chemistry First Division",
    "professionalQualification": "NET", "researchDegree": "Ph.D Chemistry", "dob": "05/11/1980", "serviceStatus": "Permanent",
    "permanentAddress": "House 12\nWard 3\nTown Delta\nPIN 176001", "landline": "01972-222333", "mobile": "+919800000001",
    "email": "asha@example.org", "submissionDate": "15/05/2032"
  },
  "part1": {},
  "part2": {
    "p8": "No promotion", "p12": "Govt College Alpha: 01/04/2031 to 31/03/2032", "p13a": "Roll 12345, 2014", "p13b": "Cleared 2013",
    "p14": "Bursar", "p17": "Contribution line 1\nContribution line 2", "p18": "Unassigned work", "p19b": "Special effort",
    "p19f": "Book A - extract", "p19g": "Problem 1\nProblem 2", "totalPeriodsPerWeek": "24", "p21i": "No fresh degree this year",
    "researchYesNo": "Yes", "p23": "Best teacher award", "p24Satisfied": "No", "p24Reasons": "Want promotion", "p25": "Other point"
  },
  "teaching": [
    {"srNo": 1, "classCourse": "B.Sc. I", "college": "GCA", "allocated": 6, "delivered": 150, "syllabusPct": 100},
    {"classCourse": "B.Sc. II", "college": "GCA", "allocated": 6, "delivered": 140, "syllabusPct": "95"}
  ],
  "assignments": [{"classCourse": "B.Sc. I", "assignments": 4, "tests": 2}],
  "activities": [{"title": "Chem Quiz", "detail": "Inter-class quiz"}],
  "results": [{"className": "B.Sc. III", "duration": "1 year", "appeared": 40, "passed": 38, "collegePct": "95", "universityPct": "88.5",
               "divI": 10, "divII": 20, "divIII": 8, "failed": 2, "reason": ""}],
  "orientation": [{"course": "Refresher in Chemistry, UGC", "place": "HRDC Shimla", "duration": "21 days", "rcoc": "RC-7"}],
  "research": [{"title": "Green synthesis", "institution": "HPU", "nature": "Minor", "status": "Ongoing"}],
  "otherInfo": [{"text": "Reviewer for journal X"}],
  "enclosures": [{"label": "Certificate / sanction order", "checked": true}, {"label": "Degree / qualification certificate", "checked": false}],
  "api": {}
}
```

- [ ] **Step 3: Write the failing Python test `tests/test_acr_fields.py`**

```python
import json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from acr_fields import (parse_dob, dob_words, dob_digits, variation, field_problems,  # noqa: E402
                        token_values, part_tables, TOKENS)

CASES = json.loads((ROOT / 'tests' / 'fixtures' / 'field_cases.json').read_text(encoding='utf-8'))
FULL = json.loads((ROOT / 'tests' / 'fixtures' / 'full_record.acr.json').read_text(encoding='utf-8'))


class Dob(unittest.TestCase):
    def test_shared_cases(self):
        for c in CASES['dob']:
            with self.subTest(c['in']):
                state, dob = parse_dob(c['in'])
                self.assertEqual(state, c['state'])
                if state == 'ok':
                    self.assertEqual(dob_words(*dob), c['words'])
                    self.assertEqual(dob_digits(*dob), c['digits'])


class Variation(unittest.TestCase):
    def test_values(self):
        self.assertEqual(variation(92.5, 88), '+4.5')
        self.assertEqual(variation(80, '85.25'), '-5.25')
        self.assertEqual(variation('90', '90'), '0')
        self.assertEqual(variation('', 50), '')
        self.assertEqual(variation('100', '0'), '+100')
        self.assertEqual(variation('33.333', '33.33'), '0')
        self.assertEqual(variation('66.667', '66.66'), '+0.01')
        self.assertEqual(variation('abc', 50), '')


class Problems(unittest.TestCase):
    def test_shared_cases(self):
        for c in CASES['problems']:
            with self.subTest(c['name']):
                self.assertEqual(field_problems(c['data']), c['expected'])


class Tokens(unittest.TestCase):
    def test_full_record(self):
        v = token_values(FULL)
        self.assertEqual(set(v), set(TOKENS))
        self.assertEqual(v['COLLEGE_PLACE'], 'District Beta, 171001')
        self.assertEqual(v['PAY_INFO'], 'Level 13A; Basic Pay 131400')
        self.assertEqual(v['PROMOTION'], 'No promotion')
        self.assertEqual(v['DOB_WORDS'], 'Fifth November Nineteen Hundred Eighty')
        self.assertEqual([v['ADDR1'], v['ADDR2'], v['ADDR3']], ['House 12', 'Ward 3', 'Town Delta, PIN 176001'])
        self.assertEqual(v['PLACE'], 'Govt College Alpha, 171001')
        self.assertEqual(v['REPORT_DATE'], '15/05/2032')
        self.assertEqual(v['CERT_DESIGNATION'], 'Associate Professor')
        self.assertEqual(v['P17'], 'Contribution line 1\nContribution line 2')

    def test_empty_record(self):
        v = token_values({})
        self.assertEqual(set(v), set(TOKENS))
        self.assertTrue(all(x == '' for x in v.values()))

    def test_partial_joins(self):
        v = token_values({'profile': {'basicPay': '5000', 'collegePin': '171001', 'promotionDate': 'P'}})
        self.assertEqual(v['PAY_INFO'], 'Basic Pay 5000')
        self.assertEqual(v['COLLEGE_PLACE'], '171001')
        self.assertEqual(v['PLACE'], '171001')
        self.assertEqual(v['PROMOTION'], 'P')


class Tables(unittest.TestCase):
    def test_full_record(self):
        t = part_tables(FULL)
        self.assertEqual(t['dob_digits'], '05111980')
        self.assertEqual(t['teaching'], [['1', 'B.Sc. I', 'GCA', '6', '150', '100%'], ['2', 'B.Sc. II', 'GCA', '6', '140', '95%']])
        self.assertEqual(t['total_periods'], '24')
        self.assertEqual(t['assignments'], [['1', 'B.Sc. I', '4', '2', '']])
        self.assertEqual(t['activities'], [['Chem Quiz', 'Inter-class quiz']])
        self.assertEqual(t['results'], [['B.Sc. III', '1 year', '40', '38', '95', '88.5', '+6.5', '+6.5', '10', '20', '8', '2', '']])
        self.assertEqual(t['orientation'], [['Refresher in Chemistry, UGC', 'HRDC Shimla', '21 days', 'RC-7']])
        self.assertEqual(t['research'], [['Green synthesis', 'HPU', 'Minor', 'Ongoing']])
        self.assertEqual(t['other_info'], [['1', 'Reviewer for journal X']])

    def test_empty_rows_skipped_and_numbering(self):
        t = part_tables({'teaching': [{}, {'classCourse': 'X', 'syllabusPct': '80%'}], 'otherInfo': [{'text': ' '}, {'text': 'Y'}]})
        self.assertEqual(t['teaching'], [['1', 'X', '', '', '', '80%']])
        self.assertEqual(t['other_info'], [['1', 'Y']])
        self.assertEqual(t['dob_digits'], '')


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 4: Write the failing Node test `tests/acr_fields.test.js`**

```js
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
```

- [ ] **Step 5: Run both; confirm they fail** — `python -m unittest tests.test_acr_fields` (ModuleNotFoundError) and `node --test tests/acr_fields.test.js` (module not found).

- [ ] **Step 6: Write `acr_fields.py`**

```python
"""Values for the cover page, Part I, Part II, point 30 and the teacher's certificate of the Word ACR.

Reads the app's saved file as it is. parse_dob, dob_words and field_problems mirror acr_fields.js;
both are checked against tests/fixtures/field_cases.json.
"""
import re
from decimal import Decimal, ROUND_HALF_UP

from api_tally import is_empty_entry

TITLES = ('Dr.', 'Shri', 'Smt', 'Kumari')
RELATIONS = ('Father', 'Husband')
TOKENS = ('SESSION', 'COLLEGE_NAME', 'COLLEGE_PLACE', 'FULL_NAME', 'FATHER_HUSBAND', 'EMPLOYEE_CODE', 'SUBJECT',
          'APPOINTMENT_DATE', 'DESIGNATION', 'PAY_INFO', 'PROMOTION', 'ACADEMIC_QUAL', 'PROFESSIONAL_QUAL',
          'RESEARCH_DEGREE', 'DOB_WORDS', 'SERVICE_STATUS', 'COLLEGES_SERVED', 'DEPT_EXAM', 'HINDI_DETAILS',
          'OTHER_ASSIGNMENT', 'ADDR1', 'ADDR2', 'ADDR3', 'LANDLINE', 'MOBILE', 'EMAIL', 'P17', 'P18', 'P19B', 'P19F',
          'P19G', 'P21I', 'RESEARCH_YES_NO', 'P23', 'P24_SATISFIED', 'P24_REASONS', 'P25', 'PLACE', 'REPORT_DATE',
          'CERT_DESIGNATION', 'PRINCIPAL_NAME')

ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
        'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
            'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth',
            'Eighteenth', 'Nineteenth', 'Twentieth']
MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
          'November', 'December']
_DOB_RE = re.compile(r'([0-9]{2})/([0-9]{2})/([0-9]{4})')
_NUM_RE = re.compile(r'-?[0-9]+(\.[0-9]+)?')


def _dict(x):
    return x if isinstance(x, dict) else {}


def _list(x):
    return x if isinstance(x, list) else []


def _s(v):
    return '' if v is None else str(v).replace('\r\n', '\n').strip()


def _join(*parts, sep=', '):
    return sep.join(p for p in (_s(x) for x in parts) if p)


def parse_dob(v):
    if v is None:
        return ('empty', None)
    if not isinstance(v, str):
        return ('bad', None)
    s = v.strip()
    if s == '':
        return ('empty', None)
    m = _DOB_RE.fullmatch(s)
    if not m:
        return ('bad', None)
    d, mo, y = (int(x) for x in m.groups())
    if not (1900 <= y <= 2099 and 1 <= mo <= 12):
        return ('bad', None)
    leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
    days = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
    if not 1 <= d <= days:
        return ('bad', None)
    return ('ok', (d, mo, y))


def _two_digit_words(n):
    if n < 20:
        return ONES[n]
    return TENS[n // 10] + (' ' + ONES[n % 10] if n % 10 else '')


def _ordinal(d):
    if d <= 20:
        return ORDINALS[d]
    if d == 30:
        return 'Thirtieth'
    return TENS[d // 10] + '-' + ORDINALS[d % 10].lower()


def dob_words(d, m, y):
    head = 'Nineteen Hundred' if y < 2000 else 'Two Thousand'
    rest = _two_digit_words(y % 100)
    return f'{_ordinal(d)} {MONTHS[m]} {head}' + (f' {rest}' if rest else '')


def dob_digits(d, m, y):
    return f'{d:02d}{m:02d}{y:04d}'


def _number(v):
    if v is None:
        return ('empty', None)
    if isinstance(v, bool):
        return ('bad', None)
    s = str(v).strip()
    if s == '':
        return ('empty', None)
    if not _NUM_RE.fullmatch(s):
        return ('bad', None)
    return ('ok', Decimal(s))


def variation(college, university):
    """Point 20 column 7: college pass % minus university pass %, 2 decimals, '+' when positive."""
    a, b = _number(college), _number(university)
    if a[0] != 'ok' or b[0] != 'ok':
        return ''
    v = (a[1] - b[1]).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    if v == 0:
        return '0'
    s = format(v.normalize(), 'f')
    return '+' + s if v > 0 else s


def field_problems(data):
    problems = []
    dob = _dict(_dict(data).get('profile')).get('dob')
    if parse_dob(dob)[0] == 'bad':
        problems.append({'code': 'BAD_DOB', 'where': 'Point 10',
                         'message': f'Point 10: date of birth "{dob}" is not a real date (use DD/MM/YYYY).'})
    for i, r in enumerate(_list(_dict(data).get('results')), 1):
        r = _dict(r)
        for key, label in (('collegePct', 'college pass %'), ('universityPct', 'university pass %')):
            if _number(r.get(key))[0] == 'bad':
                where = f'Point 20, row {i}'
                problems.append({'code': 'BAD_NUMBER', 'where': where,
                                 'message': f'{where}: {label} "{r.get(key)}" is not a number.'})
    return problems


def token_values(data):
    data = _dict(data)
    p, a = _dict(data.get('profile')), _dict(data.get('part2'))
    state, dob = parse_dob(p.get('dob'))
    lines = [ln.strip() for ln in _s(p.get('permanentAddress')).split('\n') if ln.strip()]
    basic = _s(p.get('basicPay'))
    return {
        'SESSION': _s(data.get('session')),
        'COLLEGE_NAME': _s(p.get('collegeName')),
        'COLLEGE_PLACE': _join(p.get('collegeDistrict'), p.get('collegePin')),
        'FULL_NAME': _s(p.get('fullName')),
        'FATHER_HUSBAND': _s(p.get('fatherHusband')),
        'EMPLOYEE_CODE': _s(p.get('employeeCode')),
        'SUBJECT': _s(p.get('subject')),
        'APPOINTMENT_DATE': _s(p.get('appointmentDate')),
        'DESIGNATION': _s(p.get('designation')),
        'PAY_INFO': _join(p.get('payBand'), f'Basic Pay {basic}' if basic else '', sep='; '),
        'PROMOTION': _s(a.get('p8')) or _s(p.get('promotionDate')),
        'ACADEMIC_QUAL': _s(p.get('academicQualification')),
        'PROFESSIONAL_QUAL': _s(p.get('professionalQualification')),
        'RESEARCH_DEGREE': _s(p.get('researchDegree')),
        'DOB_WORDS': dob_words(*dob) if state == 'ok' else '',
        'SERVICE_STATUS': _s(p.get('serviceStatus')),
        'COLLEGES_SERVED': _s(a.get('p12')),
        'DEPT_EXAM': _s(a.get('p13a')),
        'HINDI_DETAILS': _s(a.get('p13b')),
        'OTHER_ASSIGNMENT': _s(a.get('p14')),
        'ADDR1': lines[0] if lines else '',
        'ADDR2': lines[1] if len(lines) > 1 else '',
        'ADDR3': ', '.join(lines[2:]),
        'LANDLINE': _s(p.get('landline')),
        'MOBILE': _s(p.get('mobile')),
        'EMAIL': _s(p.get('email')),
        'P17': _s(a.get('p17')),
        'P18': _s(a.get('p18')),
        'P19B': _s(a.get('p19b')),
        'P19F': _s(a.get('p19f')),
        'P19G': _s(a.get('p19g')),
        'P21I': _s(a.get('p21i')),
        'RESEARCH_YES_NO': _s(a.get('researchYesNo')),
        'P23': _s(a.get('p23')),
        'P24_SATISFIED': _s(a.get('p24Satisfied')),
        'P24_REASONS': _s(a.get('p24Reasons')),
        'P25': _s(a.get('p25')),
        'PLACE': _join(p.get('collegeName'), p.get('collegePin')),
        'REPORT_DATE': _s(p.get('submissionDate')),
        'CERT_DESIGNATION': _s(p.get('designation')),
        'PRINCIPAL_NAME': _s(p.get('principalName')),
    }


def _rows(data, key):
    return [e for e in _list(_dict(data).get(key)) if isinstance(e, dict) and not is_empty_entry(e)]


def part_tables(data):
    data = _dict(data)
    p, a = _dict(data.get('profile')), _dict(data.get('part2'))
    state, dob = parse_dob(p.get('dob'))
    teaching = []
    for i, e in enumerate(_rows(data, 'teaching'), 1):
        pct = _s(e.get('syllabusPct'))
        teaching.append([_s(e.get('srNo')) or str(i), _s(e.get('classCourse')), _s(e.get('college')),
                         _s(e.get('allocated')), _s(e.get('delivered')), pct if not pct or pct.endswith('%') else pct + '%'])
    results = []
    for e in _rows(data, 'results'):
        var = variation(e.get('collegePct'), e.get('universityPct'))
        results.append([_s(e.get(k)) for k in ('className', 'duration', 'appeared', 'passed', 'collegePct', 'universityPct')]
                       + [var, var] + [_s(e.get(k)) for k in ('divI', 'divII', 'divIII', 'failed', 'reason')])
    return {
        'dob_digits': dob_digits(*dob) if state == 'ok' else '',
        'teaching': teaching,
        'total_periods': _s(a.get('totalPeriodsPerWeek')),
        'assignments': [[str(i), _s(e.get('classCourse')), _s(e.get('assignments')), _s(e.get('tests')), '']
                        for i, e in enumerate(_rows(data, 'assignments'), 1)],
        'activities': [[_s(e.get('title')), _s(e.get('detail'))] for e in _rows(data, 'activities')],
        'results': results,
        'orientation': [[_s(e.get(k)) for k in ('course', 'place', 'duration', 'rcoc')] for e in _rows(data, 'orientation')],
        'research': [[_s(e.get(k)) for k in ('title', 'institution', 'nature', 'status')] for e in _rows(data, 'research')],
        'other_info': [[str(i), _s(e.get('text'))] for i, e in enumerate(_rows(data, 'otherInfo'), 1)],
    }
```

- [ ] **Step 7: Write `acr_fields.js`**

```js
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
```

- [ ] **Step 8: Change `package.json` test script** to `"test": "node --test tests/"` (runs both JS test files).

- [ ] **Step 9: Run** `python -m unittest discover -s tests -v` and `node --test tests/` → all PASS.

- [ ] **Step 10: Commit**
```bash
git add acr_fields.py acr_fields.js tests/fixtures/field_cases.json tests/fixtures/full_record.acr.json tests/test_acr_fields.py tests/acr_fields.test.js package.json
git commit -m "feat: field values, DOB words and entry checks for Part I/II (Python + JS)"
```

---

### Task 2: Tokenise the template

**Files:** create `tools/tokenise_template.py`; modify `tests/test_template.py`; modify (by running) `ACR_EMPLOYEE_MASTER.docx`.

**Interfaces:** Produces a template where every token in `acr_fields.TOKENS` sits alone in its own blue (`0000CC`) run; `FULL_NAME` and `SESSION` appear twice, all others once; title and relation options are separate unstruck runs (`Dr.`, `/`, `Shri`, `/`, `Smt`, `/`, `Kumari`; `Father`, `/`, `Husband`).

- [ ] **Step 1: Add the failing tests to `tests/test_template.py`** (new class before `if __name__ == '__main__':`)

```python
class TemplateTokens(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from docx.oxml.ns import qn
        cls.qn = qn
        cls.doc = Document(ROOT / 'ACR_EMPLOYEE_MASTER.docx')

    def runs_text(self, r):
        return ''.join(t.text or '' for t in r.iter(self.qn('w:t')))

    def test_every_token_alone_in_a_blue_run(self):
        import re
        sys.path.insert(0, str(ROOT))
        from acr_fields import TOKENS
        qn = self.qn
        found = {}
        for r in self.doc.element.body.iter(qn('w:r')):
            text = self.runs_text(r)
            for tok in re.findall(r'\{\{([A-Z0-9_]+)\}\}', text):
                found[tok] = found.get(tok, 0) + 1
                rpr = r.find(qn('w:rPr'))
                colour = rpr.find(qn('w:color')).get(qn('w:val')) if rpr is not None and rpr.find(qn('w:color')) is not None else ''
                self.assertEqual((text, colour.upper()), ('{{%s}}' % tok, '0000CC'), tok)
        expected = {t: 1 for t in TOKENS}
        expected['FULL_NAME'] = 2
        expected['SESSION'] = 2
        self.assertEqual(found, expected)

    def test_title_and_relation_options_unstruck_and_separate(self):
        qn = self.qn
        for start, options in (('Appraisal of work and conduct', ('Dr.', 'Shri', 'Smt', 'Kumari')), ('Father/Husband', ('Father', 'Husband'))):
            paras = [p for p in self.doc.element.body.iter(qn('w:p')) if ''.join(t.text or '' for t in p.iter(qn('w:t'))).startswith(start)]
            self.assertEqual(len(paras), 1, start)
            runs = {self.runs_text(r): r for r in paras[0].findall(qn('w:r'))}
            for opt in options:
                self.assertIn(opt, runs, opt)
            for r in paras[0].findall(qn('w:r')):
                rpr = r.find(qn('w:rPr'))
                strike = rpr.find(qn('w:strike')) if rpr is not None else None
                self.assertTrue(strike is None or strike.get(qn('w:val')) in ('0', 'false'), self.runs_text(r))

    def test_wording_repairs(self):
        full = ' '.join(t.text or '' for t in self.doc.element.body.iter(self.qn('w:t')))
        self.assertIn('b) Hindi subject : Cleared / exempted (mention details)', full)
        self.assertNotIn('Exempted vide Director', full)
        self.assertNotIn('{{OTHER_INFO}}', full)
        self.assertEqual(self.doc.tables[1].rows[-1].cells[0].text.strip(), 'Total periods per week')
```

Also, in the existing `TemplatePage11.test_certificate_lines_match_form`, change the expected Place line to `'Place: {{PLACE}}Signature of the reported on officer'` (unchanged text; runs are split but `paragraph.text` is the same) — no edit needed; confirm it still passes after Step 4.

- [ ] **Step 2: Run** `python -m unittest tests.test_template` → the three new tests FAIL.

- [ ] **Step 3: Write `tools/tokenise_template.py`**

```python
"""One-time: put named {{TOKENS}} into the answer spots of the cover page, Part I, Part II and the teacher's
certificate in ACR_EMPLOYEE_MASTER.docx, and repair wording left over from a filled ACR.

Spec: docs/superpowers/specs/2026-09-27-profile-part1-part2-to-word-design.md, section 6.
Every step checks what it finds first. Nothing is saved unless every step succeeds, and the script refuses to run
on a template that already has {{FULL_NAME}}.
"""
import re
from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import RGBColor
from docx.text.run import Run

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'
TOKEN_RE = re.compile(r'\{\{[A-Z0-9_]+\}\}')

# (how to find the label line, where the answer spot is, token)
#   'same': first blank blue run on the label's own line
#   'next': first blank blue run on one of the next 3 lines
SPOTS = [
    (('contains', 'Appraisal of work and conduct'), 'same', '{{FULL_NAME}}'),
    (('contains', 'Full Name (in Capital letter)'), 'same', '{{FULL_NAME}}'),
    (('startswith', 'Father/'), 'same', '{{FATHER_HUSBAND}}'),
    (('exact', 'Employee Code'), 'same', '{{EMPLOYEE_CODE}}'),
    (('contains', 'Subject for which Appointed'), 'same', '{{SUBJECT}}'),
    (('contains', 'Date of appointment(in College Cadre)'), 'same', '{{APPOINTMENT_DATE}}'),
    (('contains', 'Current Designation'), 'same', '{{DESIGNATION}}'),
    (('contains', 'Present Pay Band with Grade Pay'), 'same', '{{PAY_INFO}}'),
    (('contains', 'Date of Promotion'), 'same', '{{PROMOTION}}'),
    (('startswith', 'Academic'), 'same', '{{ACADEMIC_QUAL}}'),
    (('exact', 'Professional'), 'same', '{{PROFESSIONAL_QUAL}}'),
    (('contains', 'Research Degree'), 'same', '{{RESEARCH_DEGREE}}'),
    (('contains', 'In words'), 'same', '{{DOB_WORDS}}'),
    (('contains', 'Permanent/Quasi-permanent'), 'same', '{{SERVICE_STATUS}}'),
    (('contains', 'College/Colleges in which served'), 'same', '{{COLLEGES_SERVED}}'),
    (('contains', 'Roll no (with session)'), 'same', '{{DEPT_EXAM}}'),
    (('contains', 'Any other major assignment'), 'same', '{{OTHER_ASSIGNMENT}}'),
    (('contains', 'Permanent Address (With Pin code)'), 'same', '{{ADDR1}}'),
    (('contains', 'Mobile No.'), 'same', '{{MOBILE}}'),
    (('contains', 'Email'), 'same', '{{EMAIL}}'),
    (('contains', 'What do you think has been your most important contribution'), 'next', '{{P17}}'),
    (('contains', 'Have you made any contribution in the area of work not assigned'), 'next', '{{P18}}'),
    (('contains', 'Any special effort made to improve class room'), 'next', '{{P19B}}'),
    (('contains', 'Which new books relating to your subject'), 'next', '{{P19F}}'),
    (('contains', 'What are the vital problems of teaching'), 'next', '{{P19G}}'),
    (('contains', 'Are you doing any Research work'), 'next', '{{RESEARCH_YES_NO}}'),
    (('contains', 'Are you satisfied with your present position'), 'same', '{{P24_SATISFIED}}'),
    (('contains', 'If not, do you want to change the profession'), 'next', '{{P24_REASONS}}'),
]
TITLE_PIECES = {'Dr.': ['Dr.'], '/Shri/': ['/', 'Shri', '/'], 'Smt': ['Smt'], '/Kumari': ['/', 'Kumari']}
RELATION_PIECES = {'Father/': ['Father', '/'], 'Husband': ['Husband']}


def fail(msg):
    raise SystemExit(msg + ' Nothing changed.')


def text(el):
    return ''.join(t.text or '' for t in el.iter(qn('w:t')))


def colour(r):
    rpr = r.find(qn('w:rPr'))
    c = rpr.find(qn('w:color')) if rpr is not None else None
    return (c.get(qn('w:val')) or '').upper() if c is not None else ''


def blank_blue_runs(p):
    return [r for r in p.iter(qn('w:r')) if colour(r) == '0000CC' and r.find(qn('w:t')) is not None and not text(r)]


def set_run_text(r, s):
    ts = list(r.iter(qn('w:t')))
    ts[0].text = s
    ts[0].set(qn('xml:space'), 'preserve')
    for t in ts[1:]:
        t.text = ''


def t_el(s):
    t = OxmlElement('w:t')
    t.set(qn('xml:space'), 'preserve')
    t.text = s
    return t


def new_run(rpr, children, blue=False, unstrike=False):
    r = OxmlElement('w:r')
    if rpr is not None:
        r.append(deepcopy(rpr))
    for c in children:
        r.append(c)
    if blue:
        Run(r, None).font.color.rgb = RGBColor(0, 0, 0xCC)
    if unstrike and r.find(qn('w:rPr')) is not None:
        s = r.find(qn('w:rPr')).find(qn('w:strike'))
        if s is not None:
            s.getparent().remove(s)
    return r


def matches(p, how, label):
    t = text(p).strip()
    return {'contains': label in t, 'startswith': t.startswith(label), 'exact': t == label}[how]


def one_para(paras, how, label):
    hits = [i for i, p in enumerate(paras) if matches(p, how, label)]
    if len(hits) != 1:
        fail(f'Expected exactly one line matching {how} "{label}", found {len(hits)}.')
    return hits[0]


def put_token_in_spots(paras):
    for (how, label), where, token in SPOTS:
        i = one_para(paras, how, label)
        if where == 'next':
            for j in range(i + 1, min(i + 4, len(paras))):
                if blank_blue_runs(paras[j]):
                    i = j
                    break
            else:
                fail(f'No blank answer spot within 3 lines after "{label}".')
        spots = blank_blue_runs(paras[i])
        if not spots:
            fail(f'No blank answer spot on the line of "{label}".')
        set_run_text(spots[0], token)


def cover_college(paras):
    i = one_para(paras, 'contains', 'Name of the College through which ACR is submitted')
    p = paras[i]
    spots = blank_blue_runs(p)
    after_break = None
    seen_br = False
    for el in p.iter():
        if el.tag == qn('w:br'):
            seen_br = True
        elif el.tag == qn('w:r') and seen_br and el in spots:
            after_break = el
            break
    if not spots or after_break is None or after_break is spots[0]:
        fail('Cover page college line: expected a blank spot before and after the line break.')
    set_run_text(spots[0], '{{COLLEGE_NAME}}')
    set_run_text(after_break, '{{COLLEGE_PLACE}}')


def replace_single_t(body, test, new, what):
    hits = [t for t in body.iter(qn('w:t')) if test(t.text or '')]
    if len(hits) != 1:
        fail(f'Expected exactly one text piece for {what}, found {len(hits)}.')
    hits[0].text = new(hits[0].text)
    hits[0].set(qn('xml:space'), 'preserve')


def restructure(paras, how, label, pieces):
    p = paras[one_para(paras, how, label)]
    runs = [r for r in p.findall(qn('w:r')) if text(r) in pieces]
    if sorted(text(r) for r in runs) != sorted(pieces):
        fail(f'Line "{label}": expected runs {sorted(pieces)}, found {sorted(text(r) for r in runs)}.')
    for r in runs:
        rpr = r.find(qn('w:rPr'))
        for piece in pieces[text(r)]:
            r.addprevious(new_run(rpr, [t_el(piece)], unstrike=True))
        p.remove(r)


def isolate_tokens(body):
    """Split runs so that every {{TOKEN}} is alone in its own blue run (other text keeps its formatting)."""
    while True:
        for r in body.iter(qn('w:r')):
            kids = [c for c in r if c.tag != qn('w:rPr')]
            hit = next(((i, k) for i, k in enumerate(kids) if k.tag == qn('w:t') and TOKEN_RE.search(k.text or '')), None)
            if hit is None:
                continue
            i, k = hit
            m = TOKEN_RE.search(k.text)
            if len(kids) == 1 and k.text == m.group(0) and colour(r) == '0000CC':
                continue
            rpr = r.find(qn('w:rPr'))
            before = kids[:i] + ([t_el(k.text[:m.start()])] if m.start() > 0 else [])
            after = ([t_el(k.text[m.end():])] if m.end() < len(k.text) else []) + kids[i + 1:]
            if before:
                r.addprevious(new_run(rpr, before))
            r.addprevious(new_run(rpr, [t_el(m.group(0))], blue=True))
            if after:
                r.addprevious(new_run(rpr, after))
            r.getparent().remove(r)
            break
        else:
            return


def main():
    doc = Document(MASTER)
    body = doc.element.body
    if '{{FULL_NAME}}' in text(body):
        fail('The template already has {{FULL_NAME}}; it has been tokenised before.')
    paras = list(body.iter(qn('w:p')))

    # Point 25's spot wrongly holds {{OTHER_ASSIGNMENT}} (point 14's content): give it its own token first.
    i25 = one_para(paras, 'contains', 'Any other significant point which is not covered')
    t25 = [t for p in paras[i25 + 1:i25 + 3] for t in p.iter(qn('w:t')) if (t.text or '').strip() == '{{OTHER_ASSIGNMENT}}']
    if len(t25) != 1:
        fail('Point 25: expected {{OTHER_ASSIGNMENT}} in its answer spot.')
    t25[0].text = '{{P25}}'

    cover_college(paras)
    put_token_in_spots(paras)

    lp = paras[one_para(paras, 'contains', 'Land line telephone')]
    lines = [r for r in lp.findall(qn('w:r')) if text(r) == '__________________']
    if len(lines) != 1:
        fail('Point 16: expected the ______ line after "Land line telephone No.:".')
    set_run_text(lines[0], '{{LANDLINE}}')

    replace_single_t(body, lambda s: s.startswith('Exempted vide Director of Higher Education letter no.:') and '{{HINDI_DETAILS}}' in s,
                     lambda s: 'b) Hindi subject : Cleared / exempted (mention details) {{HINDI_DETAILS}}', 'point 13(b)')
    replace_single_t(body, lambda s: '{{OTHER_INFO}}' in s, lambda s: s.replace('{{OTHER_INFO}}', ''), 'the unused {{OTHER_INFO}}')
    dp = paras[one_para(paras, 'contains', '{{REPORT_DATE}}')]
    des = [t for t in dp.iter(qn('w:t')) if (t.text or '') == 'Designation,']
    if len(des) != 1:
        fail('Teacher\'s certificate: expected "Designation," on the date line.')
    des[0].text = 'Designation, {{CERT_DESIGNATION}}'
    des[0].set(qn('xml:space'), 'preserve')

    restructure(paras, 'contains', 'Appraisal of work and conduct', TITLE_PIECES)
    restructure(paras, 'startswith', 'Father/', RELATION_PIECES)

    last = doc.tables[1].rows[-1]
    if last.cells[0].text.strip() or len(doc.tables[1].rows) != 7:
        fail('19(a): expected an empty label cell in the last row of table 1.')
    last.cells[0].paragraphs[0].add_run('Total periods per week')

    isolate_tokens(body)
    doc.save(MASTER)
    print('Tokenised the template: cover page, points 1-25, point 16 landline, 13(b) wording, certificate designation,')
    print('unstruck title/relation options, 19(a) total label.')


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run it twice, then the tests**
Run: `python tools/tokenise_template.py` → prints "Tokenised the template…". Second run → "…already has {{FULL_NAME}}… Nothing changed." Then `python -m unittest discover -s tests -v` → template tests PASS (generator tests may fail until Task 3 — note which).

- [ ] **Step 5: Commit**
```bash
git add tools/tokenise_template.py tests/test_template.py ACR_EMPLOYEE_MASTER.docx
git commit -m "feat: named tokens for the cover page, Part I and Part II answer spots in the Word template"
```

---

### Task 3: Generator fills everything from the app's file

**Files:** modify `generate_acr.py`, `tests/test_generate_api.py`; create `tests/test_generate_parts.py`.

**Interfaces:** Consumes Task 1 (`token_values`, `part_tables`, `field_problems`, `TITLES`, `RELATIONS`) and Task 2 (tokenised template). Produces `ProblemsError(problems)` (alias `ApiProblemsError` kept), `generate(data, out)` unchanged signature.

- [ ] **Step 1: Write the failing test `tests/test_generate_parts.py`**

```python
import json, shutil, sys, tempfile, unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generate_acr  # noqa: E402

FULL = json.loads((ROOT / 'tests' / 'fixtures' / 'full_record.acr.json').read_text(encoding='utf-8'))


class GenerateParts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        generate_acr.generate(FULL, cls.tmp / 'full.docx')
        cls.doc = Document(cls.tmp / 'full.docx')
        cls.paras = [p.text for p in cls.doc.paragraphs]
        cls.text = '\n'.join(cls.paras)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def on_line(self, label, value):
        lines = [t for t in self.paras if label in t and value in t]
        self.assertTrue(lines, f'no line with "{label}" and "{value}"')

    def between(self, before, value, after):
        a = self.text.index(before)
        v = self.text.index(value, a)
        self.assertLess(v, self.text.index(after, a), value)

    def test_same_line_values(self):
        for label, value in [
            ('Name of the College through which ACR is submitted', 'Govt College Alpha'),
            ('Name of the College through which ACR is submitted', 'District Beta, 171001'),
            ('Submitted for the year/session', '2031-32'),
            ('Appraisal of work and conduct', 'ASHA DEVI'),
            ('Full Name (in Capital letter)', 'ASHA DEVI'),
            ('Father/Husband', 'RAM LAL'),
            ('Employee Code', 'EC-4321'),
            ('Subject for which Appointed', 'Chemistry'),
            ('Date of appointment', '01/07/2012'),
            ('Current Designation', 'Associate Professor'),
            ('Present Pay Band with Grade Pay', 'Level 13A; Basic Pay 131400'),
            ('Date of Promotion', 'No promotion'),
            ('Academic', 'M.Sc. Chemistry First Division'),
            ('Professional', 'NET'),
            ('Research Degree', 'Ph.D Chemistry'),
            ('In words', 'Fifth November Nineteen Hundred Eighty'),
            ('College/Colleges in which served', 'Govt College Alpha: 01/04/2031 to 31/03/2032'),
            ('Roll no (with session)', 'Roll 12345, 2014'),
            ('b) Hindi subject : Cleared / exempted (mention details)', 'Cleared 2013'),
            ('Any other major assignment', 'Bursar'),
            ('Permanent Address (With Pin code)', 'House 12'),
            ('Land line telephone', '01972-222333'),
            ('Land line telephone', '+919800000001'),
            ('Email', 'asha@example.org'),
            ('Place: ', 'Govt College Alpha, 171001'),
            ('Date: ', '15/05/2032'),
            ('Designation, ', 'Associate Professor'),
            ('Name of the Principal: ', 'Dr Principal Gamma'),
            ('(PBAS) FOR THE SESSION/YEAR', '2031-32'),
        ]:
            with self.subTest(label=label, value=value):
                self.on_line(label, value)
        self.assertTrue([t for t in self.paras if 'Permanent/Quasi-permanent' in t and t.strip().endswith('Permanent')])
        self.assertTrue([t for t in self.paras if 'Are you satisfied with your present position' in t and t.strip().endswith('No')])

    def test_answers_below_questions(self):
        self.between('Permanent Address (With Pin code)', 'Ward 3', 'Land line telephone')
        self.between('Permanent Address (With Pin code)', 'Town Delta, PIN 176001', 'Land line telephone')
        self.between('most important contribution', 'Contribution line 1\nContribution line 2', 'not assigned to you')
        self.between('not assigned to you', 'Unassigned work', 'Weekly time table')
        self.between('special effort made to improve class room', 'Special effort', 'How many assignments')
        self.between('Which new books', 'Book A - extract', 'vital problems')
        self.between('vital problems', 'Problem 1\nProblem 2', 'Details of Last year')
        self.between('fresh academic / professional qualifications', 'No fresh degree this year', 'Academic Staff College')
        self.between('Are you doing any Research work', 'Yes', 'Did you receive any honour')
        self.between('Did you receive any honour', 'Best teacher award', 'Are you satisfied')
        self.between('If not, do you want to change the profession', 'Want promotion', 'Any other significant point')
        self.between('Any other significant point', 'Other point', 'PART-II: SECTION-II')

    def test_tables(self):
        T = self.doc.tables
        cells = lambda t, r: [c.text.strip() for c in T[t].rows[r].cells]
        self.assertEqual(cells(0, 0), list('05111980'))
        self.assertEqual(cells(1, 1), ['1', 'B.Sc. I', 'GCA', '6', '150', '100%'])
        self.assertEqual(cells(1, 2), ['2', 'B.Sc. II', 'GCA', '6', '140', '95%'])
        self.assertEqual(cells(1, len(T[1].rows) - 1)[0], 'Total periods per week')
        self.assertEqual(cells(1, len(T[1].rows) - 1)[3], '24')
        self.assertEqual(cells(2, 1), ['1', 'B.Sc. I', '4', '2', ''])
        self.assertEqual(cells(3, 1), ['Chem Quiz', 'Inter-class quiz'])
        self.assertEqual(cells(4, 3), ['B.Sc. III', '1 year', '40', '38', '95', '88.5', '+6.5', '+6.5', '10', '20', '8', '2', ''])
        self.assertEqual(cells(5, 1), ['Refresher in Chemistry, UGC', 'HRDC Shimla', '21 days', 'RC-7'])
        self.assertEqual(cells(6, 1), ['Green synthesis', 'HPU', 'Minor', 'Ongoing'])
        self.assertEqual(cells(24, 1), ['1', 'Reviewer for journal X'])

    def test_no_token_left_and_enclosures(self):
        full = ' '.join(t.text or '' for t in self.doc.element.body.iter(qn('w:t')))
        self.assertNotIn('{{', full)
        i = self.paras.index('☑ 1. Certificate / sanction order')
        self.assertTrue(self.paras[i + 1].startswith('I certify that the information provided'))
        self.assertNotIn('Degree / qualification certificate', full)

    def strikes(self, doc, start, options):
        p = [p for p in doc.paragraphs if p.text.startswith(start)][0]
        return {r.text: bool(r.font.strike) for r in p.runs if r.text in options}

    def test_strike_through_choices(self):
        self.assertEqual(self.strikes(self.doc, 'Appraisal of work and conduct', ('Dr.', 'Shri', 'Smt', 'Kumari')),
                         {'Dr.': True, 'Shri': True, 'Smt': False, 'Kumari': True})
        self.assertEqual(self.strikes(self.doc, 'Father/Husband', ('Father', 'Husband')), {'Father': True, 'Husband': False})
        out = self.tmp / 'none.docx'
        generate_acr.generate({'profile': {}}, out)
        d = Document(out)
        self.assertFalse(any(self.strikes(d, 'Appraisal of work and conduct', ('Dr.', 'Shri', 'Smt', 'Kumari')).values()))
        self.assertFalse(any(self.strikes(d, 'Father/Husband', ('Father', 'Husband')).values()))

    def test_entry_problems_block(self):
        out = self.tmp / 'bad.docx'
        with self.assertRaises(generate_acr.ProblemsError) as ctx:
            generate_acr.generate({'profile': {'dob': '31/02/1990'}}, out)
        self.assertEqual(ctx.exception.problems[0]['code'], 'BAD_DOB')
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Update `tests/test_generate_api.py`** — `test_place_line` now uses the profile:

```python
    def test_place_line(self):
        def place(profile):
            out = self.tmp / 'place.docx'
            generate_acr.generate({'profile': profile}, out)
            return [p.text.replace('\t', '') for p in Document(out).paragraphs if p.text.startswith('Place: ') and 'reported on officer' in p.text][0]
        self.assertEqual(place({}), 'Place: Signature of the reported on officer')
        self.assertEqual(place({'collegeName': 'Govt. College X'}), 'Place: Govt. College XSignature of the reported on officer')
        self.assertEqual(place({'collegeName': 'Govt. College X', 'collegePin': '171009'}), 'Place: Govt. College X, 171009Signature of the reported on officer')
```

- [ ] **Step 3: Run** `python -m unittest tests.test_generate_parts tests.test_generate_api` → FAIL.

- [ ] **Step 4: Edit `generate_acr.py`**

4a. Imports — after `from api_tally import …` add:
```python
from docx.oxml.ns import qn
from docx.text.run import Run
from acr_fields import token_values, part_tables, field_problems, TITLES, RELATIONS
```

4b. Replace the `class ApiProblemsError(Exception): …` block (class and its `__init__`) with:
```python
class ProblemsError(Exception):
    """The teacher's entries have problems; the ACR must not be generated."""
    def __init__(self, problems):
        self.problems = problems
        super().__init__('\n'.join(p['message'] for p in problems))


ApiProblemsError = ProblemsError  # earlier name, kept for callers
```

4c. In `replace_tokens`, after the first pass loop (`for tnode in root.xpath('.//w:t',namespaces=NS): …`) and before the "Second pass" comment, insert:
```python
    # Multi-line answers: turn each newline into a Word line break inside the same run.
    for tnode in root.xpath('.//w:t',namespaces=NS):
        if tnode.text and '\n' in tnode.text:
            parts=tnode.text.split('\n')
            tnode.text=parts[0]; tnode.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
            prev=tnode
            for part in parts[1:]:
                br=etree.Element(W+'br'); prev.addnext(br)
                t=etree.Element(W+'t'); t.set('{http://www.w3.org/XML/1998/namespace}space','preserve'); t.text=part
                br.addnext(t); prev=t
```

4d. Add these functions just above `def generate(`:
```python
def fill_part_tables(doc, t):
    """Point 10 digit boxes and the tables of points 19(a), 19(c), 19(d), 20, 21(ii), 22 and 30."""
    T = doc.tables
    _check(len(T[0].rows) == 1 and len(T[0].rows[0].cells) == 8, 0, 'the 8 date-of-birth boxes')
    for c, ch in enumerate(t['dob_digits'] or ' ' * 8):
        set_cell(doc, 0, 0, c, ch.strip())
    _check(_norm(T[1].rows[0].cells[0].text).startswith('Sr.'), 1, 'the 19(a) header')
    fill_between(doc, 1, 1, find_row(T[1], 0, 'Total periods per week'), t['teaching'])
    set_cell(doc, 1, find_row(T[1], 0, 'Total periods per week'), 3, t['total_periods'])
    _check(_norm(T[2].rows[0].cells[0].text).startswith('Sr.'), 2, 'the 19(c) header')
    fill_rows(doc, 2, t['assignments'], 1)
    _check(_norm(T[3].rows[0].cells[0].text).startswith('Titleoftheactivity'), 3, 'the 19(d) header')
    fill_rows(doc, 3, t['activities'], 1)
    _check(_norm(T[4].rows[2].cells[0].text) == '1', 4, 'the column-number row of point 20')
    fill_rows(doc, 4, t['results'], 3)
    _check(_norm(T[5].rows[0].cells[0].text).startswith('NameoftheSummer'), 5, 'the 21(ii) header')
    fill_rows(doc, 5, t['orientation'], 1)
    _check(_norm(T[6].rows[0].cells[0].text).startswith('Topictitle'), 6, 'the 22 header')
    fill_rows(doc, 6, t['research'], 1)
    _check(_norm(T[24].rows[0].cells[0].text) == 'S.No.', 24, 'the point 30 header')
    fill_rows(doc, 24, t['other_info'], 1)


def strike_unchosen(doc, starts_with, options, chosen):
    """Strike through the options not chosen (cover-page title, point 2 Father/Husband). Nothing chosen: none struck."""
    for p in doc.element.body.iter(qn('w:p')):
        if ''.join(x.text or '' for x in p.iter(qn('w:t'))).startswith(starts_with):
            runs = {''.join(x.text or '' for x in r.iter(qn('w:t'))): r for r in p.findall(qn('w:r'))}
            if not all(o in runs for o in options):
                raise RuntimeError(f'Template: "{starts_with}" line has no separate runs for {options}.')
            for o in options:
                Run(runs[o], None).font.strike = chosen in options and o != chosen
            return
    raise RuntimeError(f'Template: no line starting with "{starts_with}".')
```

4e. Replace the whole `generate()` function (from `def generate(data,out_docx):` up to the blank line before `if __name__=='__main__':`) with:
```python
def generate(data,out_docx):
    api=data.get('api') if isinstance(data.get('api'),dict) else {}
    result=tally(api)
    problems=field_problems(data)+result['problems']
    if problems:
        raise ProblemsError(problems)
    v=result['values']
    profile=data.get('profile') if isinstance(data.get('profile'),dict) else {}
    prepare_appendix_images()
    doc=Document(TEMPLATE)
    fill_part_tables(doc,part_tables(data))
    strike_unchosen(doc,'Appraisal of work and conduct',TITLES,profile.get('title'))
    strike_unchosen(doc,'Father/Husband',RELATIONS,profile.get('relation'))
    fill_api_tables(doc,api,v)
    # Replace tokens in XML after table edits.
    tmp=out_docx.with_suffix('.intermediate.docx')
    doc.save(tmp)
    replace_tokens(tmp,out_docx,token_values(data))
    tmp.unlink(missing_ok=True)
    # Enclosures: the checked items, numbered, just before the teacher's certificate.
    doc=Document(out_docx)
    selected=[x.get('label') for x in data.get('enclosures',[]) if isinstance(x,dict) and x.get('checked',True)]
    if selected:
        insert_at=None
        for p in doc.paragraphs:
            if p.text.strip().startswith('I certify that the information provided'):
                insert_at=p
                break
        if insert_at is not None:
            for idx,label in enumerate(selected,1):
                np=insert_at.insert_paragraph_before(f'☑ {idx}. {label}')
                for r in np.runs: r.font.color.rgb=BLUE
    # Append the three official instruction pages to reach the 30-page source format.
    for n in (28,29,30): add_page_break_image(doc, APPENDIX_DIR/f'page-{n}.png')
    doc.save(out_docx)
    return v
```
(Removed: the old `values={…}` block with `college.*` names, the old tables 1–6 code, the table 7 block that read the obsolete `part2.teaching`, and the old table 24 code.)

4f. In the CLI block replace `except ApiProblemsError as err:` with `except ProblemsError as err:` and the first message with `'ACR not generated. Fix these entries first:'`.

- [ ] **Step 5: Run all tests** — `python -m unittest discover -s tests -v` and `node --test tests/` → all PASS. If `test_tables` shows the point 20 variation twice as separate cells or once, inspect `T[4].rows[3]` merges and adjust only the expectation, never the numbers.

- [ ] **Step 6: Commit**
```bash
git add generate_acr.py tests/test_generate_parts.py tests/test_generate_api.py
git commit -m "feat: generator fills cover page, Part I, Part II, point 30 and certificate from the app's file"
```

---

### Task 4: App fields, tables, DOB words, notices

**Files:** modify `index.html`, `app.js`, `styles.css`, `sw.js`.

**Interfaces:** Consumes `parseDob`, `dobWords`, `fieldProblems`, `migrateDraft` (Task 1), `tally` (API).

- [ ] **Step 1: `index.html` edits** (exact replacements)

1. Replace
```html
            <label>Full name (CAPITAL)<input name="fullName"></label>
            <label>Father/Husband name<input name="fatherHusband"></label>
```
with
```html
            <label>Title<select name="title"><option value="">— choose —</option><option>Dr.</option><option>Shri</option><option>Smt</option><option>Kumari</option></select></label>
            <label>Full name (CAPITAL)<input name="fullName"></label>
            <label>Father or Husband<select name="relation"><option value="">— choose —</option><option>Father</option><option>Husband</option></select></label>
            <label>Father/Husband name<input name="fatherHusband"></label>
```
2. Replace `<label>Date of Birth<input name="dob" placeholder="DD/MM/YYYY"></label>` with
`<label>Date of Birth<input name="dob" placeholder="DD/MM/YYYY"><small id="dobWords" class="muted"></small></label>`
3. Replace `<label>Mobile<input name="mobile" inputmode="tel"></label>` with
```html
            <label>Land line telephone<input name="landline" inputmode="tel"></label>
            <label>Mobile<input name="mobile" inputmode="tel"></label>
```
4. Replace `<label>Email<input name="email" type="email"></label>` with
```html
            <label>Email<input name="email" type="email"></label>
            <label>Date of submission (teacher's certificate)<input name="submissionDate" placeholder="DD/MM/YYYY"></label>
```
5. After `<h2>Part II — Section I: Self Appraisal (17–25)</h2>` add `<p id="partLegacyNotice" class="warning hidden"></p>`.
6. Replace `<label>19(d). Academic activities organised in the college<textarea name="p19d" rows="4"></textarea></label>` with
```html
          <div class="section-heading"><div><h3>19(d). Academic activities organised in the college</h3></div><button type="button" class="secondary" data-add="activities">+ Add Activity</button></div>
          <div id="activityRows" class="repeatable"></div>
```
7. Replace `<label>21(ii). Orientation / Refresher / Summer School details<textarea name="p21ii" rows="4"></textarea></label>` with
```html
          <div class="section-heading"><div><h4>21(ii). Orientation / Refresher Course / Summer School attended during the year</h4></div><button type="button" class="secondary" data-add="orientation">+ Add Course</button></div>
          <div id="orientationRows" class="repeatable"></div>
```
8. Replace from `<label>Are you doing research work?<select name="researchYesNo"><option>Yes</option><option>No</option></select></label>` through the closing `</div>` of the following `<div class="grid two">…</div>` with
```html
          <label>Are you doing research work?<select name="researchYesNo"><option value="">— choose —</option><option>Yes</option><option>No</option></select></label>
          <div class="section-heading"><div><p class="muted">If yes, give the details (one row per project).</p></div><button type="button" class="secondary" data-add="research">+ Add Project</button></div>
          <div id="researchRows" class="repeatable"></div>
```
9. Replace `<label>24. Satisfaction with present position / pay<textarea name="p24" rows="4"></textarea></label>` with
```html
          <label>24. Are you satisfied with your present position / pay?<select name="p24Satisfied"><option value="">— choose —</option><option>Yes</option><option>No</option></select></label>
          <label>24. If not, do you want to change the profession? Give reasons.<textarea name="p24Reasons" rows="3"></textarea></label>
```
10. After `<section id="enclosures" class="section">` add
```html
        <div class="card">
          <div class="section-heading"><div><h2>30. Other Relevant Information</h2><p class="muted">Credentials, significant contributions, awards etc. not mentioned earlier.</p></div><button type="button" class="secondary" data-add="otherInfo">+ Add Item</button></div>
          <div id="otherInfoRows" class="repeatable"></div>
        </div>
```
11. Replace the Review card's warning paragraph (`<p class="warning">Final DOCX/PDF generation is intentionally not enabled in v0.1. …</p>`) with
```html
          <h3>Problems to fix before the ACR can be generated</h3>
          <ul id="reviewProblems" class="problems"></ul>
          <p class="muted">The Word ACR is made on a PC: Export Draft, then run <code>python generate_acr.py &lt;file&gt; -o ACR.docx</code>.</p>
```
12. Before `<template id="resultTemplate">` add
```html
  <template id="activityTemplate">
    <div class="repeat-row">
      <div><label>Title of the activity<input data-key="title"></label></div>
      <div><label>Brief detail of activity<textarea data-key="detail" rows="2"></textarea></label></div>
      <button type="button" class="danger remove-row">Remove</button>
    </div>
  </template>

  <template id="orientationTemplate">
    <div class="repeat-row">
      <div><label>Summer school / refresher / orientation course, with sponsoring agency<input data-key="course"></label></div>
      <div><label>Place of school / ASC<input data-key="place"></label></div>
      <div><label>Duration<input data-key="duration"></label></div>
      <div><label>RC / OC No. with title<input data-key="rcoc"></label></div>
      <button type="button" class="danger remove-row">Remove</button>
    </div>
  </template>

  <template id="researchTemplate">
    <div class="repeat-row">
      <div><label>Topic / title of research project<input data-key="title"></label></div>
      <div><label>University / institution registered with<input data-key="institution"></label></div>
      <div><label>Nature (Minor / Major / Doctoral / Post-doctoral)<input data-key="nature"></label></div>
      <div><label>Present status<input data-key="status"></label></div>
      <button type="button" class="danger remove-row">Remove</button>
    </div>
  </template>

  <template id="otherInfoTemplate">
    <div class="repeat-row">
      <div><label>Credential / contribution / award<textarea data-key="text" rows="2"></textarea></label></div>
      <button type="button" class="danger remove-row">Remove</button>
    </div>
  </template>
```

- [ ] **Step 2: `app.js` edits** (exact replacements)

1. After `import { initApiUi, renderApiLists, renderApiValues } from './api_ui.js';` add
`import { parseDob, dobWords, fieldProblems, migrateDraft } from './acr_fields.js';`
2. In the `state` line replace `results:[], api:emptyApi()` with `results:[], activities:[], orientation:[], research:[], otherInfo:[], api:emptyApi()`.
3. In `collectSimple`'s `const data={…}` replace `results:state.results};` with `results:state.results, activities:state.activities, orientation:state.orientation, research:state.research, otherInfo:state.otherInfo};`
4. In the profile field list replace `'fullName','fatherHusband',` with `'title','relation','fullName','fatherHusband',` and `'mobile','email','permanentAddress'` with `'landline','mobile','email','submissionDate','permanentAddress'`.
5. Replace `function applySimple(data){` with `function applySimple(raw){\n  const {data,notices}=migrateDraft(raw);`
6. In `applySimple` replace `state.results=data.results||[];` with `state.results=data.results||[]; state.activities=data.activities; state.orientation=data.orientation; state.research=data.research; state.otherInfo=data.otherInfo;`
7. Replace `renderRepeatables(); renderEnclosures(); renderApiLists(); showLegacyNotice(legacy);` with `renderRepeatables(); renderEnclosures(); renderApiLists(); showLegacyNotice(legacy); showPartNotice(notices); updateDobWords();`
8. Replace the `REPEAT_META` line with
```js
const REPEAT_META={teaching:{containerId:'teachingRows',templateId:'teachingTemplate'},assignments:{containerId:'assignmentRows',templateId:'assignmentTemplate'},results:{containerId:'resultRows',templateId:'resultTemplate'},activities:{containerId:'activityRows',templateId:'activityTemplate'},orientation:{containerId:'orientationRows',templateId:'orientationTemplate'},research:{containerId:'researchRows',templateId:'researchTemplate'},otherInfo:{containerId:'otherInfoRows',templateId:'otherInfoTemplate'}};
```
9. Replace the `function renderRepeatables(){…}` line with
`function renderRepeatables(){Object.entries(REPEAT_META).forEach(([collection,meta])=>renderCollection(collection,meta.templateId));}`
10. Replace `form.addEventListener('input',()=>{updateScores();saveLocal();});` with `form.addEventListener('input',()=>{updateScores();updateDobWords();saveLocal();});`
11. Replace `function renderReview(){const d=collectSimple();` with `function renderReview(){const d=collectSimple();renderFieldProblems(d);`
12. After the `function apiReviewItems(api){…}` line add
```js
function showPartNotice(notices){
  const el=$('partLegacyNotice');
  if(!notices.length){el.classList.add('hidden');el.textContent='';return;}
  el.textContent='This draft was saved by an older version. '+notices.join(' — ');
  el.classList.remove('hidden');
}
function updateDobWords(){
  const el=$('dobWords'); const r=parseDob(form.elements.dob.value);
  el.textContent=r.state==='ok'?`In words: ${dobWords(r)}`:(r.state==='bad'?'Not a real date — use DD/MM/YYYY':'');
  el.classList.toggle('over',r.state==='bad');
}
function renderFieldProblems(d){
  const ul=$('reviewProblems'); ul.innerHTML='';
  const probs=[...fieldProblems(d),...tally(d.api).problems];
  if(!probs.length){const li=document.createElement('li');li.className='ok';li.textContent='No problems. The ACR can be generated.';ul.appendChild(li);return;}
  for(const p of probs){const li=document.createElement('li');li.textContent=p.message;ul.appendChild(li);}
}
```
13. Check: `grep -n "p19d\|p21ii\|'p24'\|researchTitle" app.js index.html` → no output.

- [ ] **Step 3: `styles.css`** — append `#dobWords{display:block;margin-top:4px}` and `small.over{color:var(--danger);font-weight:600}`.

- [ ] **Step 4: `sw.js`** — `CACHE='acr-utility-v0-5'`; add `'./acr_fields.js'` to `ASSETS`.

- [ ] **Step 5: Syntax check** — `node --check app.js && node --check acr_fields.js && node --check sw.js`.

- [ ] **Step 6: Browser check** (serve with `python -m http.server 8765`; `playwright-cli`; fresh profile):
1. Profile: type DOB `05/11/1980` → "In words: Fifth November Nineteen Hundred Eighty"; `31/02/1990` → red "Not a real date…".
2. Review tab lists `Point 10: date of birth "31/02/1990" is not a real date (use DD/MM/YYYY).`; fix the date → "No problems. The ACR can be generated."
3. Part II: add a 19(d) activity, a 21(ii) course, a 22 project; Enclosures tab: add a point 30 item; reload → all still there.
4. Load an old draft: in the console run `localStorage.setItem('acrUtilityDraftV01', JSON.stringify({session:'2025-26', part2:{p19d:'Old 19d', researchTitle:'Old title'}}))`, reload → the Part II notice shows the 19(d) text and "22: your research details were moved…"; the 22 table has row 1 "Old title".
5. Console: no errors.

- [ ] **Step 7: Run all tests** — both suites PASS.

- [ ] **Step 8: Commit**
```bash
git add index.html app.js styles.css sw.js
git commit -m "feat: app fields and tables for the cover page, Part I, Part II and point 30"
```

---

### Task 5: End-to-end with the full record

- [ ] **Step 1:** Enter `tests/fixtures/full_record.acr.json` through the app's screens with a `playwright-cli run-code` script (fill each named input, select each dropdown, add each table row and fill it, tick the enclosure).
- [ ] **Step 2:** Read the saved draft (`localStorage.getItem('acrUtilityDraftV01')`) and compare `profile`, `part2` and the lists with the fixture field by field (numbers from number inputs may be numbers vs strings — compare as strings). Any difference → stop and fix the app.
- [ ] **Step 3:** Save it as `tests/out/full_from_app.acr.json`, run `python generate_acr.py tests/out/full_from_app.acr.json -o tests/out/full_from_app.docx`, convert with `tools/docx_to_pdf.ps1`, render pages 1–5 and 10–11 with `pdftoppm`, and compare with `UGC_ACR_Form.pdf` pages 1–6 and 11–12: every value in blue in its place, struck options correct, no `{{`, no layout breakage, long answers flow without overlapping.
- [ ] **Step 4:** Run both test suites; commit nothing new unless a fix was needed (commit fixes with a message naming what the check found).

---

## Self-review against the spec

| Spec item | Task |
|---|---|
| §1 R1–R5 | 1 (values), 2 (spots), 3 (generator), 4 (app), 5 (end-to-end) |
| §2 title/relation strike-through | 2 (unstruck separate runs), 3 (`strike_unchosen`), tests in 3 |
| §2 DOB words automatic and shown | 1 (both languages, shared cases), 4 (`updateDobWords`) |
| §2 tables 19(d), 21(ii), 22 + notice | 1 (`migrateDraft`), 4 (templates, notice) |
| §3 data keys | 1 (fixture), 4 (inputs, state, collect/apply) |
| §4 every row | 1 (`token_values`, `part_tables`), 2 (tokens), 3 (read-back test) |
| §5 DOB rules | 1 |
| §6 repairs 1–7 | 2 |
| §7 checks | 1 (`field_problems`/`fieldProblems`), 3 (block), 4 (Review list) |
| §8 tests | 1, 2, 3, 4 (browser), 5 (visual) |
| §9 out of scope | table 7 no longer filled from the obsolete `part2.teaching` (it was never filled from app files) — noted in Task 3 |

**Note beyond the spec:** the `researchYesNo` dropdown gets a blank "— choose —" first option (Task 4, edit 8) so that an unanswered question does not print "Yes" by default. The same applies to the new `p24Satisfied`, `title` and `relation` dropdowns.
