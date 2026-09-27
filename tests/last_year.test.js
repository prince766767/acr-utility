import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lastYearProblems, lastYearCells } from '../api_tally.js';

const CASES = JSON.parse(readFileSync(new URL('./fixtures/last_year_cases.json', import.meta.url), 'utf8'));
for (const c of CASES) {
  test(`last year: ${c.name}`, () => {
    assert.deepStrictEqual(lastYearProblems(c.ly), c.problems);
    assert.deepStrictEqual(lastYearCells(c.ly), c.cells);
  });
}
