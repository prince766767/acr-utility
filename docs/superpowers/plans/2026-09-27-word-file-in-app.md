# Word File Made in the App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app builds the same ACR Word file as `generate_acr.py`, offline, on phones and PCs.

**Architecture:** `docx_engine.js` is a line-by-line port of `generate_acr.py`. It works on `word/document.xml` of the template through the standard DOM API: the browser's own `DOMParser`/`XMLSerializer` in the app, and `@xmldom/xmldom` in Node. It reproduces python-docx's rules for cells, text and run properties. The value rules come from the existing JS modules plus the remaining ports of `acr_fields.py`. The three appendix page images move into the template once, so neither engine adds images. A parity test builds the same records with both engines and compares every paragraph run.

**Tech Stack:** Vanilla ES modules; JSZip 3.10 (vendored for the app, npm dev dependency for tests); `@xmldom/xmldom` 0.9 (dev only); Node 24 `node:test`; Python 3.12 + python-docx 1.2 + `unittest`.

**Spec:** `docs/superpowers/specs/2026-09-27-word-file-in-app-design.md`

## Global Constraints

- Paths are relative to `C:\Users\princ\Downloads\ACR_Utility_v0_3\ACR_Utility_v0_3`.
- The app's file must equal the PC file for the same record (checked by `tests/test_parity.py`): the same paragraphs, and runs with the same text, colour, bold, strike-through, font and size.
- The engine refuses with `ProblemsError` exactly when the PC generator does, with the same problem list.
- The engine mirrors python-docx 1.2:
  - `doc.tables` = body-level tables;
  - `table.cell(r,c)` = the `_cells` grid (a gridSpan cell repeats; a vMerge-continue cell points to the cell above);
  - `row.cells` resolves continuation cells to the cell above;
  - run text maps `t`, `tab`/`ptab` to `\t`, and `br` (textWrapping) / `cr` to `\n`;
  - setting run text writes `w:t`/`w:tab`/`w:br` pieces, with `xml:space="preserve"` when the text has leading or trailing space;
  - colour setting removes the old `w:color`;
  - strike True = `<w:strike/>`, False = `<w:strike w:val="0"/>`;
  - run properties go in the schema order.
- No internet needed at run time; nothing from npm is shipped except the vendored `jszip.min.js`.
- Git: branch `feature/word-in-app`; commit after each task (the user asked for commits in this workflow).

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/bake_appendix_pages.py` (create) | One-time: append appendix pages 28–30 to the template. |
| `generate_acr.py` (modify) | Stop appending pages (moved into the template). |
| `api_tally.js` (modify) | Export `LEVEL_TEXT`, `scoreText`. |
| `acr_fields.js` (modify) | Add `variation`, `tokenValues`, `partTables`, `TITLES`, `RELATIONS`, `TOKENS`. |
| `docx_engine.js` (create) | `generateDocx`, `ProblemsError`: the port of `generate_acr.py`. |
| `tools/make_docx_js.mjs` (create) | Node CLI for the parity test. |
| `vendor/jszip.min.js` (create, copied) | JSZip for the app. |
| `index.html`, `app.js`, `sw.js`, `styles.css`, `package.json`, `.gitignore` (modify) | Button, help text, offline cache, dev dependencies. |
| `tests/fixtures/variation_cases.json` (create) | Shared variation cases. |
| `tests/acr_fields_more.test.js`, `tests/docx_engine.test.js` (create) | Node tests. |
| `tests/test_template.py`, `tests/test_acr_fields.py` (modify), `tests/test_parity.py` (create) | Python tests. |

---

### Task 0: Branch

- [ ] `git checkout -b feature/word-in-app`; commit the spec and this plan:
```bash
git add docs/superpowers/specs/2026-09-27-word-file-in-app-design.md docs/superpowers/plans/2026-09-27-word-file-in-app.md
git commit -m "docs: spec and plan for making the Word file in the app"
```

---

### Task 1: Appendix pages into the template

**Files:** create `tools/bake_appendix_pages.py`; modify `generate_acr.py`, `tests/test_template.py`, `tests/test_generate_api.py`.

- [ ] **Step 1: Failing tests.** Add to `tests/test_template.py` (new class before `if __name__ == '__main__':`):
```python
class TemplateAppendixPages(unittest.TestCase):
    def test_ends_with_three_full_page_images(self):
        from docx.oxml.ns import qn
        doc = Document(ROOT / 'ACR_EMPLOYEE_MASTER.docx')
        paras = [el for el in doc.element.body if el.tag == qn('w:p')]
        blip = '{http://schemas.openxmlformats.org/drawingml/2006/main}blip'
        # each page is a section-break paragraph followed by the picture paragraph
        self.assertEqual([len(list(p.iter(blip))) for p in paras[-6:]], [0, 1, 0, 1, 0, 1])
        self.assertAlmostEqual(doc.sections[-1].page_width.inches, 8.27, places=2)
        self.assertEqual(doc.sections[-1].left_margin, 0)
```
Add to `tests/test_generate_api.py` class `GenerateApi`:
```python
    def test_generator_adds_no_pages(self):
        blip = '{http://schemas.openxmlformats.org/drawingml/2006/main}blip'
        count = lambda d: len(list(d.element.body.iter(blip)))
        self.assertEqual(count(self.doc), count(Document(ROOT / 'ACR_EMPLOYEE_MASTER.docx')))
```
Run `python -m unittest discover -s tests` → both FAIL.

- [ ] **Step 2: Write `tools/bake_appendix_pages.py`**
```python
"""One-time: append the official instruction pages 28-30 (appendix_pages/page-*.png) to ACR_EMPLOYEE_MASTER.docx as
full-page image sections, with exactly the code generate_acr.py used to append them to every generated file.
The generators then no longer add them (so the app's generator needs no image handling).
Refuses to run if the template already ends with a picture.
"""
from pathlib import Path
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

HERE = Path(__file__).resolve().parents[1]
MASTER = HERE / 'ACR_EMPLOYEE_MASTER.docx'
BLIP = '{http://schemas.openxmlformats.org/drawingml/2006/main}blip'


def add_page_break_image(doc, path):
    sec = doc.add_section(WD_SECTION.NEW_PAGE)
    sec.page_width = Inches(8.27); sec.page_height = Inches(11.69)
    sec.top_margin = Inches(0); sec.bottom_margin = Inches(0); sec.left_margin = Inches(0); sec.right_margin = Inches(0)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0); p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(str(path), width=Inches(8.27), height=Inches(11.69))


