# Saved Sessions, Last Academic Year and Point 45 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one record per session on the device. Fill "Last Academic Year" (point 29 column 3 and point 45 column 3) by hand in the first year and automatically from the previous session's record afterwards. Fill point 45 column 4 with this year's totals.

**Architecture:** A pure module `sessions.js` handles all session rules over any object with the `localStorage` API, so Node tests can use a fake: names, keys, migration, switching, previous-session lookup and file checks. The last-year number rules (`lastYearProblems`, `lastYearCells`) live in `api_tally.js` and `api_tally.py` and are checked against one shared case file. `last_year_ui.js` draws the new card. `app.js` swaps its single-key save/load for the session functions. `generate_acr.py` prints the last-year cells and point 45.

**Tech Stack:** Vanilla ES modules, `node:test`, Python 3.12 + python-docx + `unittest`, Word COM (`tools/docx_to_pdf.ps1`), `pdftoppm`, `playwright-cli`.

**Spec:** `docs/superpowers/specs/2026-09-27-sessions-last-year-point45-design.md`

## Global Constraints

- Paths are relative to `C:\Users\princ\Downloads\ACR_Utility_v0_3\ACR_Utility_v0_3`.
- Session = `YYYY-YY` with `YY == (YYYY+1) mod 100`. Previous of `2000-01` is `1999-00`.
- Storage keys: `acrUtility:session:<session>`, `acrUtility:draft`, `acrUtility:current`; the old key `acrUtilityDraftV01` is migrated and removed.
- Opening or starting a session never overwrites another session's record.
- Last-year figures come from the previous session's own point 29 column 4 totals (same tally). Once fetched they are read-only. Typed figures are allowed only when no previous record exists on the device.
- Typed figures: number ≥ 0 with at most 2 decimals; I ≤ 125, II ≤ 25; all three or none. I+II is always computed as I + II.
- Point 45 column 5 is never written. Empty last-year figures give a warning only; invalid typed figures block the Word file.
- JS and Python last-year rules must give identical results (shared case file).
- Git: branch `feature/sessions-point45`; commit after each task (the user asked for commits in this workflow).

---

## File Structure

| File | Responsibility |
|---|---|
| `sessions.js` (create) | Session names, storage keys, migration, save/read/list, switch decision, new record, previous-session lookup, last-year file check. |
| `last_year_ui.js` (create) | The "Last academic year" card: inputs, lock state, note, problems, import button. |
| `api_tally.js`, `api_tally.py` (modify) | `lastYearProblems` / `last_year_problems`, `lastYearCells` / `last_year_cells`. |
| `api_ui.js` (modify) | Preview shows point 29 column 3 and a point 45 table. |
| `app.js` (modify) | Session-aware save/load/switch/import; last-year resolution; Review warning. |
| `index.html`, `styles.css`, `sw.js` (modify) | Session list, last-year card, warning style, cache. |
| `generate_acr.py` (modify) | Blocks on last-year problems; point 29 column 3 and point 45 columns 3–4. |
| `tests/fixtures/last_year_cases.json` (create) | Shared JS/Python last-year cases. |
| `tests/last_year.test.js`, `tests/sessions.test.js` (create) | Node tests. |
| `tests/test_last_year.py` (create), `tests/test_generate_point45.py` (create) | Python tests. |

---

### Task 0: Branch

- [ ] `git checkout -b feature/sessions-point45`; then commit the spec and this plan:
```bash
git add docs/superpowers/specs/2026-09-27-sessions-last-year-point45-design.md docs/superpowers/plans/2026-09-27-sessions-last-year-point45.md
git commit -m "docs: spec and plan for saved sessions, last academic year and point 45"
```

---

### Task 1: Last-year rules in both tallies

**Files:** create `tests/fixtures/last_year_cases.json`, `tests/last_year.test.js`, `tests/test_last_year.py`; modify `api_tally.js`, `api_tally.py`.

**Interfaces (produced):**
- JS `lastYearProblems(ly) -> [{code, where, message}]`, `lastYearCells(ly) -> {cat1, cat2, total12, cat3}` (strings; all `''` unless I, II and III are all valid numbers).
- Python `last_year_problems(ly)`, `last_year_cells(ly)` — identical results.

- [ ] **Step 1: Write `tests/fixtures/last_year_cases.json`**

```json
[
  {"name": "nothing", "ly": {}, "problems": [], "cells": {"cat1": "", "cat2": "", "total12": "", "cat3": ""}},
  {"name": "not an object", "ly": null, "problems": [], "cells": {"cat1": "", "cat2": "", "total12": "", "cat3": ""}},
  {"name": "typed, all valid", "ly": {"cat1": "90", "cat2": "20", "cat3": "12.5", "source": "typed"}, "problems": [],
   "cells": {"cat1": "90", "cat2": "20", "total12": "110", "cat3": "12.5"}},
  {"name": "fetched strings and a stale total12 is recomputed", "ly": {"cat1": "106.75", "cat2": "25", "total12": "999", "cat3": "193", "source": "record", "from": "2024-25"},
   "problems": [], "cells": {"cat1": "106.75", "cat2": "25", "total12": "131.75", "cat3": "193"}},
  {"name": "numbers not strings", "ly": {"cat1": 0.1, "cat2": 0.2, "cat3": 0}, "problems": [],
   "cells": {"cat1": "0.1", "cat2": "0.2", "total12": "0.3", "cat3": "0"}},
  {"name": "partly filled", "ly": {"cat1": "90", "cat2": "", "cat3": "5"},
   "problems": [{"code": "LY_PARTIAL", "where": "Last academic year", "message": "Last academic year: fill I, II and III, or leave all three empty."}],
   "cells": {"cat1": "", "cat2": "", "total12": "", "cat3": ""}},
  {"name": "bad numbers and over the maximum", "ly": {"cat1": "130", "cat2": "abc", "cat3": "1.234"},
   "problems": [
     {"code": "BAD_SCORE", "where": "Last academic year II", "message": "Last academic year II: score must be a number (0 or more) with at most 2 decimals."},
     {"code": "BAD_SCORE", "where": "Last academic year III", "message": "Last academic year III: score must be a number (0 or more) with at most 2 decimals."},
     {"code": "OVER_MAX", "where": "Last academic year I", "message": "Last academic year I is 130; the form's maximum is 125."}
   ],
   "cells": {"cat1": "", "cat2": "", "total12": "", "cat3": ""}},
  {"name": "II just over 25; III has no maximum", "ly": {"cat1": "125", "cat2": "25.01", "cat3": "400"},
   "problems": [{"code": "OVER_MAX", "where": "Last academic year II", "message": "Last academic year II is 25.01; the form's maximum is 25."}],
   "cells": {"cat1": "125", "cat2": "25.01", "total12": "150.01", "cat3": "400"}}
]
```

