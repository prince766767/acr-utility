# Enclosure Files and the Complete PDF: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can optionally attach PDFs or photos to each ticked enclosure. The app then makes one complete PDF: the
ACR PDF, then the enclosures, numbered as in the Word file's enclosure list.

**Architecture:**
- **Pure modules, tested in Node:**
  - numbering, parts, labels and the PDF build (`enclosure_pdf.js`, with pdf-lib passed in);
  - photo sizing (`image_shrink.js`);
  - the IndexedDB file store (`enclosure_files.js`);
  - list helpers (`enclosure_ui.js`);
  - Drive file sync (`draft_sync.js`).
- **Browser wiring** sits in `app.js` and `index.html`.
- **pdf-lib** is vendored at `vendor/pdf-lib.min.js`. It is loaded on first use with a `<script>` tag and precached by
  the service worker.

**Tech Stack:** plain ES modules, pdf-lib 1.17.1 (MIT), IndexedDB, Google Drive v3 REST (existing `google_drive.js`),
`node --test`, fake-indexeddb 6.2.5 (tests only), Python Pillow and pypdf (test fixtures only).

**Spec:** `docs/superpowers/specs/2026-10-07-enclosure-files-design.md`

## Global Constraints

- Attaching is optional. Nothing in this feature may block making the Word file, and the progress bar ignores attachments.
- **Accepted files:** `.pdf`, `.jpg`, `.jpeg`, `.png`. PDFs are kept byte for byte, max 10 MB each. Photos are resized
  to a long side of at most 1700 px (never enlarged), JPEG quality 0.85, with the EXIF orientation applied.
- **Size warning** above 20 MB total: "Email may refuse a file this large; saving to Google Drive still works."
- **Messages, verbatim:**
  - "<name> could not be read as a PDF."
  - "<name> is password-protected. Open it and print it to a new PDF, then attach that."
  - "<name> could not be read as a photo."
  - "This browser has no room left for the file. Remove some files or use another device."
  - "This browser cannot keep files (private window?)."
  - "This file is on another device — attach it again, or turn on Keep my draft in Google Drive."
  - "Some enclosure files could not be synced; they will be tried again."
  - "The complete PDF could not be made (PDF tool did not load). Check the connection and try again."
  - "Left out (not on this device): Enclosure 3 — <file name>, …"
- **Numbering:** an enclosure's number is its position among the ticked entries of `state.enclosures`, from 1. This is
  exactly the filter in `docx_engine.js` `insertEnclosures`: `has(x,'checked') ? x.checked : true`, with the label
  `null`/`undefined` → `'None'`.
- **Label stamp:** `Enclosure n — <label>`, Helvetica 9 pt black on a white box, 12 pt below the top edge, left 28 pt.
  Characters outside WinAnsi become `?`.
- **Photo page:** A4 portrait 595.28 × 841.89 pt, or landscape when the image is wider than tall. The image is fitted
  inside 28 pt margins and centred.
- **Output name:** the ACR PDF name with ` with enclosures` before `.pdf`.
- **Drive:**
  - Files go in the existing folder `ACR Utility - Word and PDF`, named
    `ACR enclosure <session or (no session)> - <id> - <original name>`.
  - Scope stays `drive.file`.
  - Each sync uploads new files, downloads missing ones, and deletes Drive files of that session whose id is no longer
    in the record. This runs only after the record itself has synced.
- **Storage key:** IndexedDB database `acrUtility-files`, store `files`, key `"<session>|<id>"`.
- **Ids:** 12 characters from `[0-9a-z]`.
- **Clarification of the spec:** file contents are stored as `Uint8Array` rather than `Blob`. It is structured-clonable
  everywhere, including the tests, and pdf-lib takes it directly. Drive uploads reuse the existing `upsertFile`, which
  already accepts any bytes and MIME type, so no separate `uploadBinary` is needed.
- **Not changed:** the Word file, the template, `generate_acr.py`, the v0.4 import.
- **Git:** work on branch `feature/enclosure-files`, commit per task, and merge fast-forward into `master` at the end
  only when the user approves.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Run both suites** after every task: `npm test` and `python -m unittest discover -s tests` (from the repo root
  `C:\Users\princ\Downloads\ACR_Utility_v0_3\ACR_Utility_v0_3`).

---

### Task 0: Branch and test dependencies

**Files:**
- Modify: `package.json`, `package-lock.json` (if present)

- [ ] **Step 1: Create the branch**

```bash
git checkout master && git checkout -b feature/enclosure-files
```

- [ ] **Step 2: Add the test-only packages**

```bash
npm install --save-dev pdf-lib@1.17.1 fake-indexeddb@6.2.5
```

Expected: `package.json` devDependencies now list `pdf-lib` and `fake-indexeddb`.

- [ ] **Step 3: Run the suites (unchanged)**

Run: `npm test` → all pass. Run: `python -m unittest discover -s tests` → OK.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Enclosure files: pdf-lib and fake-indexeddb as test-only packages"
```

---

### Task 1: Numbering, parts and names (`enclosure_pdf.js`, pure part)

**Files:**
- Create: `enclosure_pdf.js`
- Create: `tests/enclosure_pdf.test.js`

**Interfaces:**
- Produces:
  - `isTicked(entry) → boolean`
  - `enclosureNumbers(enclosures) → [{ number, label, entry }]`
  - `sortedFiles(entry) → [{ id, name, type, size, order }]`
  - `pdfParts(enclosures, have: id => boolean) → { parts: [{ number, label, files: [meta] }], missing: [{ number, label, name }] }`
  - `completePdfName(pdfName) → string`
  - `winAnsiSafe(s) → string`
  - `labelText(number, label) → string`
  - `missingText(missing) → string` (`''` when empty)
  - `MESSAGES = { damaged(name), encrypted(name), photo(name), tooBig(name) }`
  - `MAX_PDF_BYTES = 10485760`
  - `PDF_TOOL_MESSAGE`

- [ ] **Step 1: Write the failing tests**

```js
// tests/enclosure_pdf.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { generateDocx } from '../docx_engine.js';
import * as E from '../enclosure_pdf.js';

const read = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const TEMPLATE = readFileSync(new URL('../ACR_EMPLOYEE_MASTER.docx', import.meta.url));

// Ticked, unticked, custom, no 'checked' key (counts as ticked), and a null label.
const MIXED = [
  { label: 'Certificate / sanction order', checked: true, files: [{ id: 'aaaaaaaaaaaa', name: 'b.pdf', type: 'application/pdf', size: 10, order: 1 },
                                                                 { id: 'bbbbbbbbbbbb', name: 'a.jpg', type: 'image/jpeg', size: 20, order: 0 }] },
  { label: 'Conference / seminar certificate', checked: false, files: [{ id: 'cccccccccccc', name: 'x.pdf', type: 'application/pdf', size: 5, order: 0 }] },
  { label: 'Invited lecture', checked: true, custom: true },
  { label: 'Old entry without checked' },
  { label: null, checked: true, files: [{ id: 'dddddddddddd', name: 'gone.pdf', type: 'application/pdf', size: 7, order: 0 }] },
];

test('enclosureNumbers counts ticked entries only, as the Word list does', async () => {
  const nums = E.enclosureNumbers(MIXED).map(({ number, label }) => [number, label]);
  assert.deepEqual(nums, [[1, 'Certificate / sanction order'], [2, 'Invited lecture'], [3, 'Old entry without checked'], [4, 'None']]);
  const data = { ...read('full_record.acr.json'), enclosures: MIXED };
  const out = await generateDocx(data, TEMPLATE, { JSZip, DOMParser, XMLSerializer });
  const xml = await (await JSZip.loadAsync(out)).file('word/document.xml').async('string');
  const word = [...xml.matchAll(/☑ (\d+)\. ([^<]*)/g)].map(m => [Number(m[1]), m[2]]);
  assert.deepEqual(word, nums);
});

