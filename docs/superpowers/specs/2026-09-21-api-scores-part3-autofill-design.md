# ACR Utility — Roadmap: API Auto-fill (Points 42–45), Saved Sessions, Phone PDF

Date: 2026-09-21
Status: awaiting user review
Source form: `UGC_ACR_Form.pdf` (30 pages; PDF pages 16–23 = document pages 82–89)

## 1. Requirements

| # | Requirement |
|---|---|
| R1 | Points 42, 43, 44 show the teacher's self-reported API scores automatically (col 4 for Cat I and II, col 5 for Cat III). Point 45 shows last academic year (col 3) and the total reported in self appraisal (col 4). Everything else the Principal fills stays blank. |
| R2 | A teacher who filled an ACR for a session (e.g. 2025-26) can, years later (e.g. 2029-30), type that session and see the ACR, then **download and print it**. |
| R3 | It must work on phones, including downloading the PDF on the phone. |
| R4 | Highest achievable accuracy: numbers, stored data and printed form. |
| R5 | Strict data privacy: nobody except the teacher can read ACR content, **including the project owner** (no admin decryption, no admin reset). |

Point 45 column 5 ("reported by Principal") and all Agree / Dis-agree / Reasons / Principal-score
columns are never written. Filling the "reported in self appraisal" columns is a deliberate,
approved exception to the earlier rule "never populate Reporting Officer fields": only the
teacher's own reported figures are copied, never an assessment.

## 2. Decisions

| Decision | Status |
|---|---|
| Category III scores come from records, each with an official-row dropdown; generator/renderer sums per row into column 5 | Approved |
| Co-authored work: the app pre-fills the full row rate and the teacher edits the score. The UGC 2010 Table-1 sharing formula is not in the supplied PDF, so nothing is hard-coded. | Approved (option A) |
| Point 45 col 3 auto-fetched from the preceding session; blank when none (this session) | Approved |
| One scoring engine, in the app (JavaScript). The exported record carries the computed `scores`; the PDF renderer only prints them. | Recommended, not yet confirmed |
| PDF is produced **in the browser** from the official PDF as the master (pdf-lib), so phones need no server | Recommended, not yet confirmed |
| Firebase (free Spark tier, Firestore) stores sessions; user owns and keeps the project alive | Approved |
| Client-side end-to-end encryption; strict mode: nobody can decrypt, including the owner; no admin reset (owner can only wipe a stuck record) | Approved |
| Identity hidden too: anonymous login name + passphrase accounts (no Google sign-in, no real email) | Approved |
| Teacher-held recovery key and encrypted backup file are the only recovery routes | Approved |
| "Finalize" freezes a session: read-only, scores + form/rule/renderer versions pinned | Approved |
| Python DOCX generator stays as-is for PC use; no adapter to the app's JSON | Recommended, not yet confirmed |

## 3. Sub-projects (each gets its own plan; built in this order)

1. **Foundation — rules, schema, scoring engine, Category III entry.**
2. **Privacy & storage**
   - **2a Privacy layer** — anonymous accounts, key derivation, encryption, recovery key.
   - **2b Sessions** — per-session encrypted records, Finalize, session viewer, previous-session lookup, backups.
3. **PDF renderer — slice 1: pages 16–23 (points 42–45); later slices: Part I, Part II, appended pages.**
4. *(deferred)* Python generator alignment. Not planned unless requested.

R1 is met by 1 + 2b (lookup) + 3 slice 1; 2a is a prerequisite of 2b. R2 and R3 in full ("the filled ACR as a PDF") are met
only when **all** renderer slices are complete; until then a phone download is the official
form with only the slices built so far filled in.

## 4. Sub-project 1 — Foundation

### 4.1 Rules first
Read the remaining instruction pages (PDF pages 24–27) and write every scoring rule with its
page number into `api_rules.md`. Two current rules in `generate_acr.py` are **not** backed by
any page reviewed so far and must be confirmed or corrected before being coded: "2 points per
extra teaching hour, cap 10" and "innovative / examination points typed in as totals". Any
rule the form does not state is entered by the teacher, never guessed.

### 4.2 One schema
A single schema file defines the record (profile, college, part2, api, Category III lists,
`scores`, `schemaVersion`, `rulesVersion`). The app's fields are renamed/extended to match
what the form needs (address lines, date of birth in words, pay info, p24a–c, departmental
exam, Category I/II inputs, Category III lists). The app and renderer both validate against it.

### 4.3 Scoring engine (JavaScript, in the app)
Computes Category I sub-scores and total (cap 125), Category II (cap 25), I+II, Category III
per official row and total. Live totals in the app come from this engine. The export carries
the computed `scores`.