- [ ] **Step 2: Write the failing tests**

`tests/last_year.test.js`:
```js
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
```

`tests/test_last_year.py`:
```python
import json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api_tally import last_year_problems, last_year_cells  # noqa: E402

CASES = json.loads((ROOT / 'tests' / 'fixtures' / 'last_year_cases.json').read_text(encoding='utf-8'))


class LastYear(unittest.TestCase):
    def test_shared_cases(self):
        for c in CASES:
            with self.subTest(c['name']):
                self.assertEqual(last_year_problems(c['ly']), c['problems'])
                self.assertEqual(last_year_cells(c['ly']), c['cells'])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 3: Run; confirm both fail** (`npm test` → import error for `lastYearProblems`; `python -m unittest tests.test_last_year` → ImportError).

- [ ] **Step 4: Append to `api_tally.js`**

```js

// Last academic year (points 29 and 45, column 3): I, II and III of last year; I+II is always I + II.
const LY_PARTS = [['cat1', 'I', 12500], ['cat2', 'II', 2500], ['cat3', 'III', null]];

export function lastYearProblems(ly) {
  const src = ly && typeof ly === 'object' ? ly : {};
  const parsed = LY_PARTS.map(([key]) => toCents(src[key]));
  const filled = parsed.filter(p => p.state !== 'missing').length;
  if (filled === 0) return [];
  if (filled < LY_PARTS.length) {
    return [{ code: 'LY_PARTIAL', where: 'Last academic year', message: 'Last academic year: fill I, II and III, or leave all three empty.' }];
  }
  const problems = [];
  LY_PARTS.forEach(([, label], i) => {
    if (parsed[i].state === 'bad') {
      const where = `Last academic year ${label}`;
      problems.push({ code: 'BAD_SCORE', where, message: `${where}: score must be a number (0 or more) with at most 2 decimals.` });
    }
  });
  LY_PARTS.forEach(([, label, max], i) => {
    if (max !== null && parsed[i].state === 'ok' && parsed[i].cents > max) {
      const where = `Last academic year ${label}`;
      problems.push({ code: 'OVER_MAX', where, message: `${where} is ${fmt(parsed[i].cents)}; the form's maximum is ${fmt(max)}.` });
    }
  });
  return problems;
}

export function lastYearCells(ly) {
  const src = ly && typeof ly === 'object' ? ly : {};
  const parsed = LY_PARTS.map(([key]) => toCents(src[key]));
  if (parsed.some(p => p.state !== 'ok')) return { cat1: '', cat2: '', total12: '', cat3: '' };
  const [a, b, c] = parsed.map(p => p.cents);
  return { cat1: fmt(a), cat2: fmt(b), total12: fmt(a + b), cat3: fmt(c) };
}
```

- [ ] **Step 5: Append to `api_tally.py`**

```python


# Last academic year (points 29 and 45, column 3): I, II and III of last year; I+II is always I + II.
LY_PARTS = (('cat1', 'I', 12500), ('cat2', 'II', 2500), ('cat3', 'III', None))


def last_year_problems(ly):
    src = ly if isinstance(ly, dict) else {}
    parsed = [to_cents(src.get(key)) for key, _, _ in LY_PARTS]
    filled = sum(1 for state, _ in parsed if state != 'missing')
    if filled == 0:
        return []
    if filled < len(LY_PARTS):
        return [{'code': 'LY_PARTIAL', 'where': 'Last academic year',
                 'message': 'Last academic year: fill I, II and III, or leave all three empty.'}]
    problems = []
    for (_, label, _), (state, _) in zip(LY_PARTS, parsed):
        if state == 'bad':
            where = f'Last academic year {label}'
            problems.append({'code': 'BAD_SCORE', 'where': where,
                             'message': f'{where}: score must be a number (0 or more) with at most 2 decimals.'})
    for (_, label, max_c), (state, c) in zip(LY_PARTS, parsed):
        if max_c is not None and state == 'ok' and c > max_c:
            where = f'Last academic year {label}'
            problems.append({'code': 'OVER_MAX', 'where': where,
                             'message': f"{where} is {fmt(c)}; the form's maximum is {fmt(max_c)}."})
    return problems


def last_year_cells(ly):
    src = ly if isinstance(ly, dict) else {}
    parsed = [to_cents(src.get(key)) for key, _, _ in LY_PARTS]
    if any(state != 'ok' for state, _ in parsed):
        return {'cat1': '', 'cat2': '', 'total12': '', 'cat3': ''}
    a, b, c = (cents for _, cents in parsed)
    return {'cat1': fmt(a), 'cat2': fmt(b), 'total12': fmt(a + b), 'cat3': fmt(c)}
