import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapSelection } from '../marks_ui.js';
import { inlineMarks } from '../acr_fields.js';

test('wraps the selected words', () => {
  assert.deepEqual(wrapSelection('Taught Botany well', 7, 13, '**'), { value: 'Taught **Botany** well', start: 9, end: 15 });
});

test('spaces at the edges of the selection stay outside, so the mark counts', () => {
  const r = wrapSelection('Taught Botany well', 6, 14, '*');
  assert.equal(r.value, 'Taught *Botany* well');
  assert.deepEqual(inlineMarks(r.value), [['Taught ', ''], ['Botany', 'i'], [' well', '']]);
});

test('nothing selected: an empty pair with the cursor inside', () => {
  assert.deepEqual(wrapSelection('3 semester', 1, 1, '^'), { value: '3^^ semester', start: 2, end: 2 });
});

test('pressing again on marked words takes the marks off', () => {
  assert.deepEqual(wrapSelection('a **b** c', 2, 7, '**'), { value: 'a b c', start: 2, end: 3 });
});
