import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { generateDocx, ProblemsError } from '../docx_engine.js';

const read = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const TEMPLATE = readFileSync(new URL('../ACR_EMPLOYEE_MASTER.docx', import.meta.url));
const deps = { JSZip, DOMParser, XMLSerializer };

test('builds a Word file with the values and no tokens left', async () => {
  const data = { ...read('full_record.acr.json'), api: read('cases.json')[0].api };
  const out = await generateDocx(data, TEMPLATE, deps);
  const xml = await (await JSZip.loadAsync(out)).file('word/document.xml').async('string');
  assert.ok(!xml.includes('{{'));
  for (const s of ['ASHA DEVI', 'Fifth November Nineteen Hundred Eighty', '106.75', '131.75', '193', '☑ 1. Certificate / sanction order'])
    assert.ok(xml.includes(s), s);
});

test('refuses with the same problems as the PC generator', async () => {
  await assert.rejects(generateDocx({ profile: { dob: '31/02/1990' }, api: { c1: { classes: '6o' } } }, TEMPLATE, deps),
    err => err instanceof ProblemsError && err.problems.map(p => p.code).join() === 'BAD_DOB,BAD_SCORE');
});

test('text style: unknown values fall back to today\'s look', async () => {
  const { normalizeStyle } = await import('../docx_engine.js');
  assert.deepStrictEqual(normalizeStyle({ chosen: true, color: 'red', font: 'Comic Sans', size: 40, bold: 'yes' }),
    { color: '000000', font: '', size: 0, bold: false, italic: false, chosen: true });
  assert.deepStrictEqual(normalizeStyle({ chosen: true, color: '#1f3864', size: '12' }),
    { color: '1F3864', font: '', size: 12, bold: false, italic: false, chosen: true });
  assert.deepStrictEqual(normalizeStyle({ color: '#1f3864' }), { color: '000000', font: '', size: 0, bold: false, italic: false, chosen: false });
  assert.deepStrictEqual(normalizeStyle(undefined), { color: '000000', font: '', size: 0, bold: false, italic: false, chosen: false });
});
