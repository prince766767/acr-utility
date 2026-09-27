# API Score Entry and Tally Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The teacher types API scores for points 26–28. The app and the Word generator add them up into point 29 column 4, point 42 column 4, point 43 column 4 and point 44 column 5, with identical figures.

**Architecture:** A pure tally function exists twice: `api_tally.js` for the browser and `api_tally.py` for the generator. Both are tested against one shared fixture file (`tests/fixtures/cases.json`), so their results cannot drift apart. The app gets entry tables and a live preview (`api_ui.js`). `generate_acr.py` refuses to build when the tally reports problems; otherwise it writes the tally's strings into fixed, label-checked cells of `ACR_EMPLOYEE_MASTER.docx`.

**Tech Stack:** Vanilla ES modules (no build step), Node 24 `node:test` for JS tests, Python 3.12 + python-docx 1.2 + `unittest`, Microsoft Word COM (PowerShell) for DOCX→PDF, poppler `pdftoppm` for page images.

**Spec:** `docs/superpowers/specs/2026-09-27-api-score-tally-design.md`

## Global Constraints

- All paths are relative to the project root `C:\Users\princ\Downloads\ACR_Utility_v0_3\ACR_Utility_v0_3`.
- Scores are **typed by the teacher**. Nothing is calculated from rates or pre-filled.
- A score is a number ≥ 0 with at most 2 decimals. Arithmetic is done in whole hundredths (integers).
- Display format: up to 2 decimals, trailing zeros removed (`20`, `7.5`, `12.25`, `0`).
- The **only** automatic cap is the Category II total at 25. Every other over-maximum is a blocking problem.
- Maxima from the form: 26(i)(a) 50, 26(i)(b) 10, 26(ii) 20, 26(iii) total 20, 26(iv) total 25, Category I 125, 27(i) 20, 27(ii) 15, 27(iii) 15, Category II total 25 (cap), 28 E(i) total 30.
- Never write any Principal column (Agree / Mention Reasons / Principal's score) or point 29 column 3 (column 3 keeps the existing `api.lastAcademicYear` behaviour).
- JS and Python problem lists must match exactly: same order, same `code`, `where` and `message`.
- No new runtime dependencies. No pytest (not installed); use `unittest`.

---

## File Structure

| File | Responsibility |
|---|---|
| `api_tally.js` (create) | Pure tally: parse scores, sum per sub-row, report problems, format. Row codes and labels. |
| `api_tally.py` (create) | Line-for-line Python mirror of `api_tally.js` (no labels, plus `LEVEL_TEXT`, `score_text`). |
| `api_ui.js` (create) | Builds the API entry tables, binds them to `state.api`, renders sums, problems and the preview. |
| `app.js` (modify) | Wires `api_ui.js` and `api_tally.js` into load/save/review; removes the old flat API fields. |
| `index.html` (modify) | New markup for the "API · 26–29" tab. |
| `styles.css` (modify) | Styles for API rows, red "over" state and preview tables. |
| `sw.js` (modify) | Caches the new modules; deletes old caches. |
| `generate_acr.py` (modify) | Blocks on problems; fills tables 8–30 of the template from the tally; old scoring removed. |
| `ACR_EMPLOYEE_MASTER.docx` (modify once) | 27(iii) rows restored to the official form. |
| `tools/fix_template_27iii.py` (create) | One-time, idempotent-checked script for the template fix. |
| `tools/docx_to_pdf.ps1` (create) | Converts a DOCX to PDF through Word, for visual checks. |
| `tests/fixtures/cases.json` (create) | Shared JS/Python test cases (input + expected output). |
| `tests/api_tally.test.js` (create) | Node tests over `cases.json`. |
| `tests/test_api_tally.py` (create) | Python tests over `cases.json`. |
| `tests/test_template.py` (create) | Checks the 27(iii) template fix. |
| `tests/test_generate_api.py` (create) | Generates the worked example and checks every written cell. |
| `package.json` (create) | `{"type":"module"}` so Node loads `api_tally.js` as an ES module. |

---

### Task 0: Put the project under git and record a baseline

The folder is not a git repository. Commits in this plan need one.

**Files:**
- Create: `.gitignore`, `package.json`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
__pycache__/
_pdf_render/
*.intermediate.docx
tests/out/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "acr-utility",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/api_tally.test.js"
  }
}
```

- [ ] **Step 3: Confirm the current generator still runs (baseline)**

Run:
```bash
echo '{"session":"2025-26"}' > tests_min.json && python generate_acr.py tests_min.json -o tests_min.docx && rm tests_min.json tests_min.docx
```
Expected: a JSON dict of scores is printed and no error appears.

- [ ] **Step 4: Initialise git and commit the baseline**

```bash
git init
git add -A
git commit -m "chore: baseline of ACR Utility v0.3 before API tally work"
```

---

### Task 1: Shared test cases and the JS tally

**Files:**
- Create: `tests/fixtures/cases.json`
- Create: `tests/api_tally.test.js`
- Create: `api_tally.js`

**Interfaces:**
- Produces (exported from `api_tally.js`):
  - `ROW_CHOICES: {[list: string]: string[]}`: valid point-44 row codes per point-28 list.
  - `ROW_LABELS: {[code: string]: string}`: dropdown and preview labels.
  - `C3_WHERE: {[list: string]: string}`: e.g. `journals → '28 A'`.
  - `P44_ORDER: string[]`: the 25 sub-row codes in form order.
  - `emptyApi(): Api`, `normalizeApi(raw): {api: Api, legacy: [string, any][]}`.
  - `toCents(v): {state:'missing'|'bad'} | {state:'ok', cents:number}`, `fmt(cents): string`, `isEmptyEntry(e): boolean`.
  - `tally(api): {values, problems}` where
    `values = {p42:{i_a,i_b,ii,iii,iv,total}, p43:{i,ii,iii,total,raw,capped:boolean}, p44:{<25 codes>, total}, p29:{I,II,I_II,III}, p28:{phd,e1Total}}` (all strings except `capped`) and
    `problems = [{code:'BAD_SCORE'|'NO_SCORE'|'NO_ROW'|'BAD_ROW'|'OVER_MAX', where:string, message:string}]`.

- [ ] **Step 1: Write the shared fixture `tests/fixtures/cases.json`**

Each case has `api` (input), optional `values` (full expected values), optional `checks` (dotted path → expected value) and `problems` (full expected list, in order).

```json
[
  {
    "name": "worked example from spec section 7",
    "api": {
      "c1": {
        "classes": 45, "excess": 6, "resourcesScore": 18.5,
        "resources": [{"course": "B.A. I Economics", "consulted": "Text book", "prescribed": "Yes", "additional": "Notes"}],
        "innovative": [{"description": "Flipped class", "score": 8}, {"description": "Case studies", "score": 7.25}],
        "exam": [{"type": "Invigilation", "assigned": "20", "extent": "100", "score": 10},
                 {"type": "Evaluation", "assigned": "300 scripts", "extent": "100", "score": 12}]
      },
      "c2": {
        "extension": [{"activity": "NSS", "hours": "2", "score": 10}, {"activity": "Cultural", "hours": "1", "score": 5}],
        "management": [{"activity": "Admission committee", "responsibility": "Yearly", "score": 7.5},
                       {"activity": "Timetable", "responsibility": "Semester", "score": 5}],
        "professional": [{"activity": "Seminar organised", "details": "one-day", "score": 3}]
      },
      "c3": {
        "journals": [{"title": "P1", "row": "A1", "score": 15}, {"title": "P2", "row": "A1", "score": 7.5}, {"title": "P3", "row": "A2", "score": 10}],
        "chapters": [{"title": "Ch1", "row": "B1a", "score": 10}, {"title": "Ch2", "row": "B1b", "score": 5}, {"title": "Ch3", "row": "B1b", "score": 2.5}],
        "proceedings": [{"title": "CP1", "score": 10}],
        "books": [{"title": "Book1", "row": "B3b", "score": 25}],
        "ongoing": [{"title": "Minor project", "row": "C1c", "score": 10}, {"title": "Consultancy", "row": "C2", "score": 10}],
        "completed": [{"title": "Completed minor", "row": "C3", "score": 10}],
        "guidance": {"mphilScore": 3, "phdAwardedScore": 10, "phdSubmittedScore": 7},
        "training": [{"programme": "Refresher", "row": "E1a", "score": 20}, {"programme": "FDP", "row": "E1b", "score": 10}],
        "papers": [{"title": "T1", "row": "E2b", "score": 7.5}, {"title": "T2", "row": "E2b", "score": 7.5},
                   {"title": "T3", "row": "E2c", "score": 5}, {"title": "T4", "row": "E2d", "score": 3}],
        "lectures": [{"title": "L1", "row": "E3b", "score": 5}]
      }
    },
    "values": {
      "p42": {"i_a": "45", "i_b": "6", "ii": "18.5", "iii": "15.25", "iv": "22", "total": "106.75"},
      "p43": {"i": "15", "ii": "12.5", "iii": "3", "total": "25", "raw": "30.5", "capped": true},
      "p44": {"A1": "22.5", "A2": "10", "B1a": "10", "B1b": "7.5", "B2": "10", "B3a": "", "B3b": "25", "B3c": "",
              "C1a": "", "C1b": "", "C1c": "10", "C2": "10", "C3": "10", "C4": "",
              "D1": "3", "D2a": "10", "D2b": "7", "E1a": "20", "E1b": "10",
              "E2a": "", "E2b": "15", "E2c": "5", "E2d": "3", "E3a": "", "E3b": "5", "total": "193"},
      "p29": {"I": "106.75", "II": "25", "I_II": "131.75", "III": "193"},
      "p28": {"phd": "17", "e1Total": "30"}
    },
    "problems": []
  },
  {
    "name": "empty record",
    "api": {},
    "values": {
      "p42": {"i_a": "", "i_b": "", "ii": "", "iii": "0", "iv": "0", "total": "0"},
      "p43": {"i": "0", "ii": "0", "iii": "0", "total": "0", "raw": "0", "capped": false},
      "p44": {"A1": "", "A2": "", "B1a": "", "B1b": "", "B2": "", "B3a": "", "B3b": "", "B3c": "",
              "C1a": "", "C1b": "", "C1c": "", "C2": "", "C3": "", "C4": "",
              "D1": "", "D2a": "", "D2b": "", "E1a": "", "E1b": "",
              "E2a": "", "E2b": "", "E2c": "", "E2d": "", "E3a": "", "E3b": "", "total": "0"},
      "p29": {"I": "0", "II": "0", "I_II": "0", "III": "0"},
      "p28": {"phd": "", "e1Total": "0"}
    },
    "problems": []
  },
  {
    "name": "every maximum exactly reached passes",
    "api": {
      "c1": {"classes": 50, "excess": 10, "resourcesScore": 20,
             "innovative": [{"description": "x", "score": 20}], "exam": [{"type": "x", "score": 25}]},
      "c2": {"extension": [{"activity": "x", "score": 20}], "management": [{"activity": "x", "score": 15}],
             "professional": [{"activity": "x", "score": 15}]},
      "c3": {"training": [{"programme": "x", "row": "E1a", "score": 20}, {"programme": "y", "row": "E1b", "score": 10}]}
    },
    "checks": {"p42.total": "125", "p43.total": "25", "p43.raw": "50", "p43.capped": true, "p29.I_II": "150", "p28.e1Total": "30"},
    "problems": []
  },
  {
    "name": "every maximum exceeded by 0.01 blocks",
    "api": {
      "c1": {"classes": 50.01, "excess": 10.01, "resourcesScore": 20.01,
             "innovative": [{"description": "x", "score": 20.01}], "exam": [{"type": "x", "score": 25.01}]},
      "c2": {"extension": [{"activity": "x", "score": 20.01}], "management": [{"activity": "x", "score": 15.01}],
             "professional": [{"activity": "x", "score": 15.01}]},
      "c3": {"training": [{"programme": "x", "row": "E1a", "score": 20}, {"programme": "y", "row": "E1b", "score": 10.01}]}
    },
    "checks": {"p42.total": "125.05", "p43.raw": "50.03", "p43.total": "25"},
    "problems": [
      {"code": "OVER_MAX", "where": "26(i)(a)", "message": "26(i)(a) is 50.01; the form's maximum is 50."},
      {"code": "OVER_MAX", "where": "26(i)(b)", "message": "26(i)(b) is 10.01; the form's maximum is 10."},
      {"code": "OVER_MAX", "where": "26(ii)", "message": "26(ii) is 20.01; the form's maximum is 20."},
      {"code": "OVER_MAX", "where": "26(iii) total", "message": "26(iii) total is 20.01; the form's maximum is 20."},
      {"code": "OVER_MAX", "where": "26(iv) total", "message": "26(iv) total is 25.01; the form's maximum is 25."},
      {"code": "OVER_MAX", "where": "Category I total", "message": "Category I total is 125.05; the form's maximum is 125."},
      {"code": "OVER_MAX", "where": "27(i) total", "message": "27(i) total is 20.01; the form's maximum is 20."},
      {"code": "OVER_MAX", "where": "27(ii) total", "message": "27(ii) total is 15.01; the form's maximum is 15."},
      {"code": "OVER_MAX", "where": "27(iii) total", "message": "27(iii) total is 15.01; the form's maximum is 15."},
      {"code": "OVER_MAX", "where": "28 E(i) total", "message": "28 E(i) total is 30.01; the form's maximum is 30."}
    ]
  },
  {
    "name": "category II exactly 25 is not capped",
    "api": {"c2": {"extension": [{"activity": "x", "score": 10}], "management": [{"activity": "x", "score": 10}],
                   "professional": [{"activity": "x", "score": 5}]}},
    "checks": {"p43.total": "25", "p43.raw": "25", "p43.capped": false, "p29.II": "25"},
    "problems": []
  },
  {
    "name": "decimals add exactly and string scores are accepted",
    "api": {"c3": {"journals": [{"title": "a", "row": "A1", "score": 0.1}, {"title": "b", "row": "A1", "score": 0.2}],
                   "chapters": [{"title": "c", "row": "B1b", "score": " 2.5 "}]}},
    "checks": {"p44.A1": "0.3", "p44.B1b": "2.5", "p29.III": "2.8"},
    "problems": []
  },
  {
    "name": "entry problems",
    "api": {
      "c1": {"classes": "abc", "exam": [{"type": "x"}]},
      "c3": {"journals": [
        {"title": "a", "score": 15},
        {"title": "b", "row": "A1"},
        {"title": "c", "row": "A1", "score": -5},
        {"title": "d", "row": "A1", "score": 7.125},
        {"title": "", "row": "", "score": ""},
        {"title": "e", "row": "Z9", "score": 10}
      ]}
    },
    "checks": {"p42.i_a": "", "p44.A1": "", "p29.III": "0"},
    "problems": [
      {"code": "BAD_SCORE", "where": "26(i)(a)", "message": "26(i)(a): score must be a number (0 or more) with at most 2 decimals."},
      {"code": "NO_SCORE", "where": "26(iv), entry 1", "message": "26(iv), entry 1: score is missing."},
      {"code": "NO_ROW", "where": "28 A, entry 1", "message": "28 A, entry 1: choose the point-44 row."},
      {"code": "NO_SCORE", "where": "28 A, entry 2", "message": "28 A, entry 2: score is missing."},
      {"code": "BAD_SCORE", "where": "28 A, entry 3", "message": "28 A, entry 3: score must be a number (0 or more) with at most 2 decimals."},
      {"code": "BAD_SCORE", "where": "28 A, entry 4", "message": "28 A, entry 4: score must be a number (0 or more) with at most 2 decimals."},
      {"code": "BAD_ROW", "where": "28 A, entry 6", "message": "28 A, entry 6: \"Z9\" is not a valid point-44 row for this table."}
    ]
  },
  {
    "name": "single-row table ignores any row value",
    "api": {"c3": {"proceedings": [{"title": "p", "row": "A1", "score": 10}]}},
    "checks": {"p44.B2": "10", "p44.A1": "", "p29.III": "10"},
    "problems": []
  },
  {
    "name": "only Ph.D thesis submitted",
    "api": {"c3": {"guidance": {"phdSubmittedScore": 7}}},
    "checks": {"p44.D2a": "", "p44.D2b": "7", "p28.phd": "7", "p29.III": "7"},
    "problems": []
  },
  {
    "name": "a zero score still fills its cell",
    "api": {"c3": {"papers": [{"title": "x", "row": "E2a", "score": 0}]}},
    "checks": {"p44.E2a": "0", "p44.total": "0"},
    "problems": []
  }
]
```

- [ ] **Step 2: Write the failing Node test `tests/api_tally.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tally, fmt, toCents, normalizeApi, P44_ORDER, ROW_CHOICES, ROW_LABELS } from '../api_tally.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/cases.json', import.meta.url), 'utf8'));
const pick = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);