def main():
    doc = Document(MASTER)
    paras = [el for el in doc.element.body if el.tag == qn('w:p')]
    if paras and list(paras[-1].iter(BLIP)):
        raise SystemExit('The template already ends with a picture; nothing changed.')
    for n in (28, 29, 30):
        add_page_break_image(doc, HERE / 'appendix_pages' / f'page-{n}.png')
    doc.save(MASTER)
    print('Appended appendix pages 28-30 to the template.')


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: `generate_acr.py`**: delete the functions `add_page_break_image` and `prepare_appendix_images` (whole bodies); in `generate()` delete the line `    prepare_appendix_images()` and the two lines
```python
    # Append the three official instruction pages to reach the 30-page source format.
    for n in (28,29,30): add_page_break_image(doc, APPENDIX_DIR/f'page-{n}.png')
```
- [ ] **Step 4:** `python tools/bake_appendix_pages.py` (twice: the second refuses); run all tests → PASS.
- [ ] **Step 5:** Regenerate `DEMO_Acr_generated.docx/.pdf` as in the earlier task (full record + API worked example; `tools/docx_to_pdf.ps1`) and confirm the PDF still has 30 pages with pages 28–30 as images.
- [ ] **Step 6: Commit**
```bash
git add tools/bake_appendix_pages.py generate_acr.py ACR_EMPLOYEE_MASTER.docx tests/test_template.py tests/test_generate_api.py DEMO_Acr_generated.docx DEMO_Acr_generated.pdf
git commit -m "refactor: appendix pages 28-30 live in the template instead of being appended per file"
```

---

### Task 2: Remaining field rules in JS

**Files:** modify `api_tally.js`, `acr_fields.js`, `tests/test_acr_fields.py`; create `tests/fixtures/variation_cases.json`, `tests/acr_fields_more.test.js`.

**Interfaces (produced):** `api_tally.js`: `LEVEL_TEXT`, `scoreText(v)`. `acr_fields.js`: `TITLES`, `RELATIONS`, `TOKENS`, `variation(c, u)`, `tokenValues(data)`, `partTables(data)`, with the same results as `acr_fields.py` (`dob_digits`, `total_periods`, `other_info` keys kept in snake case to match).

- [ ] **Step 1: `tests/fixtures/variation_cases.json`**
```json
[
  [92.5, 88, "+4.5"], [80, "85.25", "-5.25"], ["90", "90", "0"], ["", 50, ""], ["100", "0", "+100"],
  ["33.333", "33.33", "0"], ["66.667", "66.66", "+0.01"], ["abc", 50, ""], ["-5", "5", "-10"],
  ["0.005", "0", "+0.01"], ["0", "0.005", "-0.01"], [" 70 ", "69.99", "+0.01"], [null, "1", ""], ["10.10", "0.1", "+10"]
]
```
- [ ] **Step 2: Failing tests.** In `tests/test_acr_fields.py` add to class `Variation`:
```python
    def test_shared_cases(self):
        cases = json.loads((ROOT / 'tests' / 'fixtures' / 'variation_cases.json').read_text(encoding='utf-8'))
        for c, u, expected in cases:
            with self.subTest(c=c, u=u):
                self.assertEqual(variation(c, u), expected)
```
Create `tests/acr_fields_more.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { variation, tokenValues, partTables, TOKENS } from '../acr_fields.js';

const read = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const FULL = read('full_record.acr.json');

for (const [c, u, expected] of read('variation_cases.json')) {
  test(`variation ${JSON.stringify(c)} - ${JSON.stringify(u)}`, () => assert.strictEqual(variation(c, u), expected));
}

test('tokenValues on the full record (same as test_acr_fields.py)', () => {
  const v = tokenValues(FULL);
  assert.deepStrictEqual(Object.keys(v), TOKENS);
  assert.strictEqual(v.COLLEGE_PLACE, 'District Beta, 171001');
  assert.strictEqual(v.PAY_INFO, 'Level 13A; Basic Pay 131400');
  assert.strictEqual(v.PROMOTION, 'No promotion');
  assert.strictEqual(v.DOB_WORDS, 'Fifth November Nineteen Hundred Eighty');
  assert.deepStrictEqual([v.ADDR1, v.ADDR2, v.ADDR3], ['House 12', 'Ward 3', 'Town Delta, PIN 176001']);
  assert.strictEqual(v.PLACE, 'Govt College Alpha, 171001');
  assert.strictEqual(v.P17, 'Contribution line 1\nContribution line 2');
});

test('tokenValues on an empty record and partial joins', () => {
  assert.ok(Object.values(tokenValues({})).every(x => x === ''));
  const v = tokenValues({ profile: { basicPay: '5000', collegePin: '171001', promotionDate: 'P' } });
  assert.deepStrictEqual([v.PAY_INFO, v.COLLEGE_PLACE, v.PLACE, v.PROMOTION], ['Basic Pay 5000', '171001', '171001', 'P']);
});

test('partTables on the full record (same as test_acr_fields.py)', () => {
  const t = partTables(FULL);
  assert.strictEqual(t.dob_digits, '05111980');
  assert.deepStrictEqual(t.teaching, [['1', 'B.Sc. I', 'GCA', '6', '150', '100%'], ['2', 'B.Sc. II', 'GCA', '6', '140', '95%']]);
  assert.strictEqual(t.total_periods, '24');
  assert.deepStrictEqual(t.assignments, [['1', 'B.Sc. I', '4', '2', '']]);
  assert.deepStrictEqual(t.results, [['B.Sc. III', '1 year', '40', '38', '95', '88.5', '+6.5', '+6.5', '10', '20', '8', '2', '']]);
  assert.deepStrictEqual(t.other_info, [['1', 'Reviewer for journal X']]);
  const e = partTables({ teaching: [{}, { classCourse: 'X', syllabusPct: '80%' }], otherInfo: [{ text: ' ' }, { text: 'Y' }] });
  assert.deepStrictEqual([e.teaching, e.other_info, e.dob_digits], [[['1', 'X', '', '', '', '80%']], [['1', 'Y']], '']);
});
```
Run both suites → the JS test FAILS (missing exports); the Python variation cases PASS (Python already correct — they pin the expected values).

- [ ] **Step 3: Append to `api_tally.js`**
```js

// Printed in the "Whether international/National/State..." column of 28 E(ii) and E(iii).
export const LEVEL_TEXT = { E2a: 'International', E2b: 'National', E2c: 'Regional / State', E2d: 'Local - University / College',
  E3a: 'International', E3b: 'National' };

export function scoreText(v) {
  const r = toCents(v);
  return r.state === 'ok' ? fmt(r.cents) : '';
}
```
- [ ] **Step 4: Append to `acr_fields.js`**
```js

// ---- Word-file values: ports of acr_fields.py (token_values, part_tables, variation) ----
import { isEmptyEntry } from './api_tally.js';

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
    COLLEGE_PLACE: joinFilled([p.collegeDistrict, p.collegePin]),
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
    COLLEGES_SERVED: s(a.p12),
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
        !pct || pct.endsWith('%') ? pct : pct + '%'];
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
```
(`obj`, `NUM_RE`, `parseDob` and `dobWords` already exist in `acr_fields.js`; the `import` line moves to the top of the file together with the existing imports if a linter complains — ES modules allow imports anywhere at top level.)