test('pdfParts keeps ticked enclosures with files on this device, in file order, and lists the missing', () => {
  const have = id => id !== 'dddddddddddd';
  const { parts, missing } = E.pdfParts(MIXED, have);
  assert.deepEqual(parts.map(p => [p.number, p.label, p.files.map(f => f.name)]), [[1, 'Certificate / sanction order', ['a.jpg', 'b.pdf']]]);
  assert.deepEqual(missing, [{ number: 4, label: 'None', name: 'gone.pdf' }]);
  assert.equal(E.missingText(missing), 'Left out (not on this device): Enclosure 4 \u2014 gone.pdf');
  assert.equal(E.missingText([]), '');
});

test('names, labels and messages', () => {
  assert.equal(E.completePdfName('ACR 2025-26 ASHA DEVI.pdf'), 'ACR 2025-26 ASHA DEVI with enclosures.pdf');
  assert.equal(E.labelText(3, 'Conference / seminar certificate'), 'Enclosure 3 \u2014 Conference / seminar certificate');
  assert.equal(E.labelText(1, 'प्रमाण पत्र é'), 'Enclosure 1 \u2014 ?????? ???? é');
  assert.equal(E.MESSAGES.damaged('a.pdf'), 'a.pdf could not be read as a PDF.');
  assert.equal(E.MESSAGES.encrypted('a.pdf'), 'a.pdf is password-protected. Open it and print it to a new PDF, then attach that.');
  assert.equal(E.MESSAGES.photo('p.jpg'), 'p.jpg could not be read as a photo.');
  assert.equal(E.MESSAGES.tooBig('big.pdf'), 'big.pdf is larger than 10 MB. Attach a smaller copy.');
  assert.equal(E.MAX_PDF_BYTES, 10 * 1024 * 1024);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/enclosure_pdf.test.js`
Expected: FAIL, `Cannot find module '../enclosure_pdf.js'`.

- [ ] **Step 3: Implement**

```js
// enclosure_pdf.js
// The complete PDF: the ACR PDF followed by the teacher's enclosure files
// (spec docs/superpowers/specs/2026-10-07-enclosure-files-design.md). No browser code: PDFLib is passed in.

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const PDF_TOOL_MESSAGE = 'The complete PDF could not be made (PDF tool did not load). Check the connection and try again.';
export const MESSAGES = {
  damaged: name => `${name} could not be read as a PDF.`,
  encrypted: name => `${name} is password-protected. Open it and print it to a new PDF, then attach that.`,
  photo: name => `${name} could not be read as a photo.`,
  tooBig: name => `${name} is larger than 10 MB. Attach a smaller copy.`,
};

// The same rule as insertEnclosures in docx_engine.js, so the PDF's numbers are the Word list's numbers.
export const isTicked = e => Boolean(e) && typeof e === 'object' && !Array.isArray(e)
  && (Object.prototype.hasOwnProperty.call(e, 'checked') ? Boolean(e.checked) : true);

export function enclosureNumbers(enclosures) {
  return (Array.isArray(enclosures) ? enclosures : []).filter(isTicked)
    .map((entry, i) => ({ number: i + 1, label: entry.label === undefined || entry.label === null ? 'None' : String(entry.label), entry }));
}

export const sortedFiles = entry => (Array.isArray(entry?.files) ? entry.files : [])
  .filter(f => f && typeof f === 'object' && f.id).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// have(id): is the file in this browser? Ticked enclosures without files keep their number and give no part.
export function pdfParts(enclosures, have) {
  const parts = [], missing = [];
  for (const { number, label, entry } of enclosureNumbers(enclosures)) {
    const files = [];
    for (const f of sortedFiles(entry)) {
      if (have(f.id)) files.push(f);
      else missing.push({ number, label, name: String(f.name || '') });
    }
    if (files.length) parts.push({ number, label, files });
  }
  return { parts, missing };
}

export const missingText = missing => (missing.length
  ? 'Left out (not on this device): ' + missing.map(m => `Enclosure ${m.number} \u2014 ${m.name}`).join(', ') : '');

export const completePdfName = pdfName => String(pdfName).replace(/\.pdf$/i, '') + ' with enclosures.pdf';

// Helvetica (a standard PDF font) can draw only WinAnsi characters.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export const winAnsiSafe = s => [...String(s)].map(c => {
  const n = c.codePointAt(0);
  return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN_ANSI_EXTRA.has(c) ? c : '?';
}).join('');

export const labelText = (number, label) => winAnsiSafe(`Enclosure ${number} \u2014 ${label}`);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/enclosure_pdf.test.js` → PASS. Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add enclosure_pdf.js tests/enclosure_pdf.test.js
git commit -m "Enclosure files: numbering as in the Word list, PDF parts, names and labels"
```

---

### Task 2: Checking PDFs and building the complete PDF (`enclosure_pdf.js`, pdf-lib part)

**Files:**
- Modify: `enclosure_pdf.js` (append)
- Create: `tests/fixtures/encl/make_fixtures.py`, plus its outputs `portrait.jpg`, `landscape.jpg`, `two-pages.pdf`
  and `locked.pdf` in `tests/fixtures/encl/`
- Modify: `tests/enclosure_pdf.test.js` (append)

**Interfaces:**
- Consumes: `labelText` (Task 1).
- Produces:
  - `checkPdf(bytes, PDFLib) → Promise<'ok' | 'encrypted' | 'damaged'>`
  - `photoPlacement(imgW, imgH) → { page: [w, h], x, y, width, height }`
  - `buildCompletePdf({ acrPdf: Uint8Array, parts: [{ number, label, files: [{ name, type: 'application/pdf' | 'image/jpeg', bytes: Uint8Array }] }], PDFLib }) → Promise<Uint8Array>`

- [ ] **Step 1: Make the fixtures**

```python
# tests/fixtures/encl/make_fixtures.py
"""Makes the small files tests/enclosure_pdf.test.js uses. Run once: python tests/fixtures/encl/make_fixtures.py"""
from pathlib import Path
from PIL import Image
from pypdf import PdfWriter

HERE = Path(__file__).resolve().parent
Image.new('RGB', (60, 90), (200, 30, 30)).save(HERE / 'portrait.jpg', quality=85)
Image.new('RGB', (90, 60), (30, 30, 200)).save(HERE / 'landscape.jpg', quality=85)
w = PdfWriter()
w.add_blank_page(width=595.28, height=841.89)
w.add_blank_page(width=595.28, height=841.89)
w.write(HERE / 'two-pages.pdf')
w = PdfWriter()
w.add_blank_page(width=595.28, height=841.89)
w.encrypt(user_password='secret', owner_password='owner')
w.write(HERE / 'locked.pdf')
print('fixtures written')
```

Run: `python tests/fixtures/encl/make_fixtures.py` → `fixtures written`.

- [ ] **Step 2: Write the failing tests (append to `tests/enclosure_pdf.test.js`)**

