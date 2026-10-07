# Enclosure files and the complete PDF (ACR + enclosures)

Date: 2026-10-07. Status: approved in conversation, awaiting review of this written spec.

## Goal

Teachers may (optionally) attach the documents behind the enclosures they tick: PDFs or photos/scans. The app then
makes one complete record: the ACR PDF followed by every attached enclosure, numbered as in the ACR's enclosure list.
Attaching is never required and never blocks making the ACR.

## User decisions (2026-10-07)

| Question | Decision |
|---|---|
| What is the "complete set"? | One combined PDF: ACR PDF, then the enclosures. |
| Where are files kept? | In this browser; also in the teacher's Google Drive when "Keep my draft in Google Drive" is on, so they come back on another device. |
| How are files attached? | Per ticked enclosure; one enclosure may hold several files. |
| How is each enclosure marked in the PDF? | A small label at the top of its first page. No divider pages. |
| File size | Photos shrunk to print quality when attached; PDFs kept as they are (max 10 MB each); warn when the total is above 20 MB. |

## 1. Enclosures tab

- Each ticked enclosure, ready-made or custom, shows an **Attach PDF / photo** button. It accepts `.pdf`, `.jpg`,
  `.jpeg` and `.png` (`accept="application/pdf,image/jpeg,image/png"`). Several files may be chosen at once. On a
  phone the system picker also offers the camera.
- Under the enclosure, its files are listed in order, each with name and size and the buttons **↑**, **↓** and
  **Remove**.
- **Photos** (JPEG/PNG) are resized when attached: the long side becomes at most 1700 px (never enlarged), saved as
  JPEG at quality 0.85. The EXIF orientation is applied, so phone photos are not sideways. The result is typically
  300–600 KB.
- **PDFs** are kept byte for byte, up to 10 MB each. A larger PDF is refused with a message naming the file.
- **Checked when attached:**
  - A PDF that cannot be opened is refused: "<name> could not be read as a PDF."
  - A password-protected PDF is refused: "<name> is password-protected. Open it and print it to a new PDF, then attach that."
  - An image the browser cannot decode is refused: "<name> could not be read as a photo."
- **Size line** at the top of the tab: "7 files, 4.8 MB attached". Above 20 MB it adds: "Email may refuse a file this
  large; saving to Google Drive still works."
- **Unticking** an enclosure keeps its files stored and hides them, and leaves them out of the PDF. Ticking it again
  shows them again.
- Removing a custom enclosure also deletes its files.
- Attaching is optional. Nothing on this tab blocks the ACR, and the progress bar ignores attachments.

## 2. Storage

### In the record

Each entry in `state.enclosures` gets an optional `files` array of
`{ id, name, type, size, order }`, where `type` is `application/pdf` or `image/jpeg`. The record never holds file
contents. Older records without `files` work unchanged. The v0.4 import creates no files.

### In this browser

- **Store:** IndexedDB database `acrUtility-files`, object store `files`, key `"<session>|<id>"`, value
  `{ session, id, name, type, size, bytes: Blob, addedAt }`.
- **Ids:** `id` is a random 12-character string from `crypto.getRandomValues`.
- **Sessions are kept apart:** files belong to the session they were attached in, like the rest of the record.
- **Storage full:** if the browser refuses a write (QuotaExceededError), the attach is refused with "This browser
  has no room left for the file. Remove some files or use another device." Nothing already saved is touched.
- **No IndexedDB** (private windows on some browsers): the Attach buttons are disabled, with the note "This browser
  cannot keep files (private window?)."

### In Google Drive (only when "Keep my draft in Google Drive" is on)

- **Upload:** each file is uploaded to the existing app folder `ACR Utility - Word and PDF`, named
  `ACR enclosure <session> - <id> - <original name>`. Scope stays `drive.file`.
- **Each sync of a session:**
  1. **Upload:** every file in the record that is in this browser and not yet in Drive is uploaded.
  2. **Download:** every file in the record that is not in this browser but is in Drive is downloaded into this
     browser.
  3. **Delete:** every Drive file named `ACR enclosure <session> - <id> - ...` whose id is no longer in the record is
     deleted. The record is the truth. This runs only after the record itself has synced.
- **Which copy wins:** draft-copy conflicts are settled by the existing "which copy?" question first. The file steps
  then follow the chosen record.
- **Errors:** a failed file upload or download leaves the record alone and shows "Some enclosure files could not be
  synced; they will be tried again." The next sync tries again.

### Draft sync off

A file listed in the record but missing in this browser shows: "This file is on another device — attach it again, or
turn on Keep my draft in Google Drive." It is left out of the PDF (see section 3).

## 3. The complete PDF

### Build (`enclosure_pdf.js`, no browser code)

`buildCompletePdf({ acrPdf, enclosures, PDFLib })` returns `Uint8Array`.

- **Inputs:**
  - `acrPdf`: bytes of the Google-made ACR PDF.
  - `enclosures`: the ticked entries of `state.enclosures` in record order, each with
    `{ label, files: [{ name, type, bytes }] }` and already-missing files removed.
- **Numbering:** an enclosure's number is its position among the **ticked** entries, counted from 1. This is the same
  number `insertEnclosures` in `docx_engine.js` prints ("☑ n. label"). Ticked enclosures without files keep their
  number and add no pages.