- [ ] **Step 5:** Run both suites → PASS. Also a random JS/Python comparison of `variation` on 5,000 generated pairs (as done for the tallies) → 0 mismatches.
- [ ] **Step 6: Commit**
```bash
git add api_tally.js acr_fields.js tests/fixtures/variation_cases.json tests/acr_fields_more.test.js tests/test_acr_fields.py
git commit -m "feat: token values, table rows and point 20 variation in JS (ports of acr_fields.py)"
```

---

### Task 3: The engine and the parity test

**Files:** create `docx_engine.js`, `tools/make_docx_js.mjs`, `tests/docx_engine.test.js`, `tests/test_parity.py`; modify `package.json`, `.gitignore`.

- [ ] **Step 1: Dev dependencies**
```bash
npm install --save-dev jszip@3.10.1 @xmldom/xmldom@0.9.8
```
Add `node_modules/` to `.gitignore`.

- [ ] **Step 2: Failing tests**

`tests/docx_engine.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { generateDocx, ProblemsError } from '../docx_engine.js';

const read = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const TEMPLATE = readFileSync(new URL('../ACR_EMPLOYEE_MASTER.docx', import.meta.url));
const deps = { JSZip, DOMParser, XMLSerializer };

test('builds a Word file with the values and no tokens left', async () => {
  const data = { ...read('full_record.acr.json'), api: read('cases.json')[0].api };
  const out = await generateDocx(data, TEMPLATE, deps);
  const xml = await (await JSZip.loadAsync(out)).file('word/document.xml').async('string');
  assert.ok(!xml.includes('{{'));
  for (const s of ['ASHA DEVI', 'Fifth November Nineteen Hundred Eighty', '106.75', '131.75', '193', '☑ 1. Certificate / sanction order'])
    assert.ok(xml.includes(s), s);
});

test('refuses with the same problems as the PC generator', async () => {
  await assert.rejects(generateDocx({ profile: { dob: '31/02/1990' }, api: { c1: { classes: 60 } } }, TEMPLATE, deps),
    err => err instanceof ProblemsError && err.problems.map(p => p.code).join() === 'BAD_DOB,OVER_MAX');
});
```

`tests/test_parity.py`:
```python
"""The app's Word file (docx_engine.js) must be the same as generate_acr.py's for the same record."""
import json, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generate_acr  # noqa: E402

FIX = ROOT / 'tests' / 'fixtures'
FULL = json.loads((FIX / 'full_record.acr.json').read_text(encoding='utf-8'))
WORKED = json.loads((FIX / 'cases.json').read_text(encoding='utf-8'))[0]['api']
TOOL = ROOT / 'tools' / 'make_docx_js.mjs'


def copy(x):
    return json.loads(json.dumps(x))


def records():
    full = copy(FULL)
    full['api'] = dict(copy(WORKED), lastAcademicYear={'cat1': '90', 'cat2': '20', 'cat3': '12.5', 'source': 'typed'})
    long = copy(FULL)
    for k in ('p17', 'p18', 'p19b', 'p19f', 'p19g', 'p25'):
        long['part2'][k] = '\n'.join(f'{k} line {i}: a long answer that wraps over the printed line.' for i in range(1, 11))
    extra = copy(FULL)
    extra['teaching'] = [{'classCourse': f'C{i}', 'college': 'G', 'allocated': 6, 'delivered': 100 + i, 'syllabusPct': 90} for i in range(7)]
    extra['assignments'] = [{'classCourse': f'A{i}', 'assignments': i, 'tests': 1} for i in range(1, 6)]
    extra['activities'] = [{'title': f'T{i}', 'detail': f'D{i}\nsecond line'} for i in range(3)]
    extra['results'] = [{'className': f'R{i}', 'collegePct': str(80 + i), 'universityPct': '79.5'} for i in range(6)]
    extra['orientation'] = [{'course': f'O{i}', 'place': 'P', 'duration': '21 days', 'rcoc': f'RC-{i}'} for i in range(3)]
    extra['research'] = [{'title': f'Rs{i}', 'institution': 'U', 'nature': 'Minor', 'status': 'On'} for i in range(2)]
    extra['otherInfo'] = [{'text': f'Info {i}'} for i in range(3)]
    extra['api'] = {'c1': {'innovative': [{'description': f'm{i}', 'score': 3} for i in range(5)],
                           'exam': [{'type': f'd{i}', 'score': 4} for i in range(5)],
                           'resources': [{'course': f'c{i}'} for i in range(5)], 'resourcesScore': 12},
                    'c2': {'extension': [{'activity': f'e{i}', 'score': 4} for i in range(4)],
                           'professional': [{'activity': f'p{i}', 'score': 2.5} for i in range(3)]},
                    'c3': {'papers': [{'title': f't{i}', 'row': 'E2d', 'score': 3} for i in range(6)]}}
    no_title = copy(FULL)
    no_title['profile']['title'] = ''
    no_title['profile']['relation'] = ''
    return {'full': full, 'long_answers': long, 'extra_rows': extra, 'no_title': no_title, 'empty': {}}


def run_text(r):
    out = ''
    for el in r:
        tag = el.tag.split('}')[1]
        if tag == 't':
            out += el.text or ''
        elif tag in ('tab', 'ptab'):
            out += '\t'
        elif tag in ('br', 'cr'):
            out += '\n'
    return out


def run_props(r):
    rpr = r.find(qn('w:rPr'))
    def el(tag):
        return rpr.find(qn(tag)) if rpr is not None else None
    def onoff(tag):
        e = el(tag)
        return None if e is None else e.get(qn('w:val')) not in ('0', 'false')
    c, f, s = el('w:color'), el('w:rFonts'), el('w:sz')
    return (c.get(qn('w:val')) if c is not None else None, onoff('w:b'), onoff('w:strike'),
            f.get(qn('w:ascii')) if f is not None else None, s.get(qn('w:val')) if s is not None else None)


def dump(path):
    body = Document(path).element.body
    return [[(run_text(r),) + run_props(r) for r in p.findall(qn('w:r')) if run_text(r)] for p in body.iter(qn('w:p'))]


class Parity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def js(self, rec, name):
        src, out = self.tmp / f'{name}.json', self.tmp / f'{name}.js.docx'
        src.write_text(json.dumps(rec), encoding='utf-8')
        r = subprocess.run(['node', str(TOOL), str(src), str(out)], capture_output=True, text=True, cwd=ROOT)
        return r, out

    def test_same_document(self):
        for name, rec in records().items():
            with self.subTest(name):
                py = self.tmp / f'{name}.py.docx'
                generate_acr.generate(copy(rec), py)
                r, js = self.js(rec, name)
                self.assertEqual(r.returncode, 0, r.stderr)
                a, b = dump(py), dump(js)
                self.assertEqual(len(a), len(b), 'number of paragraphs')
                for i, (x, y) in enumerate(zip(a, b)):
                    self.assertEqual(x, y, f'paragraph {i}')

    def test_same_problems(self):
        rec = {'profile': {'dob': '31/02/1990'}, 'results': [{'collegePct': 'x'}],
               'api': {'c1': {'classes': 60}, 'lastAcademicYear': {'cat1': '1'}}}
        with self.assertRaises(generate_acr.ProblemsError) as ctx:
            generate_acr.generate(copy(rec), self.tmp / 'bad.py.docx')
        r, out = self.js(rec, 'bad')
        self.assertEqual(r.returncode, 2, r.stderr)
        self.assertEqual(json.loads(r.stdout), ctx.exception.problems)
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
```
Run → both FAIL (engine missing).

