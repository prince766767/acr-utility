# ACR Utility — Saved sessions, last academic year, point 45

Date: 2026-09-27
Status: awaiting user review
Source form: `UGC_ACR_Form.pdf` (PDF page 11 = point 29, page 23 = point 45)
Builds on: `2026-09-27-api-score-tally-design.md` (point 29 col 4, 42–44) and
`2026-09-27-profile-part1-part2-to-word-design.md` (profile, Part I/II). Replaces, for this part, the cloud-based
"previous session lookup" of `2026-09-21-api-scores-part3-autofill-design.md` §5.4 with a device-only version.

## 1. Requirements

| # | Requirement |
|---|---|
| R1 | Point 29 column 3 and point 45 column 3 ("Last Academic Year") show last year's API totals I, II, I+II, III. |
| R2 | In the first year the teacher types them. From the next year on the app fills them automatically from the previous session's record. |
| R3 | Point 45 column 4 ("Total API score reported in self appraisal") shows this year's totals, identical to point 29 column 4. Column 5 (Principal) is never written. |
| R4 | The app keeps one record per session on the device; opening or starting a session never overwrites another session. |
| R5 | Figures are exact and the same in the app, the saved file and the Word file. |

## 2. Decisions (approved 2026-09-27)

| Decision | Choice |
|---|---|
| Where records live | In the app on the device (browser storage), one per session; exported files are the backup and the way to move to another device. No cloud in this work. |
| Which figures | Last year's own totals: last year's point 29 column 4 (I, II, I+II, III), computed with the same tally. |
| First year | The teacher types I, II and III; I+II is computed. |
| Fetched figures | Read-only, with their source shown; to change them the teacher corrects last year's record. |
| Last year's file of the wrong session | Refused with a message naming the expected and found session. |
| Last year's record/file with API problems | Not used; the problems are listed. |

## 3. Sessions

### 3.1 Session names
A session is `YYYY-YY` where the second part is the year after the first, modulo 100: `2025-26`, `1999-00`.
The previous session of `YYYY-YY` is `(YYYY−1)-(YY−1 mod 100)`, e.g. `2025-26 → 2024-25`, `2000-01 → 1999-00`.
Anything else (e.g. `2025-27`, `2025/26`, `25-26`) is not a valid session.