for (const c of cases) {
  test(c.name, () => {
    const r = tally(c.api);
    if (c.values) assert.deepStrictEqual(r.values, c.values);
    for (const [path, expected] of Object.entries(c.checks || {})) assert.strictEqual(pick(r.values, path), expected, path);
    assert.deepStrictEqual(r.problems, c.problems);
  });
}

test('invariants: point 29 equals the 42/43/44 totals', () => {
  for (const c of cases) {
    const v = tally(c.api).values;
    assert.strictEqual(v.p29.I, v.p42.total);
    assert.strictEqual(v.p29.II, v.p43.total);
    assert.strictEqual(v.p29.III, v.p44.total);
  }
});

test('fmt drops trailing zeros', () => {
  assert.strictEqual(fmt(2000), '20');
  assert.strictEqual(fmt(750), '7.5');
  assert.strictEqual(fmt(1225), '12.25');
  assert.strictEqual(fmt(5), '0.05');
  assert.strictEqual(fmt(0), '0');
});

test('toCents', () => {
  assert.deepStrictEqual(toCents(''), { state: 'missing' });
  assert.deepStrictEqual(toCents(undefined), { state: 'missing' });
  assert.deepStrictEqual(toCents('7.50'), { state: 'ok', cents: 750 });
  assert.deepStrictEqual(toCents(0.1), { state: 'ok', cents: 10 });
  assert.deepStrictEqual(toCents('1.234'), { state: 'bad' });
  assert.deepStrictEqual(toCents(-1), { state: 'bad' });
  assert.deepStrictEqual(toCents(true), { state: 'bad' });
});

test('every row code has a label and is in P44_ORDER', () => {
  for (const codes of Object.values(ROW_CHOICES)) for (const code of codes) {
    assert.ok(ROW_LABELS[code], code);
    assert.ok(P44_ORDER.includes(code), code);
  }
  for (const code of ['D1', 'D2a', 'D2b']) assert.ok(ROW_LABELS[code]);
  assert.strictEqual(P44_ORDER.length, 25);
});