- [ ] **Step 3: Write `tools/make_docx_js.mjs`**
```js
// Builds an ACR Word file with the app's engine (docx_engine.js), for the parity test with generate_acr.py.
// Usage: node tools/make_docx_js.mjs <record.json> <out.docx>
// Exit code 2 with the problems as JSON on stdout when the record has problems (no file written).
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { generateDocx, ProblemsError } from '../docx_engine.js';

const [, , inPath, outPath] = process.argv;
const data = JSON.parse(readFileSync(inPath, 'utf8'));
const template = readFileSync(new URL('../ACR_EMPLOYEE_MASTER.docx', import.meta.url));
try {
  writeFileSync(outPath, await generateDocx(data, template, { JSZip, DOMParser, XMLSerializer }));
} catch (err) {
  if (err instanceof ProblemsError) {
    process.stdout.write(JSON.stringify(err.problems));
    process.exit(2);
  }
  throw err;
}
```

- [ ] **Step 4: Write `docx_engine.js`**
```js
// Builds the ACR Word file in the app, exactly as generate_acr.py does on a PC
// (spec docs/superpowers/specs/2026-09-27-word-file-in-app-design.md). It follows python-docx 1.2's rules for cells,
// text and run properties so that tests/test_parity.py finds the two files identical. Change both together.
import { tally, toCents, fmt, isEmptyEntry, lastYearProblems, lastYearCells, LEVEL_TEXT, scoreText } from './api_tally.js';
import { fieldProblems, tokenValues, partTables, TITLES, RELATIONS } from './acr_fields.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const BLUE = '0000CC';
const FORM_FONT = 'Times New Roman';
const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow',
  'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz',
  'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
  'specVanish', 'oMath'];
// Point 44 "API Score reported in self appraisal" cells: code -> [table, row, column, start of Max. Score text].
const P44_CELLS = {
  A1: [27, 3, 4, '15/'], A2: [27, 4, 4, '10/'], B1a: [27, 5, 4, '10/'], B1b: [27, 6, 4, '5/'],
  B2: [28, 0, 4, '10/'], B3a: [28, 1, 4, '50/'], B3b: [28, 2, 4, '25/'], B3c: [28, 3, 4, '15/'],
  C1a: [28, 4, 4, '20/'], C1b: [28, 5, 4, '15/'], C1c: [28, 6, 4, '10/'],
  C2: [29, 0, 5, '10/'], C3: [29, 1, 5, '20/'], C4: [29, 2, 5, '30/'],
  D1: [29, 3, 5, '3/'], D2a: [29, 4, 5, '10/'], D2b: [29, 5, 5, '7/'],
  E1a: [29, 6, 5, '20/'], E1b: [29, 7, 5, '10/'],
  E2a: [29, 8, 5, '10/'], E2b: [29, 9, 5, '7.5/'], E2c: [29, 10, 5, '5/'], E2d: [29, 11, 5, '3/'],
  E3a: [30, 0, 4, '10/'], E3b: [30, 1, 4, '5/'],
};

export class ProblemsError extends Error {
  constructor(problems) {
    super(problems.map(p => p.message).join('\n'));
    this.name = 'ProblemsError';
    this.problems = problems;
  }
}

// ---- XML helpers (namespace-aware; the browser DOM and @xmldom/xmldom both support these) ----
const isW = (n, local) => !!n && n.nodeType === 1 && n.namespaceURI === W && n.localName === local;
const kids = (el, local) => { const out = []; for (let n = el.firstChild; n; n = n.nextSibling) if (isW(n, local)) out.push(n); return out; };
const kid = (el, local) => (el ? kids(el, local)[0] || null : null);
const all = (el, local) => Array.from(el.getElementsByTagNameNS(W, local));
const wGet = (el, name) => (el.hasAttributeNS(W, name) ? el.getAttributeNS(W, name) : null);
const wSet = (el, name, value) => el.setAttributeNS(W, 'w:' + name, value);
const wEl = (xml, local) => xml.createElementNS(W, 'w:' + local);
const norm = s => (s || '').replace(/\s+/g, '');
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function setText(el, text) { while (el.firstChild) el.removeChild(el.firstChild); el.appendChild(el.ownerDocument.createTextNode(text)); }
function insertAfter(ref, el) { ref.parentNode.insertBefore(el, ref.nextSibling); return el; }
function check(ok, ti, what) {
  if (!ok) throw new Error(`Template table ${ti}: expected ${what}. The template layout has changed; nothing was written.`);
}

// ---- text, as python-docx reads it ----
function runText(r) {
  let s = '';
  for (let n = r.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1 || n.namespaceURI !== W) continue;
    const name = n.localName;
    if (name === 't') s += n.textContent;
    else if (name === 'tab' || name === 'ptab') s += '\t';
    else if (name === 'cr') s += '\n';
    else if (name === 'br') { const type = wGet(n, 'type'); if (type === null || type === 'textWrapping') s += '\n'; }
    else if (name === 'noBreakHyphen') s += '-';
  }
  return s;
}
function paraText(p) {
  let s = '';
  for (let n = p.firstChild; n; n = n.nextSibling) {
    if (isW(n, 'r')) s += runText(n);
    else if (isW(n, 'hyperlink')) s += kids(n, 'r').map(runText).join('');
  }
  return s;
}
const cellText = tc => kids(tc, 'p').map(paraText).join('\n');
const deepText = el => all(el, 't').map(t => t.textContent).join('');

// ---- tables, as python-docx addresses them ----
function gridSpan(tc) { const g = kid(kid(tc, 'tcPr'), 'gridSpan'); return g ? parseInt(wGet(g, 'val'), 10) : 1; }
function vMerge(tc) { const v = kid(kid(tc, 'tcPr'), 'vMerge'); return v ? (wGet(v, 'val') || 'continue') : null; }
function gridBefore(tr) { const g = kid(kid(tr, 'trPr'), 'gridBefore'); return g ? parseInt(wGet(g, 'val'), 10) : 0; }
function gridOffset(tc) {
  let off = gridBefore(tc.parentNode);
  for (const t of kids(tc.parentNode, 'tc')) { if (t === tc) return off; off += gridSpan(t); }
  throw new Error('Template: cell not found in its row.');
}
function tcAtGridOffset(tr, offset) {
  let remaining = offset - gridBefore(tr);
  for (const tc of kids(tr, 'tc')) {
    if (remaining < 0) break;
    if (remaining === 0) return tc;
    remaining -= gridSpan(tc);
  }
  throw new Error(`Template: no cell at grid offset ${offset}.`);
}
function tcAbove(tc) {
  let tr = tc.parentNode.previousSibling;
  while (tr && !isW(tr, 'tr')) tr = tr.previousSibling;
  if (!tr) throw new Error('Template: no row above the top row.');
  return tcAtGridOffset(tr, gridOffset(tc));
}

class Table {
  constructor(tbl) { this.tbl = tbl; }
  get rows() { return kids(this.tbl, 'tr'); }
  get colCount() { const g = kid(this.tbl, 'tblGrid'); return g ? kids(g, 'gridCol').length : 0; }
  cell(r, c) {  // python-docx Table.cell(): the _cells grid
    const cc = this.colCount, cells = [];
    for (const tr of this.rows) {
      for (const tc of kids(tr, 'tc')) {
        for (let i = 0; i < gridSpan(tc); i++) {
          if (vMerge(tc) === 'continue') cells.push(cells[cells.length - cc]);
          else if (i > 0) cells.push(cells[cells.length - 1]);
          else cells.push(tc);
        }
      }
    }
    const tc = cells[r * cc + c];
    if (!tc) throw new Error(`Template: table cell (${r}, ${c}) does not exist.`);
    return tc;
  }
  rowCells(r) {  // python-docx _Row.cells
    const out = [];
    const add = tc => { if (vMerge(tc) === 'continue') { add(tcAbove(tc)); return; } for (let i = 0; i < gridSpan(tc); i++) out.push(tc); };
    for (const tc of kids(this.rows[r], 'tc')) add(tc);
    return out;
  }
  text(r, c) { return cellText(this.rowCells(r)[c]); }
}

class Doc {
  constructor(xml) { this.xml = xml; this.body = kid(xml.documentElement, 'body'); }
  get tables() { return kids(this.body, 'tbl').map(t => new Table(t)); }
}

// ---- runs, as python-docx writes them ----
function insertOrdered(parent, el, order) {
  const rank = order.indexOf(el.localName);
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && n.namespaceURI === W && order.indexOf(n.localName) > rank) { parent.insertBefore(el, n); return el; }
  }
  parent.appendChild(el);
  return el;
}
function getOrAdd(parent, local, order) { return kid(parent, local) || insertOrdered(parent, wEl(parent.ownerDocument, local), order); }
function getOrAddRPr(r) {
  const existing = kid(r, 'rPr');
  if (existing) return existing;
  const rpr = wEl(r.ownerDocument, 'rPr');
  r.insertBefore(rpr, r.firstChild);
  return rpr;
}
function setRunText(r, text) {
  const xml = r.ownerDocument;
  for (const n of Array.from(r.childNodes)) if (n.nodeType === 1 && !isW(n, 'rPr')) r.removeChild(n);
  let buf = '';
  const flush = () => {
    if (buf) {
      const t = wEl(xml, 't');
      t.appendChild(xml.createTextNode(buf));
      if (buf.trim().length < buf.length) t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      r.appendChild(t);
    }
    buf = '';
  };
  for (const ch of String(text)) {
    if (ch === '\t') { flush(); r.appendChild(wEl(xml, 'tab')); }
    else if (ch === '\r' || ch === '\n') { flush(); r.appendChild(wEl(xml, 'br')); }
    else buf += ch;
  }
  flush();
}
function setColor(r, hex) {
  const rpr = getOrAddRPr(r);
  for (const c of kids(rpr, 'color')) rpr.removeChild(c);
  const color = insertOrdered(rpr, wEl(r.ownerDocument, 'color'), RPR_ORDER);
  wSet(color, 'val', hex);
}
function setStrike(r, on) {
  const strike = getOrAdd(getOrAddRPr(r), 'strike', RPR_ORDER);
  if (on) strike.removeAttributeNS(W, 'val'); else wSet(strike, 'val', '0');
}
function giveCellFont(p, r) {
  const own = kid(r, 'rPr');
  if (own && kid(own, 'rFonts')) return;
  const mark = kid(kid(p, 'pPr'), 'rPr');
  const fonts = kid(mark, 'rFonts');
  const rpr = getOrAddRPr(r);
  const rfonts = getOrAdd(rpr, 'rFonts', RPR_ORDER);
  if (fonts && wGet(fonts, 'ascii')) {
    for (const a of Array.from(fonts.attributes)) if (a.namespaceURI !== XMLNS_NS) rfonts.setAttributeNS(a.namespaceURI, a.name, a.value);
  } else {
    for (const k of ['ascii', 'hAnsi', 'cs']) wSet(rfonts, k, FORM_FONT);
  }
  const sz = kid(mark, 'sz');
  if (sz && !kid(rpr, 'sz')) {
    const mine = insertOrdered(rpr, wEl(r.ownerDocument, 'sz'), RPR_ORDER);
    wSet(mine, 'val', String(parseInt(wGet(sz, 'val'), 10)));
    const szcs = kid(mark, 'szCs');
    if (szcs && !kid(rpr, 'szCs')) insertAfter(mine, szcs.cloneNode(true));
  }
}

// ---- the steps of generate_acr.py ----
function setCell(doc, ti, row, col, text) {
  const tc = doc.tables[ti].cell(row, col);
  if (!kids(tc, 'p').length) tc.appendChild(wEl(doc.xml, 'p'));
  const p = kids(tc, 'p')[0];
  const runs = kids(p, 'r');
  const r = runs.length ? runs[0] : p.appendChild(wEl(doc.xml, 'r'));
  setRunText(r, String(text || ''));
  setColor(r, BLUE);
  giveCellFont(p, r);
  for (const rr of kids(p, 'r').slice(1)) setRunText(rr, '');
}
function cloneRow(table, idx) { const tr = table.rows[idx]; insertAfter(tr, tr.cloneNode(true)); }
function fillRows(doc, ti, rows, start = 1) {
  const t = doc.tables[ti];
  const existing = Math.max(0, t.rows.length - start);
  for (let k = 0; k < rows.length - existing; k++) cloneRow(t, start);
  rows.forEach((row, i) => { for (let c = 0; c < t.colCount; c++) setCell(doc, ti, start + i, c, c < row.length ? row[c] : ''); });
}
function findRow(table, col, prefix, start = 0) {
  for (let r = start; r < table.rows.length; r++) if (norm(table.text(r, col)).startsWith(norm(prefix))) return r;
  throw new Error(`Template: no row starting with "${prefix}" in column ${col}.`);
}
function fillBetween(doc, ti, first, end, rows) {
  const t = doc.tables[ti];
  for (let k = 0; k < rows.length - (end - first); k++) cloneRow(t, end - 1);
  rows.forEach((vals, i) => vals.forEach((v, c) => setCell(doc, ti, first + i, c, v)));
}
function entries(api, group, name) {
  const g = obj(api[group]);
  return (Array.isArray(g[name]) ? g[name] : []).filter(e => !isEmptyEntry(e));
}
const field = (e, key) => (e[key] === undefined || e[key] === null ? '' : String(e[key]));
const sc = e => scoreText(e.score);
const level = e => (typeof e.row === 'string' && has(LEVEL_TEXT, e.row) ? LEVEL_TEXT[e.row] : '');

function fillApiTables(doc, api, v) {
  const T = doc.tables;
  check(norm(T[8].text(1, 0)) === '(a)' && norm(T[8].text(2, 0)) === '(b)', 8, '(a)/(b) rows');
  setCell(doc, 8, 1, 2, v.p42.i_a);
  setCell(doc, 8, 2, 2, v.p42.i_b);
  fillBetween(doc, 9, 1, findRow(doc.tables[9], 0, 'API score based'),
    entries(api, 'c1', 'resources').map((e, i) => [i + 1, field(e, 'course'), field(e, 'consulted'), field(e, 'prescribed'), field(e, 'additional')]));
  const scoreRow = findRow(doc.tables[9], 0, 'APIscorebased') + 1;
  check(norm(doc.tables[9].text(scoreRow - 1, 4)) === 'APIScore', 9, '"API Score" above the 26(ii) score cell');
  setCell(doc, 9, scoreRow, 4, v.p42.ii);
  fillBetween(doc, 10, 1, findRow(doc.tables[10], 1, 'Total Score'),
    entries(api, 'c1', 'innovative').map((e, i) => [i + 1, field(e, 'description'), sc(e)]));
  setCell(doc, 10, findRow(doc.tables[10], 1, 'Total Score'), 2, v.p42.iii);
  fillBetween(doc, 11, 1, findRow(doc.tables[11], 1, 'Total Score'),
    entries(api, 'c1', 'exam').map((e, i) => [i + 1, field(e, 'type'), field(e, 'assigned'), field(e, 'extent'), sc(e)]));
  setCell(doc, 11, findRow(doc.tables[11], 1, 'Total Score'), 4, v.p42.iv);
  for (const [heading, totalLabel, name, col2, total] of [['(i)', 'Total (Max.20)', 'extension', 'hours', v.p43.i],
    ['(ii)', 'Total (Max.15)', 'management', 'responsibility', v.p43.ii], ['(iii)', 'Total (Max.15)', 'professional', 'details', v.p43.iii]]) {
    const h = findRow(doc.tables[12], 1, heading);
    const end = findRow(doc.tables[12], 1, totalLabel, h + 1);
    fillBetween(doc, 12, h + 1, end, entries(api, 'c2', name).map((e, i) => [i + 1, field(e, 'activity'), field(e, col2), sc(e)]));
    setCell(doc, 12, findRow(doc.tables[12], 1, totalLabel, h + 1), 3, total);
  }
  setCell(doc, 12, findRow(doc.tables[12], 1, 'Total Score'), 3, v.p43.total);
  const c3 = (name, cols) => entries(api, 'c3', name).map((e, i) => [i + 1, ...cols.map(k => field(e, k)), sc(e)]);
  fillRows(doc, 13, c3('journals', ['title', 'journal', 'issn', 'peer', 'coauthors', 'mainAuthor']), 1);
  fillRows(doc, 14, c3('chapters', ['title', 'book', 'issn', 'peer', 'coauthors', 'mainAuthor']), 1);
  fillRows(doc, 15, c3('proceedings', ['title', 'conference', 'issn', 'coauthors', 'mainAuthor']), 1);
  fillRows(doc, 16, c3('books', ['title', 'type', 'publisher', 'peer', 'coauthors', 'mainAuthor']), 1);
  fillRows(doc, 17, c3('ongoing', ['title', 'agency', 'period', 'amount']), 1);
  fillRows(doc, 18, c3('completed', ['title', 'agency', 'period', 'amount', 'outcome']), 1);
  const g = obj(obj(api.c3).guidance);
  check(doc.tables[19].text(1, 0).startsWith('M.Phil') && doc.tables[19].text(2, 0).startsWith('Ph.D'), 19, 'M.Phil / Ph.D rows');
  [[1, 'mphilEnrolled'], [2, 'mphilSubmitted'], [3, 'mphilAwarded']].forEach(([c, k]) => setCell(doc, 19, 1, c, field(g, k)));
  setCell(doc, 19, 1, 4, v.p44.D1);
  [[1, 'phdEnrolled'], [2, 'phdSubmitted'], [3, 'phdAwarded']].forEach(([c, k]) => setCell(doc, 19, 2, c, field(g, k)));
  setCell(doc, 19, 2, 4, v.p28.phd);
  fillRows(doc, 20, entries(api, 'c3', 'training').map((e, i) => [i + 1, field(e, 'programme'), field(e, 'duration'), field(e, 'organisedBy'), sc(e)]), 1);
  fillRows(doc, 21, entries(api, 'c3', 'papers').map((e, i) => [i + 1, field(e, 'title'), field(e, 'conference'), field(e, 'organisedBy'), level(e), sc(e)]), 1);
  fillRows(doc, 22, entries(api, 'c3', 'lectures').map((e, i) => [i + 1, field(e, 'title'), field(e, 'conference'), field(e, 'organisedBy'), level(e), sc(e)]), 1);
  const ly = lastYearCells(api.lastAcademicYear);
  check(norm(doc.tables[31].text(0, 2)).startsWith('LastAcademic'), 31, 'the "Last Academic Year" header of point 45');
  for (const [r, label, key, value] of [[1, 'Teaching', 'cat1', v.p29.I], [2, 'Co-curricular', 'cat2', v.p29.II],
    [3, 'Total', 'total12', v.p29.I_II], [4, 'Research', 'cat3', v.p29.III]]) {
    for (const ti of [23, 31]) {
      check(norm(doc.tables[ti].text(r, 1)).startsWith(label), ti, `row ${r} starting "${label}"`);
      setCell(doc, ti, r, 2, ly[key]);
      setCell(doc, ti, r, 3, value);
    }
  }
  for (const [r, label, key] of [[3, '(i)a', 'i_a'], [4, '(i)b', 'i_b'], [5, '(ii)', 'ii'], [6, '(iii)', 'iii'], [7, '(iv)', 'iv']]) {
    check(norm(doc.tables[25].text(r, 0)) === label, 25, `row ${r} "${label}"`);
    setCell(doc, 25, r, 3, v.p42[key]);
  }
  check(norm(doc.tables[25].text(8, 1)).startsWith('TotalScore'), 25, 'Total Score row');
  setCell(doc, 25, 8, 3, v.p42.total);
  for (const [r, label, key] of [[3, '(i)', 'i'], [4, '(ii)', 'ii'], [5, '(iii)', 'iii']]) {
    check(norm(doc.tables[26].text(r, 0)) === label, 26, `row ${r} "${label}"`);
    setCell(doc, 26, r, 3, v.p43[key]);
  }
  check(norm(doc.tables[26].text(6, 1)).startsWith('TotalScore'), 26, 'Total Score row');
  setCell(doc, 26, 6, 3, v.p43.total);
  for (const [code, [ti, r, c, maxPrefix]] of Object.entries(P44_CELLS)) {
    check(norm(doc.tables[ti].text(r, c - 1)).startsWith(maxPrefix), ti, `row ${r} Max. Score "${maxPrefix}" for ${code}`);
    check(doc.tables[ti].text(r, c).trim() === '', ti, `empty API cell for ${code}`);
    setCell(doc, ti, r, c, v.p44[code]);
  }
  check(norm(doc.tables[30].text(2, 1)) === 'Total', 30, 'Total row');
  setCell(doc, 30, 2, 4, v.p44.total);
}

function fillPartTables(doc, t) {
  const T = doc.tables;
  check(T[0].rows.length === 1 && T[0].rowCells(0).length === 8, 0, 'the 8 date-of-birth boxes');
  Array.from(t.dob_digits || ' '.repeat(8)).forEach((ch, c) => setCell(doc, 0, 0, c, ch.trim()));
  check(norm(T[1].text(0, 0)).startsWith('Sr.'), 1, 'the 19(a) header');
  fillBetween(doc, 1, 1, findRow(doc.tables[1], 0, 'Total periods per week'), t.teaching);
  setCell(doc, 1, findRow(doc.tables[1], 0, 'Total periods per week'), 3, t.total_periods);
  check(norm(T[2].text(0, 0)).startsWith('Sr.'), 2, 'the 19(c) header');
  fillRows(doc, 2, t.assignments, 1);
  check(norm(T[3].text(0, 0)).startsWith('Titleoftheactivity'), 3, 'the 19(d) header');
  fillRows(doc, 3, t.activities, 1);
  check(norm(T[4].text(2, 0)) === '1', 4, 'the column-number row of point 20');
  fillRows(doc, 4, t.results, 3);
  check(norm(T[5].text(0, 0)).startsWith('NameoftheSummer'), 5, 'the 21(ii) header');
  fillRows(doc, 5, t.orientation, 1);
  check(norm(T[6].text(0, 0)).startsWith('Topictitle'), 6, 'the 22 header');
  fillRows(doc, 6, t.research, 1);
  check(norm(T[24].text(0, 0)) === 'S.No.', 24, 'the point 30 header');
  fillRows(doc, 24, t.other_info, 1);
}

function strikeUnchosen(doc, startsWith, options, chosen) {
  for (const p of all(doc.body, 'p')) {
    if (!deepText(p).startsWith(startsWith)) continue;
    const runs = {};
    for (const r of kids(p, 'r')) runs[deepText(r)] = r;
    if (!options.every(o => has(runs, o))) throw new Error(`Template: "${startsWith}" line has no separate runs for ${options}.`);
    for (const o of options) setStrike(runs[o], options.includes(chosen) && o !== chosen);
    return;
  }
  throw new Error(`Template: no line starting with "${startsWith}".`);
}

function replaceTokens(xml, values) {
  const map = Object.entries(values).map(([k, v]) => ['{{' + k + '}}', String(v || '')]);
  const root = xml.documentElement;
  for (const t of all(root, 't')) {
    const txt = t.textContent;
    let out = txt;
    for (const [tok, val] of map) if (out.includes(tok)) out = out.split(tok).join(val);
    if (out !== txt) setText(t, out);
  }
  for (const t of all(root, 't')) {
    if (!t.textContent.includes('\n')) continue;
    const parts = t.textContent.split('\n');
    setText(t, parts[0]);
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    let prev = t;
    for (const part of parts.slice(1)) {
      const br = insertAfter(prev, wEl(xml, 'br'));
      const nt = wEl(xml, 't');
      nt.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      setText(nt, part);
      prev = insertAfter(br, nt);
    }
  }
  for (const p of all(root, 'p')) {
    const full = deepText(p);
    if (!map.some(([tok]) => full.includes(tok))) continue;
    let changed = full;
    for (const [tok, val] of map) if (changed.includes(tok)) changed = changed.split(tok).join(val);
    const texts = all(p, 't');
    if (!texts.length) { const r = p.appendChild(wEl(xml, 'r')); const t = r.appendChild(wEl(xml, 't')); setText(t, changed); continue; }
    setText(texts[0], changed);
    for (const tt of texts.slice(1)) setText(tt, '');
  }
}

function insertEnclosures(doc, data) {
  const selected = (Array.isArray(data.enclosures) ? data.enclosures : [])
    .filter(x => x && typeof x === 'object' && !Array.isArray(x) && (has(x, 'checked') ? x.checked : true))
    .map(x => (x.label === undefined || x.label === null ? 'None' : String(x.label)));
  if (!selected.length) return;
  const at = kids(doc.body, 'p').find(p => paraText(p).trim().startsWith('I certify that the information provided'));
  if (!at) return;
  selected.forEach((label, i) => {
    const p = wEl(doc.xml, 'p');
    at.parentNode.insertBefore(p, at);
    const r = p.appendChild(wEl(doc.xml, 'r'));
    setRunText(r, `☑ ${i + 1}. ${label}`);
    setColor(r, BLUE);
  });
}

// Returns the Word file (Uint8Array). deps: { JSZip, DOMParser, XMLSerializer }.
export async function generateDocx(data, templateBytes, { JSZip, DOMParser, XMLSerializer }) {
  data = obj(data);
  const api = obj(data.api);
  const result = tally(api);
  const problems = [...fieldProblems(data), ...result.problems, ...lastYearProblems(api.lastAcademicYear)];
  if (problems.length) throw new ProblemsError(problems);
  const v = result.values;
  const profile = obj(data.profile);
  const zip = await JSZip.loadAsync(templateBytes);
  const xml = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
  const doc = new Doc(xml);
  fillPartTables(doc, partTables(data));
  strikeUnchosen(doc, 'Appraisal of work and conduct', TITLES, profile.title);
  strikeUnchosen(doc, 'Father/Husband', RELATIONS, profile.relation);
  fillApiTables(doc, api, v);
  replaceTokens(xml, tokenValues(data));
  insertEnclosures(doc, data);
  let out = new XMLSerializer().serializeToString(xml);
  if (!out.startsWith('<?xml')) out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
  zip.file('word/document.xml', out);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
```
(`toCents`/`fmt` are imported for completeness of the value rules the engine relies on through `scoreText`; remove them if a linter flags them unused.)