### 3.2 Storage (browser `localStorage`)
| Key | Holds |
|---|---|
| `acrUtility:session:<session>` | the full saved record of that session (same shape as today's draft/export) |
| `acrUtility:draft` | the record currently being edited when it has no valid session yet |
| `acrUtility:current` | the session currently open, or empty when the unnamed draft is open |

Migration on first load: if the old key `acrUtilityDraftV01` exists, it is moved to
`acrUtility:session:<its session>` when its session is valid (unless that key already exists — then it goes to
`acrUtility:draft` and a notice says so), otherwise to `acrUtility:draft`; the old key is then removed.
All reads and writes are wrapped so that a storage error shows a message and never loses the on-screen data.

### 3.3 Opening and starting sessions
The ACR Session box offers the saved sessions as suggestions. The app acts when the box loses focus (`change`), not on
every keystroke:

| Situation | What happens |
|---|---|
| Value is not a valid session | Message "Session must look like 2025-26"; nothing is switched or saved under it. |
| Unnamed draft is open, value is valid and no record exists for it | The draft becomes that session's record (nothing is lost). |
| Unnamed draft is open, a record already exists for that session | Ask: "A 2025-26 record already exists. Open it? (your unnamed draft is kept as the unnamed draft)". |
| A session is open and the value is another valid session | Save the current record; open the other session's record if it exists, otherwise start a new record. |
| New record | Starts with the **profile** (college and employee details) copied from the record that was open, and empty Part I, Part II, tables, API entries and enclosures. |

"Import Draft" saves the file's record under its session and opens it; if a record for that session exists, the app
asks before replacing it. A file without a valid session becomes the unnamed draft (after asking if one exists).
"Export Draft" is unchanged.

## 4. Last academic year

### 4.1 Where the figures come from
For the open session S with previous session P:

| Case | Figures | Shown as |
|---|---|---|
| No valid session open | none | "Choose the session first." |
| Record for P exists, its API has no problems | tally of P's `api` → p29 I, II, I+II, III | read-only, "From the 2024-25 record" |
| Record for P exists, its API has problems | none used | "The 2024-25 record has problems, so its totals cannot be used: …" (the problems) + "Open 2024-25 to fix them." |
| No record for P | the teacher types I, II, III; I+II = I + II | editable boxes + "No 2024-25 record on this device. Type last year's figures, or import last year's file." + button **Import last year's file** |

Fetched figures are recalculated whenever S is opened or the API tab is shown, so a corrected P is reflected.

### 4.2 Import last year's file
- The file's session must equal P, else: "This file is for 2023-24; last year for 2025-26 is 2024-25." — refused.
- The file's API must have no problems, else the problems are listed — refused.
- Accepted: saved as the P record (after asking if one exists — in this case none exists by §4.1), and the figures
  switch to "From the 2024-25 record".

### 4.3 Typed figures (first year)
- I, II, III: numbers ≥ 0 with at most 2 decimals (the same rule as API scores); maximums I ≤ 125, II ≤ 25.
  III has no maximum. I+II is computed exactly (hundredths).
- Problems (block the Word file, listed on the Review tab and in the API tab):
  `Last academic year I: score must be a number (0 or more) with at most 2 decimals.`,
  `Last academic year I is 130; the form's maximum is 125.` (same for II with 25).
- A partly filled set (e.g. I and III but not II) is a problem: `Last academic year: fill I, II and III, or leave all three empty.`

### 4.4 Saved with the record
`api.lastAcademicYear = { cat1, cat2, total12, cat3, source, from }` — strings formatted like the other totals
(`fmt`), `source` ∈ `record` | `typed`, `from` = P (for `record`). When the source is `record` the stored strings
are the freshly fetched ones; when no figures exist all four are `''`.

## 5. Word file

| Cell | Value |
|---|---|
| Point 29, col 3 (table 23, rows 1–4, column 3) | `lastAcademicYear` cat1, cat2, total12, cat3 |
| Point 45, col 3 (table 31, rows 1–4, column 3) | the same four |
| Point 45, col 4 (table 31, rows 1–4, column 4) | this year's p29 I, II, I+II, III (same strings as point 29 col 4) |
| Point 45, col 5 | never written |

Checks: typed figures that break §4.3 block generation (same problem messages). Empty figures are allowed: both
column 3s print blank and the app's Review tab shows the warning "Last academic year figures are not filled in."
The generator checks the row labels of table 31 before writing (as for the other tables).

## 6. Out of scope
Point 48 (Part IV committee table); cloud sessions; phone PDF; changing how the Principal columns are handled.

## 7. Testing
1. Pure functions (JS, node:test): `isSession`, `previousSession` (incl. 2000-01 → 1999-00), storage migration, the
   §3.3 switching rules (on an in-memory storage object), last-year resolution for the four §4.1 cases, typed-figure
   checks, last-year file import refusals.
2. Python: the same typed-figure checks (shared cases file with JS), generator writes point 29 col 3 and point 45
   col 3/4 and leaves col 5 empty; a typed-figure problem blocks generation.
3. Invariant: point 45 col 4 = point 29 col 4 for every tally test case.
4. Browser: two sessions on one device — enter 2024-25 with API scores, start 2025-26 → profile copied, annual parts
   empty, last-year figures locked "From the 2024-25 record"; change a 2024-25 score → 2025-26 follows; remove the
   2024-25 record from storage (test step; the app has no delete button in this work) → typed boxes appear; import a 2023-24 file → refused; import a 2024-25 file with a problem →
   refused; import a good one → locked again. Reload keeps everything; the old single-draft key is migrated.
5. Visual: generated PDF, point 29 and point 45 pages against PDF pages 11 and 23.
