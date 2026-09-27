# ACR Utility — API Score Entry and Tally (Points 26–29 → 29, 42, 43, 44)

Date: 2026-09-27
Status: awaiting user review
Source form: `UGC_ACR_Form.pdf` (PDF pages 6–11 = points 26–29; PDF pages 16–22 = points 42–44)
Relation to earlier spec: this replaces the "Category III entry" and "scoring engine" parts of
sub-project 1 in `2026-09-21-api-scores-part3-autofill-design.md` with a narrower scope, set by
the user on 2026-09-27. Scores are **typed by the teacher**, not calculated from rates. Point 45,
privacy/storage and the PDF renderer are not part of this spec.

## 1. Requirements

| # | Requirement |
|---|---|
| R1 | The teacher types API scores in 26(i)(a), 26(i)(b), 26(ii), 26(iii), 26(iv), 27(i)–(iii) and 28 A, B(i), B(ii), B(iii), C(i & ii), C(iii & iv), D, E(i), E(ii), E(iii). |
| R2 | These are tallied into **point 29, column 4** (rows I, II, I+II, III). |
| R3 | Category I scores fill **point 42, column 4** ("API Score reported in self appraisal by the teacher"). |
| R4 | Category II scores fill **point 43, column 4**. |
| R5 | Category III scores fill **point 44, column 5**, one value per official sub-row. |
| R6 | The numbers are exact, and the app and the Word file always show the same figures. |
| R7 | All Principal columns (Agree / Mention Reasons / Principal's score) and point 29 column 3 (Last Academic Year) are **never written** by this feature. |

## 2. Decisions (approved 2026-09-27)

| Decision | Choice |
|---|---|
| Mapping point-28 entries to point-44 sub-rows | Each entry has a required **Point-44 row** dropdown, limited to the sub-rows valid for that table. |
| Scores above a printed maximum | **Warn and block**: shown in red, listed on the Review tab, and the Word generator refuses to build. The **only** automatic cap is the Category II total at 25, as the form prints "Total Score (I+II+III) (Max. 25)". |
| Ph.D in point 28 D | Two score boxes: *Ph.D awarded* and *Ph.D thesis submitted*. Point 28 D's Ph.D cell prints their sum; point 44 gets each one in its own cell. |
| Outputs | Live preview in the app **and** `generate_acr.py` fills the Word ACR. |
| Scores | Always typed by the teacher; nothing is pre-filled from the rate column. |

## 3. Entry screens (app, tab "API · 26–29")

Every "score" input accepts a number ≥ 0 with at most 2 decimal places. Each add-row table uses
the same repeatable-row mechanism as the existing 19(a)/19(c)/20 tables.

### 3.1 Category I (point 26)
| Form item | Input | Printed max |
|---|---|---|
| 26(i)(a) Classes taken | one score box | 50 |
| 26(i)(b) Teaching load in excess of UGC norm | one score box | 10 |
| 26(ii) Reading/instructional material | add-row table: Course/Paper, Consulted, Prescribed, Additional resource provided (no score per row) **+ one score box** | 20 |
| 26(iii) Participatory & innovative methods | add-row table: Short description, **Score** | total 20 |
| 26(iv) Examination duties | add-row table: Type of duty, Duties assigned, Extent carried out (%), **Score** | total 25 |

Category I total = (i)(a) + (i)(b) + (ii) + (iii) total + (iv) total; printed max 125.

### 3.2 Category II (point 27)
| Form item | Add-row table columns | Printed max |
|---|---|---|
| 27(i) Extension, co-curricular & field based | Type of activity, Average hours/week, **Score** | 20 |
| 27(ii) Corporate life & management | Activity, Yearly/semester-wise responsibilities, **Score** | 15 |
| 27(iii) Professional development | Activity, Details, **Score** | 15 |

Raw sum = (i) + (ii) + (iii). **Category II total = min(raw sum, 25).** The raw sum is shown next to it
so the teacher can see when the cap is applied.

### 3.3 Category III (point 28)
Columns follow the form's tables. "Row" is the Point-44 row dropdown (required when it has more than one option).

| Point 28 table | Columns (plus **Score**) | Row dropdown options → point 44 sub-row |
|---|---|---|
| A Published papers in journals | Title with page nos., Journal, ISSN/ISBN, Peer reviewed / impact factor, No. of co-authors, Main author? | `A1` Refereed journals (15/publication) · `A2` Non-refereed but recognised, ISBN/ISSN (10/publication) |
| B(i) Articles/chapters in books | Title with page nos., Book title/editor/publisher, ISSN/ISBN, Peer reviewed, No. of co-authors, Main author? | `B1a` International publishers (10/chapter) · `B1b` Indian/National publishers (5/chapter) |
| B(ii) Full papers in conference proceedings | Title with page nos., Conference publication details, ISSN/ISBN, No. of co-authors, Main author? | fixed `B2` (no dropdown) |
| B(iii) Books | Title with page nos., Type of book & authorship, Publisher & ISSN/ISBN, Peer reviewed, No. of co-authors, Main author? | `B3a` International, peer-review system · `B3b` National / State & Central Govt. · `B3c` Other local publishers |
| C(i & ii) Ongoing projects/consultancies | Title, Agency, Period, Grant/amount mobilised (Rs lakh) | `C1a` Major, > 30 L science / > 5 L arts · `C1b` Major, 5–30 L science / 3–5 L arts · `C1c` Minor · `C2` Consultancy |
| C(iii & iv) Completed projects/consultancies | Title, Agency, Period, Grant/amount, Policy document/patent as outcome? | `C3` Completed project report accepted · `C4` Project outcome / patent / technology transfer |
| D Research guidance | fixed rows, no add-row: M.Phil (Enrolled, Submitted, Awarded, **Score**); Ph.D (Enrolled, Submitted, Awarded, **Score – awarded**, **Score – thesis submitted**) | M.Phil score → `D1`; Ph.D awarded → `D2a`; Ph.D submitted → `D2b` |
| E(i) Training courses / FDPs | Programme, Duration, Organised by | `E1a` Not less than two weeks · `E1b` One week |
| E(ii) Papers presented | Title of paper, Title of conference, Organised by | `E2a` International · `E2b` National · `E2c` Regional/State · `E2d` Local – University/College |
| E(iii) Invited lectures / chairmanships | Title of lecture, Title of conference, Organised by | `E3a` International · `E3b` National |

For E(ii) and E(iii) the form's "Whether international/National/…" column is printed from the chosen row,
so the two can never disagree.

Category III has no printed overall maximum. E(i) total (`E1a` + `E1b`) has a printed maximum of **30**.

### 3.4 Live preview
Below the entry cards, the tab shows four read-only tables laid out like the form: point 29 (column 4
only), point 42 (column 4), point 43 (column 4), point 44 (column 5). All Principal columns are shown
empty. Values update on every keystroke.

## 4. Tally (one set of rules, two implementations)

`api_tally.js` (browser) and a Python mirror inside `generate_acr.py` implement the same function:
`tally(api) → { values, problems }`.

### 4.1 Arithmetic
- Each score is converted to whole hundredths (`Math.round(x*100)`), summed as integers and converted
  back only for display. This avoids floating-point drift (e.g. 7.5 + 0.1 + 0.2).
- Display format: up to 2 decimals with trailing zeros removed: `20`, `7.5`, `12.25`, `0`.

### 4.2 Blank vs zero
- A single-value cell (26(i)(a), (i)(b), (ii), point-44 sub-row) whose inputs are all empty prints **blank**.
- A cell fed by at least one entered score prints the sum, even if it is `0`.
- **Total rows always print a number** (point 29 all four rows, the 42/43/44 Total rows, the 26(iii)/(iv) and 27 totals), `0` if nothing was entered.

### 4.3 Outputs
| Target | Value |
|---|---|
| 42 col 4, rows (i)a, (i)b, (ii), (iii), (iv) | 26(i)(a), 26(i)(b), 26(ii), 26(iii) total, 26(iv) total |
| 42 col 4, Total | Category I total |
| 43 col 4, rows (i), (ii), (iii) | 27(i), 27(ii), 27(iii) totals (not capped individually; over-max blocks instead) |
| 43 col 4, Total | min(raw sum, 25) |
| 44 col 5, each sub-row | sum of the entries assigned to it (D rows from the D boxes) |
| 44 col 5, Total | Category III total = sum of all sub-rows |
| 29 col 4, I / II / I+II / III | Category I total / Category II total (capped) / I + II / Category III total |

### 4.4 Problems (block generation)
| Check | Message example |
|---|---|
| 26(i)(a) > 50, 26(i)(b) > 10, 26(ii) > 20 | "26(i)(a) is 52; the form's maximum is 50." |
| 26(iii) total > 20, 26(iv) total > 25 | "26(iv) total is 27; maximum 25." |
| 27(i) > 20, 27(ii) > 15, 27(iii) > 15 | "27(ii) total is 16; maximum 15." |
| E(i) total > 30 | "28 E(i) total is 40; the form allows at most 30." |
| Category I total > 125 | (cannot occur when the parts pass; kept as a safety check) |
| Point-28 entry with details but no Row chosen | "28 A, entry 2: choose the point-44 row." |
| Score not a number, negative, or more than 2 decimals | "28 E(ii), entry 3: score must be a number ≥ 0 with at most 2 decimals." |
| Entry with details but no score | "26(iv), entry 1: score is missing." |

A completely empty row (no field filled) is ignored. The Category II cap is **not** a problem; the app just
shows "capped from 30.5 to 25".

## 5. Data shape (saved in the app draft / `.acr.json`, under `api`)

```json
{
  "c1": {
    "classes": 45, "excess": 6, "resourcesScore": 18.5,
    "resources":  [{"course": "", "consulted": "", "prescribed": "", "additional": ""}],
    "innovative": [{"description": "", "score": 8}],
    "exam":       [{"type": "", "assigned": "", "extent": "", "score": 10}]
  },
  "c2": {
    "extension":    [{"activity": "", "hours": "", "score": 10}],
    "management":   [{"activity": "", "responsibility": "", "score": 7.5}],
    "professional": [{"activity": "", "details": "", "score": 3}]
  },
  "c3": {
    "journals":    [{"title": "", "journal": "", "issn": "", "peer": "", "coauthors": "", "mainAuthor": "", "row": "A1", "score": 15}],
    "chapters":    [{"title": "", "book": "", "issn": "", "peer": "", "coauthors": "", "mainAuthor": "", "row": "B1a", "score": 10}],
    "proceedings": [{"title": "", "conference": "", "issn": "", "coauthors": "", "mainAuthor": "", "score": 10}],
    "books":       [{"title": "", "type": "", "publisher": "", "peer": "", "coauthors": "", "mainAuthor": "", "row": "B3b", "score": 25}],
    "ongoing":     [{"title": "", "agency": "", "period": "", "amount": "", "row": "C1c", "score": 10}],
    "completed":   [{"title": "", "agency": "", "period": "", "amount": "", "outcome": "", "row": "C3", "score": 10}],
    "guidance":    {"mphilEnrolled": "", "mphilSubmitted": "", "mphilAwarded": "", "mphilScore": 3,
                    "phdEnrolled": "", "phdSubmitted": "", "phdAwarded": "", "phdAwardedScore": 10, "phdSubmittedScore": 7},
    "training":    [{"programme": "", "duration": "", "organisedBy": "", "row": "E1a", "score": 20}],
    "papers":      [{"title": "", "conference": "", "organisedBy": "", "row": "E2b", "score": 7.5}],
    "lectures":    [{"title": "", "conference": "", "organisedBy": "", "row": "E3b", "score": 5}]
  }
}
```

The old flat fields (`apiC1Classes` … `apiC3`) are removed from the form. When an old draft is loaded and any
of them holds a value, the app shows a one-time notice listing those values so the teacher can re-enter them;
they are not silently converted.

## 6. Word generator (`generate_acr.py`)

- Reads `data["api"]` in the shape of section 5, calls the Python tally, and **stops with the problem list**
  (non-zero exit, no file written) when there is any problem.
- The old rule-based functions (`score_classes`, `api_scores` with "2 × extra hours", compliance %, etc.) are
  removed; they were never verified against the form.
- Table indices refer to `ACR_EMPLOYEE_MASTER.docx`. Exact cells (merged/gridSpan) are confirmed in code by
  reading the row label text before writing, and the generator fails loudly if a label does not match.

| Point | Template table | What is written |
|---|---|---|
| 26(i)(a),(b) | 8, rows 1–2, API column | the two scores |
| 26(ii) | 9, rows 1–3 detail rows (extra rows cloned); row 6 API column | detail rows; score |
| 26(iii) | 10, entry rows (cloned as needed); Total row API column | entries; total |
| 26(iv) | 11, same pattern | entries; total |
| 27 | 12: (i) rows 2–3 + Total (Max.20); (ii) rows 6–7 + Total (Max.15); (iii) rows after its heading + Total (Max.15); row "Total Score (I+II+III)" | entries; part totals; capped total |
| 28 A … E(iii) | 13–18, 20–22 entry rows; 19 fixed M.Phil / Ph.D rows | entries with scores (Ph.D cell = awarded + submitted) |
| 29 | 23, rows 1–4, column 4 | I, II, I+II, III |
| 42 | 25, rows 3–8, column 4 | five rows + Total |
| 43 | 26, rows 3–6, column 4 | three rows + Total |
| 44 | 27–30, the "API Score reported in self appraisal" column of each sub-row; 30 Total row | sub-row sums + Total |

**Template defect to fix:** in table 12 the 27(iii) heading row was overwritten with sample data
("(iii) Chaired a session in, | Session Chair in National Seminar | 02") and its two blank entry rows are
missing. The official form (PDF page 8) has "(iii) Professional Development Activities" followed by two blank
rows and "Total (Max.15)". The template is corrected to match the form before any data is written.

Point 29 column 3 keeps its current behaviour (`api.lastAcademicYear`), unchanged by this work.

## 7. Worked example (expected results, calculated by hand)

Input:
- 26(i)(a) 45 · 26(i)(b) 6 · 26(ii) 18.5 · 26(iii) entries 8, 7.25 · 26(iv) entries 10, 12
- 27(i) 10, 5 · 27(ii) 7.5, 5 · 27(iii) 3
- 28 A: A1 15, A1 7.5, A2 10 · B(i): B1a 10, B1b 5, B1b 2.5 · B(ii): 10 · B(iii): B3b 25
- C(i&ii): C1c 10, C2 10 · C(iii&iv): C3 10 · D: M.Phil 3, Ph.D awarded 10, Ph.D submitted 7
- E(i): E1a 20, E1b 10 · E(ii): E2b 7.5, E2b 7.5, E2c 5, E2d 3 · E(iii): E3b 5

Expected:

| Target | Value |
|---|---|
| 26(iii) total / 26(iv) total | 15.25 / 22 |
| 42: (i)a, (i)b, (ii), (iii), (iv), Total | 45, 6, 18.5, 15.25, 22, **106.75** |
| 27 part totals | 15, 12.5, 3 (raw sum 30.5) |
| 43: (i), (ii), (iii), Total | 15, 12.5, 3, **25** (capped from 30.5) |
| 44: A1, A2 | 22.5, 10 |
| 44: B1a, B1b, B2 | 10, 7.5, 10 |
| 44: B3a, B3b, B3c | blank, 25, blank |
| 44: C1a, C1b, C1c, C2, C3, C4 | blank, blank, 10, 10, 10, blank |
| 44: D1, D2a, D2b | 3, 10, 7 |
| 44: E1a, E1b | 20, 10 (E(i) total 30 = max, allowed) |
| 44: E2a, E2b, E2c, E2d | blank, 15, 5, 3 |
| 44: E3a, E3b | blank, 5 |
| 44: Total | **193** |
| 29 col 4: I, II, I+II, III | 106.75, 25, 131.75, 193 |
| 28 D Ph.D cell | 17 |

Blocking example: E(i) entries E1a 20 + E1a 20 → "28 E(i) total is 40; the form allows at most 30"; no Word file.

## 8. Testing

1. **Unit tests (JS and Python)** with the worked example above plus: empty record (all totals 0, sub-rows blank);
   each maximum at exactly the limit (passes) and 0.01 above (blocks); Category II exactly 25 and above 25;
   0.1 + 0.2 sums to 0.3; missing row; missing score; negative; three decimals; fully empty row ignored.
2. **Parity test:** one JSON fixture run through both implementations must produce identical `values` and
   identical problem codes.
3. **Invariant:** point 29 I = point 42 Total; 29 II = 43 Total; 29 III = 44 Total; 29 I+II = I + II.
4. **Word check:** generate from the fixture, convert to PDF, compare each filled table with PDF pages 7–11 and
   16–22 by eye; confirm every Principal column and point 29 column 3 are empty.
5. **App check:** fill the example in the browser; the live preview must show the expected table.

## 9. Out of scope
Point 45; Principal / Reviewing Officer columns; point 29 column 3; any rate-based auto-scoring or co-author
sharing formula; Firebase, privacy and saved sessions; the in-browser PDF renderer; aligning the app and generator
field names outside `api` (profile, Part I, Part II remain as they are). Table 7 (26(i) course rows) keeps its
current behaviour.
