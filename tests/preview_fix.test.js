import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unfloatWideTables } from '../preview_fix.js';

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