- [ ] **Step 5: Run** `npm test` and `python -m unittest tests.test_parity -v` → PASS. When a parity case fails, the assertion names the paragraph index: dump both paragraphs, find which python-docx rule the engine differs from, fix the engine (never the Python side) and rerun until all cases pass.
- [ ] **Step 6:** Open one app-made file (`full`) in Word via `tools/docx_to_pdf.ps1` → it must convert without a repair prompt or error, and have 30 pages.
- [ ] **Step 7: Commit**
```bash
git add docx_engine.js tools/make_docx_js.mjs tests/docx_engine.test.js tests/test_parity.py package.json package-lock.json .gitignore
git commit -m "feat: the app's Word-file engine (port of generate_acr.py) with a parity test"
```

---

### Task 4: Button in the app, offline

**Files:** create `vendor/jszip.min.js` (copied); modify `index.html`, `app.js`, `sw.js`, `styles.css`.

- [ ] **Step 1:** `mkdir -p vendor && cp node_modules/jszip/dist/jszip.min.js vendor/jszip.min.js` (keeps its MIT licence header).
- [ ] **Step 2: `index.html`**
1. Before `<script type="module" src="app.js"></script>` add `<script src="vendor/jszip.min.js"></script>`.
2. In the Review card, directly after `<ul id="reviewProblems" class="problems"></ul>` add:
```html
          <div class="docx-box">
            <button type="button" id="downloadDocxBtn">Download Word file (.docx)</button>
            <span id="docxReason" class="muted"></span>
            <p id="docxStatus" class="muted" role="status"></p>
            <details>
              <summary>Make a PDF or print on a phone</summary>
              <p><strong>Microsoft Word app:</strong> open the downloaded file, then the ⋯ (More) menu → <em>Save as</em> or <em>Export</em> → PDF; or ⋯ → <em>Print</em>.</p>
              <p><strong>Google Docs:</strong> open the file, then ⋮ → <em>Share &amp; export</em> → <em>Save as</em> → PDF document; or ⋮ → <em>Share &amp; export</em> → <em>Print</em>. Google Docs may lay some pages out slightly differently from Word.</p>
            </details>
          </div>
```
3. Replace the sentence `The Word ACR is made on a PC: Export Draft, then run <code>python generate_acr.py &lt;file&gt; -o ACR.docx</code>.` with `On a PC the Word file can also be made with <code>python generate_acr.py &lt;exported file&gt; -o ACR.docx</code>; both give the same file.`
- [ ] **Step 3: `app.js`**
1. After `import { initLastYearUi, renderLastYear } from './last_year_ui.js';` add `import { generateDocx, ProblemsError } from './docx_engine.js';`
2. In `renderFieldProblems`, right after the `const probs=[…];` line (and the warning line that follows it) add:
```js
  $('downloadDocxBtn').disabled=probs.length>0; $('docxReason').textContent=probs.length?'Fix the problems listed above first.':'';
```
3. After the `$('session').addEventListener('change', …);` block add:
```js
$('downloadDocxBtn').addEventListener('click',async()=>{
  const status=$('docxStatus'), d=saveLocal();
  status.textContent='Making the Word file…';
  try{
    const resp=await fetch('ACR_EMPLOYEE_MASTER.docx');
    if(!resp.ok) throw new Error('The Word template could not be loaded.');
    const bytes=new Uint8Array(await resp.arrayBuffer());
    const out=await generateDocx(d,bytes,{JSZip:window.JSZip,DOMParser,XMLSerializer});
    const name=`ACR_${d.session||'draft'}.docx`;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    status.textContent=`Word file ready: ${name}`;
  }catch(err){console.error(err); status.textContent=err instanceof ProblemsError?'Fix the problems listed above first.':(err.message||String(err));}
});
```
- [ ] **Step 4: `sw.js`**: `CACHE='acr-utility-v0-7'`; add `'./docx_engine.js','./vendor/jszip.min.js','./ACR_EMPLOYEE_MASTER.docx'` to `ASSETS`.
- [ ] **Step 5: `styles.css`**: append `.docx-box{margin-top:12px}` and `.docx-box details{margin-top:8px}`.
- [ ] **Step 6:** `node --check` on `app.js`, `docx_engine.js`, `sw.js`; run both suites.
- [ ] **Step 7: Browser check** (only if the user agrees to start the local server — it was stopped earlier for low memory): fresh profile; clear service worker caches; import `tests/fixtures/full_record.acr.json`; Review tab shows the button enabled; click → file `ACR_2031-32.docx` downloads; with a problem (DOB 31/02/1990) the button is disabled with the reason; offline (`playwright-cli` network offline) after one load the button still works. Convert the downloaded file with `tools/docx_to_pdf.ps1` and compare its PDF with the PC-made PDF of the same record (both 30 pages; pages 1, 6–11, 14–19 by eye).
- [ ] **Step 8: Commit**
```bash
git add vendor/jszip.min.js index.html app.js sw.js styles.css
git commit -m "feat: Download Word file button in the app (works offline, phones and PCs)"
```

---

### Task 5: Report

- [ ] Run both suites; summarise: parity cases passing, browser result, and that the phone menu names in the help text still need confirming on a real Android phone and iPhone by the user (they cannot be checked from here).

---

## Self-review against the spec

| Spec item | Task |
|---|---|
| R1 Word file in the app, offline | 3 (engine), 4 (button, vendored JSZip, cache) |
| R2 same as PC | 3 (parity test over 5 records) |
| R3 refuse on problems | 3 (engine + parity of problem lists), 4 (disabled button) |
| R4 PDF/print help | 4 (help text), 5 (to be confirmed on phones) |
| §4 engine steps and python-docx rules | 3 |
| §4 `acr_fields.js` ports | 2 |
| §5 appendix pages in the template | 1 |
| §6 parity records | 3 (`records()`: full, long answers, extra rows, no title, empty; problems) |
| §7 libraries | 3 (dev deps), 4 (vendor) |
| §8 checks 1–4 | 2, 3, 4 (Google Docs check: reported only if a Google account/Docs is available; otherwise listed as not done) |