```js
import * as PDFLib from 'pdf-lib';
import { inflateSync } from 'node:zlib';

const fx = n => new Uint8Array(readFileSync(new URL(`./fixtures/encl/${n}`, import.meta.url)));
async function acrPdf(pages) {
  const d = await PDFLib.PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([595.28, 841.89]);
  return d.save();
}
// All content-stream bytes of a page as a latin1 string (inflated when compressed).
function pageContent(doc, i) {
  const page = doc.getPage(i);
  const c = page.node.Contents();
  if (!c) return '';
  const streams = c instanceof PDFLib.PDFArray ? c.asArray().map(r => doc.context.lookup(r)) : [c];
  return streams.map(s => {
    const raw = Buffer.from(s.getContents());
    try { return inflateSync(raw).toString('latin1'); } catch { return raw.toString('latin1'); }
  }).join('\n');
}
const hex = s => Buffer.from(s, 'latin1').toString('hex').toUpperCase();
const hasText = (doc, i, s) => pageContent(doc, i).toUpperCase().includes(hex(s));

test('checkPdf: a good PDF, a password-protected one and garbage', async () => {
  assert.equal(await E.checkPdf(fx('two-pages.pdf'), PDFLib), 'ok');
  assert.equal(await E.checkPdf(fx('locked.pdf'), PDFLib), 'encrypted');
  assert.equal(await E.checkPdf(new TextEncoder().encode('not a pdf at all'), PDFLib), 'damaged');
});

test('photoPlacement: portrait and landscape A4, fitted inside 28 pt margins and centred', () => {
  const p = E.photoPlacement(600, 900);
  assert.deepEqual(p.page, [595.28, 841.89]);
  assert.ok(p.width <= 595.28 - 56 + 1e-9 && p.height <= 841.89 - 56 + 1e-9);
  assert.ok(Math.abs(p.x - (595.28 - p.width) / 2) < 1e-9 && Math.abs(p.y - (841.89 - p.height) / 2) < 1e-9);
  assert.ok(Math.abs(p.width / p.height - 600 / 900) < 1e-9);
  const l = E.photoPlacement(900, 600);
  assert.deepEqual(l.page, [841.89, 595.28]);
  assert.ok(l.width <= 841.89 - 56 + 1e-9 && l.height <= 595.28 - 56 + 1e-9);
});

test('buildCompletePdf: ACR pages, then each enclosure in order, label on its first page only', async () => {
  const parts = [
    { number: 1, label: 'Certificate / sanction order', files: [
      { name: 'p.jpg', type: 'image/jpeg', bytes: fx('portrait.jpg') },
      { name: 'two.pdf', type: 'application/pdf', bytes: fx('two-pages.pdf') }] },
    { number: 3, label: 'Invited lecture', files: [{ name: 'l.jpg', type: 'image/jpeg', bytes: fx('landscape.jpg') }] },
  ];
  const out = await E.buildCompletePdf({ acrPdf: await acrPdf(2), parts, PDFLib });
  const doc = await PDFLib.PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 2 + 1 + 2 + 1);
  const { width, height } = doc.getPage(5).getSize();
  assert.ok(width > height, 'landscape photo gives a landscape page');
  const stamped = [0, 1, 2, 3, 4, 5].filter(i => hasText(doc, i, 'Enclosure '));
  assert.deepEqual(stamped, [2, 5]);
  assert.ok(hasText(doc, 2, 'Enclosure 1 '));
  assert.ok(hasText(doc, 2, ' Certificate / sanction order'));
  assert.ok(hasText(doc, 5, 'Enclosure 3 '));
});

test('buildCompletePdf with no parts is just the ACR PDF', async () => {
  const doc = await PDFLib.PDFDocument.load(await E.buildCompletePdf({ acrPdf: await acrPdf(3), parts: [], PDFLib }));
  assert.equal(doc.getPageCount(), 3);
});
```

(The `import` lines go at the top of the file with the other imports.)

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test tests/enclosure_pdf.test.js`
Expected: FAIL, `E.checkPdf is not a function`.

- [ ] **Step 4: Implement (append to `enclosure_pdf.js`)**

```js
// 'ok', 'encrypted' (password-protected) or 'damaged' (cannot be opened).
export async function checkPdf(bytes, PDFLib) {
  try {
    await PDFLib.PDFDocument.load(bytes);
    return 'ok';
  } catch {
    // pdf-lib's built bundle loses its error classes, so ask again ignoring encryption: it opens only if merely locked.
    try { return (await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true })).isEncrypted ? 'encrypted' : 'damaged'; }
    catch { return 'damaged'; }
  }
}

const A4 = [595.28, 841.89];
const MARGIN = 28;

// A photo on an A4 page (landscape when wider than tall), fitted inside the margins, centred, never stretched.
export function photoPlacement(imgW, imgH) {
  const [w, h] = imgW > imgH ? [A4[1], A4[0]] : A4;
  const s = Math.min((w - 2 * MARGIN) / imgW, (h - 2 * MARGIN) / imgH);
  const width = imgW * s, height = imgH * s;
  return { page: [w, h], x: (w - width) / 2, y: (h - height) / 2, width, height };
}

// "Enclosure n — label" at the top left of the page, on a white box so it stays readable on a scan.
function stamp(page, text, font, rgb) {
  const size = 9, pad = 2;
  const box = page.getMediaBox();
  const x = box.x + MARGIN;
  const y = box.y + box.height - 12 - size;   // the text's top is 12 pt below the top edge
  const w = font.widthOfTextAtSize(text, size);
  page.drawRectangle({ x: x - pad, y: y - pad - 2, width: w + 2 * pad, height: size + 2 * pad + 2, color: rgb(1, 1, 1) });
  page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
}

export async function buildCompletePdf({ acrPdf, parts, PDFLib }) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const out = await PDFDocument.create();
  const acr = await PDFDocument.load(acrPdf);
  for (const p of await out.copyPages(acr, acr.getPageIndices())) out.addPage(p);
  const font = await out.embedFont(StandardFonts.Helvetica);
  for (const part of parts) {
    let first = null;
    for (const f of part.files) {
      if (f.type === 'application/pdf') {
        const src = await PDFDocument.load(f.bytes);
        for (const p of await out.copyPages(src, src.getPageIndices())) { out.addPage(p); first ??= p; }
      } else {
        const img = await out.embedJpg(f.bytes);
        const at = photoPlacement(img.width, img.height);
        const page = out.addPage(at.page);
        page.drawImage(img, { x: at.x, y: at.y, width: at.width, height: at.height });
        first ??= page;
      }
    }
    if (first) stamp(first, labelText(part.number, part.label), font, rgb);
  }
  return out.save();
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test tests/enclosure_pdf.test.js` → PASS.

If `hasText` finds no label, print `pageContent(doc, 2)` once and look for the `Tj` operand. pdf-lib writes Helvetica
text as an uppercase hex string `<456E...> Tj`. Adjust only the test helper if the case differs, never the module.

Then `npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add enclosure_pdf.js tests/enclosure_pdf.test.js tests/fixtures/encl
git commit -m "Enclosure files: check attached PDFs and build the complete PDF with labels"
```

---

### Task 3: Shrinking photos (`image_shrink.js`)

**Files:**
- Create: `image_shrink.js`
- Create: `tests/image_shrink.test.js`

**Interfaces:**
- Produces:
  - `MAX_SIDE = 1700`
  - `fitSize(w, h, max = MAX_SIDE) → { width, height }`
  - `shrinkImage(file, env?) → Promise<Blob | null>`. It returns `null` when the photo cannot be read.
    `env = { createImageBitmap, document }` defaults to the globals.

- [ ] **Step 1: Write the failing tests**

```js
// tests/image_shrink.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, shrinkImage, MAX_SIDE } from '../image_shrink.js';

test('fitSize: long side at most 1700, never enlarged, proportions kept', () => {
  assert.equal(MAX_SIDE, 1700);
  assert.deepEqual(fitSize(4000, 3000), { width: 1700, height: 1275 });
  assert.deepEqual(fitSize(3000, 4000), { width: 1275, height: 1700 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitSize(10000, 3), { width: 1700, height: 1 });
});

function fakeEnv({ bitmap, blob = new Blob(['jpeg']), fail = false }) {
  const log = [];
  const ctx = { fillStyle: '', fillRect: (...a) => log.push(['fillRect', ...a]), drawImage: (b, ...a) => log.push(['drawImage', ...a]) };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb, type, q) => { log.push(['toBlob', type, q]); cb(blob); } };
  return {
    log, canvas,
    env: {
      createImageBitmap: async (file, opts) => { log.push(['bitmap', opts]); if (fail) throw new Error('bad'); return bitmap; },
      document: { createElement: tag => { assert.equal(tag, 'canvas'); return canvas; } },
    },
  };
}

test('shrinkImage: upright, resized, white background, JPEG 0.85', async () => {
  const bitmap = { width: 3400, height: 1700, close() {} };
  const { env, log, canvas } = fakeEnv({ bitmap });
  const out = await shrinkImage(new Blob(['x']), env);
  assert.ok(out instanceof Blob);
  assert.deepEqual(log[0], ['bitmap', { imageOrientation: 'from-image' }]);
  assert.equal(canvas.width, 1700);
  assert.equal(canvas.height, 850);
  assert.deepEqual(log.find(l => l[0] === 'drawImage'), ['drawImage', 0, 0, 1700, 850]);
  assert.deepEqual(log.find(l => l[0] === 'toBlob'), ['toBlob', 'image/jpeg', 0.85]);
});