```

- [ ] **Step 6: Run** `npm test` and `python -m unittest discover -s tests` → all PASS.
- [ ] **Step 7: Commit**
```bash
git add api_tally.js api_tally.py tests/fixtures/last_year_cases.json tests/last_year.test.js tests/test_last_year.py
git commit -m "feat: last academic year rules (typed-figure checks and cells) in both tallies"
```

---

### Task 2: `sessions.js`

**Files:** create `sessions.js`, `tests/sessions.test.js`.

**Interfaces (produced):** `SESSION_PREFIX`, `DRAFT_KEY`, `CURRENT_KEY`, `OLD_KEY`, `isSession(s)`, `previousSession(s)`, `readRecord(store, session)`, `hasRecord(store, session)`, `saveRecord(store, record)` (record only), `writeRecord(store, record)` (record + current pointer), `listSessions(store)`, `loadCurrent(store)`, `migrate(store) -> notices[]`, `decideSwitch(current, target, targetExists) -> 'same'|'invalid'|'name-draft'|'ask-open-existing'|'open'|'new'`, `newRecordFrom(record, session)`, `lastYear(store, session) -> {state:'no-session'|'record'|'record-problems'|'none', from, message, values?, problems?}`, `checkLastYearFile(file, session) -> {ok, message?, problems?}`.

- [ ] **Step 1: Write the failing test `tests/sessions.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../sessions.js';

