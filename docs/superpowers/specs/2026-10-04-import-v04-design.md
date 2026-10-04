# Bring an ACR over from the earlier version (v0.4) — design

Date: 2026-10-04. Status: draft for the user's review.

## Goal

A teacher who filled their ACR in the earlier utility (v0.4, at `/acr-utility/v0.4/`) can bring it into the new
version without retyping. The v0.4 data itself is **never changed or deleted**.

## Where v0.4 data can come from

1. **This browser.**
   - v0.4 and the new app run at the same web address, so the new app can read v0.4's saved drafts directly.
   - These are the browser-storage keys `acr.index.v1` and `acr.doc.<id>`, plus the same keys behind an
     `acct.<id>.` prefix for teachers who used v0.4's Google sign-in.
2. **A v0.4 backup file.**
   - These are the files v0.4's export / backup buttons make: one draft (`.acr.json`) or a backup holding all
     years.
   - **Import Draft** in the new app will recognise a v0.4 file by its `schemaVersion` and `p1` fields, and
     convert it instead of misreading it.
   - This covers teachers whose v0.4 data is on another device: export there, import here.
3. **Not covered: v0.4's own Drive sync files.**
   - They were made with v0.4's Google Client ID, and the new app's permission only reaches its own files, so
     it cannot read them.
   - A teacher in that situation opens `/v0.4/` on any device, signs in there (v0.4 then brings the data onto
     that browser), and then uses route 1 or 2.

## What the teacher sees

- **The entry point.** A button **"Bring over from the earlier version"** in the top bar's "earlier version"
  area.
  - It lists every v0.4 ACR found in this browser as session · name · last saved, for example
    `2025-26 · ASHA DEVI · saved 16 Aug 2026`.
  - Each entry has an **Import** button.
- **If the new app already has that session**, it asks: "Replace the 2025-26 record in the new version with
  the one from the earlier version?" Nothing is replaced without that answer.
- **After importing**, the record opens and a short **report** lists:
  - anything that could not be carried over (see "Not carried over" below), with the v0.4 text included so
    the teacher can paste it somewhere if needed
  - a reminder to check the record with **Preview**
- **Importing a v0.4 file through Import Draft** gives the same conversion, questions and report.

## Field mapping (v0.4 → new version)

### Identity and Part-I

| v0.4 | New | Notes |
|---|---|---|
| `session` | `session` | |
| `college.name` / `.district` / `.pin` | `collegeName` / `collegeDistrict` / `collegePin` | |
| `college.principal` (else `principalBlock.name`) | `principalName` | |
| `p1.fullName`, `fatherHusband`, `subject`, `designation`, `payBand`, `landline`, `mobile`, `email` | same meaning | `empCode` → `employeeCode`, `dateAppointment` → `appointmentDate` |
| `p1.promotion` | `p8` | `p8` is what the form prints |
| `p1.qualAcademic` + `p1.qualDivision` | `academicQualification` | joined, e.g. "M.Sc. Chemistry First Division" |
| `p1.qualProfessional` / `qualResearch` | `professionalQualification` / `researchDegree` | |
| `p1.dob` (8 digits DDMMYYYY) | `dob` as DD/MM/YYYY | The words are worked out by the new version, so `dobWords` is not needed. An invalid date is kept as typed, and Review flags it. |
| `p1.status` | `serviceStatus` | Matched to Permanent / Quasi-permanent / Temporary / Contract; unmatched goes to the report. |
| `p1.served[]` (college, duration) | `p12` | one line per college: "College – duration" |
| `p1.deptExamRoll`, `deptExamSession` | `p13a` | "Roll …, session …" |
| `p1.hindi` / `otherAssignment` / `permAddress` | `p13b` / `p14` / `permanentAddress` | |
| `certify.date` | `submissionDate` | |
| `style.answerColor`, `style.answerBold` | `style.color`, `style.bold` | Text style |

### Part-II (points 17–25, 30)