- **Pages:**
  1. All pages of the ACR PDF, unchanged.
  2. Each ticked enclosure with files, in number order. Within an enclosure the files go in their `order`:
     - PDF: all its pages copied unchanged (`copyPages`).
     - JPEG: one A4 portrait page (595.28 × 841.89 pt), or A4 landscape when the image is wider than tall. The image
       is scaled to fit inside 28 pt margins, keeping its proportions, and centred.
- **Label:** on the first page of each enclosure, the text `Enclosure n — <label>` is drawn in Helvetica, 9 pt, black,
  12 pt below the top edge, left at 28 pt, on a white box just large enough for the text. Characters Helvetica
  cannot draw (outside WinAnsi) are replaced by `?`.
- **Output name:** the ACR PDF's name (`acrFileName(d, 'pdf')`) with ` with enclosures` before `.pdf`.

### Delivery (Review tab)

| Files attached (ticked, present on this device)? | Share / Email | Save to Google Drive | Download complete PDF |
|---|---|---|---|
| none | Word + ACR PDF (as today) | Word + ACR PDF (as today) | button hidden |
| at least one | Word + complete PDF | Word + ACR PDF + complete PDF | Word not included; downloads the complete PDF |

- **Same PDF step as today:** each action that needs the ACR PDF makes it via Google, with the same sign-in as today.
  If sign-in or conversion fails: "The complete PDF needs the ACR PDF from Google: <reason>." The existing Word-only
  fallbacks stay.
- **Missing files:** if some listed files are missing on this device, the Review tab and the result message say
  "Left out (not on this device): Enclosure 3 — <file name>, …".
- **Loading pdf-lib:** `vendor/pdf-lib.min.js` is loaded on first use (dynamic `<script>`), then reused. A load
  failure gives "The complete PDF could not be made (PDF tool did not load). Check the connection and try again."

## 4. Structure

New files:
- `enclosure_files.js`: IndexedDB store with `put`, `get`, `remove`, `list(session)` and `available()`, and the
  quota error mapping. All storage is behind this one interface, so tests can use a fake.
- `enclosure_pdf.js`: `buildCompletePdf`, `enclosureNumbers` (the numbering rule above), `completePdfName` and
  `checkPdf(bytes, PDFLib)` (open, encrypted, damaged).
- `image_shrink.js`: `shrinkImage(file)` gives a JPEG Blob (canvas with `createImageBitmap(file, {imageOrientation: 'from-image'})`).
- `enclosure_ui.js`: the attach buttons, file lists, ordering, size line and missing-file notes.
- `vendor/pdf-lib.min.js` and `vendor/pdf-lib.LICENSE.txt` (MIT), with pdf-lib 1.17.1 pinned.

Changed files:
- `app.js`:
  - the record carries `files`;
  - the Enclosures tab calls `enclosure_ui`;
  - the Review buttons and the new Download complete PDF button;
  - Share and Drive use the complete PDF when it applies.
- `google_drive.js`: `uploadBinary` (upsert by name with a Blob), `downloadBytes(fileId)`, `deleteFile(fileId)`.
- `draft_sync.js`: the file steps of section 2 after each session's record sync.
- `sw.js`: precache the new modules and pdf-lib; bump the cache version.
- `index.html`: the size line and the Download complete PDF button.
- `package.json`: `pdf-lib` as a dev dependency, used by the tests only.

Not changed:
- the Word file and the template;
- `generate_acr.py` (the PC generator ignores `files`);
- the v0.4 import.

## 5. Testing

Unit tests (`node --test`), with pdf-lib from `node_modules`:
- **Numbering:** `enclosureNumbers` matches the "☑ n." numbering of `docx_engine.js` for mixed ticked, unticked and
  custom entries (one shared fixture).
- **Page counts:** `buildCompletePdf` gives ACR pages + PDF pages + one page per JPEG, in the right order, and skips
  unticked enclosures and those without files.
- **Labels:** each label is on the first page of its enclosure and nowhere else, checked by extracting the page
  content stream text.
- **Photo pages:** a landscape JPEG gives a landscape page, and the image stays inside the margins.
- **checkPdf:** accepts a normal PDF and refuses an encrypted one and garbage bytes, with the messages above.
- **Name:** `completePdfName` gives the expected name.
- **Draft sync file steps** (fake Drive and fake store):
  - uploads only new files;
  - downloads only missing ones;
  - deletes only orphans of that session;
  - leaves another session's files alone;
  - leaves the record unchanged when a transfer fails.
- **`enclosure_files` with a fake IndexedDB-like store:** a quota error maps to the message.

By hand, on the local server (PC and phone):
- attaching PDFs and photos, including from the phone camera;
- sideways phone photos come out upright;
- reordering and removing files;
- the size warning;
- unticking and ticking again;
- the complete PDF via Download, Share and Drive;
- with draft sync on, continuing on the other device;
- with draft sync off, the missing-file note.

Existing tests stay green. Python tests are unaffected.

## Out of scope

- OCR, compressing PDFs, or editing pages.
- Attaching files in the PC generator (`generate_acr.py`).
- Putting enclosure files inside the Word file.
