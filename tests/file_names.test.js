import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acrFileName } from '../file_names.js';

test('name and session', () => {
  assert.strictEqual(acrFileName({ session: '2025-26', profile: { fullName: 'Ravi Kumar' } }, 'docx'), 'ACR_Ravi_Kumar_2025-26.docx');
});
test('runs of other characters become one underscore, ends trimmed', () => {
  assert.strictEqual(acrFileName({ session: '2025-26', profile: { fullName: '  Dr. A/B   Singh, ' } }, 'pdf'), 'ACR_Dr._A_B_Singh_2025-26.pdf');
});
test('Devanagari names are kept (letters + combining marks)', () => {
  assert.strictEqual(acrFileName({ session: '2025-26', profile: { fullName: 'रवि कुमार' } }, 'docx'), 'ACR_रवि_कुमार_2025-26.docx');
});
test('empty parts fall back', () => {
  assert.strictEqual(acrFileName({}, 'docx'), 'ACR_noname_draft.docx');
  assert.strictEqual(acrFileName({ session: '', profile: { fullName: '///' } }, 'pdf'), 'ACR_noname_draft.pdf');
  assert.strictEqual(acrFileName(undefined, 'pdf'), 'ACR_noname_draft.pdf');
});
