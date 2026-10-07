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
