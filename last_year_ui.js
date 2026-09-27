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
