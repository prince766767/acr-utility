# ACR Utility — Word file made in the app (phones and PCs)

Date: 2026-09-27
Status: awaiting user review
Builds on: the generator as it is today (`generate_acr.py`, `acr_fields.py`, `api_tally.py`) and the app's JS rules
(`api_tally.js`, `acr_fields.js`, `sessions.js`). Replaces, for the phone, the "PDF renderer" of
`2026-09-21-api-scores-part3-autofill-design.md` §6 (pdf-lib on the official PDF), which was never built.

## 1. Requirements

| # | Requirement |
|---|---|
| R1 | The teacher can make the complete ACR as a Word file from the app, on a phone or a PC, without Python and without internet. |
| R2 | The app's file is the same as the PC generator's for the same record: same values in the same places, same line breaks, colours, strike-through and fonts. |
| R3 | The app refuses to make the file while there are problems (entry, API, last academic year), exactly as the PC generator does. |
| R4 | The teacher is told how to turn the file into a PDF or print it on a phone. |

## 2. Decisions (approved 2026-09-27)

| Decision | Choice |
|---|---|
| How the phone produces the ACR | The app builds the same `.docx` as the PC; the PDF/print step is done by the free Word or Google Docs app. |
| Python generator | Kept for PC use. A parity test builds the same records with both engines and fails on any difference. |

## 3. What the teacher sees

- Review tab: **Download Word file (.docx)** button. Disabled (with the reason "Fix the problems listed above first.")
  while any problem is listed. Downloads `ACR_<session>.docx` (`ACR_draft.docx` without a session).
- While building: "Making the Word file…"; on success: "Word file ready: ACR_2025-26.docx"; on an unexpected template
  error: the error message (the same text the PC generator would print), nothing downloaded.
- Help text under the button: how to make a PDF or print on a phone with the Word app and with Google Docs. The
  exact menu names are checked on Android and iPhone during the build and written in that text.

## 4. The app's engine

`generate_docx.js` exports `generateDocx(data, templateBytes, deps) -> Promise<Uint8Array>` where
`deps = { JSZip, DOMParser, XMLSerializer }` (browser globals in the app; `jszip` and `@xmldom/xmldom` in Node tests).
It throws `ProblemsError` (with `.problems`) before building anything when there are problems.

Steps, in the PC generator's order and with its checks:
1. Problems: `fieldProblems(data)` + `tally(api).problems` + `lastYearProblems(api.lastAcademicYear)`.
2. Point 10 digit boxes and the tables of 19(a), 19(c), 19(d), 20, 21(ii), 22 and 30 (`partTables`), cloning blank
   rows when needed.
3. Strike-through of the title and Father/Husband options not chosen.
4. API tables of points 26–29 and 42–45 (`fillApiTables`), including the label and Max. Score checks before writing,
   and point 29/45 column 3 from `lastYearCells`.
5. Token replacement over `word/document.xml` (first pass per text node, newline → line break, second pass for tokens
   split across runs), with `tokenValues`.
6. Enclosures: checked items as `☑ n. label` paragraphs in blue before "I certify that the information provided".
7. Cell values without a font of their own take the cell paragraph mark's font and size, else Times New Roman.

The engine reproduces python-docx's addressing exactly: `document.tables` = body-level tables in order; a row's cells
are listed one per grid column (a `gridSpan` cell repeats; a `vMerge` continuation cell stands for the cell above).

`acr_fields.js` gains the remaining ports of `acr_fields.py`: `variation`, `tokenValues`, `partTables` (plus `TOKENS`,
`TITLES`, `RELATIONS`). Shared JS/Python cases are extended for them.

## 5. Appendix pages 28–30

The PC generator appends the three official instruction pages as full-page images to every file. They move into the
template once: a one-time script appends them with the same python-docx code the generator uses today, and the
generator stops appending them. The PC output is unchanged; the app's engine needs no image handling. A test checks the
template ends with three full-page image sections and that the generator no longer adds pages.

## 6. Parity test

A Node script builds `.docx` files with the app's engine for a set of records; a Python test builds the same records
with `generate_acr.py` and compares both files: every body paragraph and table cell in document order — text (line
breaks as `\n`), and for each run with text: colour, bold, strike-through and font name. Records:
- the full sample record with the API worked example and typed last-year figures;
- the long-answers record (10-line answers in 17, 18, 19(b));
- extra rows (more entries than template rows in 26(iii), 26(iv), 27, 28 E(ii), 19(a));
- title/relation choices: chosen, and none;
- an empty record.
A record with problems must be refused by both, with the same problem list.

## 7. Libraries and offline use

- App: JSZip 3.10 (MIT) is copied into the project as `vendor/jszip.min.js` and loaded with a `<script>` tag, not from
  the internet. The template and the page images are part of the app and of the service worker's cache.
- Tests only: `jszip` and `@xmldom/xmldom` as npm dev dependencies (not shipped).

## 8. Checks
1. Unit tests for `variation`, `tokenValues`, `partTables` (shared cases with Python).
2. Parity test (§6).
3. Browser: fill a record, download the file (offline too), open it in Word → PDF, compare with the PC-made PDF page by
   page.
4. Google Docs: open the same file and note any differences; reported, not promised identical.

## 9. Out of scope
Cloud sessions; making a PDF without a separate app; retiring the Python generator.
