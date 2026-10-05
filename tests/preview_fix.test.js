import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unfloatWideTables, joinBorderedParagraphs, alignSignatureColumn } from '../preview_fix.js';

// A table as docx-preview draws a floating one: float left, inside a page column of the given width.
const table = (width, float = 'left') => ({
  style: { float, marginLeft: '9pt', marginRight: '9pt' },
  getBoundingClientRect: () => ({ width }),
  parentElement: { clientWidth: 700, pad: 50 },
});
const root = tables => ({ querySelectorAll: () => tables });
const style = el => ({ paddingLeft: `${el.pad}px`, paddingRight: `${el.pad}px` });   // column = 700 - 2*50 = 600

test('a table wider than half the column no longer floats; it is centred, so the text after it goes below', () => {
  const t = table(590);
  unfloatWideTables(root([t]), style);
  assert.deepEqual(t.style, { float: 'none', marginLeft: 'auto', marginRight: 'auto' });
});

test('a small floating table (point 10 date-of-birth boxes) keeps its float', () => {
  const t = table(193);
  unfloatWideTables(root([t]), style);
  assert.deepEqual(t.style, { float: 'left', marginLeft: '9pt', marginRight: '9pt' });
});

test('tables that do not float are left alone', () => {
  const t = table(600, '');
  unfloatWideTables(root([t]), style);
  assert.deepEqual(t.style, { float: '', marginLeft: '9pt', marginRight: '9pt' });
});

// Paragraphs as docx-preview draws bordered ones: each with its own four borders.
const para = (border = '0.5pt solid black') => ({
  tagName: 'P',
  style: { borderTop: border, borderBottom: border, borderLeft: border, borderRight: border },
});
const chain = ps => { ps.forEach((p, i) => { p.nextElementSibling = ps[i + 1] || null; }); return { querySelectorAll: () => ps }; };

test('consecutive bordered paragraphs become one box: no lines between them', () => {
  const ps = [para(), para(), para()];
  joinBorderedParagraphs(chain(ps));
  assert.deepEqual(ps.map(p => [p.style.borderTop, p.style.borderBottom]),
    [['0.5pt solid black', 'none'], ['none', 'none'], ['none', '0.5pt solid black']]);
});

test('a paragraph without borders, or with different side borders, ends the box', () => {
  const plain = { tagName: 'P', style: { borderTop: '', borderBottom: '', borderLeft: '', borderRight: '' } };
  const ps = [para(), plain, para(), para('1pt solid red')];
  joinBorderedParagraphs(chain(ps));
  assert.deepEqual(ps.map(p => [p.style.borderTop, p.style.borderBottom]),
    [['0.5pt solid black', '0.5pt solid black'], ['', ''], ['0.5pt solid black', '0.5pt solid black'], ['1pt solid red', '1pt solid red']]);
});

// A Signature Column line as docx-preview draws it: text, a tab span (an em space), more text.
function line(tabAt) {
  const tab = { textContent: '\u2003', children: [], style: {}, getBoundingClientRect: () => ({ left: tabAt }) };
  return { querySelectorAll: () => [tab], tab };
}
test('Signature Column lines: the text after a tab starts at the column (7000 twips from the margin)', () => {
  const a = line(150), b = line(600);
  const section = { getBoundingClientRect: () => ({ left: 20 }), _pad: 60 };
  const root = { querySelectorAll: sel => (sel === 'p.docx_signaturecolumn' ? [a, b] : []) };
  alignSignatureColumn(root, () => section, () => ({ paddingLeft: '60px' }));
  const col = 20 + 60 + 7000 / 20 * 96 / 72;   // section left + margin + 350 pt in px
  assert.deepEqual(a.tab.style, { display: 'inline-block', width: `${col - 150}px` });
  assert.deepEqual(b.tab.style, { display: 'inline-block', width: '4px' });   // already past the column: a small gap
});
