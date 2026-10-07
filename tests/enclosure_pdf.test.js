import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { generateDocx } from '../docx_engine.js';
import * as E from '../enclosure_pdf.js';
import * as PDFLib from 'pdf-lib';
import { inflateSync } from 'node:zlib';

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