| v0.4 | New |
|---|---|
| `s1.q17`, `q18`, `q19b`, `q19g`, `q21i`, `q23`, `q25` | `p17`, `p18`, `p19b`, `p19g`, `p21i`, `p23`, `p25` |
| `s1.q19a` rows (class, college, allocated, delivered, % syllabus) | `teaching` rows (Sr. No. numbered 1, 2, …); numbers taken from the text, e.g. "95%" → 95 |
| `s1.q19aTotal` | `totalPeriodsPerWeek` |
| `s1.q19c` rows (class, assignments, tests) | `assignments` rows |
| `s1.q19d` rows (title, detail) | `activities` rows |
| `s1.q19f` books (title, author, publisher, pages, extract) | `p19f` text, one block per book: "Title – Author, Publisher, n pages" followed by the extract |
| `s1.q20` rows | `results` rows: class, duration, appeared, passed, college %, university % (if a number), Div. I/II/III, failed, reason. Variation is worked out by the new version. |
| `s1.q21ii` courses (name, place, duration, RC/OC) | `orientation` rows (course, place, duration, rcoc) |
| `s1.q22` short answer + `q22rows` | `researchYesNo` (Yes/No, from the answer's first word) + `research` rows (title, institution, nature, status) |
| `s1.q24` / `q24b` | `p24Satisfied` (Yes/No, from the answer's first word) / `p24Reasons` |
| `partB` entries | `otherInfo` rows (point 30) |
| `enclosures` (text) | `enclosures`: each becomes a ticked custom enclosure |

### API scores (points 26–29)

| v0.4 | New |
|---|---|
| `s2.c1.scoreA` / `scoreB` | `api.c1.classes` / `excess` |
| `s2.c1.ii.rows` + `ii.score` | `api.c1.resources` rows + `resourcesScore` |
| `s2.c1.iii.rows` (desc, score) | `api.c1.innovative` (description, score) |
| `s2.c1.iv.rows` | `api.c1.exam` (type, assigned, extent, score) |
| `s2.c2.i` / `ii` / `iii` (activity, hours/responsibility/details, score) | `api.c2.extension` / `management` / `professional` |
| `c3.A` journals | `api.c3.journals`: title, journal, ISSN, impact factor → "peer", co-authors = authors − 1, main author Yes/No, row **A1** (refereed) / **A2** (recognised), score |
| `c3.Bi` chapters | `chapters`, row **B1a** (international) / **B1b** (national) |
| `c3.Bii` proceedings | `proceedings` (row B2 is implied) |
| `c3.Biii` books | `books`, row **B3a** / **B3b** / **B3c** from international / national / local; type text from the v0.4 choice |
| `c3.Ci` ongoing projects | `ongoing`, row **C1a / C1b / C1c** from the amount, using v0.4's science / arts slabs |
| `c3.Cii` consultancy | `ongoing`, row **C2** |
| `c3.Ciii` completed | `completed`, row **C3** |
| `c3.Civ` outcomes | `completed`, row **C4** |
| `c3.D` guidance (kind, number, score) | `api.c3.guidance`: M.Phil awarded, Ph.D awarded and Ph.D submitted counts and scores, summed per kind |
| `c3.Ei` training | `training`, row **E1a** (two weeks+) / **E1b** (one week) |
| `c3.Eii` papers presented | `papers`, row **E2a / E2b / E2c / E2d** from international / national / state / local |
| `c3.Eiii` invited lectures | `lectures`, row **E3a / E3b** |
| `s2.lastYear` c1 / c2 / c3 | `api.lastAcademicYear` cat1 / cat2 / cat3 (typed) |

All API scores are copied **as typed in v0.4**. The new version then totals them under its own (tested) rules,
so a total may differ from v0.4's if v0.4 capped or rounded differently. The report says so.

## Not carried over (listed in the report with the v0.4 text)

- (Since 2026-10-04 the new version has 26(i) rows, so these are now carried over.)
- The 19(a) note beside the total, the 19(c) "verifiable record" remarks, and the 26(ii) footnote.
- The "Reported (override)" figures of point 29.
- Enclosure numbers in the Category-III tables ("Encl. #").
- v0.4's place lines (`college.place`, `certify.place`, `principalBlock.place`, `principalBlock.college`) and
  `certify.designation`.
- Text in the D (guidance) "Candidate / details" column.

## Building blocks

- **New `import_v04.js`** (pure, no browser code):
  - `findV04Docs(store)` lists the v0.4 drafts in browser storage, including the signed-in namespaces.
  - `isV04(json)` recognises a v0.4 draft or backup.
  - `convertV04(doc)` returns `{ record, report }` following the mapping above.
- **`app.js` / `index.html`:**
  - the "Bring over from the earlier version" list and the replace question
  - the report panel
  - Import Draft detecting v0.4 files
- **`sw.js`** — the new module is added to the cached files and the cache version is bumped.

## Testing

- **Unit tests for `convertV04`**, using a realistic v0.4 draft fixture built from v0.4's own `blankDoc` shape
  with every field filled. They check every row of the mapping tables, every point-44 row code, the DOB
  conversion, Yes/No answers, guidance sums, and that every "not carried over" item appears in the report.
- **`findV04Docs`** finds plain and signed-in drafts and ignores everything else.
- **A Word check:** the converted fixture through the new generator (both generators via the parity tool),
  compared with v0.4's own output for the same draft, to confirm the important text lands on the right points.
- **A browser check:**
  - make a draft in `/v0.4/` locally, then bring it over in the new app
  - the replace question
  - the report
  - Preview
- **v0.4's data is unchanged afterwards**, checked byte for byte.

## Out of scope

- Reading v0.4's Drive sync files directly (it would need v0.4's Google Client ID; see route 3).
- Importing in the other direction (new → v0.4).