test('shrinkImage: null when the photo cannot be read or encoded', async () => {
  assert.equal(await shrinkImage(new Blob(['x']), fakeEnv({ fail: true }).env), null);
  assert.equal(await shrinkImage(new Blob(['x']), fakeEnv({ bitmap: { width: 10, height: 10 }, blob: null }).env), null);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/image_shrink.test.js` → FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// image_shrink.js
// Phone photos are resized when attached as an enclosure: still sharp when printed on A4, but a few hundred KB.

export const MAX_SIDE = 1700;

export function fitSize(w, h, max = MAX_SIDE) {
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

// A JPEG Blob of the photo, upright (EXIF orientation applied), long side at most MAX_SIDE; null if it cannot be read.
export async function shrinkImage(file, { createImageBitmap = globalThis.createImageBitmap, document = globalThis.document } = {}) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return null; }
  const { width, height } = fitSize(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';   // a transparent PNG gets a white page, not a black one
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return blob || null;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/image_shrink.test.js` → PASS. Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add image_shrink.js tests/image_shrink.test.js
git commit -m "Enclosure files: resize attached photos to print quality"
```

---

### Task 4: The file store in this browser (`enclosure_files.js`)

**Files:**
- Create: `enclosure_files.js`
- Create: `tests/enclosure_files.test.js`

**Interfaces:**
- Produces:
  - `createFileStore({ indexedDB }) → { available(): Promise<boolean>, put(rec), get(session, id), remove(session, id), ids(session): Promise<string[]> }`,
    where `rec = { session, id, name, type, size, bytes: Uint8Array, addedAt }`
  - `newFileId(crypto?) → string` (12 characters, `[0-9a-z]`)
  - `isQuotaError(err) → boolean`
  - `FULL_MESSAGE`
  - `NO_STORE_MESSAGE`

- [ ] **Step 1: Write the failing tests**

```js
// tests/enclosure_files.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createFileStore, newFileId, isQuotaError, FULL_MESSAGE, NO_STORE_MESSAGE } from '../enclosure_files.js';

const rec = (session, id, n = 3) => ({ session, id, name: id + '.pdf', type: 'application/pdf', size: n, bytes: new Uint8Array(n).fill(7), addedAt: '2026-10-07T10:00:00.000Z' });

test('put, get, ids and remove, kept apart per session', async () => {
  const s = createFileStore({ indexedDB: new IDBFactory() });
  assert.equal(await s.available(), true);
  await s.put(rec('2025-26', 'aaaaaaaaaaaa'));
  await s.put(rec('2025-26', 'bbbbbbbbbbbb', 5));
  await s.put(rec('2024-25', 'cccccccccccc'));
  await s.put(rec('', 'dddddddddddd'));
  assert.deepEqual((await s.ids('2025-26')).sort(), ['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
  assert.deepEqual(await s.ids(''), ['dddddddddddd']);
  const got = await s.get('2025-26', 'bbbbbbbbbbbb');
  assert.equal(got.name, 'bbbbbbbbbbbb.pdf');
  assert.deepEqual([...got.bytes], [7, 7, 7, 7, 7]);
  assert.equal(await s.get('2024-25', 'bbbbbbbbbbbb'), undefined);
  await s.remove('2025-26', 'aaaaaaaaaaaa');
  assert.deepEqual(await s.ids('2025-26'), ['bbbbbbbbbbbb']);
});

test('no IndexedDB: not available, with the message for the tab', async () => {
  assert.equal(await createFileStore({ indexedDB: undefined }).available(), false);
  assert.equal(NO_STORE_MESSAGE, 'This browser cannot keep files (private window?).');
});

test('quota errors are recognised; ids look right', () => {
  assert.equal(isQuotaError(Object.assign(new Error('x'), { name: 'QuotaExceededError' })), true);
  assert.equal(isQuotaError({ code: 22 }), true);
  assert.equal(isQuotaError(new Error('other')), false);
  assert.equal(FULL_MESSAGE, 'This browser has no room left for the file. Remove some files or use another device.');
  const id = newFileId();
  assert.match(id, /^[0-9a-z]{12}$/);
  assert.notEqual(newFileId(), id);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/enclosure_files.test.js` → FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// enclosure_files.js
// The teacher's enclosure files, kept in this browser (IndexedDB) per session. The record only lists them.

const DB_NAME = 'acrUtility-files';
const STORE = 'files';
export const FULL_MESSAGE = 'This browser has no room left for the file. Remove some files or use another device.';
export const NO_STORE_MESSAGE = 'This browser cannot keep files (private window?).';

export function newFileId(crypto = globalThis.crypto) {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map(b => (b % 36).toString(36)).join('');
}

export const isQuotaError = err => Boolean(err) && (err.name === 'QuotaExceededError' || err.code === 22);

export function createFileStore({ indexedDB = globalThis.indexedDB } = {}) {
  let opening = null;
  const open = () => (opening ??= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new Error('IndexedDB is not available')); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
  const key = (session, id) => `${session || ''}|${id}`;
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      let out;
      req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error || req.error);
      t.onabort = () => reject(t.error || req.error);
    });
  }
  return {
    async available() {
      try { await open(); return true; } catch { opening = null; return false; }
    },
    put: rec => tx('readwrite', s => s.put(rec, key(rec.session, rec.id))),
    get: (session, id) => tx('readonly', s => s.get(key(session, id))),
    remove: (session, id) => tx('readwrite', s => s.delete(key(session, id))),
    async ids(session) {
      const prefix = `${session || ''}|`;
      const keys = await tx('readonly', s => s.getAllKeys());
      return keys.filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
    },
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/enclosure_files.test.js` → PASS. Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add enclosure_files.js tests/enclosure_files.test.js
git commit -m "Enclosure files: keep attached files in this browser per session"
```

---

### Task 5: Drive downloads and deletes binary files (`google_drive.js`)

**Files:**
- Modify: `google_drive.js` (inside `createDrive`, and its `return`)
- Modify: `tests/google_drive.test.js` (append)

**Interfaces:**
- Produces: `drive.downloadBytes(fileId) → Promise<Uint8Array>`, `drive.deleteFile(fileId) → Promise<void>`. Uploads use
  the existing `drive.upsertFile({ name, bytes, mime, folderId })`.

- [ ] **Step 1: Write the failing tests (append)**

```js
test('downloadBytes returns the file bytes', async () => {
  const fetch = fakeFetch([new Response(new Uint8Array([1, 2, 250]))]);
  const out = await createDrive({ fetch, getToken: tokens('T1') }).downloadBytes('ID9');
  assert.deepEqual([...out], [1, 2, 250]);
  assert.equal(fetch.calls[0].url, `${API}/ID9?alt=media`);
});

test('deleteFile sends DELETE for the file', async () => {
  const fetch = fakeFetch([new Response(null, { status: 204 })]);
  await createDrive({ fetch, getToken: tokens('T1') }).deleteFile('ID7');
  assert.equal(fetch.calls[0].method, 'DELETE');
  assert.equal(fetch.calls[0].url, `${API}/ID7`);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/google_drive.test.js` → FAIL, `downloadBytes is not a function`.

- [ ] **Step 3: Implement**

In `google_drive.js`, after `downloadText`:

```js
  async function downloadBytes(fileId) {
    return new Uint8Array(await (await call(`${API}/${fileId}?alt=media`)).arrayBuffer());
  }

  async function deleteFile(fileId) {
    await call(`${API}/${fileId}`, { method: 'DELETE' });
  }

  return { ensureFolder, upsertFile, docxToPdf, listFiles, downloadText, downloadBytes, deleteFile };
```

(Replace the old `return` line.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/google_drive.test.js` → PASS. Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add google_drive.js tests/google_drive.test.js
git commit -m "Enclosure files: download and delete binary files in Drive"
```

---

### Task 6: Syncing enclosure files with the draft (`draft_sync.js`)

**Files:**
- Modify: `draft_sync.js`
- Modify: `tests/draft_sync.test.js` (append)

**Interfaces:**
- Consumes:
  - `drive.upsertFile`, `drive.listFiles(folderId, prefix)`, `drive.downloadBytes`, `drive.deleteFile` (Task 5);
  - a file store with `ids(session)`, `get(session, id)` and `put(rec)` (Task 4 shape).
- Produces:
  - `FILE_PREFIX = 'ACR enclosure '`
  - `fileDriveName(session, id, name)`
  - `fileIdFromName(name, session) → id | null`
  - `recordFiles(record) → [{ id, name, type }]`
  - `createDraftSync({ ..., files })`, where `files` is optional. When `files` is given, every `syncSession` and
    `syncAll` result may carry `filesFailed: n`.

- [ ] **Step 1: Write the failing tests (append to `tests/draft_sync.test.js`)**

```js
// A Drive for the file steps: names -> {id, bytes}; records uploads, downloads and deletes.
function fileDrive(initial = {}) {
  const files = new Map(Object.entries(initial).map(([name, bytes], i) => [name, { id: 'D' + i, name, bytes }]));
  const log = [];
  let n = 50;
  return {
    log, files,
    ensureFolder: async () => 'FOLDER',
    listFiles: async (folderId, prefix) => [...files.values()].filter(f => f.name.startsWith(prefix)).map(({ id, name }) => ({ id, name })),
    downloadText: async () => { throw new Error('no draft in this test'); },
    upsertFile: async ({ name, bytes, mime }) => {
      if (mime === 'application/json') return { id: 'J', name };   // the draft itself
      log.push(['up', name]);
      const f = { id: 'D' + n++, name, bytes: new Uint8Array(await new Blob([bytes]).arrayBuffer()) };
      files.set(name, f);
      return { id: f.id, name };
    },
    downloadBytes: async id => { log.push(['down', id]); return [...files.values()].find(f => f.id === id).bytes; },
    deleteFile: async id => { log.push(['del', id]); for (const [k, f] of files) if (f.id === id) files.delete(k); },
  };
}
function memFiles(list = []) {
  const m = new Map(list.map(r => [`${r.session}|${r.id}`, r]));
  return {
    m,
    ids: async session => [...m.values()].filter(r => r.session === session).map(r => r.id),
    get: async (session, id) => m.get(`${session}|${id}`),
    put: async r => { m.set(`${r.session}|${r.id}`, r); },
  };
}
const withFiles = (session, list) => rec(session, 'ASHA', { enclosures: [{ label: 'Certificate / sanction order', checked: true, files: list }] });
const meta = (id, name = id + '.pdf') => ({ id, name, type: 'application/pdf', size: 1, order: 0 });

test('file names in Drive', () => {
  assert.equal(D.fileDriveName('2025-26', 'aaaaaaaaaaaa', 'x.pdf'), 'ACR enclosure 2025-26 - aaaaaaaaaaaa - x.pdf');
  assert.equal(D.fileDriveName('', 'aaaaaaaaaaaa', 'x.pdf'), 'ACR enclosure (no session) - aaaaaaaaaaaa - x.pdf');
  assert.equal(D.fileIdFromName('ACR enclosure 2025-26 - aaaaaaaaaaaa - x - y.pdf', '2025-26'), 'aaaaaaaaaaaa');
  assert.equal(D.fileIdFromName('ACR enclosure 2024-25 - aaaaaaaaaaaa - x.pdf', '2025-26'), null);
  assert.equal(D.fileIdFromName('ACR draft 2025-26.acr.json', '2025-26'), null);
});

test('file steps: upload new, download missing, delete orphans of this session only', async () => {
  const st = new FakeStore();
  S.saveRecord(st, withFiles('2025-26', [meta('aaaaaaaaaaaa'), meta('bbbbbbbbbbbb')]));
  const drive = fileDrive({
    'ACR enclosure 2025-26 - bbbbbbbbbbbb - bbbbbbbbbbbb.pdf': new Uint8Array([9]),
    'ACR enclosure 2025-26 - zzzzzzzzzzzz - old.pdf': new Uint8Array([1]),
    'ACR enclosure 2024-25 - yyyyyyyyyyyy - keep.pdf': new Uint8Array([1]),
  });
  const files = memFiles([{ session: '2025-26', id: 'aaaaaaaaaaaa', name: 'aaaaaaaaaaaa.pdf', type: 'application/pdf', size: 1, bytes: new Uint8Array([5]) }]);
  const sync = D.createDraftSync({ store: st, sessions: S, drive, files, ask: async () => 'device' });
  const r = await sync.syncSession('2025-26');
  assert.equal(r.filesFailed, undefined);
  assert.deepEqual(drive.log, [['up', 'ACR enclosure 2025-26 - aaaaaaaaaaaa - aaaaaaaaaaaa.pdf'], ['down', 'D0'], ['del', 'D1']]);
  assert.deepEqual([...(await files.get('2025-26', 'bbbbbbbbbbbb')).bytes], [9]);
  assert.ok(drive.files.has('ACR enclosure 2024-25 - yyyyyyyyyyyy - keep.pdf'));
});

test('file steps: a failed transfer is counted, the record is left alone, nothing is deleted wrongly', async () => {
  const st = new FakeStore();
  S.saveRecord(st, withFiles('2025-26', [meta('bbbbbbbbbbbb')]));
  const drive = fileDrive({ 'ACR enclosure 2025-26 - bbbbbbbbbbbb - b.pdf': new Uint8Array([9]) });
  drive.downloadBytes = async () => { throw new Error('offline'); };
  const sync = D.createDraftSync({ store: st, sessions: S, drive, files: memFiles(), ask: async () => 'device' });
  const before = JSON.stringify(S.readRecord(st, '2025-26').enclosures);
  const r = await sync.syncSession('2025-26');
  assert.equal(r.filesFailed, 1);
  assert.equal(JSON.stringify(S.readRecord(st, '2025-26').enclosures), before);
  assert.ok(drive.files.has('ACR enclosure 2025-26 - bbbbbbbbbbbb - b.pdf'));
});

test('without a file store the draft sync works as before', async () => {
  const st = new FakeStore();
  S.saveRecord(st, withFiles('2025-26', [meta('aaaaaaaaaaaa')]));
  const drive = fileDrive();
  const r = await D.createDraftSync({ store: st, sessions: S, drive, ask: async () => 'device' }).syncSession('2025-26');
  assert.equal(r.action, 'upload');
  assert.deepEqual(drive.log, []);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/draft_sync.test.js` → FAIL, `D.fileDriveName is not a function`.

- [ ] **Step 3: Implement**

In `draft_sync.js`, after `otherCopyName`:

```js
// Enclosure files sit in the same Drive folder, one Drive file per attached file; the record lists them.
export const FILE_PREFIX = 'ACR enclosure ';
const sessionLabel = session => (session ? session : '(no session)');
export const fileDriveName = (session, id, name) => `${FILE_PREFIX}${sessionLabel(session)} - ${id} - ${name}`;

export function fileIdFromName(name, session) {
  const p = `${FILE_PREFIX}${sessionLabel(session)} - `;
  if (!String(name).startsWith(p)) return null;
  const m = /^([0-9a-z]{12}) - /.exec(name.slice(p.length));
  return m ? m[1] : null;
}

export const recordFiles = record => (Array.isArray(record?.enclosures) ? record.enclosures : [])
  .flatMap(e => (e && Array.isArray(e.files) ? e.files : []))
  .filter(f => f && typeof f === 'object' && /^[0-9a-z]{12}$/.test(String(f.id)))
  .map(f => ({ id: f.id, name: String(f.name || 'file'), type: String(f.type || 'application/octet-stream') }));
```

Change the factory signature and comment:

```js
// deps: store (localStorage-like), sessions (sessions.js), drive ({ensureFolder, listFiles, downloadText, upsertFile,
// downloadBytes, deleteFile}), files (optional enclosure file store: ids, get, put), ask(kind, {session, local, remote})
// -> 'drive' | 'device', deviceLabel, now.
export function createDraftSync({ store, sessions, drive, files = null, ask, deviceLabel = '', now = () => new Date() }) {
```

Inside the factory, before `async function sessionsHere()`:

```js
  // After the record has synced: the record is the truth for which files exist.
  async function syncFiles(session, folderId, listed) {
    if (!files) return {};
    const want = recordFiles(sessions.readRecord(store, session));
    const here = new Set(await files.ids(session));
    const there = new Map();
    for (const f of listed) { const id = fileIdFromName(f.name, session); if (id) there.set(id, f); }
    let failed = 0;
    for (const f of want) {
      try {
        if (here.has(f.id) && !there.has(f.id)) {
          const rec = await files.get(session, f.id);
          await drive.upsertFile({ name: fileDriveName(session, f.id, f.name), bytes: rec.bytes, mime: rec.type, folderId });
        } else if (!here.has(f.id) && there.has(f.id)) {
          const bytes = await drive.downloadBytes(there.get(f.id).id);
          await files.put({ session, id: f.id, name: f.name, type: f.type, size: bytes.length, bytes, addedAt: now().toISOString() });
        }
      } catch (err) { console.warn('Enclosure file not synced:', err); failed++; }
    }
    const keep = new Set(want.map(f => f.id));
    for (const [id, f] of there) {
      if (keep.has(id)) continue;
      try { await drive.deleteFile(f.id); } catch (err) { console.warn('Enclosure file not deleted:', err); failed++; }
    }
    return failed ? { filesFailed: failed } : {};
  }
  const listFileCopies = folderId => (files ? drive.listFiles(folderId, FILE_PREFIX) : []);
```

Replace `syncSession` and `syncAll` in the returned object:

```js
    async syncSession(session) {
      const folderId = await drive.ensureFolder();
      const result = await syncOne(session, folderId, await drive.listFiles(folderId, PREFIX));
      return { ...result, ...(await syncFiles(session, folderId, await listFileCopies(folderId))) };
    },
    async syncAll() {
      const folderId = await drive.ensureFolder();
      const drafts = await drive.listFiles(folderId, PREFIX);
      const copies = await listFileCopies(folderId);
      const names = new Set(await sessionsHere());
      for (const f of drafts) { const s = sessionFromName(f.name); if (s !== null) names.add(s); }
      const out = [];
      for (const s of [...names].sort()) out.push({ ...(await syncOne(s, folderId, drafts)), ...(await syncFiles(s, folderId, copies)) });
      return out;
    },
```

(`drafts`, the list of draft files, avoids clashing with the new `files` parameter. Rename every use of the old local `files` in `syncAll`.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/draft_sync.test.js` → PASS, old and new tests. Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add draft_sync.js tests/draft_sync.test.js
git commit -m "Enclosure files: upload, download and delete them in Drive with the draft"
```

---

### Task 7: Enclosure list helpers and the file block (`enclosure_ui.js`)

**Files:**
- Create: `enclosure_ui.js`
- Create: `tests/enclosure_ui.test.js`

**Interfaces:**
- Consumes: `enclosureNumbers`, `sortedFiles` (Task 1).
- Produces:
  - `formatSize(bytes) → string`
  - `WARN_BYTES = 20971520`
  - `sizeSummary(enclosures) → { text, warn }`
  - `addFiles(entry, metas) → files[]`
  - `removeFile(entry, id) → files[]`
  - `moveFile(entry, id, dir: -1 | 1) → files[]` (every result has `order` renumbered 0..n-1)
  - `MISSING_NOTE`
  - `fileBlock(doc, { entry, have: Set<string>, canStore: boolean, onAttach(FileList), onMove(id, dir), onRemove(id) }) → HTMLElement`

- [ ] **Step 1: Write the failing tests**

```js
// tests/enclosure_ui.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../enclosure_ui.js';

const f = (id, size, order) => ({ id, name: id + '.pdf', type: 'application/pdf', size, order });

test('formatSize and sizeSummary count ticked enclosures only', () => {
  assert.equal(U.formatSize(500), '1 KB');
  assert.equal(U.formatSize(300 * 1024), '300 KB');
  assert.equal(U.formatSize(4.8 * 1024 * 1024), '4.8 MB');
  const encl = [
    { label: 'A', checked: true, files: [f('a', 3 * 1024 * 1024, 0), f('b', 1.8 * 1024 * 1024, 1)] },
    { label: 'B', checked: false, files: [f('c', 50 * 1024 * 1024, 0)] },
  ];
  assert.deepEqual(U.sizeSummary(encl), { text: '2 files, 4.8 MB attached', warn: '' });
  encl[1].checked = true;
  assert.deepEqual(U.sizeSummary(encl), { text: '3 files, 54.8 MB attached', warn: 'Email may refuse a file this large; saving to Google Drive still works.' });
  assert.deepEqual(U.sizeSummary([{ label: 'A', checked: true }]), { text: '', warn: '' });
  assert.equal(U.WARN_BYTES, 20 * 1024 * 1024);
});

test('addFiles, moveFile and removeFile keep a clean order', () => {
  const entry = { label: 'A', checked: true, files: [f('a', 1, 0), f('b', 1, 1)] };
  entry.files = U.addFiles(entry, [{ id: 'c', name: 'c.jpg', type: 'image/jpeg', size: 1 }]);
  assert.deepEqual(entry.files.map(x => [x.id, x.order]), [['a', 0], ['b', 1], ['c', 2]]);
  entry.files = U.moveFile(entry, 'c', -1);
  assert.deepEqual(entry.files.map(x => [x.id, x.order]), [['a', 0], ['c', 1], ['b', 2]]);
  assert.deepEqual(U.moveFile(entry, 'a', -1).map(x => x.id), ['a', 'c', 'b']);   // already first: unchanged
  entry.files = U.removeFile(entry, 'a');
  assert.deepEqual(entry.files.map(x => [x.id, x.order]), [['c', 0], ['b', 1]]);
  assert.equal(U.MISSING_NOTE, 'This file is on another device — attach it again, or turn on Keep my draft in Google Drive.');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/enclosure_ui.test.js` → FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// enclosure_ui.js
// The files attached to one ticked enclosure on the Enclosures tab, and the list arithmetic behind it.
import { enclosureNumbers, sortedFiles } from './enclosure_pdf.js';

export const WARN_BYTES = 20 * 1024 * 1024;
export const MISSING_NOTE = 'This file is on another device — attach it again, or turn on Keep my draft in Google Drive.';

export const formatSize = n => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function sizeSummary(enclosures) {
  const files = enclosureNumbers(enclosures).flatMap(({ entry }) => sortedFiles(entry));
  if (!files.length) return { text: '', warn: '' };
  const bytes = files.reduce((s, x) => s + (Number(x.size) || 0), 0);
  return {
    text: `${files.length} file${files.length === 1 ? '' : 's'}, ${formatSize(bytes)} attached`,
    warn: bytes > WARN_BYTES ? 'Email may refuse a file this large; saving to Google Drive still works.' : '',
  };
}

const renumber = list => list.map((x, i) => ({ ...x, order: i }));
export const addFiles = (entry, metas) => renumber([...sortedFiles(entry), ...metas]);
export const removeFile = (entry, id) => renumber(sortedFiles(entry).filter(x => x.id !== id));
export function moveFile(entry, id, dir) {
  const list = sortedFiles(entry);
  const i = list.findIndex(x => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return renumber(list);
  [list[i], list[j]] = [list[j], list[i]];
  return renumber(list);
}

function button(doc, text, cls, onClick) {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// The attach button and the file list for one ticked enclosure.
export function fileBlock(doc, { entry, have, canStore, onAttach, onMove, onRemove }) {
  const box = doc.createElement('div');
  box.className = 'encl-files';
  const files = sortedFiles(entry);
  files.forEach((x, i) => {
    const row = doc.createElement('div');
    row.className = 'encl-file';
    const name = doc.createElement('span');
    name.textContent = `${x.name} (${formatSize(Number(x.size) || 0)})`;
    row.appendChild(name);
    if (!have.has(x.id)) {
      const note = doc.createElement('span');
      note.className = 'encl-missing';
      note.textContent = MISSING_NOTE;
      row.appendChild(note);
    }
    if (i > 0) row.appendChild(button(doc, '↑', 'secondary', () => onMove(x.id, -1)));
    if (i < files.length - 1) row.appendChild(button(doc, '↓', 'secondary', () => onMove(x.id, 1)));
    row.appendChild(button(doc, 'Remove', 'danger', () => onRemove(x.id)));
    box.appendChild(row);
  });
  const input = doc.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';
  input.className = 'hidden';
  input.addEventListener('change', () => { if (input.files && input.files.length) onAttach(input.files); input.value = ''; });
  const attach = button(doc, 'Attach PDF / photo', 'secondary', () => input.click());
  attach.disabled = !canStore;
  box.append(attach, input);
  return box;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/enclosure_ui.test.js` → PASS. Then `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add enclosure_ui.js tests/enclosure_ui.test.js
git commit -m "Enclosure files: file list helpers and the attach block"
```

---

### Task 8: Wiring into the app (Enclosures tab, Review, Share, Drive, offline cache)

**Files:**
- Create: `vendor/pdf-lib.min.js` (copied from `node_modules/pdf-lib/dist/pdf-lib.min.js`)
- Create: `vendor/pdf-lib.LICENSE.txt` (copied from `node_modules/pdf-lib/LICENSE.md`)
- Modify: `index.html` (Enclosures card, Review actions)
- Modify: `styles.css` (append)
- Modify: `app.js` (imports, store, `renderEnclosures`, attach and remove, Review buttons, Share, Drive, draft sync, startup)
- Modify: `sw.js` (`ASSETS`, `CACHE` bumped from `v0-40` to `v0-41`)

**Interfaces:**
- Consumes: everything from Tasks 1–7, under the exact names listed in their Interfaces blocks.

- [ ] **Step 1: Vendor pdf-lib**

```bash
cp node_modules/pdf-lib/dist/pdf-lib.min.js vendor/pdf-lib.min.js
cp node_modules/pdf-lib/LICENSE.md vendor/pdf-lib.LICENSE.txt
head -c 300 vendor/pdf-lib.min.js
```

Expected: a minified UMD bundle that defines the global `PDFLib`.

- [ ] **Step 2: `index.html`**

In the Enclosures card, replace

```html
          <p class="muted">Selected enclosures will later populate the official ACR list with automatic numbering and checked boxes.</p>
```

with

```html
          <p class="muted">Ticked enclosures are listed in the ACR with numbers. You may also attach each one's document (PDF or photo); the app then makes a complete PDF: the ACR followed by the enclosures. Attaching is optional.</p>
          <p id="enclosureSize" class="muted"></p>
          <p id="enclosureStatus" class="muted" role="status"></p>
```

In `.docx-actions`, after the `driveBtn` button, add

```html
              <button type="button" id="completePdfBtn" class="hidden">Download complete PDF (ACR + enclosures)</button>
```

and after `<p id="docxStatus" ...></p>` add

```html
            <p id="enclosureMissing" class="muted"></p>
```

- [ ] **Step 3: `styles.css` (append one line)**

```css
.encl-files{grid-column:1/-1;margin:-2px 0 6px 28px;display:grid;gap:6px}.encl-file{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.9rem}.encl-file button{padding:4px 9px}.encl-missing{color:var(--danger);font-size:.85rem}.encl-warn{color:var(--danger)}
```

- [ ] **Step 4: `app.js`, imports and state**

Add after the `preview_fix.js` import:

```js
import { pdfParts, missingText, completePdfName, buildCompletePdf, checkPdf, MESSAGES, MAX_PDF_BYTES, PDF_TOOL_MESSAGE } from './enclosure_pdf.js';
import { createFileStore, newFileId, isQuotaError, FULL_MESSAGE, NO_STORE_MESSAGE } from './enclosure_files.js';
import { shrinkImage } from './image_shrink.js';
import { fileBlock, sizeSummary, addFiles, removeFile, moveFile } from './enclosure_ui.js';
```

After `const drive=...` (line 45) add:

```js
// Enclosure files (spec docs/superpowers/specs/2026-10-07-enclosure-files-design.md).
const fileStore=createFileStore();
let canStoreFiles=false, haveIds=new Set(), pdfLibLoading=null;
function loadPdfLib(){
  if(window.PDFLib) return Promise.resolve(window.PDFLib);
  return pdfLibLoading??=new Promise((resolve,reject)=>{
    const s=document.createElement('script'); s.src='vendor/pdf-lib.min.js';
    s.onload=()=>window.PDFLib?resolve(window.PDFLib):reject(new Error(PDF_TOOL_MESSAGE));
    s.onerror=()=>{pdfLibLoading=null; reject(new Error(PDF_TOOL_MESSAGE));};
    document.head.appendChild(s);
  });
}
async function refreshFiles(){
  canStoreFiles=await fileStore.available();
  haveIds=new Set(canStoreFiles?await fileStore.ids(state.session):[]);
  renderEnclosures(); renderReview();
}
```

- [ ] **Step 5: `app.js`, `renderEnclosures` with file blocks**

Replace the body of `renderEnclosures` (the two lines at `app.js:145-147`, from `const list=$('enclosureList')` to
the end of the custom list) with:

```js
  const list=$('enclosureList'); list.innerHTML='';
  const block=entry=>fileBlock(document,{entry,have:haveIds,canStore:canStoreFiles,
    onAttach:files=>attachFiles(entry,files),
    onMove:(id,dir)=>{entry.files=moveFile(entry,id,dir); renderEnclosures(); saveLocal();},
    onRemove:id=>removeAttached(entry,id)});
  enclosureDefaults.forEach(label=>{
    const wrap=document.createElement('label');wrap.className='checkitem';
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=state.enclosures.some(x=>x.label===label&&x.checked);
    cb.addEventListener('change',()=>{const found=state.enclosures.find(x=>x.label===label);if(found)found.checked=cb.checked;else state.enclosures.push({label,checked:cb.checked});saveLocal();updateProgress();renderEnclosures();});
    wrap.append(cb,document.createTextNode(label));list.appendChild(wrap);
    const entry=state.enclosures.find(x=>x.label===label&&x.checked&&!x.custom);
    if(entry) list.appendChild(block(entry));
  });
  $('customEnclosures').innerHTML=''; state.enclosures.filter(x=>x.custom).forEach(x=>{
    const d=document.createElement('div');d.className='custom-item';d.innerHTML=`<span>☑ ${escapeHtml(x.label)}</span>`;
    const b=document.createElement('button');b.type='button';b.className='danger';b.textContent='Remove';
    b.onclick=async()=>{for(const f of x.files||[]) await fileStore.remove(state.session,f.id).catch(console.error); state.enclosures=state.enclosures.filter(y=>y!==x);renderEnclosures();saveLocal();updateProgress();};
    d.appendChild(b);$('customEnclosures').appendChild(d);
    if(x.checked!==false) $('customEnclosures').appendChild(block(x));
  });
  const sz=sizeSummary(state.enclosures);
  $('enclosureSize').textContent=canStoreFiles?sz.text:NO_STORE_MESSAGE;
  if(sz.warn&&canStoreFiles){const w=document.createElement('span');w.className='encl-warn';w.textContent=' '+sz.warn;$('enclosureSize').appendChild(w);}
```

Keep the line before (the function header) and the closing brace after unchanged.

Then add after `renderEnclosures`:

```js
async function attachFiles(entry,list){
  const status=$('enclosureStatus'), msgs=[], metas=[]; status.textContent='Adding…';
  for(const file of list){
    let type, bytes;
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
      if(file.size>MAX_PDF_BYTES){msgs.push(MESSAGES.tooBig(file.name));continue;}
      bytes=new Uint8Array(await file.arrayBuffer());
      let verdict; try{verdict=await checkPdf(bytes,await loadPdfLib());}catch(err){msgs.push(err.message);break;}
      if(verdict!=='ok'){msgs.push(MESSAGES[verdict](file.name));continue;}
      type='application/pdf';
    }else{
      const blob=await shrinkImage(file);
      if(!blob){msgs.push(MESSAGES.photo(file.name));continue;}
      bytes=new Uint8Array(await blob.arrayBuffer()); type='image/jpeg';
    }
    const id=newFileId(), name=type==='image/jpeg'?file.name.replace(/\.(png|jpe?g)$/i,'')+'.jpg':file.name;
    try{await fileStore.put({session:state.session,id,name,type,size:bytes.length,bytes,addedAt:new Date().toISOString()});}
    catch(err){console.error(err); msgs.push(isQuotaError(err)?FULL_MESSAGE:`${file.name} could not be saved: ${err?.message||err}`); break;}
    metas.push({id,name,type,size:bytes.length}); haveIds.add(id);
  }
  if(metas.length) entry.files=addFiles(entry,metas);
  renderEnclosures(); saveLocal(); renderReview();
  status.textContent=msgs.join(' ');
}
async function removeAttached(entry,id){
  try{await fileStore.remove(state.session,id);}catch(err){console.error(err);}
  haveIds.delete(id); entry.files=removeFile(entry,id); renderEnclosures(); saveLocal(); renderReview();
}
```

- [ ] **Step 6: `app.js`, the complete PDF in Review, Share and Drive**

Change `syncDocxButtons` to include the new button:

```js
function syncDocxButtons(){for(const id of ['downloadDocxBtn','shareBtn','driveBtn','shareNowBtn','completePdfBtn'])$(id).disabled=docxBlocked||docxBusy;}
```

After `pdfFor`, add:

```js
const enclosureParts=()=>pdfParts(state.enclosures,id=>haveIds.has(id));
// The ACR PDF followed by the enclosure files on this device; missing = files listed but not here.
async function completeFor(pdf){
  const {parts,missing}=enclosureParts();
  const PDFLib=await loadPdfLib();
  const filled=[];
  for(const p of parts){
    const files=[];
    for(const f of p.files){const rec=await fileStore.get(state.session,f.id); if(rec) files.push({name:f.name,type:f.type,bytes:rec.bytes});}
    if(files.length) filled.push({...p,files});
  }
  const bytes=await buildCompletePdf({acrPdf:new Uint8Array(await pdf.arrayBuffer()),parts:filled,PDFLib});
  return {file:new File([bytes],completePdfName(pdf.name),{type:'application/pdf'}),missing:missingText(missing)};
}
function renderCompleteControls(){
  const {parts,missing}=enclosureParts();
  $('completePdfBtn').classList.toggle('hidden',!googleReady||!parts.length);
  $('enclosureMissing').textContent=missingText(missing);
}
```

In `renderReview` (the one-line function at `app.js:438`), add `renderCompleteControls();` as the first statement
after `{`.

Replace the `shareBtn` handler body lines from `const files=[docx,pdf];` to the end of that handler with:

```js
  let files=[docx,pdf], note='';
  if(enclosureParts().parts.length){say('Adding the enclosures…'); const c=await completeFor(pdf); files=[docx,c.file]; note=c.missing;}
  const text=shareResultText(await shareFiles(files,{title:docx.name.replace(/\.docx$/,'')}),files);
  return note?`${text} ${note}`:text;
}));
```

In the `driveBtn` handler, replace

```js
  await drive.upsertFile({name:pdf.name,bytes:pdf,mime:'application/pdf',folderId});
  const p=document.createElement('span'); p.append(`Saved ${docx.name} and ${pdf.name} to Google Drive. `);
```

with

```js
  await drive.upsertFile({name:pdf.name,bytes:pdf,mime:'application/pdf',folderId});
  let saved=`Saved ${docx.name} and ${pdf.name}`, note='';
  if(enclosureParts().parts.length){
    say('Adding the enclosures…'); const c=await completeFor(pdf);
    await drive.upsertFile({name:c.file.name,bytes:c.file,mime:'application/pdf',folderId});
    saved=`Saved ${docx.name}, ${pdf.name} and ${c.file.name}`; note=c.missing?` ${c.missing}`:'';
  }
  const p=document.createElement('span'); p.append(`${saved} to Google Drive.${note} `);
```

After the `driveBtn` handler, add:

```js
$('completePdfBtn').addEventListener('click',()=>runDocxJob(async say=>{
  const d=saveLocal();
  say('Signing in to Google…');
  try{await googleTokens.getToken();}catch(err){return `The complete PDF needs the ACR PDF from Google: ${errText(err)}`;}
  say('Making the Word file…'); const docx=await makeDocx(d);
  let pdf; try{say('Making the PDF…'); pdf=await pdfFor(d,docx);}catch(err){return `The complete PDF needs the ACR PDF from Google: ${errText(err)}`;}
  say('Adding the enclosures…'); const c=await completeFor(pdf);
  downloadFile(c.file);
  return c.missing?`Complete PDF ready: ${c.file.name}. ${c.missing}`:`Complete PDF ready: ${c.file.name}`;
}));
```

- [ ] **Step 7: `app.js`, draft sync and startup**

Change the `draftSync` line (`app.js:398`) to pass the store:

```js
const draftSync=googleReady?createDraftSync({store,sessions,drive,files:fileStore,ask:askWhichCopy,deviceLabel:deviceLabel()}):null;
```

In `runDraftSync`, after `refreshSessionList();` add:

```js
    if(results.some(r=>r.filesFailed)) $('draftMenuStatus').textContent='Some enclosure files could not be synced; they will be tried again.';
    await refreshFiles();
```

In `openSession` (`app.js:81`), append `refreshFiles();` before the closing `}`.

At the end of the startup code, after the line that starts with `if(googleReady){for(const id of ['shareBtn'`, add:

```js
refreshFiles();
```

- [ ] **Step 8: `sw.js`**

Add these to `ASSETS` after `'./preview_fix.js'`:

```js
'./enclosure_pdf.js','./enclosure_files.js','./image_shrink.js','./enclosure_ui.js','./vendor/pdf-lib.min.js',
```

Change `const CACHE='acr-utility-v0-40';` to `const CACHE='acr-utility-v0-41';`.

- [ ] **Step 9: Run the suites**

Run: `npm test` → all pass. The `sw_rules` test checks every precached file exists, which covers
`vendor/pdf-lib.min.js`. Run: `python -m unittest discover -s tests` → OK.

- [ ] **Step 10: Commit**

```bash
git add vendor/pdf-lib.min.js vendor/pdf-lib.LICENSE.txt index.html styles.css app.js sw.js
git commit -m "Enclosure files: attach on the Enclosures tab; complete PDF via Download, Share and Drive; files sync with the draft"
```

---

### Task 9: Checks by hand with the user (local server, PC and phone)

**Files:** none, unless a check fails (then fix, add a test where the failure was in a tested module, and commit).

- [ ] **Step 1: Ask the user before starting the server**, then run `python -m http.server 8765` in the background
  from the repo root. In the test browser, clear the service worker and caches first. The service worker serves the
  cache first.
- [ ] **Step 2: The user checks on the PC, at http://localhost:8765/:**
  1. Tick two enclosures. Attach to the first one PDF and one photo, and to the second one photo. The size line shows
     the count and size.
  2. A password-protected PDF is refused with the message, and so is a non-PDF renamed to `.pdf`.
  3. Use ↑ / ↓ and Remove. Untick and tick again: the files hide and come back.
  4. Review → **Download complete PDF**: ACR pages, then the enclosures. Each label is on the enclosure's first page,
     and the numbers are the same as in the Word list.
  5. **Share / Email** sends the Word file plus the complete PDF. **Save to Drive** saves three files.
  6. With no files attached, everything is exactly as before (button hidden).
- [ ] **Step 3: The user checks on a phone** (live site after merge, or the PC's LAN address):
  - attach from the camera, and sideways photos come out upright;
  - with draft sync on, the files appear on the other device;
  - with draft sync off, the missing-file note appears and Review lists the file as left out.
- [ ] **Step 4: Stop the server.** When the user approves, merge fast-forward into `master` and publish with
  `git push origin master:main`. Then update the memory files (resume point and a new feature note).