### 4.4 Row catalogue — `api_rows.json` (single source of truth)
`key`, `label`, `rate`, `unit`, `group`, optional variants. Rows of point 44:

| key | Official row | Rate |
|---|---|---|
| A1 | Research papers – refereed journals | 15 / publication |
| A2 | Research papers – non-refereed, ISBN/ISSN | 10 / publication |
| B1a | Chapters, international publishers | 10 / chapter |
| B1b | Chapters, Indian/national publishers | 5 / chapter |
| B2 | Full papers in conference proceedings | 10 / publication |
| B3a | Books, international, peer reviewed | 50 sole author · 10 chapter in edited book |
| B3b | Books, national / State / Central Govt. | 25 sole author · 5 chapter |
| B3c | Books, other local publishers | 15 sole author · 3 chapter |
| C1a | Major project, > Rs 30 L (science) / > Rs 5 L (arts) | 20 / project |
| C1b | Major project, Rs 5–30 L / Rs 3–5 L | 15 / project |
| C1c | Minor project | 10 / project |
| C2 | Consultancy | 10 per Rs 10 L (science) / per Rs 2 L (arts) |
| C3 | Completed project report accepted | 20 major · 10 minor |
| C4 | Project outcome – patent / technology | 30 national · 50 international |
| D1 | M.Phil degree awarded | 3 / candidate |
| D2a | Ph.D degree awarded | 10 / candidate |
| D2b | Ph.D thesis submitted | 7 / candidate |
| E1a | Training / refresher, not less than two weeks | 20 each |
| E1b | Training, one week | 10 each |
| E2a–d | Conference papers: international / national / regional-State / local | 10 / 7.5 / 5 / 3 |
| E3a–b | Invited lectures: international / national | 10 / 5 |

Cap: E1a + E1b together ≤ **30** (printed on the form). Category III total is uncapped.
D1, D2a, D2b are computed from the existing `researchGuidance` counts, not per candidate.

### 4.5 Category III entry screens
Replace the single `apiC3` number with repeatable lists (journal papers, chapters, conference
proceedings, books, projects/consultancy/patents, research guidance, training, conference
papers, invited lectures). Each record: required **Row** dropdown limited to valid rows, the
rate-dependent field (authorship, amount + stream, national/international), and an editable
`score` pre-filled from the catalogue (consultancy = 10 × ⌊amount ÷ 10 L or 2 L⌋).

### 4.6 Accuracy checks
- Unit tests with hand-calculated expected scores (rows, E1 cap, empty Category III, consultancy floor).
- Invariant test: totals shown at points 29, 42, 43, 44 and 45 are identical for any input.
- Finalize is blocked on: a Category III record with no row, non-numeric score, missing mandatory profile fields.

## 5. Sub-project 2 — Privacy & storage

### 5.1 Privacy model (2a)
Goal: only the teacher can read ACR content; the owner of the Firebase project cannot.
- **Account.** The teacher picks a *login name* and a *passphrase*. Firebase Auth email/password is used
  with a pseudo-email `<SHA-256(normalised login name)>@acr.invalid` and a password equal to `authSecret`.
  No Google account and no real email are involved, so the owner sees neither identity.
- **Key derivation.** A memory-hard KDF (Argon2id via a vendored WASM build; PBKDF2-SHA256 with
  ≥ 600,000 iterations as fallback) derives two independent, domain-separated secrets from the
  passphrase: `authSecret` (login) and `KEK` (key-wrapping). Parameters are fixed in the plan.
- **Data key.** A random 256-bit `DEK` encrypts everything with AES-256-GCM (fresh 96-bit IV per write,
  the session id bound as associated data). The DEK is stored **wrapped twice**: under `KEK`, and under a
  random recovery key (≥ 128 bits, shown once as grouped words for the teacher to store). Changing the
  passphrase re-wraps the DEK; no data is re-encrypted.
- **Passphrase strength is enforced** (minimum length + strength meter; the app can generate a random
  multi-word passphrase). Reason: the owner holds the wrapped key and the auth hash, so a weak passphrase could
  be brute-forced offline. Privacy against the owner is only as strong as the passphrase.
- **Keys live in memory only.** The app asks for the passphrase on launch and locks when closed.
  Local drafts and exported backup files are encrypted with the same DEK.
- **Recovery.** Passphrase, recovery key, or encrypted backup file. If all are lost the data is
  permanently unreadable. The owner can delete a stuck account's records in the Firebase console (a wipe,
  never a decryption). There is no email reset, by design.