test('normalizeApi reports old flat fields and keeps other keys', () => {
  const { api, legacy } = normalizeApi({ apiC3: 12, apiC1Exam: '', lastAcademicYear: { cat1: '90' }, c1: { classes: 40 } });
  assert.deepStrictEqual(legacy, [['apiC3', 12]]);
  assert.deepStrictEqual(api.lastAcademicYear, { cat1: '90' });
  assert.strictEqual(api.c1.classes, 40);
  assert.deepStrictEqual(api.c3.journals, []);
  assert.strictEqual(api.apiC3, undefined);
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `node --test tests/api_tally.test.js`
Expected: FAIL with `Cannot find module ... api_tally.js`.

- [ ] **Step 4: Write `api_tally.js`**

```js
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
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/api_tally.test.js`
Expected: all tests PASS (10 fixture cases + 5 others), `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/fixtures/cases.json tests/api_tally.test.js api_tally.js
git commit -m "feat: JS API score tally with shared test cases"
```

---

### Task 2: Python tally (mirror) passing the same cases

**Files:**
- Create: `api_tally.py`
- Create: `tests/test_api_tally.py`

**Interfaces:**
- Consumes: `tests/fixtures/cases.json` (Task 1).
- Produces: `tally(api) -> {'values': ..., 'problems': [...]}` (same shape and strings as JS; `capped` is a bool); `is_empty_entry(e) -> bool`; `score_text(v) -> str` (formatted score or `''`); `to_cents(v) -> (state, cents)`; `fmt(cents) -> str`; `LEVEL_TEXT: dict` (E2a…E3b → text printed in the "Whether international/National…" columns); `P44_ORDER: list`.

- [ ] **Step 1: Write the failing test `tests/test_api_tally.py`**

```python
import json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api_tally import tally, fmt, to_cents, score_text, is_empty_entry  # noqa: E402

CASES = json.loads((ROOT / 'tests' / 'fixtures' / 'cases.json').read_text(encoding='utf-8'))


def pick(obj, path):
    for k in path.split('.'):
        obj = obj[k]
    return obj


class SharedCases(unittest.TestCase):
    def test_cases(self):
        for c in CASES:
            with self.subTest(c['name']):
                r = tally(c['api'])
                if 'values' in c:
                    self.assertEqual(r['values'], c['values'])
                for path, expected in c.get('checks', {}).items():
                    self.assertEqual(pick(r['values'], path), expected, path)
                self.assertEqual(r['problems'], c['problems'])

    def test_invariants(self):
        for c in CASES:
            v = tally(c['api'])['values']
            self.assertEqual(v['p29']['I'], v['p42']['total'])
            self.assertEqual(v['p29']['II'], v['p43']['total'])
            self.assertEqual(v['p29']['III'], v['p44']['total'])


class Helpers(unittest.TestCase):
    def test_fmt(self):
        self.assertEqual([fmt(2000), fmt(750), fmt(1225), fmt(5), fmt(0)], ['20', '7.5', '12.25', '0.05', '0'])

    def test_to_cents(self):
        self.assertEqual(to_cents(''), ('missing', None))
        self.assertEqual(to_cents(None), ('missing', None))
        self.assertEqual(to_cents('7.50'), ('ok', 750))
        self.assertEqual(to_cents(0.1), ('ok', 10))
        self.assertEqual(to_cents(45.0), ('ok', 4500))
        self.assertEqual(to_cents('1.234'), ('bad', None))
        self.assertEqual(to_cents(-1), ('bad', None))
        self.assertEqual(to_cents(True), ('bad', None))
        self.assertEqual(to_cents('\u0663'), ('bad', None))  # Arabic-Indic digit: JS rejects it too

    def test_score_text_and_empty(self):
        self.assertEqual(score_text(7.5), '7.5')
        self.assertEqual(score_text(''), '')
        self.assertTrue(is_empty_entry({'title': ' ', 'score': ''}))
        self.assertFalse(is_empty_entry({'score': 0}))


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `python -m unittest discover -s tests -v`
Expected: ERROR `ModuleNotFoundError: No module named 'api_tally'`.

- [ ] **Step 3: Write `api_tally.py`**

```python
"""Tally of teacher-entered API scores (points 26-28) into points 29, 42, 43 and 44.

Line-for-line mirror of api_tally.js; both are checked against tests/fixtures/cases.json.
Scores are handled in whole hundredths so decimal sums are exact.
"""
import math
import re

ROW_CHOICES = {
    'journals': ['A1', 'A2'],
    'chapters': ['B1a', 'B1b'],
    'proceedings': ['B2'],
    'books': ['B3a', 'B3b', 'B3c'],
    'ongoing': ['C1a', 'C1b', 'C1c', 'C2'],
    'completed': ['C3', 'C4'],
    'training': ['E1a', 'E1b'],
    'papers': ['E2a', 'E2b', 'E2c', 'E2d'],
    'lectures': ['E3a', 'E3b'],
}
C3_WHERE = {
    'journals': '28 A', 'chapters': '28 B(i)', 'proceedings': '28 B(ii)', 'books': '28 B(iii)',
    'ongoing': '28 C(i & ii)', 'completed': '28 C(iii & iv)', 'training': '28 E(i)', 'papers': '28 E(ii)', 'lectures': '28 E(iii)',
}
P44_ORDER = ['A1', 'A2', 'B1a', 'B1b', 'B2', 'B3a', 'B3b', 'B3c', 'C1a', 'C1b', 'C1c', 'C2', 'C3', 'C4',
             'D1', 'D2a', 'D2b', 'E1a', 'E1b', 'E2a', 'E2b', 'E2c', 'E2d', 'E3a', 'E3b']
# Printed in the "Whether international/National/State..." column of 28 E(ii) and E(iii).
LEVEL_TEXT = {'E2a': 'International', 'E2b': 'National', 'E2c': 'Regional / State', 'E2d': 'Local - University / College',
              'E3a': 'International', 'E3b': 'National'}

_SCORE_RE = re.compile(r'[0-9]+(\.[0-9]{1,2})?')


def to_cents(v):
    if v is None:
        return ('missing', None)
    if isinstance(v, bool):
        return ('bad', None)
    if isinstance(v, (int, float)):
        if isinstance(v, float) and not math.isfinite(v):
            return ('bad', None)
        s = str(v)
    elif isinstance(v, str):
        s = v.strip()
    else:
        return ('bad', None)
    if s == '':
        return ('missing', None)
    if not _SCORE_RE.fullmatch(s):
        return ('bad', None)
    whole, _, frac = s.partition('.')
    return ('ok', int(whole) * 100 + int((frac + '00')[:2]))


def fmt(cents):
    whole, frac = divmod(cents, 100)
    if frac == 0:
        return str(whole)
    if frac % 10 == 0:
        return f'{whole}.{frac // 10}'
    return f'{whole}.{frac:02d}'


def score_text(v):
    state, c = to_cents(v)
    return fmt(c) if state == 'ok' else ''


def is_empty_entry(e):
    if not isinstance(e, dict):
        return True
    return all(v is None or (isinstance(v, str) and v.strip() == '') for v in e.values())


def _group(obj, key):
    x = obj.get(key) if isinstance(obj, dict) else None
    return x if isinstance(x, dict) else {}


def _list(obj, key):
    x = obj.get(key)
    return x if isinstance(x, list) else []


def tally(api):
    c1, c2, c3 = _group(api, 'c1'), _group(api, 'c2'), _group(api, 'c3')
    problems = []

    def add(code, where, message):
        problems.append({'code': code, 'where': where, 'message': message})

    def bad(where):
        add('BAD_SCORE', where, f'{where}: score must be a number (0 or more) with at most 2 decimals.')

    def single(v, where):
        state, c = to_cents(v)
        if state == 'bad':
            bad(where)
            return None
        return c

    def list_sum(entries, where):
        total = 0
        for idx, e in enumerate(entries, 1):
            if is_empty_entry(e):
                continue
            w = f'{where}, entry {idx}'
            state, c = to_cents(e.get('score'))
            if state == 'missing':
                add('NO_SCORE', w, f'{w}: score is missing.')
                continue
            if state == 'bad':
                bad(w)
                continue
            total += c
        return total

    a = single(c1.get('classes'), '26(i)(a)')
    b = single(c1.get('excess'), '26(i)(b)')
    ii = single(c1.get('resourcesScore'), '26(ii)')
    iii = list_sum(_list(c1, 'innovative'), '26(iii)')
    iv = list_sum(_list(c1, 'exam'), '26(iv)')
    e1 = list_sum(_list(c2, 'extension'), '27(i)')
    e2 = list_sum(_list(c2, 'management'), '27(ii)')
    e3 = list_sum(_list(c2, 'professional'), '27(iii)')

    p44 = {k: 0 for k in P44_ORDER}
    fed = {k: False for k in P44_ORDER}
    for name, choices in ROW_CHOICES.items():
        where = C3_WHERE[name]
        for idx, e in enumerate(_list(c3, name), 1):
            if is_empty_entry(e):
                continue
            w = f'{where}, entry {idx}'
            row = None
            if len(choices) == 1:
                row = choices[0]
            else:
                r = e.get('row')
                r = r.strip() if isinstance(r, str) else ''
                if r == '':
                    add('NO_ROW', w, f'{w}: choose the point-44 row.')
                elif r not in choices:
                    add('BAD_ROW', w, f'{w}: "{r}" is not a valid point-44 row for this table.')
                else:
                    row = r
            state, c = to_cents(e.get('score'))
            if state == 'missing':
                add('NO_SCORE', w, f'{w}: score is missing.')
                continue
            if state == 'bad':
                bad(w)
                continue
            if row is None:
                continue
            p44[row] += c
            fed[row] = True
    g = _group(c3, 'guidance')
    d1 = single(g.get('mphilScore'), '28 D M.Phil score')
    d2a = single(g.get('phdAwardedScore'), '28 D Ph.D awarded score')
    d2b = single(g.get('phdSubmittedScore'), '28 D Ph.D thesis submitted score')
    for key, c in (('D1', d1), ('D2a', d2a), ('D2b', d2b)):
        if c is not None:
            p44[key] += c
            fed[key] = True

    cat1 = (a or 0) + (b or 0) + (ii or 0) + iii + iv
    raw2 = e1 + e2 + e3
    cat2 = min(raw2, 2500)
    cat3 = sum(p44[k] for k in P44_ORDER)
    e1_total = p44['E1a'] + p44['E1b']

    def over(c, max_c, where):
        if c is not None and c > max_c:
            add('OVER_MAX', where, f"{where} is {fmt(c)}; the form's maximum is {fmt(max_c)}.")

    over(a, 5000, '26(i)(a)')
    over(b, 1000, '26(i)(b)')
    over(ii, 2000, '26(ii)')
    over(iii, 2000, '26(iii) total')
    over(iv, 2500, '26(iv) total')
    over(cat1, 12500, 'Category I total')
    over(e1, 2000, '27(i) total')
    over(e2, 1500, '27(ii) total')
    over(e3, 1500, '27(iii) total')
    over(e1_total, 3000, '28 E(i) total')

    def opt(c):
        return '' if c is None else fmt(c)

    p44v = {k: (fmt(p44[k]) if fed[k] else '') for k in P44_ORDER}
    p44v['total'] = fmt(cat3)
    return {
        'values': {
            'p42': {'i_a': opt(a), 'i_b': opt(b), 'ii': opt(ii), 'iii': fmt(iii), 'iv': fmt(iv), 'total': fmt(cat1)},
            'p43': {'i': fmt(e1), 'ii': fmt(e2), 'iii': fmt(e3), 'total': fmt(cat2), 'raw': fmt(raw2), 'capped': raw2 > 2500},
            'p44': p44v,
            'p29': {'I': fmt(cat1), 'II': fmt(cat2), 'I_II': fmt(cat1 + cat2), 'III': fmt(cat3)},
            'p28': {'phd': '' if d2a is None and d2b is None else fmt((d2a or 0) + (d2b or 0)), 'e1Total': fmt(e1_total)},
        },
        'problems': problems,
    }
```

- [ ] **Step 4: Run both test suites and confirm they pass**

Run: `python -m unittest discover -s tests -v` then `node --test tests/api_tally.test.js`
Expected: both PASS. Passing the same `cases.json` in both is the parity check.

- [ ] **Step 5: Commit**

```bash
git add api_tally.py tests/test_api_tally.py
git commit -m "feat: Python mirror of the API tally, checked against the shared cases"
```

---

### Task 3: Restore 27(iii) in the Word template

In table 12 of `ACR_EMPLOYEE_MASTER.docx`, the 27(iii) heading row holds sample data ("(iii) Chaired a session in, | Session Chair in National Seminar | 02") and its two blank entry rows are missing. PDF page 8 of the form has "(iii) Professional Development Activities", two blank rows, then "Total (Max.15)".

**Files:**
- Create: `tools/fix_template_27iii.py`
- Create: `tests/test_template.py`
- Modify (by running the script): `ACR_EMPLOYEE_MASTER.docx`

**Interfaces:**
- Produces: table 12 rows = 0 header, 1 "(i)…", 2–3 blank, 4 "Total (Max.20)", 5 "(ii)…", 6–7 blank, 8 "Total (Max.15)", 9 "(iii) Professional Development Activities", 10–11 blank, 12 "Total (Max.15)", 13 "Total Score (I+II+III) (Max. 25)".

- [ ] **Step 1: Write the failing test `tests/test_template.py`**

```python
import sys, unittest
from pathlib import Path
from docx import Document

ROOT = Path(__file__).resolve().parents[1]


class Template27iii(unittest.TestCase):
    def test_27iii_matches_official_form(self):
        t = Document(ROOT / 'ACR_EMPLOYEE_MASTER.docx').tables[12]
        col1 = [r.cells[1].text.strip() for r in t.rows]
        self.assertEqual(len(t.rows), 14)
        self.assertEqual(col1[9], '(iii) Professional Development Activities')
        self.assertEqual([t.rows[9].cells[c].text.strip() for c in (0, 2, 3)], ['', '', ''])
        for r in (10, 11):
            self.assertEqual([c.text.strip() for c in t.rows[r].cells], ['', '', '', ''])
        self.assertEqual(col1[12], 'Total (Max.15)')
        self.assertTrue(col1[13].startswith('Total Score (I+II+III)'))
        self.assertNotIn('Chaired', ' '.join(col1))


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `python -m unittest tests.test_template -v` (from the project root)
Expected: FAIL (`13 != 14` or the "(iii) Chaired…" text).

- [ ] **Step 3: Write `tools/fix_template_27iii.py`**

```python
"""One-time fix: restore point 27(iii) in ACR_EMPLOYEE_MASTER.docx to the official form (PDF page 8).

Table 12's "(iii)" row was overwritten with sample data and its two blank entry rows were missing.
Refuses to run if the table does not look exactly as expected, so it cannot damage a fixed template.
"""
from copy import deepcopy
from pathlib import Path
from docx import Document

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'


def main():
    doc = Document(MASTER)
    t = doc.tables[12]
    row9, blank = t.rows[9], t.rows[6]
    runs = row9.cells[1].paragraphs[0].runs
    if len(t.rows) != 12 or not row9.cells[1].text.startswith('(iii) Chaired') or row9.cells[3].text.strip() != '02':
        raise SystemExit('Table 12 is not in the expected damaged state; nothing changed.')
    if any(c.text.strip() for c in blank.cells):
        raise SystemExit('Row 6 of table 12 is not blank; nothing changed.')
    # Keep run 0 ("(iii) ", bold) and its formatting; replace the sample text.
    runs[1].text = 'Professional Development Activities'
    for r in runs[2:]:
        r.text = ''
    for c in (2, 3):
        for p in row9.cells[c].paragraphs:
            for r in p.runs:
                r.text = ''
    row9._tr.addnext(deepcopy(blank._tr))
    row9._tr.addnext(deepcopy(blank._tr))
    doc.save(MASTER)
    print('Fixed table 12 (point 27(iii)).')


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run the fix, then the test**

Run: `python tools/fix_template_27iii.py` → prints `Fixed table 12 (point 27(iii)).`
Run it a second time → prints `Table 12 is not in the expected damaged state; nothing changed.` (guard works).
Run: `python -m unittest tests.test_template -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/fix_template_27iii.py tests/test_template.py ACR_EMPLOYEE_MASTER.docx
git commit -m "fix: restore point 27(iii) rows in the Word template to the official form"
```

---

### Task 4: Word generator fills 26–29 and 42–44 from the tally

**Files:**
- Modify: `generate_acr.py` (imports; delete `score_classes` and `api_scores`; add helpers + `fill_api_tables`; change `generate()` and `__main__`)
- Create: `tests/test_generate_api.py`

**Interfaces:**
- Consumes: `api_tally.tally`, `is_empty_entry`, `score_text`, `LEVEL_TEXT` (Task 2); fixed template (Task 3).
- Produces: `generate(data, out_docx) -> values` (the tally `values` dict); raises `ApiProblemsError(problems)` **before writing anything** when the tally has problems. CLI exits with code 1 and prints each problem message.

- [ ] **Step 1: Write the failing test `tests/test_generate_api.py`**

```python
import json, shutil, sys, tempfile, unittest
from pathlib import Path
from docx import Document

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generate_acr  # noqa: E402

CASES = json.loads((ROOT / 'tests' / 'fixtures' / 'cases.json').read_text(encoding='utf-8'))
WORKED = CASES[0]['api']


def txt(doc, t, r, c):
    return doc.tables[t].rows[r].cells[c].text.strip()


class GenerateApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        out = cls.tmp / 'worked.docx'
        generate_acr.generate({'session': '2025-26', 'api': WORKED}, out)
        cls.doc = Document(out)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_point_29_col4_and_col3_untouched(self):
        d = self.doc
        self.assertEqual([txt(d, 23, r, 3) for r in (1, 2, 3, 4)], ['106.75', '25', '131.75', '193'])
        self.assertEqual([txt(d, 23, r, 2) for r in (1, 2, 3, 4)], ['', '', '', ''])

    def test_point_42_col4(self):
        self.assertEqual([txt(self.doc, 25, r, 3) for r in range(3, 9)], ['45', '6', '18.5', '15.25', '22', '106.75'])

    def test_point_43_col4(self):
        self.assertEqual([txt(self.doc, 26, r, 3) for r in range(3, 7)], ['15', '12.5', '3', '25'])

    def test_point_44_col5(self):
        d = self.doc
        expected = CASES[0]['values']['p44']
        for code, (t, r, c, _) in generate_acr.P44_CELLS.items():
            self.assertEqual(txt(d, t, r, c), expected[code], code)
        self.assertEqual(txt(d, 30, 2, 4), '193')

    def test_principal_columns_empty(self):
        d = self.doc
        for t, first, api_col in ((25, 3, 3), (26, 3, 3), (27, 3, 4), (28, 0, 4), (29, 0, 5), (30, 0, 4)):
            for r in range(first, len(d.tables[t].rows)):
                seen = set()
                for cell in d.tables[t].rows[r].cells[api_col + 1:]:
                    if id(cell._tc) in seen:
                        continue
                    seen.add(id(cell._tc))
                    self.assertEqual(cell.text.strip(), '', f'table {t} row {r}')

    def test_point_26_tables(self):
        d = self.doc
        self.assertEqual(txt(d, 8, 1, 2), '45')
        self.assertEqual(txt(d, 8, 2, 2), '6')
        self.assertEqual([txt(d, 9, 1, c) for c in range(5)], ['1', 'B.A. I Economics', 'Text book', 'Yes', 'Notes'])
        self.assertEqual(txt(d, 9, 6, 4), '18.5')
        self.assertEqual([txt(d, 10, r, 2) for r in (1, 2, 3)], ['8', '7.25', '15.25'])
        self.assertEqual([txt(d, 11, r, 4) for r in (1, 2, 3)], ['10', '12', '22'])

    def test_point_27_table(self):
        d = self.doc
        self.assertEqual([txt(d, 12, 2, c) for c in range(4)], ['1', 'NSS', '2', '10'])
        self.assertEqual(txt(d, 12, 4, 3), '15')
        self.assertEqual([txt(d, 12, r, 3) for r in (6, 7, 8)], ['7.5', '5', '12.5'])
        self.assertEqual([txt(d, 12, 10, c) for c in range(4)], ['1', 'Seminar organised', 'one-day', '3'])
        self.assertEqual(txt(d, 12, 12, 3), '3')
        self.assertEqual(txt(d, 12, 13, 3), '25')

    def test_point_28_tables(self):
        d = self.doc
        self.assertEqual(len(d.tables[13].rows), 4)  # header + 3 papers
        self.assertEqual([txt(d, 13, r, 7) for r in (1, 2, 3)], ['15', '7.5', '10'])
        self.assertEqual(txt(d, 15, 1, 6), '10')
        self.assertEqual(txt(d, 19, 1, 4), '3')
        self.assertEqual(txt(d, 19, 2, 4), '17')
        self.assertEqual([txt(d, 21, 1, 4), txt(d, 21, 3, 4), txt(d, 21, 4, 4)], ['National', 'Regional / State', 'Local - University / College'])
        self.assertEqual(txt(d, 22, 1, 5), '5')

    def test_problems_block_generation(self):
        out = self.tmp / 'blocked.docx'
        with self.assertRaises(generate_acr.ApiProblemsError) as ctx:
            generate_acr.generate({'api': {'c1': {'classes': 60}}}, out)
        self.assertEqual(ctx.exception.problems[0]['where'], '26(i)(a)')
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `python -m unittest tests.test_generate_api -v`
Expected: FAIL/ERROR (`P44_CELLS` / `ApiProblemsError` not defined).

- [ ] **Step 3: Edit `generate_acr.py` imports**

After the line `from docx.enum.text import WD_ALIGN_PARAGRAPH` add:

```python
from api_tally import tally, is_empty_entry, score_text, LEVEL_TEXT
```

- [ ] **Step 4: Replace the two functions `score_classes` and `api_scores` (whole bodies) with the new helpers**

```python
class ApiProblemsError(Exception):
    """The teacher's API entries have problems; the ACR must not be generated."""
    def __init__(self, problems):
        self.problems = problems
        super().__init__('\n'.join(p['message'] for p in problems))


# Point 44 "API Score reported in self appraisal" cells: code -> (table, row, column, start of Max. Score text).
# The Max. Score column is the column just before the API column; it is checked before writing.
P44_CELLS = {
    'A1': (27, 3, 4, '15/'), 'A2': (27, 4, 4, '10/'), 'B1a': (27, 5, 4, '10/'), 'B1b': (27, 6, 4, '5/'),
    'B2': (28, 0, 4, '10/'), 'B3a': (28, 1, 4, '50/'), 'B3b': (28, 2, 4, '25/'), 'B3c': (28, 3, 4, '15/'),
    'C1a': (28, 4, 4, '20/'), 'C1b': (28, 5, 4, '15/'), 'C1c': (28, 6, 4, '10/'),
    'C2': (29, 0, 5, '10/'), 'C3': (29, 1, 5, '20/'), 'C4': (29, 2, 5, '30/'),
    'D1': (29, 3, 5, '3/'), 'D2a': (29, 4, 5, '10/'), 'D2b': (29, 5, 5, '7/'),
    'E1a': (29, 6, 5, '20/'), 'E1b': (29, 7, 5, '10/'),
    'E2a': (29, 8, 5, '10/'), 'E2b': (29, 9, 5, '7.5/'), 'E2c': (29, 10, 5, '5/'), 'E2d': (29, 11, 5, '3/'),
    'E3a': (30, 0, 4, '10/'), 'E3b': (30, 1, 4, '5/'),
}


def _norm(s):
    return re.sub(r'\s+', '', s or '')


def _check(ok, ti, what):
    if not ok:
        raise RuntimeError(f'Template table {ti}: expected {what}. The template layout has changed; nothing was written.')


def find_row(table, col, prefix, start=0):
    for r in range(start, len(table.rows)):
        if _norm(table.rows[r].cells[col].text).startswith(_norm(prefix)):
            return r
    raise RuntimeError(f'Template: no row starting with "{prefix}" in column {col}.')


def fill_between(doc, ti, first, end, rows):
    """Write rows into table ti from row `first`, before row `end`; clone blank entry rows when more are needed."""
    t = doc.tables[ti]
    free = end - first
    for _ in range(len(rows) - free):
        clone_row(t, end - 1)
    for i, vals in enumerate(rows):
        for c, v in enumerate(vals):
            set_cell(doc, ti, first + i, c, v)


def entries(api, group, name):
    g = api.get(group) if isinstance(api.get(group), dict) else {}
    lst = g.get(name) if isinstance(g.get(name), list) else []
    return [e for e in lst if not is_empty_entry(e)]


def field(e, key):
    v = e.get(key)
    return '' if v is None else str(v)


def fill_api_tables(doc, api, v):
    T = doc.tables
    # 26(i)(a), (b)
    _check(_norm(T[8].rows[1].cells[0].text) == '(a)' and _norm(T[8].rows[2].cells[0].text) == '(b)', 8, '(a)/(b) rows')
    set_cell(doc, 8, 1, 2, v['p42']['i_a'])
    set_cell(doc, 8, 2, 2, v['p42']['i_b'])
    # 26(ii)
    fill_between(doc, 9, 1, find_row(T[9], 0, '**Besides'),
                 [[i, field(e, 'course'), field(e, 'consulted'), field(e, 'prescribed'), field(e, 'additional')]
                  for i, e in enumerate(entries(api, 'c1', 'resources'), 1)])
    score_row = find_row(T[9], 0, 'APIscorebased') + 1
    _check(_norm(T[9].rows[score_row - 1].cells[4].text) == 'APIScore', 9, '"API Score" above the 26(ii) score cell')
    set_cell(doc, 9, score_row, 4, v['p42']['ii'])
    # 26(iii)
    fill_between(doc, 10, 1, find_row(T[10], 1, 'Total Score'),
                 [[i, field(e, 'description'), score_text(e.get('score'))] for i, e in enumerate(entries(api, 'c1', 'innovative'), 1)])
    set_cell(doc, 10, find_row(T[10], 1, 'Total Score'), 2, v['p42']['iii'])
    # 26(iv)
    fill_between(doc, 11, 1, find_row(T[11], 1, 'Total Score'),
                 [[i, field(e, 'type'), field(e, 'assigned'), field(e, 'extent'), score_text(e.get('score'))]
                  for i, e in enumerate(entries(api, 'c1', 'exam'), 1)])
    set_cell(doc, 11, find_row(T[11], 1, 'Total Score'), 4, v['p42']['iv'])
    # 27 (i), (ii), (iii)
    for heading, total_label, name, col2, total in (('(i)', 'Total (Max.20)', 'extension', 'hours', v['p43']['i']),
                                                    ('(ii)', 'Total (Max.15)', 'management', 'responsibility', v['p43']['ii']),
                                                    ('(iii)', 'Total (Max.15)', 'professional', 'details', v['p43']['iii'])):
        h = find_row(T[12], 1, heading)
        end = find_row(T[12], 1, total_label, h + 1)
        fill_between(doc, 12, h + 1, end,
                     [[i, field(e, 'activity'), field(e, col2), score_text(e.get('score'))] for i, e in enumerate(entries(api, 'c2', name), 1)])
        set_cell(doc, 12, find_row(T[12], 1, total_label, h + 1), 3, total)
    set_cell(doc, 12, find_row(T[12], 1, 'Total Score'), 3, v['p43']['total'])
    # 28 A ... E(iii) detail tables
    sc = lambda e: score_text(e.get('score'))
    fill_rows(doc, 13, [[i, field(e, 'title'), field(e, 'journal'), field(e, 'issn'), field(e, 'peer'), field(e, 'coauthors'), field(e, 'mainAuthor'), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'journals'), 1)], 1)
    fill_rows(doc, 14, [[i, field(e, 'title'), field(e, 'book'), field(e, 'issn'), field(e, 'peer'), field(e, 'coauthors'), field(e, 'mainAuthor'), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'chapters'), 1)], 1)
    fill_rows(doc, 15, [[i, field(e, 'title'), field(e, 'conference'), field(e, 'issn'), field(e, 'coauthors'), field(e, 'mainAuthor'), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'proceedings'), 1)], 1)
    fill_rows(doc, 16, [[i, field(e, 'title'), field(e, 'type'), field(e, 'publisher'), field(e, 'peer'), field(e, 'coauthors'), field(e, 'mainAuthor'), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'books'), 1)], 1)
    fill_rows(doc, 17, [[i, field(e, 'title'), field(e, 'agency'), field(e, 'period'), field(e, 'amount'), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'ongoing'), 1)], 1)
    fill_rows(doc, 18, [[i, field(e, 'title'), field(e, 'agency'), field(e, 'period'), field(e, 'amount'), field(e, 'outcome'), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'completed'), 1)], 1)
    g = api.get('c3', {}).get('guidance', {}) if isinstance(api.get('c3'), dict) else {}
    g = g if isinstance(g, dict) else {}
    _check(T[19].rows[1].cells[0].text.startswith('M.Phil') and T[19].rows[2].cells[0].text.startswith('Ph.D'), 19, 'M.Phil / Ph.D rows')
    for c, key in ((1, 'mphilEnrolled'), (2, 'mphilSubmitted'), (3, 'mphilAwarded')):
        set_cell(doc, 19, 1, c, field(g, key))
    set_cell(doc, 19, 1, 4, v['p44']['D1'])
    for c, key in ((1, 'phdEnrolled'), (2, 'phdSubmitted'), (3, 'phdAwarded')):
        set_cell(doc, 19, 2, c, field(g, key))
    set_cell(doc, 19, 2, 4, v['p28']['phd'])
    fill_rows(doc, 20, [[i, field(e, 'programme'), field(e, 'duration'), field(e, 'organisedBy'), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'training'), 1)], 1)
    fill_rows(doc, 21, [[i, field(e, 'title'), field(e, 'conference'), field(e, 'organisedBy'), LEVEL_TEXT.get(e.get('row'), ''), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'papers'), 1)], 1)
    fill_rows(doc, 22, [[i, field(e, 'title'), field(e, 'conference'), field(e, 'organisedBy'), LEVEL_TEXT.get(e.get('row'), ''), sc(e)]
                        for i, e in enumerate(entries(api, 'c3', 'lectures'), 1)], 1)
    # 29: column 4 from the tally; column 3 keeps its existing source (api.lastAcademicYear).
    lay = api.get('lastAcademicYear') if isinstance(api.get('lastAcademicYear'), dict) else {}
    for r, label, key, value in ((1, 'Teaching', 'cat1', v['p29']['I']), (2, 'Co-curricular', 'cat2', v['p29']['II']),
                                 (3, 'Total', 'total12', v['p29']['I_II']), (4, 'Research', 'cat3', v['p29']['III'])):
        _check(_norm(T[23].rows[r].cells[1].text).startswith(label), 23, f'row {r} starting "{label}"')
        set_cell(doc, 23, r, 2, lay.get(key, ''))
        set_cell(doc, 23, r, 3, value)
    # 42: column 4
    for r, label, key in ((3, '(i)a', 'i_a'), (4, '(i)b', 'i_b'), (5, '(ii)', 'ii'), (6, '(iii)', 'iii'), (7, '(iv)', 'iv')):
        _check(_norm(T[25].rows[r].cells[0].text) == label, 25, f'row {r} "{label}"')
        set_cell(doc, 25, r, 3, v['p42'][key])
    _check(_norm(T[25].rows[8].cells[1].text).startswith('TotalScore'), 25, 'Total Score row')
    set_cell(doc, 25, 8, 3, v['p42']['total'])
    # 43: column 4
    for r, label, key in ((3, '(i)', 'i'), (4, '(ii)', 'ii'), (5, '(iii)', 'iii')):
        _check(_norm(T[26].rows[r].cells[0].text) == label, 26, f'row {r} "{label}"')
        set_cell(doc, 26, r, 3, v['p43'][key])
    _check(_norm(T[26].rows[6].cells[1].text).startswith('TotalScore'), 26, 'Total Score row')
    set_cell(doc, 26, 6, 3, v['p43']['total'])
    # 44: column 5, one cell per sub-row, then Total
    for code, (ti, r, c, max_prefix) in P44_CELLS.items():
        _check(_norm(T[ti].rows[r].cells[c - 1].text).startswith(max_prefix), ti, f'row {r} Max. Score "{max_prefix}" for {code}')
        _check(T[ti].rows[r].cells[c].text.strip() == '', ti, f'empty API cell for {code}')
        set_cell(doc, ti, r, c, v['p44'][code])
    _check(_norm(T[30].rows[2].cells[1].text) == 'Total', 30, 'Total row')
    set_cell(doc, 30, 2, 4, v['p44']['total'])
```

- [ ] **Step 5: Change `generate()`**

Replace the first four lines of `generate()`:

```python
def generate(data,out_docx):
    prepare_appendix_images()
    doc=Document(TEMPLATE)
    p=data.get('profile',{}); a=data.get('part2',{}); api=data.get('api',{})
    scores=api_scores(data)
```

with:

```python
def generate(data,out_docx):
    api=data.get('api') if isinstance(data.get('api'),dict) else {}
    result=tally(api)
    if result['problems']:
        raise ApiProblemsError(result['problems'])
    v=result['values']
    prepare_appendix_images()
    doc=Document(TEMPLATE)
    p=data.get('profile',{}); a=data.get('part2',{})
```

Then delete everything from the line `    set_cell(doc,8,1,2,f"{scores['classes']:.2f}"); set_cell(doc,8,2,2,f"{scores['extra']:.2f}")` down to and including the line `    set_cell(doc,23,4,2,api.get('lastAcademicYear',{}).get('cat3','')); set_cell(doc,23,4,3,f"{scores['cat3']:.2f}")` (the old tables 8–23 code, including the `# resources`, `# Category II detail table` and `# Category III tables` blocks). Put this line in its place:

```python
    fill_api_tables(doc,api,v)
```

At the end of `generate()`, replace `    return scores` with `    return v`.

- [ ] **Step 6: Change the CLI block at the bottom**

Replace:

```python
    s=generate(d,Path(args.output)); print(json.dumps(s,indent=2))
```

with:

```python
    try:
        values=generate(d,Path(args.output))
    except ApiProblemsError as err:
        import sys
        print('ACR not generated. Fix these API entries first:',file=sys.stderr)
        for prob in err.problems: print(' - '+prob['message'],file=sys.stderr)
        sys.exit(1)
    print(json.dumps(values,indent=2))
```

- [ ] **Step 7: Confirm no old names remain**

Run: `grep -n "api_scores\|score_classes\|scores\[" generate_acr.py`
Expected: no output.

- [ ] **Step 8: Run all Python tests**

Run: `python -m unittest discover -s tests -v`
Expected: all PASS (tally, template, generate).

- [ ] **Step 9: Check the CLI refuses bad input**

Run:
```bash
echo '{"api":{"c1":{"classes":60}}}' > tests_bad.json; python generate_acr.py tests_bad.json -o tests_bad.docx; echo "exit=$?"; ls tests_bad.docx; rm -f tests_bad.json
```
Expected: `ACR not generated...`, ` - 26(i)(a) is 60; the form's maximum is 50.`, `exit=1`, and `ls` reports that `tests_bad.docx` does not exist.

- [ ] **Step 10: Commit**

```bash
git add generate_acr.py tests/test_generate_api.py
git commit -m "feat: generator fills points 26-29 and 42-44 from the API tally and blocks on problems"
```

---

### Task 5: App entry tables for points 26–28

**Files:**
- Create: `api_ui.js`
- Modify: `index.html` (the whole `<section id="api" class="section">…</section>`)
- Modify: `app.js` (imports, state, collect/apply, updateScores, review, init)
- Modify: `styles.css` (append rules)
- Modify: `sw.js`

**Interfaces:**
- Consumes: `ROW_CHOICES`, `ROW_LABELS`, `C3_WHERE`, `P44_ORDER`, `tally`, `normalizeApi`, `emptyApi` (Task 1).
- Produces (from `api_ui.js`): `initApiUi({getApi: () => Api, onChange: () => void})`, `renderApiLists()`, `renderApiValues({values, problems})`.

- [ ] **Step 1: Replace the API section in `index.html`**

Replace everything from `<section id="api" class="section">` to its closing `</section>` (just before `<section id="enclosures"`) with:

```html
      <section id="api" class="section">
        <div class="card">
          <h2>Part II — Section II: PBAS / API (26–29)</h2>
          <p class="muted">Type the API score you claim for each item. The app adds them up into point 29 and into the self-appraisal columns of points 42, 43 and 44. Nothing is calculated for you; the rates in the lists are a guide only.</p>
          <p id="apiLegacyNotice" class="warning hidden"></p>
        </div>

        <div class="card">
          <h3>26. Category I — Teaching, Learning &amp; Evaluation</h3>
          <div class="grid two">
            <label>26(i)(a) Classes taken — API score (max 50)<input data-api-field="c1.classes" data-where="26(i)(a)" type="number" min="0" step="0.01" inputmode="decimal"></label>
            <label>26(i)(b) Teaching load in excess of UGC norm — API score (max 10)<input data-api-field="c1.excess" data-where="26(i)(b)" type="number" min="0" step="0.01" inputmode="decimal"></label>
          </div>
          <div class="section-heading"><div><h4>26(ii) Reading / instructional material consulted</h4></div><button type="button" class="secondary" data-api-add="c1.resources">+ Add Course</button></div>
          <div id="list-c1-resources" class="repeatable"></div>
          <label>26(ii) API score (max 20)<input data-api-field="c1.resourcesScore" data-where="26(ii)" type="number" min="0" step="0.01" inputmode="decimal"></label>
          <div class="section-heading"><div><h4>26(iii) Participatory &amp; innovative teaching-learning methods</h4></div><button type="button" class="secondary" data-api-add="c1.innovative">+ Add Item</button></div>
          <div id="list-c1-innovative" class="repeatable"></div>
          <div class="score-box">26(iii) total: <strong data-sum="p42.iii" data-max="20" data-where="26(iii) total"></strong></div>
          <div class="section-heading"><div><h4>26(iv) Examination duties assigned and performed</h4></div><button type="button" class="secondary" data-api-add="c1.exam">+ Add Duty</button></div>
          <div id="list-c1-exam" class="repeatable"></div>
          <div class="score-box">26(iv) total: <strong data-sum="p42.iv" data-max="25" data-where="26(iv) total"></strong></div>
          <div class="score-box">Category I total: <strong data-sum="p42.total" data-max="125" data-where="Category I total"></strong></div>
        </div>

        <div class="card">
          <h3>27. Category II — Co-curricular, Extension, Professional Development</h3>
          <div class="section-heading"><div><h4>27(i) Extension, co-curricular &amp; field based activities</h4></div><button type="button" class="secondary" data-api-add="c2.extension">+ Add Activity</button></div>
          <div id="list-c2-extension" class="repeatable"></div>
          <div class="score-box">27(i) total: <strong data-sum="p43.i" data-max="20" data-where="27(i) total"></strong></div>
          <div class="section-heading"><div><h4>27(ii) Contribution to corporate life and management of the institution</h4></div><button type="button" class="secondary" data-api-add="c2.management">+ Add Activity</button></div>
          <div id="list-c2-management" class="repeatable"></div>
          <div class="score-box">27(ii) total: <strong data-sum="p43.ii" data-max="15" data-where="27(ii) total"></strong></div>
          <div class="section-heading"><div><h4>27(iii) Professional development activities</h4></div><button type="button" class="secondary" data-api-add="c2.professional">+ Add Activity</button></div>
          <div id="list-c2-professional" class="repeatable"></div>
          <div class="score-box">27(iii) total: <strong data-sum="p43.iii" data-max="15" data-where="27(iii) total"></strong></div>
          <div class="score-box">Category II total: <strong data-sum="p43.total" data-max="25"></strong> <span id="cat2CapNote" class="muted"></span></div>
        </div>

        <div class="card">
          <h3>28. Category III — Research, Publications &amp; Academic Contributions</h3>
          <p class="muted">For every entry, choose the point-44 row it belongs to. Its score is added to that row of point 44.</p>
          <div class="section-heading"><div><h4>A. Published papers in journals</h4></div><button type="button" class="secondary" data-api-add="c3.journals">+ Add Paper</button></div>
          <div id="list-c3-journals" class="repeatable"></div>
          <div class="section-heading"><div><h4>B(i) Articles / chapters published in books</h4></div><button type="button" class="secondary" data-api-add="c3.chapters">+ Add Chapter</button></div>
          <div id="list-c3-chapters" class="repeatable"></div>
          <div class="section-heading"><div><h4>B(ii) Full papers in conference proceedings</h4></div><button type="button" class="secondary" data-api-add="c3.proceedings">+ Add Paper</button></div>
          <div id="list-c3-proceedings" class="repeatable"></div>
          <div class="section-heading"><div><h4>B(iii) Books published as single / co-author or as editor</h4></div><button type="button" class="secondary" data-api-add="c3.books">+ Add Book</button></div>
          <div id="list-c3-books" class="repeatable"></div>
          <div class="section-heading"><div><h4>C(i &amp; ii) Ongoing projects / consultancies</h4></div><button type="button" class="secondary" data-api-add="c3.ongoing">+ Add Project</button></div>
          <div id="list-c3-ongoing" class="repeatable"></div>
          <div class="section-heading"><div><h4>C(iii &amp; iv) Completed projects / consultancies</h4></div><button type="button" class="secondary" data-api-add="c3.completed">+ Add Project</button></div>
          <div id="list-c3-completed" class="repeatable"></div>
          <h4>D. Research guidance</h4>
          <div class="grid guidance-grid">
            <strong>M.Phil or equivalent</strong>
            <label>Number enrolled<input data-api-field="c3.guidance.mphilEnrolled" type="number" min="0" step="1"></label>
            <label>Thesis submitted<input data-api-field="c3.guidance.mphilSubmitted" type="number" min="0" step="1"></label>
            <label>Degree awarded<input data-api-field="c3.guidance.mphilAwarded" type="number" min="0" step="1"></label>
            <label>API score — D(i), degree awarded (3 / candidate)<input data-api-field="c3.guidance.mphilScore" data-where="28 D M.Phil score" type="number" min="0" step="0.01" inputmode="decimal"></label>
            <strong>Ph.D or equivalent</strong>
            <label>Number enrolled<input data-api-field="c3.guidance.phdEnrolled" type="number" min="0" step="1"></label>
            <label>Thesis submitted<input data-api-field="c3.guidance.phdSubmitted" type="number" min="0" step="1"></label>
            <label>Degree awarded<input data-api-field="c3.guidance.phdAwarded" type="number" min="0" step="1"></label>
            <label>API score — D(ii), degree awarded (10 / candidate)<input data-api-field="c3.guidance.phdAwardedScore" data-where="28 D Ph.D awarded score" type="number" min="0" step="0.01" inputmode="decimal"></label>
            <label>API score — D(ii), thesis submitted (7 / candidate)<input data-api-field="c3.guidance.phdSubmittedScore" data-where="28 D Ph.D thesis submitted score" type="number" min="0" step="0.01" inputmode="decimal"></label>
          </div>
          <div class="section-heading"><div><h4>E(i) Training courses, FDPs, refresher / orientation (max 30)</h4></div><button type="button" class="secondary" data-api-add="c3.training">+ Add Programme</button></div>
          <div id="list-c3-training" class="repeatable"></div>
          <div class="score-box">E(i) total: <strong data-sum="p28.e1Total" data-max="30" data-where="28 E(i) total"></strong></div>
          <div class="section-heading"><div><h4>E(ii) Papers presented in conferences, seminars, workshops, symposia</h4></div><button type="button" class="secondary" data-api-add="c3.papers">+ Add Paper</button></div>
          <div id="list-c3-papers" class="repeatable"></div>
          <div class="section-heading"><div><h4>E(iii) Invited lectures and chairmanships</h4></div><button type="button" class="secondary" data-api-add="c3.lectures">+ Add Lecture</button></div>
          <div id="list-c3-lectures" class="repeatable"></div>
          <div class="score-box">Category III total: <strong data-sum="p44.total"></strong></div>
        </div>

        <div class="card">
          <h3>Problems to fix before the ACR can be generated</h3>
          <ul id="apiProblems" class="problems"></ul>
        </div>
        <div class="card">
          <h3>Preview — how the scores will print (points 29, 42, 43, 44)</h3>
          <p class="muted">Only the teacher's self-appraisal columns are filled. The Principal's columns stay blank.</p>
          <div id="apiPreview" class="table-scroll"></div>
        </div>
      </section>
```

- [ ] **Step 2: Create `api_ui.js`**

```js
// Entry tables for points 26-28 and the live preview of points 29, 42, 43 and 44.
// Every value typed here is stored as typed in state.api; api_tally.js does all the arithmetic.
import { ROW_CHOICES, ROW_LABELS, C3_WHERE, P44_ORDER } from './api_tally.js';

const WHERE = { 'c1.innovative': '26(iii)', 'c1.exam': '26(iv)', 'c2.extension': '27(i)', 'c2.management': '27(ii)', 'c2.professional': '27(iii)' };
for (const [k, w] of Object.entries(C3_WHERE)) WHERE['c3.' + k] = w;

const SCORE = ['score', 'API score', 'score'];
const ROW = ['row', 'Point-44 row', 'row'];
const LEVEL = ['row', 'Level (point-44 row)', 'row'];
const FIELDS = {
  'c1.resources': [['course', 'Course / Paper'], ['consulted', 'Consulted'], ['prescribed', 'Prescribed'], ['additional', 'Additional resource provided']],
  'c1.innovative': [['description', 'Short description'], SCORE],
  'c1.exam': [['type', 'Type of examination duty'], ['assigned', 'Duties assigned'], ['extent', 'Extent carried out (%)'], SCORE],
  'c2.extension': [['activity', 'Type of activity'], ['hours', 'Average hours / week'], SCORE],
  'c2.management': [['activity', 'Activity'], ['responsibility', 'Yearly / semester-wise responsibilities'], SCORE],
  'c2.professional': [['activity', 'Activity'], ['details', 'Details'], SCORE],
  'c3.journals': [['title', 'Title with page nos.'], ['journal', 'Journal'], ['issn', 'ISSN / ISBN No.'], ['peer', 'Peer reviewed? Impact factor, if any'], ['coauthors', 'No. of co-authors'], ['mainAuthor', 'Are you the main author?'], ROW, SCORE],
  'c3.chapters': [['title', 'Title with page nos.'], ['book', 'Book title, editor & publisher'], ['issn', 'ISSN / ISBN No.'], ['peer', 'Peer reviewed?'], ['coauthors', 'No. of co-authors'], ['mainAuthor', 'Are you the main author?'], ROW, SCORE],
  'c3.proceedings': [['title', 'Title with page nos.'], ['conference', 'Details of conference publication'], ['issn', 'ISSN / ISBN No.'], ['coauthors', 'No. of co-authors'], ['mainAuthor', 'Are you the main author?'], SCORE],
  'c3.books': [['title', 'Title with page nos.'], ['type', 'Type of book & authorship'], ['publisher', 'Publisher & ISSN / ISBN No.'], ['peer', 'Peer reviewed?'], ['coauthors', 'No. of co-authors'], ['mainAuthor', 'Are you the main author?'], ROW, SCORE],
  'c3.ongoing': [['title', 'Title'], ['agency', 'Agency'], ['period', 'Period'], ['amount', 'Grant / amount mobilised (Rs lakh)'], ROW, SCORE],
  'c3.completed': [['title', 'Title'], ['agency', 'Agency'], ['period', 'Period'], ['amount', 'Grant / amount mobilised (Rs lakh)'], ['outcome', 'Policy document / patent as outcome?'], ROW, SCORE],
  'c3.training': [['programme', 'Programme'], ['duration', 'Duration'], ['organisedBy', 'Organised by'], ROW, SCORE],
  'c3.papers': [['title', 'Title of the paper presented'], ['conference', 'Title of conference / seminar'], ['organisedBy', 'Organised by'], LEVEL, SCORE],
  'c3.lectures': [['title', 'Title of lecture / academic session'], ['conference', 'Title of conference / seminar'], ['organisedBy', 'Organised by'], LEVEL, SCORE],
};

let getApi = () => ({});
let notify = () => {};

const listFor = path => { const [g, k] = path.split('.'); return getApi()[g][k]; };
const containerFor = path => document.getElementById('list-' + path.replace('.', '-'));
const readPath = path => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), getApi());
function writePath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], getApi())[last] = value;
}

function buildRow(path, entry, idx) {
  const row = document.createElement('div');
  row.className = 'repeat-row api-row';
  if (WHERE[path]) row.dataset.where = `${WHERE[path]}, entry ${idx + 1}`;
  const no = document.createElement('div');
  no.className = 'entry-no';
  no.textContent = `Entry ${idx + 1}`;
  row.appendChild(no);
  const listName = path.split('.')[1];
  for (const [key, label, kind] of FIELDS[path]) {
    const wrap = document.createElement('label');
    wrap.append(label);
    let input;
    if (kind === 'row') {
      input = document.createElement('select');
      input.add(new Option('— choose —', ''));
      for (const code of ROW_CHOICES[listName]) input.add(new Option(ROW_LABELS[code], code));
      input.value = entry.row ?? '';
    } else {
      input = document.createElement('input');
      if (kind === 'score') { input.type = 'number'; input.min = '0'; input.step = '0.01'; input.inputMode = 'decimal'; }
      input.value = entry[key] ?? '';
    }
    input.addEventListener(kind === 'row' ? 'change' : 'input', () => { entry[key] = input.value; });
    wrap.appendChild(input);
    row.appendChild(wrap);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    const list = listFor(path);
    list.splice(list.indexOf(entry), 1);
    renderList(path);
    notify();
  });
  row.appendChild(remove);
  return row;
}

function renderList(path) {
  const box = containerFor(path);
  box.innerHTML = '';
  listFor(path).forEach((entry, idx) => box.appendChild(buildRow(path, entry, idx)));
}

export function renderApiLists() {
  Object.keys(FIELDS).forEach(renderList);
  document.querySelectorAll('[data-api-field]').forEach(el => { el.value = readPath(el.dataset.apiField) ?? ''; });
}

export function initApiUi(opts) {
  getApi = opts.getApi;
  notify = opts.onChange;
  document.querySelectorAll('[data-api-field]').forEach(el => el.addEventListener('input', () => writePath(el.dataset.apiField, el.value)));
  document.querySelectorAll('[data-api-add]').forEach(btn => btn.addEventListener('click', () => {
    const path = btn.dataset.apiAdd;
    const list = listFor(path);
    const entry = {};
    list.push(entry);
    const row = buildRow(path, entry, list.length - 1);
    containerFor(path).appendChild(row);
    notify();
    requestAnimationFrame(() => { const first = row.querySelector('input,select'); if (first) first.focus(); });
  }));
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const pick = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
const SERIAL = { A1: 'A', A2: 'A', B1a: 'B (i)', B1b: 'B (i)', B2: 'B (ii)', B3a: 'B (iii)', B3b: 'B (iii)', B3c: 'B (iii)',
  C1a: 'C (i)', C1b: 'C (i)', C1c: 'C (i)', C2: 'C (ii)', C3: 'C (iii)', C4: 'C (iv)', D1: 'D (i)', D2a: 'D (ii)', D2b: 'D (ii)',
  E1a: 'E (i)', E1b: 'E (i)', E2a: 'E (ii)', E2b: 'E (ii)', E2c: 'E (ii)', E2d: 'E (ii)', E3a: 'E (iii)', E3b: 'E (iii)' };
const PRINCIPAL = ['Principal: agree', 'Reasons', "Principal's score"];

function table(title, head, rows, valCol) {
  const th = head.map(h => `<th>${esc(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c, i) => `<td${i === valCol ? ' class="val"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<h4>${esc(title)}</h4><table class="preview-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function previewHtml(v) {
  const blank = ['', '', ''];
  return [
    table('29. Summary of API scores', ['', 'Criteria', 'Last academic year', 'Total API score for assessment period'], [
      ['I', 'Teaching, learning and evaluation related activities', '', v.p29.I],
      ['II', 'Co-curricular, extension, professional development etc.', '', v.p29.II],
      ['', 'Total I + II', '', v.p29.I_II],
      ['III', 'Research and academic contribution', '', v.p29.III],
    ], 3),
    table('42. Category I', ['Serial', 'Criteria', 'Max.', 'API score reported in self appraisal', ...PRINCIPAL], [
      ['(i) a', 'Classes taken', '50', v.p42.i_a, ...blank],
      ['(i) b', 'Teaching load in excess of UGC norm', '10', v.p42.i_b, ...blank],
      ['(ii)', 'Imparting of knowledge / syllabus enrichment', '20', v.p42.ii, ...blank],
      ['(iii)', 'Participatory and innovative methods', '20', v.p42.iii, ...blank],
      ['(iv)', 'Examination duties', '25', v.p42.iv, ...blank],
      ['', 'Total score', '125', v.p42.total, ...blank],
    ], 3),
    table('43. Category II', ['Serial', 'Criteria', 'Max.', 'API score reported in self appraisal', ...PRINCIPAL], [
      ['(i)', 'Extension, co-curricular & field based activities', '20', v.p43.i, ...blank],
      ['(ii)', 'Contribution to corporate life and management', '15', v.p43.ii, ...blank],
      ['(iii)', 'Professional development activities', '15', v.p43.iii, ...blank],
      ['', 'Total score (i + ii + iii), max. 25', '25', v.p43.total, ...blank],
    ], 3),
    table('44. Category III', ['Serial', 'Criteria (rate)', 'API score reported in self appraisal', ...PRINCIPAL], [
      ...P44_ORDER.map(code => [SERIAL[code], ROW_LABELS[code], v.p44[code], ...blank]),
      ['', 'Total', v.p44.total, ...blank],
    ], 2),
  ].join('');
}

export function renderApiValues({ values, problems }) {
  document.querySelectorAll('[data-sum]').forEach(el => {
    const val = pick(values, el.dataset.sum);
    el.textContent = el.dataset.max ? `${val} / ${el.dataset.max}` : val;
  });
  const flagged = new Set(problems.map(p => p.where));
  document.querySelectorAll('[data-where]').forEach(el => el.classList.toggle('over', flagged.has(el.dataset.where)));
  document.getElementById('cat2CapNote').textContent =
    values.p43.capped ? `(your parts add up to ${values.p43.raw}; the form allows at most 25)` : '';
  const ul = document.getElementById('apiProblems');
  ul.innerHTML = '';
  if (!problems.length) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = 'No problems. The API scores are ready.';
    ul.appendChild(li);
  }
  for (const p of problems) {
    const li = document.createElement('li');
    li.textContent = p.message;
    ul.appendChild(li);
  }
  document.getElementById('apiPreview').innerHTML = previewHtml(values);
}
```

- [ ] **Step 3: Wire `app.js`**

3a. After `import firebaseConfig from './firebase-config.js';` add:

```js
import { tally, normalizeApi, emptyApi } from './api_tally.js';
import { initApiUi, renderApiLists, renderApiValues } from './api_ui.js';
```

3b. In the `state` line, replace `api:{},` with `api:emptyApi(),`.

3c. In `collectSimple`, replace `part2:{}, api:{}, ui:state.ui` with `part2:{}, api:state.api, ui:state.ui`, and delete this line:

```js
    else if(n.startsWith('api')) data.api[n]=value;
```

3d. In `applySimple`, replace:

```js
  const merged={...(data.profile||{}),...(data.part1||{}),...(data.part2||{}),...(data.api||{})};
```
with:
```js
  const merged={...(data.profile||{}),...(data.part1||{}),...(data.part2||{})};
  const {api:apiData,legacy}=normalizeApi(data.api);
```
In the same function replace `state.api=data.api||{};` with `state.api=apiData;`, and replace `renderRepeatables(); renderEnclosures(); updateScores();` with `renderRepeatables(); renderEnclosures(); renderApiLists(); showLegacyNotice(legacy); updateScores();`.

3e. Replace the whole `function updateScores(){ ... }` (from `function updateScores(){` through its closing `}` before `form.addEventListener('input'`) with:

```js
function updateScores(){const result=tally(state.api);renderApiValues(result);return result;}
function showLegacyNotice(legacy){
  const el=$('apiLegacyNotice');
  if(!legacy.length){el.classList.add('hidden');el.textContent='';return;}
  el.textContent='This draft was saved by an older version that kept only single API totals. Those values are not used any more; please re-enter them in the tables below: '+legacy.map(([k,v])=>`${k} = ${v}`).join(', ')+'.';
  el.classList.remove('hidden');
}
function apiReviewItems(api){const {values:v,problems}=tally(api);return [['Category I API (point 29)',v.p29.I],['Category II API (point 29)',v.p29.II],['Total I + II',v.p29.I_II],['Category III API (point 29)',v.p29.III],['API problems to fix',problems.length]];}
```

3f. In `renderReview`, replace:

```js
,['Category I API',(+d.api.apiC1Classes||0)+(+d.api.apiC1Excess||0)+(+d.api.apiC1Resources||0)+(+d.api.apiC1Innovative||0)+(+d.api.apiC1Exam||0)],['Category II API',Math.min((+d.api.apiC2Extension||0)+(+d.api.apiC2Management||0)+(+d.api.apiC2Professional||0),25)],['Category III API',+d.api.apiC3||0]];
```
with:
```js
,...apiReviewItems(d.api)];
```

3g. Replace the last line:

```js
loadLocal();renderRepeatables();renderEnclosures();updateScores();updateProgress();renderReview();
```
with:
```js
initApiUi({getApi:()=>state.api,onChange:()=>{updateScores();saveLocal();}});
renderApiLists();loadLocal();renderRepeatables();renderEnclosures();updateScores();updateProgress();renderReview();
```

3h. Confirm no old field names remain:
Run: `grep -n "apiC1\|apiC2\|apiC3\|summary1\|cat1Total" app.js index.html`
Expected: only the `LEGACY_KEYS` list in `api_tally.js` uses these names, so the output is empty for these two files.

- [ ] **Step 4: Append to `styles.css`**

```css
.repeat-row.api-row{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.api-row .entry-no{grid-column:1/-1;font-weight:600;color:var(--muted)}
.api-row>button{grid-column:1/-1;justify-self:start}
.repeat-row.over{border-color:var(--danger);background:#fdf0f0}
input.over,strong.over{color:var(--danger);border-color:var(--danger);font-weight:700}
.problems li{color:var(--danger);margin:4px 0}
.problems li.ok{color:#1d6b32}
.guidance-grid{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));align-items:end}
.guidance-grid>strong{grid-column:1/-1;margin-top:8px}
.table-scroll{overflow-x:auto}
.preview-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:.85rem}
.preview-table th,.preview-table td{border:1px solid var(--line);padding:4px 6px;vertical-align:top}
.preview-table td.val{color:#0000cc;font-weight:600;text-align:center;min-width:70px}
```

- [ ] **Step 5: Update `sw.js` so phones get the new files**

Replace the first two lines and the `activate` listener:

```js
const CACHE='acr-utility-v0-4';
const ASSETS=['./','./index.html','./styles.css','./app.js','./api_tally.js','./api_ui.js','./firebase-config.js','./manifest.webmanifest'];
```
```js
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
```
(The old cache `acr-utility-v0-1` would otherwise keep serving the old `app.js`, because `caches.match` searches every cache.)

- [ ] **Step 6: Run the app and check entry and totals in a browser**

Run the server in the background: `python -m http.server 8765` (from the project root). Open `http://localhost:8765/index.html` in a fresh browser profile or a private window. Use the `playwright-cli` skill or Chrome.

On the "API · 26–29" tab, check each of these:
1. Type 45 in 26(i)(a). Category I total shows `45 / 125`.
2. Type 52 in 26(i)(a). The box turns red, the problems list shows `26(i)(a) is 52; the form's maximum is 50.`, and Category I shows `52 / 125` in red. Change it back to 45.
3. In 28 A, add a paper, type title "P1" and score 15, and leave the row as "— choose —". The row is outlined red and the problem `28 A, entry 1: choose the point-44 row.` appears. Choose "Refereed journals". The problem disappears.
4. Reload the page. All values and rows are still there, restored from localStorage.
5. Remove the paper. It disappears and the Category III total returns to `0`.
6. The browser console shows no errors.

- [ ] **Step 7: Run all automated tests again**

Run: `node --test tests/api_tally.test.js && python -m unittest discover -s tests -v`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add api_ui.js index.html app.js styles.css sw.js
git commit -m "feat: API entry tables for points 26-28 with live totals, problems and preview"
```

---

### Task 6: End-to-end check with the worked example (app → JSON → Word → PDF)

**Files:**
- Create: `tools/docx_to_pdf.ps1`
- Create: `tests/fixtures/worked_example.acr.json` (exported from the app)

- [ ] **Step 1: Create `tools/docx_to_pdf.ps1`**

```powershell
# Converts a DOCX to PDF with Microsoft Word, for visual checks of the generated ACR.
param([Parameter(Mandatory)][string]$In, [Parameter(Mandatory)][string]$Out)
$inPath = (Resolve-Path $In).Path
$outPath = [System.IO.Path]::GetFullPath($Out)
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open($inPath, $false, $true)
  $doc.ExportAsFixedFormat($outPath, 17)
  $doc.Close($false)
} finally {
  $word.Quit()
}
Write-Output "Wrote $outPath"
```

- [ ] **Step 2: Enter the whole worked example in the app**

With the server from Task 5 running, enter every value from spec section 7 (the same values as `cases.json` case 1) on the API tab. Then check the preview:
- Point 29 shows `106.75`, `25`, `131.75`, `193`.
- Point 42 shows `45, 6, 18.5, 15.25, 22, 106.75`.
- Point 43 shows `15, 12.5, 3, 25`, and the Category II line reads "(your parts add up to 30.5; the form allows at most 25)".
- Point 44 shows every value in the spec's table, blanks included, with Total `193`.
- The problems list says "No problems".

- [ ] **Step 3: Export and generate**

Click **Export Draft**. Save the file as `tests/fixtures/worked_example.acr.json`. Then run:

```bash
python generate_acr.py tests/fixtures/worked_example.acr.json -o tests/out/worked_example.docx
```
Expected: the printed `p29` is `{"I": "106.75", "II": "25", "I_II": "131.75", "III": "193"}`.

(`tests/out/` is git-ignored. Create it first with `mkdir -p tests/out`.)

- [ ] **Step 4: Convert to PDF and look at every filled table**

```powershell
powershell -ExecutionPolicy Bypass -File tools/docx_to_pdf.ps1 -In tests/out/worked_example.docx -Out tests/out/worked_example.pdf
```
Then find the pages and render them:
```bash
python -c "import fitz;d=fitz.open('tests/out/worked_example.pdf');[print(i+1,k) for i,p in enumerate(d) for k in ('26. CATEGORY','27. CATEGORY','28. CATEGORY','SUMMARY OF API','42. CATEGORY','43. CATEGORY','44. CATEGORY') if k in p.get_text()]"
pdftoppm -r 70 -png tests/out/worked_example.pdf tests/out/pg
```
Open the page images for points 26–29 and 42–44 and compare each with the official pages (`UGC_ACR_Form.pdf` pages 6–11 and 16–22). Check that:
- every value from the spec's table appears in blue in the right cell;
- the 27(iii) block reads "(iii) Professional Development Activities" with the entry on its own row;
- every Principal column and point 29 "Last Academic Year" is empty;
- no table layout is broken.

- [ ] **Step 5: Commit the example file and the tool**

```bash
git add tools/docx_to_pdf.ps1 tests/fixtures/worked_example.acr.json
git commit -m "test: end-to-end worked example exported from the app"
```

---

## Self-review against the spec

| Spec item | Task |
|---|---|
| R1 entry for 26(i)(a)(b), 26(ii)–(iv), 27(i)–(iii), 28 A–E(iii) (§3) | 5 |
| R2 point 29 col 4 | 1, 2, 4 (Word), 5 (preview) |
| R3/R4/R5 points 42, 43, 44 | 1, 2, 4, 5 |
| R6 exact and identical (§4.1, §8.2) | 1, 2 (shared `cases.json`), 6 |
| R7 Principal columns and 29 col 3 untouched | 4 (`test_principal_columns_empty`, col-3 test) |
| Row dropdown (§3.3) | 1 (`ROW_CHOICES`), 5 |
| Warn and block; only Category II capped (§4.4) | 1, 2, 4 (CLI exit 1), 5 (red + problems list) |
| Ph.D two boxes (§3.3, §4.3) | 1 (`p28.phd`), 4 (table 19), 5 |
| Blank vs zero (§4.2) | 1 (empty and zero cases) |
| Old flat fields: notice, not converted (§5) | 1 (`normalizeApi`), 5 (`showLegacyNotice`) |
| Old rule formulas removed (§6) | 4 (Step 7 grep) |
| Template 27(iii) defect (§6) | 3 |
| E(ii)/E(iii) level printed from the row (§3.3) | 2 (`LEVEL_TEXT`), 4 |
| Worked example (§7) and tests (§8) | 1, 2, 4, 6 |

**Differences from the spec wording:**
- The Python tally lives in its own `api_tally.py`, not inside `generate_acr.py`. This keeps it testable against the shared cases; its behaviour is exactly as specified.
- The E(i) message reads "28 E(i) total is 40; the form's maximum is 30." so it matches every other over-maximum message.
