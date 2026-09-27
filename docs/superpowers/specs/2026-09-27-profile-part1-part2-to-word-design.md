# ACR Utility — Profile, Part I and Part II into the Word file

Date: 2026-09-27
Status: awaiting user review
Source form: `UGC_ACR_Form.pdf` (PDF pages 1–6 = cover, points 1–25; page 11–12 = point 30, enclosures, certificates)
Builds on: `2026-09-27-api-score-tally-design.md` (points 26–29, 42–44 are done and unchanged here).

## 1. Requirements

| # | Requirement |
|---|---|
| R1 | Everything the teacher fills outside the API sections reaches the Word ACR: cover page, Part I points 1–16, Part II points 17–25, point 30, the enclosures list and the teacher's certificate. |
| R2 | The generator reads the app's own saved/exported file (`.acr.json`) with no conversion step. |
| R3 | Every value prints in the official form's own place, in blue, with the form's wording and layout kept. |
| R4 | Nothing is guessed or silently converted: derived values (DOB words and digits, variation %) are computed exactly and shown in the app; old free-text entries that no longer fit are shown in a notice. |
| R5 | Principal / Reporting Officer content is never written (except the Principal's *name*, a profile field the form already prints). |

## 2. Decisions (approved 2026-09-27)

| Decision | Choice |
|---|---|
| Scope | Cover page, points 1–25, point 30, enclosures, teacher's certificate. |
| Dr./Shri/Smt/Kumari and Father/Husband | Chosen in the profile; the options not chosen are struck through in the Word file. Nothing chosen → all printed plain. |
| Date of birth in words | Automatic from the date, shown next to the date in the app for checking. The 8 digit boxes come from the same date. |
| 19(d), 21(ii), 22 | Add-row tables with the form's columns (like 19(a)/19(c)/20). Old text in the replaced boxes is shown in a notice; never silently converted. |
| Approach | One-time guarded script puts named `{{TOKENS}}` into the template's answer spots; the generator's existing token replacement fills them; tables are filled by code. |

## 3. Data (the app's saved file)

Existing keys are kept; **new** keys are marked ★.

```text
session
profile: collegeName, collegeDistrict, collegePin, principalName, collegeAddress, collegeOther,
         title★ ('Dr.'|'Shri'|'Smt'|'Kumari'|''), relation★ ('Father'|'Husband'|''),
         fullName, fatherHusband, employeeCode, subject, appointmentDate, designation, payBand, basicPay,
         promotionDate, academicQualification, professionalQualification, researchDegree,
         dob ('DD/MM/YYYY'), serviceStatus, permanentAddress, landline★, mobile, email, submissionDate★
part2:   p8, p12, p13a, p13b, p14,                      (Part I annual boxes; stored under part2 today)
         p17, p18, p19b, p19f, p19g, p21i, p23, p24Satisfied★ ('Yes'|'No'|''), p24Reasons★, p25,
         totalPeriodsPerWeek, researchYesNo
teaching[]:    srNo, classCourse, college, allocated, delivered, syllabusPct          (19(a), existing)
assignments[]: classCourse, assignments, tests                                        (19(c), existing)
activities★[]: title, detail                                                          (19(d))
results[]:     className, duration, appeared, passed, collegePct, universityPct,
               divI, divII, divIII, failed, reason                                    (20, existing)
orientation★[]: course, place, duration, rcoc                                         (21(ii))
research★[]:   title, institution, nature, status                                     (22)
otherInfo★[]:  text                                                                   (30)
enclosures[]:  label, checked, custom                                                 (existing)
api:           unchanged (points 26–28)
```

Old keys replaced: `p19d`, `p21ii`, `p24`, `researchTitle`, `researchInstitution`, `researchNature`,
`researchStatus`. When a loaded draft has text in any of them, the app shows it in a notice (as done for the old
API fields). **Exception:** the four single research fields map one-to-one onto the columns of the new 22 table,
so they become its first row; the notice still lists them so the teacher can check.

Note: Part I boxes `p8`…`p14` are stored under `part2` because of the app's existing routing (`n.startsWith('p')`).
This is kept as is; the generator reads them from `part2`.

## 4. Where each value prints

"Token" = a placeholder the template script puts in the answer spot; the generator replaces it (blue).
Multi-line values keep their line breaks (the generator turns `\n` into Word line breaks).

| Form item | Template spot | Value |
|---|---|---|
| Cover: Name of the College | `{{COLLEGE_NAME}}`, next line `{{COLLEGE_PLACE}}` | `collegeName`; second line = `collegeDistrict` + `, ` + `collegePin` (only the filled parts) |
| Cover: Appraisal of … Dr./Shri/Smt/Kumari | strike-through on the options not chosen; `{{FULL_NAME}}` | `title`, `fullName` |
| Cover: year/session | `{{SESSION}}` (exists) | `session` |
| 1 Full name | `{{FULL_NAME}}` | `fullName` |
| 2 Father/Husband name | strike the one not chosen; `{{FATHER_HUSBAND}}` | `relation`, `fatherHusband` |
| 3 Employee code | `{{EMPLOYEE_CODE}}` | `employeeCode` |
| 4 Subject | `{{SUBJECT}}` | `subject` |
| 5 Date of appointment | `{{APPOINTMENT_DATE}}` | `appointmentDate` |
| 6 Current designation | `{{DESIGNATION}}` | `designation` |
| 7 Pay band with grade pay | `{{PAY_INFO}}` | `payBand`; if `basicPay` is filled: `payBand` + `; Basic Pay ` + `basicPay` (only the filled parts) |
| 8 Date of promotion | `{{PROMOTION}}` | `p8`; if empty, `promotionDate` |
| 9(a)(b)(c) | `{{ACADEMIC_QUAL}}`, `{{PROFESSIONAL_QUAL}}`, `{{RESEARCH_DEGREE}}` | profile fields |
| 10 Date of birth | table 0 cells 0–7; `{{DOB_WORDS}}` | digits of `dob` (DDMMYYYY); words (§5) |
| 11 Status | `{{SERVICE_STATUS}}` | `serviceStatus` |
| 12 Colleges served | `{{COLLEGES_SERVED}}` | `p12` |
| 13(a) Departmental exam | `{{DEPT_EXAM}}` | `p13a` |
| 13(b) Hindi | label restored to the form's wording; `{{HINDI_DETAILS}}` | `p13b` |
| 14 Other major assignment | `{{OTHER_ASSIGNMENT}}` | `p14` |
| 15 Permanent address | `{{ADDR1}}`, `{{ADDR2}}`, `{{ADDR3}}` | lines of `permanentAddress`; lines beyond 3 go into `{{ADDR3}}` joined by `, ` |
| 16 Phone / email | `{{LANDLINE}}` (replaces the `______` line), `{{MOBILE}}`, `{{EMAIL}}` | profile fields |
| 17, 18 | `{{P17}}`, `{{P18}}` | `p17`, `p18` |
| 19(a) | table 1 rows + "Total periods per week" row (label restored) | `teaching[]` → Sr. No. (`srNo` or row number), class, college, allocated, delivered, `syllabusPct` + `%`; total = `totalPeriodsPerWeek` |
| 19(b) | `{{P19B}}` | `p19b` |
| 19(c) | table 2 | `assignments[]` → Sr. No., class, assignments, tests, last column left blank (it is "Refer the verifiable record…") |
| 19(d) | table 3 | `activities[]` |
| 19(f), 19(g) | `{{P19F}}`, `{{P19G}}` | `p19f`, `p19g` |
| 20 | table 4 from row 3 | `results[]`; column 7 "Variation (col. 5−6)" = `collegePct − universityPct`, 2 decimals, trailing zeros dropped, `+` sign when positive, blank when either is empty |
| 21(i) | `{{P21I}}` (exists) | `p21i` |
| 21(ii) | table 5 | `orientation[]` |
| 22 | `{{RESEARCH_YES_NO}}` after the question; table 6 | `researchYesNo`; `research[]` |
| 23 | `{{P23}}` (exists) | `p23` |
| 24 | `{{P24_SATISFIED}}`, `{{P24_REASONS}}` | `p24Satisfied`, `p24Reasons` |
| 25 | `{{P25}}` (the spot now wrongly holding `{{OTHER_ASSIGNMENT}}`) | `p25` |
| 30 | table 24 rows (S.No., text) | `otherInfo[]` |
| Enclosures | existing generator behaviour (checked items listed before the certificate) | `enclosures[]` |
| Teacher's certificate | `{{PLACE}}` (exists), `{{REPORT_DATE}}` (exists), `{{CERT_DESIGNATION}}` after "Designation," | `PLACE` = `collegeName` (+ `, ` + `collegePin`, only filled parts); `REPORT_DATE` = `submissionDate`; designation |
| Principal's certificate | `{{PRINCIPAL_NAME}}` (exists) | `principalName` |

Tables grow by cloning a blank row when there are more entries than template rows (as for the API tables);
fully empty entries are skipped.

## 5. Date of birth

- `dob` must match `DD/MM/YYYY` and be a real calendar date (e.g. 31/02/1990 is rejected). Empty → boxes and words blank.
- Digit boxes: the 8 characters `DDMMYYYY`, one per cell of table 0.
- Words: day as an ordinal word, month name, year in the form's customary style:
  - Day: First … Thirty-first (`Twenty-first`, `Thirtieth`, …).
  - Year 1900–1999: `Nineteen Hundred` + words for the last two digits (`Eighty Three`; `Nineteen Hundred Five` for 1905; `Nineteen Hundred` for 1900).
  - Year 2000–2099: `Two Thousand` + words for the last two digits (`Two Thousand`, `Two Thousand Five`, `Two Thousand Twelve`).
  - Example: 30/06/1987 → `Thirtieth June Nineteen Hundred Eighty Seven`.
- The same function exists in JS (for the app's display) and Python (for the Word file), checked against one shared
  test table, as the API tally is.

## 6. Template repairs (one guarded script, refuses to run twice)

1. Put the tokens of §4 into the blank blue answer spots left by the clean-up (first blank blue run after each label;
   extra blank runs on the same line are removed). Each insertion is checked against the label text of its line.
2. Remove the leftover strike-through on "Dr.", "Smt", "/Kumari" (cover) and "Husband" (point 2). The generator applies
   strike-through per the teacher's choice.
3. Point 13(b): replace the old teacher's answer "Exempted vide Director of Higher Education letter no.:" with the form's
   label "b) Hindi subject : Cleared / exempted (mention details)", followed by `{{HINDI_DETAILS}}`.
4. Point 25: its answer spot gets `{{P25}}`; `{{OTHER_ASSIGNMENT}}` stays only at point 14.
5. Point 16: the `__________________` after "Land line telephone No.:" becomes `{{LANDLINE}}`.
6. 19(a): restore the label "Total periods per week" in the last row of table 1.
7. Certificate: add `{{CERT_DESIGNATION}}` after "Designation,".

## 7. Checks (block generation, listed like the API problems)

| Check | Message |
|---|---|
| `dob` filled but not a valid `DD/MM/YYYY` date | `Point 10: date of birth "31/02/1990" is not a real date (use DD/MM/YYYY).` |
| a `results[]` percentage filled but not a number | `Point 20, row 2: college pass % "abc" is not a number.` |

The app shows the same messages on the Review tab. Everything else prints exactly as typed.

## 8. Testing

1. **DOB words:** one shared table of dates → expected words, run by both JS and Python (1st, 2nd, 3rd, 11th, 12th,
   13th, 21st, 22nd, 23rd, 30th, 31st; years 1900, 1905, 1983, 1999, 2000, 2005, 2012; invalid dates).
2. **Variation:** 92.5 − 88 → `+4.5`; 80 − 85.25 → `-5.25`; equal → `0`; one side empty → blank.
3. **Full record:** a fixture where every field has a unique value; generate; read back every token spot and table
   cell; assert strike-through state for each title/relation choice (including "none").
4. **Template:** no `~strike~` left on Dr./Smt/Kumari/Husband; 13(b) label matches the form; every token of §4
   appears exactly once (ADDR1–3 once each); 19(a) total label present.
5. **Old data notice:** loading a draft with `p19d`/`p21ii`/`p24` text shows it; research fields become row 1.
6. **Visual:** generate the full-record fixture → PDF; compare pages 1–5 and 10–11 with PDF pages 1–6 and 11–12.
7. All existing API tests keep passing.

## 9. Out of scope

- The "Div.I 'A to S+'" grade labels in the point-20 table header (the form prints plain "Div.I").
- Principal / Reporting Officer / Reviewing Officer entries.
- The Firebase / privacy work.
- Point 26(i) course table (table 7), which keeps its current behaviour.