- **What the owner can see:** opaque account ids, save timestamps, ciphertext sizes, and a plain
  `status` flag (`draft`/`final`, needed by the security rules). **Hidden:** identity, content, scores,
  session years (document id = HMAC of the session id; the real session name is inside the ciphertext).
- **Hygiene:** no analytics or third-party scripts; no logging of record content; Firebase Analytics disabled.
- **Stated limit:** an app served from the owner's own site could in principle be modified to capture
  passphrases. The protection covers stored data, console access, leaks and casual viewing, not a
  deliberately altered app. The app's privacy note must say so.

### 5.2 Data model and rules (2b)
- `users/{uid}/keys/main`: KDF parameters, salt, `wrappedDEK` (passphrase), `wrappedDEKRecovery`.
- `users/{uid}/acrs/{docId}`, `docId = base64url(HMAC-SHA256(macKey, session))`, holding `ciphertext`, `iv`, `status`,
  `updatedAt`. Inside the ciphertext: session, record data, `scores`, `schemaVersion`, `rulesVersion`,
  `rendererVersion`, `finalizedAt`, `revision`.
- Reopening a final session first copies it to `.../acrs/{docId}/revisions/{n}`.
- `firestore.rules`: per-user access only; a `final` document cannot be updated unless the update sets
  `status` back to `draft`. Session ids are validated in the app as `YYYY-YY` with consecutive years.

### 5.3 Session viewer
After unlocking, the teacher types a session (or picks one from a list built by decrypting their own records).
`final` → read-only ACR view with **Download PDF** and **Print**; `draft` → editable; not found → clear
message plus "Import backup file". A final ACR is rendered from its stored `scores` and pinned versions and
is never recomputed.

### 5.4 Local storage and previous-session lookup
- Local drafts move to per-session keys `acrUtilityDraft:<session>` (encrypted); the legacy plaintext
  `acrUtilityDraftV01` is migrated into its session and removed. Saving under a new session name never
  overwrites another session (today's single key does).
- Point 45 col 3 / point 29 "Last Academic Year": look up session N−1 in order **cloud → local copy →
  imported file**, showing the source ("Fetched from 2025-26, saved 12 Aug 2026"). If none is found the app
  says so and offers "Import last year's file" or "Continue blank"; blank never appears silently.

### 5.5 Backup and offline
Export/import of the encrypted `.acr.json` remains; the app prompts for a backup download on Finalize.
Edits work offline and sync when online. Installing to the home screen is recommended (iOS Safari can delete
site storage after ~7 days of non-use).

### 5.6 Setup (user action)
Create a free Firebase project; paste its web config into `firebase-config.js`; enable the **Email/Password**
provider (not Google), leave email verification/reset unused; disable Analytics; deploy `firestore.rules`.
The owner keeps the project alive for as long as records must remain retrievable.

## 6. Sub-project 3 — PDF renderer

- pdf-lib is vendored into the PWA (cached by `sw.js`) with the official `UGC_ACR_Form.pdf`;
  works offline. Values are drawn in blue, matching the existing generator.
- **Slice 1 (points 42–45, PDF pages 16–23):** a coordinate table (page, x, y, width, alignment)
  for every value cell: Cat I (5 rows + total), Cat II (3 + total), Cat III (all point-44 rows
  + total, incl. the E1 cap), point 45 (col 3, col 4). Coordinates are measured from the
  official pages and each page is verified visually against the source. Principal columns
  and point 45 col 5 are not touched.
- **Later slices (own specs):** Part I; Part II, which needs continuation pages for long
  answers and repeatable rows; appended instruction pages 28–30.
- Download on phone via the browser's file download / share sheet; **Print** opens the PDF in
  the viewer's print flow.
- A final ACR is rendered by the pinned `rendererVersion`; changes to layout bump the version.

## 7. Risks
- Long Part II answers do not fit the official page layout; the later-slice spec must decide
  on continuation pages.
- Rules not stated in the form (co-author sharing) rely on the teacher's entry.
- Old ACRs depend on the Firebase project staying alive and on the teacher keeping the passphrase, recovery key or an encrypted backup.
- A weak passphrase weakens privacy against the owner; strength is enforced.
- Losing all recovery routes loses the data permanently (accepted).
- iOS may evict local storage; cloud and backup files are the safeguards.

## 8. Out of scope
Table 32 (Part IV summary); any Principal / Reviewing Officer entry; the UGC Table-1 formula; any owner/admin decryption or reset;
server-side generation; changes to the Python DOCX generator.