class FakeStore {
  constructor(entries = {}) { this.m = new Map(Object.entries(entries)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const WORKED = JSON.parse(readFileSync(new URL('./fixtures/cases.json', import.meta.url), 'utf8'))[0].api;
const rec = (session, extra = {}) => ({ session, profile: { fullName: 'X' }, part2: { p17: 'a' }, api: {}, ...extra });

test('session names', () => {
  for (const s of ['2025-26', '1999-00', '2099-00']) assert.ok(S.isSession(s), s);
  for (const s of ['2025-27', '2025/26', '25-26', '', null, '2025-26 ']) assert.ok(!S.isSession(s), String(s));
  assert.strictEqual(S.previousSession('2025-26'), '2024-25');
  assert.strictEqual(S.previousSession('2000-01'), '1999-00');
  assert.strictEqual(S.previousSession('bad'), '');
});

test('write, read, list, current', () => {
  const st = new FakeStore();
  S.writeRecord(st, rec('2025-26'));
  S.writeRecord(st, rec('2024-25'));
  S.writeRecord(st, rec(''));
  assert.deepStrictEqual(S.listSessions(st), ['2024-25', '2025-26']);
  assert.strictEqual(st.getItem(S.CURRENT_KEY), '');
  assert.strictEqual(S.loadCurrent(st).session, '');
  S.saveRecord(st, rec('2023-24'));
  assert.strictEqual(st.getItem(S.CURRENT_KEY), '', 'saveRecord does not move the pointer');
  assert.ok(S.hasRecord(st, '2023-24'));
  assert.ok(!S.hasRecord(st, '2022-23'));
  assert.strictEqual(S.readRecord(st, '2025-26').part2.p17, 'a');
});

test('migrate the old single draft', () => {
  const named = new FakeStore({ [S.OLD_KEY]: JSON.stringify(rec('2025-26')) });
  assert.deepStrictEqual(S.migrate(named), []);
  assert.strictEqual(named.getItem(S.OLD_KEY), null);
  assert.strictEqual(S.loadCurrent(named).session, '2025-26');

  const unnamed = new FakeStore({ [S.OLD_KEY]: JSON.stringify(rec('')) });
  S.migrate(unnamed);
  assert.strictEqual(S.loadCurrent(unnamed).session, '');

  const clash = new FakeStore({ [S.OLD_KEY]: JSON.stringify(rec('2025-26', { part2: { p17: 'old' } })),
    [S.SESSION_PREFIX + '2025-26']: JSON.stringify(rec('2025-26')) });
  assert.deepStrictEqual(S.migrate(clash), ['A saved 2025-26 record already existed, so the older draft was kept as the unnamed draft.']);
  assert.strictEqual(S.readRecord(clash, '').part2.p17, 'old');
  assert.strictEqual(S.readRecord(clash, '2025-26').part2.p17, 'a');

  const busy = new FakeStore({ [S.OLD_KEY]: JSON.stringify(rec('')), [S.DRAFT_KEY]: JSON.stringify(rec('')) });
  assert.deepStrictEqual(S.migrate(busy), ['An older draft is still stored and was not moved, because an unnamed draft already exists.']);
  assert.notStrictEqual(busy.getItem(S.OLD_KEY), null);

  assert.deepStrictEqual(S.migrate(new FakeStore()), []);
});

test('switch decisions (spec 3.3)', () => {
  assert.strictEqual(S.decideSwitch('2025-26', '2025-26', true), 'same');
  assert.strictEqual(S.decideSwitch('', '', false), 'same');
  assert.strictEqual(S.decideSwitch('2025-26', '2025-27', false), 'invalid');
  assert.strictEqual(S.decideSwitch('2025-26', '', false), 'invalid');
  assert.strictEqual(S.decideSwitch('', '2025-26', false), 'name-draft');
  assert.strictEqual(S.decideSwitch('', '2025-26', true), 'ask-open-existing');
  assert.strictEqual(S.decideSwitch('2025-26', '2024-25', true), 'open');
  assert.strictEqual(S.decideSwitch('2025-26', '2026-27', false), 'new');
});

test('a new record keeps only the profile', () => {
  const r = S.newRecordFrom({ ...rec('2024-25'), teaching: [{ a: 1 }], enclosures: [{ label: 'x' }], api: WORKED }, '2025-26');
  assert.deepStrictEqual(r.profile, { fullName: 'X' });
  assert.strictEqual(r.session, '2025-26');
  assert.deepStrictEqual([r.part2, r.teaching, r.enclosures, r.api], [{}, [], [], {}]);
});

test('last year lookup: four cases', () => {
  const st = new FakeStore();
  assert.deepStrictEqual(S.lastYear(st, ''), { state: 'no-session', from: '', message: 'Choose the session first.' });
  assert.deepStrictEqual(S.lastYear(st, '2025-26'), { state: 'none', from: '2024-25',
    message: "No 2024-25 record on this device. Type last year's figures, or import last year's file." });
  S.saveRecord(st, rec('2024-25', { api: WORKED }));
  assert.deepStrictEqual(S.lastYear(st, '2025-26'), { state: 'record', from: '2024-25', message: 'From the 2024-25 record.',
    values: { cat1: '106.75', cat2: '25', total12: '131.75', cat3: '193' } });
  S.saveRecord(st, rec('2024-25', { api: { c1: { classes: 60 } } }));
  const bad = S.lastYear(st, '2025-26');
  assert.strictEqual(bad.state, 'record-problems');
  assert.strictEqual(bad.message, 'The 2024-25 record has problems, so its totals cannot be used. Open 2024-25 to fix them.');
  assert.strictEqual(bad.problems[0].message, "26(i)(a) is 60; the form's maximum is 50.");
});

test('last year file checks', () => {
  assert.deepStrictEqual(S.checkLastYearFile(rec('2024-25', { api: WORKED }), '2025-26'), { ok: true });
  assert.deepStrictEqual(S.checkLastYearFile(rec('2023-24'), '2025-26'),
    { ok: false, message: 'This file is for 2023-24; last year for 2025-26 is 2024-25.' });
  assert.deepStrictEqual(S.checkLastYearFile(rec(''), '2025-26'),
    { ok: false, message: 'This file is for no session; last year for 2025-26 is 2024-25.' });
  assert.deepStrictEqual(S.checkLastYearFile(rec('2024-25'), ''), { ok: false, message: 'Choose the session first.' });
  const r = S.checkLastYearFile(rec('2024-25', { api: { c1: { classes: 60 } } }), '2025-26');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.message, 'The 2024-25 file has problems, so its totals cannot be used.');
  assert.strictEqual(r.problems.length, 1);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL (`sessions.js` missing).

- [ ] **Step 3: Write `sessions.js`**

```js
// One saved record per session in browser storage, and the "last academic year" lookup
// (spec docs/superpowers/specs/2026-09-27-sessions-last-year-point45-design.md, sections 3 and 4).
// Pure functions over any object with the localStorage API, so they are tested with a fake store.
import { tally } from './api_tally.js';

export const SESSION_PREFIX = 'acrUtility:session:';
export const DRAFT_KEY = 'acrUtility:draft';
export const CURRENT_KEY = 'acrUtility:current';
export const OLD_KEY = 'acrUtilityDraftV01';
const SESSION_RE = /^([0-9]{4})-([0-9]{2})$/;

export function isSession(s) {
  if (typeof s !== 'string') return false;
  const m = SESSION_RE.exec(s);
  return !!m && Number(m[2]) === (Number(m[1]) + 1) % 100;
}

export function previousSession(s) {
  if (!isSession(s)) return '';
  const y = Number(s.slice(0, 4)) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function parse(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

const keyFor = session => (isSession(session) ? SESSION_PREFIX + session : DRAFT_KEY);

export function readRecord(store, session) {
  const raw = store.getItem(keyFor(session));
  return raw === null ? null : parse(raw);
}

export function hasRecord(store, session) {
  return isSession(session) && store.getItem(SESSION_PREFIX + session) !== null;
}

export function saveRecord(store, record) {
  store.setItem(keyFor(record.session), JSON.stringify(record));
}

export function writeRecord(store, record) {
  saveRecord(store, record);
  store.setItem(CURRENT_KEY, isSession(record.session) ? record.session : '');
}

export function listSessions(store) {
  const out = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(SESSION_PREFIX) && isSession(k.slice(SESSION_PREFIX.length))) out.push(k.slice(SESSION_PREFIX.length));
  }
  return out.sort();
}

export function loadCurrent(store) {
  const cur = store.getItem(CURRENT_KEY);
  return readRecord(store, isSession(cur) ? cur : '');
}

// Moves the single draft of earlier versions into the per-session keys. Returns notices for the teacher.
export function migrate(store) {
  const raw = store.getItem(OLD_KEY);
  if (raw === null) return [];
  const rec = parse(raw);
  const session = rec && isSession(rec.session) ? rec.session : '';
  if (session && store.getItem(SESSION_PREFIX + session) === null) {
    store.setItem(SESSION_PREFIX + session, raw);
    store.setItem(CURRENT_KEY, session);
    store.removeItem(OLD_KEY);
    return [];
  }
  if (store.getItem(DRAFT_KEY) !== null) {
    return ['An older draft is still stored and was not moved, because an unnamed draft already exists.'];
  }
  store.setItem(DRAFT_KEY, raw);
  store.setItem(CURRENT_KEY, '');
  store.removeItem(OLD_KEY);
  return session ? [`A saved ${session} record already existed, so the older draft was kept as the unnamed draft.`] : [];
}

export function decideSwitch(current, target, targetExists) {
  if (target === current) return 'same';
  if (!isSession(target)) return 'invalid';
  if (!isSession(current)) return targetExists ? 'ask-open-existing' : 'name-draft';
  return targetExists ? 'open' : 'new';
}

export function newRecordFrom(record, session) {
  const profile = record && typeof record.profile === 'object' && record.profile ? JSON.parse(JSON.stringify(record.profile)) : {};
  return {
    session, profile, part1: {}, part2: {}, teaching: [], assignments: [], results: [], activities: [],
    orientation: [], research: [], otherInfo: [], api: {}, enclosures: [], ui: { section: 'profile' },
  };
}

function totals(api) {
  const { values, problems } = tally(api);
  const p = values.p29;
  return { values: { cat1: p.I, cat2: p.II, total12: p.I_II, cat3: p.III }, problems };
}

export function lastYear(store, session) {
  if (!isSession(session)) return { state: 'no-session', from: '', message: 'Choose the session first.' };
  const from = previousSession(session);
  const rec = readRecord(store, from);
  if (!rec) {
    return { state: 'none', from, message: `No ${from} record on this device. Type last year's figures, or import last year's file.` };
  }
  const t = totals(rec.api);
  if (t.problems.length) {
    return { state: 'record-problems', from, problems: t.problems,
      message: `The ${from} record has problems, so its totals cannot be used. Open ${from} to fix them.` };
  }
  return { state: 'record', from, message: `From the ${from} record.`, values: t.values };
}

export function checkLastYearFile(file, session) {
  if (!isSession(session)) return { ok: false, message: 'Choose the session first.' };
  const from = previousSession(session);
  const fileSession = file && isSession(file.session) ? file.session : '';
  if (fileSession !== from) {
    return { ok: false, message: `This file is for ${fileSession || 'no session'}; last year for ${session} is ${from}.` };
  }
  const t = totals(file.api);
  if (t.problems.length) {
    return { ok: false, message: `The ${from} file has problems, so its totals cannot be used.`, problems: t.problems };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit**
```bash
git add sessions.js tests/sessions.test.js
git commit -m "feat: per-session records and last-year lookup (sessions.js)"
```

---

### Task 3: Generator — point 29 column 3, point 45, last-year checks

**Files:** modify `generate_acr.py`; create `tests/test_generate_point45.py`.

- [ ] **Step 1: Write the failing test `tests/test_generate_point45.py`**

```python
import json, shutil, sys, tempfile, unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generate_acr  # noqa: E402

WORKED = json.loads((ROOT / 'tests' / 'fixtures' / 'cases.json').read_text(encoding='utf-8'))[0]['api']


def cells(doc, t, col):
    return [doc.tables[t].rows[r].cells[col].text.strip() for r in (1, 2, 3, 4)]


class Point45(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def gen(self, ly):
        api = dict(WORKED)
        if ly is not None:
            api['lastAcademicYear'] = ly
        out = self.tmp / 'p45.docx'
        generate_acr.generate({'session': '2025-26', 'api': api}, out)
        return Document(out)

    def test_last_year_and_this_year(self):
        d = self.gen({'cat1': '90', 'cat2': '20', 'total12': 'stale', 'cat3': '12.5', 'source': 'typed'})
        self.assertEqual(cells(d, 23, 2), ['90', '20', '110', '12.5'])          # point 29 col 3
        self.assertEqual(cells(d, 31, 2), ['90', '20', '110', '12.5'])          # point 45 col 3
        self.assertEqual(cells(d, 31, 3), cells(d, 23, 3))                      # point 45 col 4 = point 29 col 4
        self.assertEqual(cells(d, 31, 3), ['106.75', '25', '131.75', '193'])
        self.assertEqual(cells(d, 31, 4), ['', '', '', ''])                     # Principal column untouched

    def test_no_last_year_prints_blank(self):
        d = self.gen(None)
        self.assertEqual(cells(d, 23, 2), ['', '', '', ''])
        self.assertEqual(cells(d, 31, 2), ['', '', '', ''])
        self.assertEqual(cells(d, 31, 3), ['106.75', '25', '131.75', '193'])

    def test_invalid_typed_figures_block(self):
        out = self.tmp / 'bad.docx'
        api = dict(WORKED, lastAcademicYear={'cat1': '130', 'cat2': '20', 'cat3': '5'})
        with self.assertRaises(generate_acr.ProblemsError) as ctx:
            generate_acr.generate({'api': api}, out)
        self.assertEqual(ctx.exception.problems[-1]['message'], "Last academic year I is 130; the form's maximum is 125.")
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run** `python -m unittest tests.test_generate_point45` → FAIL.

- [ ] **Step 3: Edit `generate_acr.py`**

3a. Import: change `from api_tally import tally, is_empty_entry, score_text, LEVEL_TEXT` to
`from api_tally import tally, is_empty_entry, score_text, LEVEL_TEXT, last_year_problems, last_year_cells`.

3b. In `generate()`, replace `problems=field_problems(data)+result['problems']` with
`problems=field_problems(data)+result['problems']+last_year_problems(api.get('lastAcademicYear'))`.

3c. Replace the point 29 block in `fill_api_tables` (from `# 29: column 4 from the tally; column 3 keeps its existing source (api.lastAcademicYear).` through `        set_cell(doc, 23, r, 3, value)`) with:
```python
    # 29 and 45: column 3 = last academic year (I+II computed), column 4 = this year's totals; 45 col 5 is the Principal's.
    ly = last_year_cells(api.get('lastAcademicYear'))
    _check(_norm(T[31].rows[0].cells[2].text).startswith('LastAcademic'), 31, 'the "Last Academic Year" header of point 45')
    for r, label, key, value in ((1, 'Teaching', 'cat1', v['p29']['I']), (2, 'Co-curricular', 'cat2', v['p29']['II']),
                                 (3, 'Total', 'total12', v['p29']['I_II']), (4, 'Research', 'cat3', v['p29']['III'])):
        for ti in (23, 31):
            _check(_norm(T[ti].rows[r].cells[1].text).startswith(label), ti, f'row {r} starting "{label}"')
            set_cell(doc, ti, r, 2, ly[key])
            set_cell(doc, ti, r, 3, value)
```

- [ ] **Step 4: Run all tests** → PASS. **Step 5: Commit**
```bash
git add generate_acr.py tests/test_generate_point45.py
git commit -m "feat: point 29 column 3 and point 45 columns 3-4 in the Word file; last-year checks"
```

---

### Task 4: App — sessions, last-year card, point 45 preview

**Files:** create `last_year_ui.js`; modify `index.html`, `app.js`, `api_ui.js`, `styles.css`, `sw.js`.

- [ ] **Step 1: `index.html`**

1. Replace `<input id="session" placeholder="2026-27" autocomplete="off">` with
`<input id="session" placeholder="2026-27" autocomplete="off" list="sessionList"><datalist id="sessionList"></datalist>`
2. Before the API tab card that starts `<h3>Problems to fix before the ACR can be generated</h3>` (its `<div class="card">` line), insert:
```html
        <div class="card">
          <h3>Last academic year (points 29 and 45, column 3)</h3>
          <p id="lyNote" class="muted"></p>
          <div class="grid two">
            <label>I — Teaching, learning and evaluation (max 125)<input id="ly-cat1" type="number" min="0" step="0.01" inputmode="decimal"></label>
            <label>II — Co-curricular, extension, professional development (max 25)<input id="ly-cat2" type="number" min="0" step="0.01" inputmode="decimal"></label>
            <label>III — Research and academic contribution<input id="ly-cat3" type="number" min="0" step="0.01" inputmode="decimal"></label>
            <div class="score-box">Total I + II: <strong id="ly-total12">—</strong></div>
          </div>
          <ul id="lyProblems" class="problems"></ul>
          <label id="lyImportWrap" class="file-button secondary hidden">Import last year's file
            <input id="lyImport" type="file" accept="application/json,.json" hidden>
          </label>
        </div>
```
(Use a unique anchor: the line `          <h3>Problems to fix before the ACR can be generated</h3>` that is followed by `<ul id="apiProblems"`; insert the card before the `        <div class="card">` line directly above it.)

- [ ] **Step 2: Create `last_year_ui.js`**

```js
// The "Last academic year" card of the API tab (points 29 and 45, column 3).
// Fetched figures are shown read-only; typed figures are allowed only when there is no previous record.
import { lastYearProblems, lastYearCells } from './api_tally.js';

const KEYS = ['cat1', 'cat2', 'cat3'];
const $ = id => document.getElementById(id);

export function initLastYearUi({ getLy, setLy, onChange, onImport }) {
  for (const k of KEYS) {
    $('ly-' + k).addEventListener('input', e => {
      const ly = { ...getLy(), [k]: e.target.value, source: 'typed', from: '' };
      ly.total12 = lastYearCells(ly).total12;
      setLy(ly);
      onChange();
    });
  }
  $('lyImport').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await onImport(file);
  });
}

// info: result of sessions.lastYear (or a refused import: {state:'none', message, problems}); ly: the stored figures.
export function renderLastYear(info, ly) {
  const typed = info.state === 'none';
  for (const k of KEYS) {
    const el = $('ly-' + k);
    el.value = ly[k] ?? '';
    el.readOnly = !typed;
    el.disabled = info.state === 'no-session' || info.state === 'record-problems';
  }
  $('ly-total12').textContent = lastYearCells(ly).total12 || '—';
  $('lyNote').textContent = info.message;
  const ul = $('lyProblems');
  ul.innerHTML = '';
  for (const p of info.problems ?? (typed ? lastYearProblems(ly) : [])) {
    const li = document.createElement('li');
    li.textContent = p.message;
    ul.appendChild(li);
  }
  $('lyImportWrap').classList.toggle('hidden', !typed);
}
```

- [ ] **Step 3: `api_ui.js`** — point 29 column 3 and a point 45 table in the preview

3a. Replace `function previewHtml(v) {` with `function previewHtml(v, ly) {` and, in the point 29 rows, replace the four `''` in column 3 with `ly.cat1`, `ly.cat2`, `ly.total12`, `ly.cat3` respectively:
```js
      ['I', 'Teaching, learning and evaluation related activities', ly.cat1, v.p29.I],
      ['II', 'Co-curricular, extension, professional development etc.', ly.cat2, v.p29.II],
      ['', 'Total I + II', ly.total12, v.p29.I_II],
      ['III', 'Research and academic contribution', ly.cat3, v.p29.III],
```
3b. Before the closing `].join('');` of `previewHtml`, add a point 45 table after the point 44 table:
```js
    table('45. Summary of API scores by Principal', ['', 'Criteria', 'Last academic year', 'Reported in self appraisal', "Principal's total"], [
      ['I', 'Teaching, learning and evaluation related activities', ly.cat1, v.p29.I, ''],
      ['II', 'Co-curricular, extension, professional development etc.', ly.cat2, v.p29.II, ''],
      ['', 'Total I + II', ly.total12, v.p29.I_II, ''],
      ['III', 'Research and academic contribution', ly.cat3, v.p29.III, ''],
    ], 3),
```
3c. Replace `export function renderApiValues({ values, problems }) {` with `export function renderApiValues({ values, problems }, ly = { cat1: '', cat2: '', total12: '', cat3: '' }) {` and `previewHtml(values)` with `previewHtml(values, ly)`.
3d. Update the first header comment line to `// Entry tables for points 26-28 and the live preview of points 29, 42, 43, 44 and 45.`

- [ ] **Step 4: `app.js`** (exact replacements)

1. After `import { parseDob, dobWords, fieldProblems, migrateDraft } from './acr_fields.js';` add:
```js
import * as sessions from './sessions.js';
import { initLastYearUi, renderLastYear } from './last_year_ui.js';
```
and change `import { tally, normalizeApi, emptyApi } from './api_tally.js';` to
`import { tally, normalizeApi, emptyApi, lastYearProblems, lastYearCells } from './api_tally.js';`
2. Replace `const LOCAL_KEY='acrUtilityDraftV01';` with:
```js
// Browser storage, wrapped so that a storage error never loses what is on screen.
function safeStore(){
  let ls=null; try{ls=window.localStorage;}catch(err){console.error(err);}
  const fail=err=>{console.error(err);const s=document.getElementById('syncStatus');if(s)s.textContent="This browser's storage could not be used; your entries stay on screen but are not saved. Use Export Draft to keep a copy.";};
  const guard=(fn,fallback)=>{try{return ls?fn():fallback;}catch(err){fail(err);return fallback;}};
  return {get length(){return guard(()=>ls.length,0);},key:i=>guard(()=>ls.key(i),null),getItem:k=>guard(()=>ls.getItem(k),null),setItem:(k,v)=>guard(()=>ls.setItem(k,v)),removeItem:k=>guard(()=>ls.removeItem(k))};
}
const store=safeStore();
```
3. In `collectSimple`, replace `const data={session:$('session').value.trim(),` with `const data={session:state.session,`.
4. Replace the `saveLocal` and `loadLocal` lines with:
```js
function saveLocal(){const data=collectSimple(); data.savedAt=new Date().toISOString(); sessions.writeRecord(store,data); $('lastSaved').value=new Date(data.savedAt).toLocaleString(); updateProgress(); return data;}
function loadLocal(){const notices=sessions.migrate(store); const rec=sessions.loadCurrent(store); if(rec){applySimple(rec); if(rec.savedAt) $('lastSaved').value=new Date(rec.savedAt).toLocaleString();} resolveLastYear(); refreshSessionList(); if(notices.length) $('syncStatus').textContent=notices.join(' ');}
function refreshSessionList(){const dl=$('sessionList'); dl.innerHTML=''; for(const s of sessions.listSessions(store)){const o=document.createElement('option'); o.value=s; dl.appendChild(o);}}
function openSession(session){const rec=sessions.readRecord(store,session)||sessions.newRecordFrom({},session); applySimple(rec); store.setItem(sessions.CURRENT_KEY,session); resolveLastYear(); updateScores(); saveLocal(); refreshSessionList(); renderReview();}
function resolveLastYear(){
  const info=sessions.lastYear(store,state.session);
  const ly=state.api.lastAcademicYear&&typeof state.api.lastAcademicYear==='object'?state.api.lastAcademicYear:{};
  if(info.state==='record') state.api.lastAcademicYear={...info.values,source:'record',from:info.from};
  else if(info.state!=='none'||ly.source==='record') state.api.lastAcademicYear={cat1:'',cat2:'',total12:'',cat3:'',source:info.state==='none'?'typed':'',from:''};
  renderLastYear(info,state.api.lastAcademicYear);
  return info;
}
async function importLastYearFile(file){
  let rec=null; try{rec=JSON.parse(await file.text());}catch(err){console.error(err);}
  if(!rec||typeof rec!=='object'){renderLastYear({state:'none',message:'This is not an ACR file.',problems:[]},state.api.lastAcademicYear||{});return;}
  const res=sessions.checkLastYearFile(rec,state.session);
  if(!res.ok){renderLastYear({state:'none',message:res.message,problems:res.problems||[]},state.api.lastAcademicYear||{});return;}
  sessions.saveRecord(store,rec); resolveLastYear(); updateScores(); saveLocal(); refreshSessionList();
}
```
5. In `switchSection`, replace `state.ui.section=id; saveLocal();` with `state.ui.section=id; if(id==='api'){resolveLastYear(); updateScores();} saveLocal();`.
6. Replace `function updateScores(){const result=tally(state.api);renderApiValues(result);return result;}` with
`function updateScores(){const result=tally(state.api);renderApiValues(result,lastYearCells(state.api.lastAcademicYear));return result;}`
7. In `renderFieldProblems`, replace `const probs=[...fieldProblems(d),...tally(d.api).problems];` with
```js
  const probs=[...fieldProblems(d),...tally(d.api).problems,...lastYearProblems(d.api.lastAcademicYear)];
  if(!lastYearCells(d.api.lastAcademicYear).cat1&&!lastYearProblems(d.api.lastAcademicYear).length){const w=document.createElement('li');w.className='warn';w.textContent='Last academic year figures are not filled in.';ul.appendChild(w);}
```
8. Replace the whole `$('importInput').addEventListener(…);` line with:
```js
$('importInput').addEventListener('change',async e=>{
  const file=e.target.files[0]; e.target.value=''; if(!file) return;
  let rec=null; try{rec=JSON.parse(await file.text());}catch(err){console.error(err);}
  if(!rec||typeof rec!=='object'){alert('Invalid ACR draft file.');return;}
  const s=sessions.isSession(rec.session)?rec.session:'';
  const exists=s?sessions.hasRecord(store,s):store.getItem(sessions.DRAFT_KEY)!==null;
  if(exists&&!confirm(s?`Replace the saved ${s} record with this file?`:'Replace the unnamed draft with this file?')) return;
  saveLocal(); rec.session=s; sessions.saveRecord(store,rec);
  if(s) openSession(s); else {applySimple(rec); store.setItem(sessions.CURRENT_KEY,''); resolveLastYear(); updateScores(); saveLocal(); refreshSessionList();}
  $('syncStatus').textContent=s?`Imported the ${s} record.`:'Imported as the unnamed draft.';
});
$('session').addEventListener('change',()=>{
  const box=$('session'), status=$('syncStatus'), target=box.value.trim();
  const action=sessions.decideSwitch(state.session,target,sessions.hasRecord(store,target));
  if(action==='same'){box.value=state.session;return;}
  if(action==='invalid'){status.textContent='Session must look like 2025-26.';box.value=state.session;return;}
  if(action==='name-draft'){state.session=target; resolveLastYear(); updateScores(); saveLocal(); store.removeItem(sessions.DRAFT_KEY); refreshSessionList(); status.textContent=`This draft is now the ${target} record.`;return;}
  if(action==='ask-open-existing'&&!confirm(`A ${target} record already exists. Open it? (your unnamed draft is kept as the unnamed draft)`)){box.value=state.session;return;}
  saveLocal();
  if(action==='new'){sessions.saveRecord(store,sessions.newRecordFrom(collectSimple(),target)); status.textContent=`Started the ${target} record (profile copied; annual parts empty).`;}
  else status.textContent=`Opened the ${target} record.`;
  openSession(target);
});
```
9. Replace the line `initApiUi({getApi:()=>state.api,onChange:()=>{updateScores();saveLocal();}});` with
```js
initApiUi({getApi:()=>state.api,onChange:()=>{updateScores();saveLocal();}});
initLastYearUi({getLy:()=>state.api.lastAcademicYear||{},setLy:v=>{state.api.lastAcademicYear=v;},onChange:()=>{resolveLastYear();updateScores();saveLocal();},onImport:importLastYearFile});
```
10. Check: `grep -n "LOCAL_KEY\|acrUtilityDraftV01" app.js` → no output.

- [ ] **Step 5: `styles.css`** — append `.problems li.warn{color:#8a5a00}`.
- [ ] **Step 6: `sw.js`** — `CACHE='acr-utility-v0-6'`; add `'./sessions.js','./last_year_ui.js'` to `ASSETS`.
- [ ] **Step 7:** `node --check` on `app.js`, `sessions.js`, `last_year_ui.js`, `api_ui.js`, `sw.js`; run both test suites.
- [ ] **Step 8: Browser check** (fresh profile; `python -m http.server 8765`; `playwright-cli`, accept confirm dialogs with `dialog-accept`):
1. Old key migration: `localStorage.setItem('acrUtilityDraftV01', JSON.stringify({session:'2024-25', profile:{fullName:'T'}, api:{c1:{classes:45}}}))`, reload → session box shows 2024-25, `acrUtility:session:2024-25` exists, old key gone.
2. On 2024-25 enter the API worked example scores (or import `tests/fixtures/worked_example.acr.json` after setting its session to 2024-25).
3. Type `2025-26` in the session box and tab out → "Started the 2025-26 record (profile copied; annual parts empty)"; profile name kept; Part II empty; API tab: last-year boxes read-only showing 106.75 / 25 / 131.75 / 193 and "From the 2024-25 record."; preview point 29 and point 45 column 3 show them.
4. Switch to 2024-25, change 26(i)(a) from 45 to 44, switch back to 2025-26 → I shows 105.75.
5. Remove `acrUtility:session:2024-25` from storage (console), open the API tab → boxes editable, note "No 2024-25 record on this device…", import button visible; type I 130 → red problem "Last academic year I is 130; the form's maximum is 125."
6. Import last year's file with session 2023-24 → refused with "This file is for 2023-24; last year for 2025-26 is 2024-25."; import a 2024-25 file whose API has 26(i)(a)=60 → refused with its problem; import a good 2024-25 file → figures locked again.
7. Reload → still on 2025-26 with everything kept; console has no errors.
- [ ] **Step 9: Commit**
```bash
git add index.html app.js api_ui.js last_year_ui.js styles.css sw.js
git commit -m "feat: saved sessions in the app, last academic year card, point 45 preview"
```

---

### Task 5: End-to-end and visual check

- [ ] Export the 2025-26 record from the browser run (Task 4) as `tests/out/s2025.acr.json`; `python generate_acr.py tests/out/s2025.acr.json -o tests/out/s2025.docx`; convert with `tools/docx_to_pdf.ps1`; render the point 29 and point 45 pages; compare with `UGC_ACR_Form.pdf` pages 11 and 23: column 3 = last year's figures, column 4 = this year's, point 45 column 5 empty, blue values in Times New Roman.
- [ ] Run both suites; commit only fixes found here (message naming what the check found).

---

## Self-review against the spec

| Spec item | Task |
|---|---|
| §1 R1, R3 (29/45 col 3, 45 col 4, col 5 untouched) | 3 (Word), 4 (preview), 5 (visual) |
| §1 R2 (typed first year, automatic later) | 2 (`lastYear`), 4 (`resolveLastYear`, card) |
| §1 R4 (records per session, never overwritten) | 2 (`saveRecord`/`writeRecord`/`decideSwitch`), 4 (switch/import handlers) |
| §1 R5 (exact, same everywhere) | 1 (shared cases), 3 (`last_year_cells`), 4 (`lastYearCells`) |
| §3.1–3.3 names, storage, migration, switching, new record, import | 2, 4 |
| §4.1 four cases + messages | 2 (tests), 4 (card) |
| §4.2 last-year file import | 2 (`checkLastYearFile`), 4 (`importLastYearFile`) |
| §4.3 typed checks | 1, 3 (block), 4 (card problems, Review) |
| §4.4 stored shape | 4 (`resolveLastYear`, `initLastYearUi`) |
| §5 Word cells + warning vs block | 3, 4 (Review warning) |
| §7 tests | 1–5 |

**Deliberate choices within the spec:** the printed I+II is always recalculated from I and II (even if a stored `total12` differs), so it can never disagree with them. The point 45 preview in the app is an addition for checking; it prints nothing new.
