// Entry tables for points 26-28 and the live preview of points 29, 42, 43, 44 and 45.
// Every value typed here is stored as typed in state.api; api_tally.js does all the arithmetic.
import { ROW_CHOICES, ROW_LABELS, C3_WHERE, P44_ORDER } from './api_tally.js';

const WHERE = { 'c1.lectures': '26(i)', 'c1.innovative': '26(iii)', 'c1.exam': '26(iv)', 'c2.extension': '27(i)', 'c2.management': '27(ii)', 'c2.professional': '27(iii)' };
for (const [k, w] of Object.entries(C3_WHERE)) WHERE['c3.' + k] = w;

const SCORE = ['score', 'API score', 'score'];
const ROW = ['row', 'Point-44 row', 'row'];
const LEVEL = ['row', 'Level (point-44 row)', 'row'];
const FIELDS = {
  'c1.lectures': [['course', 'Course / Paper'], ['level', 'Level'], ['mode', 'Mode of teaching'], ['allotted', 'No. of classes / week allotted'], ['conducted', 'No. of classes conducted'], ['pct', '% of classes taken (documented record)']],
  'c1.resources': [['course', 'Course / Paper'], ['consulted', 'Consulted'], ['prescribed', 'Prescribed'], ['additional', 'Additional resource provided']],
  'c1.innovative': [['description', 'Short description'], SCORE],
  'c1.exam': [['type', 'Type of examination duty'], ['assigned', 'Duties assigned'], ['extent', 'Extent carried out (%)'], SCORE],
  'c2.extension': [['activity', 'Type of activity'], ['hours', 'Average hours / week'], SCORE],
  'c2.management': [['activity', 'Activity'], ['responsibility', 'Yearly / semester-wise responsibilities'], SCORE],
  'c2.professional': [['activity', 'Activity'], ['details', 'Details'], SCORE],
  'c3.journals': [['title', 'Title with page nos.'], ['journal', 'Journal'], ['issn', 'ISSN / ISBN No.'], ['peer', 'Peer reviewed? Impact factor, if any'], ['coauthors', 'No. of co-authors'], ['mainAuthor', 'Are you the main author?'], ROW, SCORE],
  'c3.chapters': [['title', 'Title with page nos.'], ['book', 'Book title, editor & publisher'], ['issn', 'ISSN / ISBN No.'], ['peer', 'Peer reviewed?'], ['coauthors', 'No. of co-authors'], ['mainAuthor', 'Are you the main author?'], ROW, SCORE],
  'c3.proceedings': [['title', 'Title with page nos.'], ['conference', 'Details of conference publication'], ['issn', 'ISSN / ISBN No.'], ['coauthors', 'No. of co-authors'], ['mainAuthor', 'Are you the main author?'], SCORE],
  'c3.books': [['title', 'Title with page nos.'], ['type', 'Type of book & authorship'], ['publisher', 'Publisher & ISSN / ISBN No.'], ['peer', 'Peer reviewed?'], ['coauthors', 'No. of co-authors'], ['mainAuthor', 'Are you the main author?'], ROW, SCORE],
  'c3.ongoing': [['title', 'Title'], ['agency', 'Agency'], ['period', 'Period'], ['amount', 'Grant / amount mobilised (Rs lakh)'], ROW, SCORE],
  'c3.completed': [['title', 'Title'], ['agency', 'Agency'], ['period', 'Period'], ['amount', 'Grant / amount mobilised (Rs lakh)'], ['outcome', 'Policy document / patent as outcome?'], ROW, SCORE],
  'c3.training': [['programme', 'Programme'], ['duration', 'Duration'], ['organisedBy', 'Organised by'], ROW, SCORE],
  'c3.papers': [['title', 'Title of the paper presented'], ['conference', 'Title of conference / seminar'], ['organisedBy', 'Organised by'], LEVEL, SCORE],
  'c3.lectures': [['title', 'Title of lecture / academic session'], ['conference', 'Title of conference / seminar'], ['organisedBy', 'Organised by'], LEVEL, SCORE],
};

let getApi = () => ({});
let notify = () => {};

const listFor = path => { const [g, k] = path.split('.'); return getApi()[g][k]; };
const containerFor = path => document.getElementById('list-' + path.replace('.', '-'));
const readPath = path => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), getApi());
function writePath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], getApi())[last] = value;
}

function buildRow(path, entry, idx) {
  const row = document.createElement('div');
  row.className = 'repeat-row api-row';
  if (WHERE[path]) row.dataset.where = `${WHERE[path]}, entry ${idx + 1}`;
  const no = document.createElement('div');
  no.className = 'entry-no';
  no.textContent = `Entry ${idx + 1}`;
  row.appendChild(no);
  const listName = path.split('.')[1];
  for (const [key, label, kind] of FIELDS[path]) {
    const wrap = document.createElement('label');
    wrap.append(label);
    let input;
    if (kind === 'row') {
      input = document.createElement('select');
      input.add(new Option('— choose —', ''));
      for (const code of ROW_CHOICES[listName]) input.add(new Option(ROW_LABELS[code], code));
      input.value = entry.row ?? '';
    } else {
      input = document.createElement('input');
      if (kind === 'score') { input.type = 'text'; input.inputMode = 'decimal'; input.dataset.score = ''; }   // cleaned to a number as typed (app.js)
      input.value = entry[key] ?? '';
    }
    input.addEventListener(kind === 'row' ? 'change' : 'input', () => { entry[key] = input.value; });
    wrap.appendChild(input);
    row.appendChild(wrap);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    const list = listFor(path);
    list.splice(list.indexOf(entry), 1);
    renderList(path);
    notify();
  });
  row.appendChild(remove);
  return row;
}

function renderList(path) {
  const box = containerFor(path);
  box.innerHTML = '';
  listFor(path).forEach((entry, idx) => box.appendChild(buildRow(path, entry, idx)));
}

export function renderApiLists() {
  Object.keys(FIELDS).forEach(renderList);
  document.querySelectorAll('[data-api-field]').forEach(el => { el.value = readPath(el.dataset.apiField) ?? ''; });
}

export function initApiUi(opts) {
  getApi = opts.getApi;
  notify = opts.onChange;
  document.querySelectorAll('[data-api-field]').forEach(el => el.addEventListener('input', () => writePath(el.dataset.apiField, el.value)));
  document.querySelectorAll('[data-api-add]').forEach(btn => btn.addEventListener('click', () => {
    const path = btn.dataset.apiAdd;
    const list = listFor(path);
    const entry = {};
    list.push(entry);
    const row = buildRow(path, entry, list.length - 1);
    containerFor(path).appendChild(row);
    notify();
    requestAnimationFrame(() => { const first = row.querySelector('input,select'); if (first) first.focus(); });
  }));
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const pick = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
const SERIAL = { A1: 'A', A2: 'A', B1a: 'B (i)', B1b: 'B (i)', B2: 'B (ii)', B3a: 'B (iii)', B3b: 'B (iii)', B3c: 'B (iii)',
  C1a: 'C (i)', C1b: 'C (i)', C1c: 'C (i)', C2: 'C (ii)', C3: 'C (iii)', C4: 'C (iv)', D1: 'D (i)', D2a: 'D (ii)', D2b: 'D (ii)',
  E1a: 'E (i)', E1b: 'E (i)', E2a: 'E (ii)', E2b: 'E (ii)', E2c: 'E (ii)', E2d: 'E (ii)', E3a: 'E (iii)', E3b: 'E (iii)' };
const PRINCIPAL = ['Principal: agree', 'Reasons', "Principal's score"];

function table(title, head, rows, valCol) {
  const th = head.map(h => `<th>${esc(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c, i) => `<td${i === valCol ? ' class="val"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<h4>${esc(title)}</h4><table class="preview-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function previewHtml(v, ly) {
  const blank = ['', '', ''];
  return [
    table('29. Summary of API scores', ['', 'Criteria', 'Last academic year', 'Total API score for assessment period'], [
      ['I', 'Teaching, learning and evaluation related activities', ly.cat1, v.p29.I],
      ['II', 'Co-curricular, extension, professional development etc.', ly.cat2, v.p29.II],
      ['', 'Total I + II', ly.total12, v.p29.I_II],
      ['III', 'Research and academic contribution', ly.cat3, v.p29.III],
    ], 3),
    table('42. Category I', ['Serial', 'Criteria', 'Max.', 'API score reported in self appraisal', ...PRINCIPAL], [
      ['(i) a', 'Classes taken', '50', v.p42.i_a, ...blank],
      ['(i) b', 'Teaching load in excess of UGC norm', '10', v.p42.i_b, ...blank],
      ['(ii)', 'Imparting of knowledge / syllabus enrichment', '20', v.p42.ii, ...blank],
      ['(iii)', 'Participatory and innovative methods', '20', v.p42.iii, ...blank],
      ['(iv)', 'Examination duties', '25', v.p42.iv, ...blank],
      ['', 'Total score', '125', v.p42.total, ...blank],
    ], 3),
    table('43. Category II', ['Serial', 'Criteria', 'Max.', 'API score reported in self appraisal', ...PRINCIPAL], [
      ['(i)', 'Extension, co-curricular & field based activities', '20', v.p43.i, ...blank],
      ['(ii)', 'Contribution to corporate life and management', '15', v.p43.ii, ...blank],
      ['(iii)', 'Professional development activities', '15', v.p43.iii, ...blank],
      ['', 'Total score (i + ii + iii), max. 25', '25', v.p43.total, ...blank],
    ], 3),
    table('44. Category III', ['Serial', 'Criteria (rate)', 'API score reported in self appraisal', ...PRINCIPAL], [
      ...P44_ORDER.map(code => [SERIAL[code], ROW_LABELS[code], v.p44[code], ...blank]),
      ['', 'Total', v.p44.total, ...blank],
    ], 2),
    table('45. Summary of API scores by Principal', ['', 'Criteria', 'Last academic year', 'Reported in self appraisal', "Principal's total"], [
      ['I', 'Teaching, learning and evaluation related activities', ly.cat1, v.p29.I, ''],
      ['II', 'Co-curricular, extension, professional development etc.', ly.cat2, v.p29.II, ''],
      ['', 'Total I + II', ly.total12, v.p29.I_II, ''],
      ['III', 'Research and academic contribution', ly.cat3, v.p29.III, ''],
    ], 3),
  ].join('');
}

export function renderApiValues({ values, problems }, ly = { cat1: '', cat2: '', total12: '', cat3: '' }) {
  document.querySelectorAll('[data-sum]').forEach(el => {
    const val = pick(values, el.dataset.sum);
    const over = el.dataset.max && Number(val) > Number(el.dataset.max);
    el.textContent = el.dataset.max ? `${val} / ${el.dataset.max}${over ? ` (${el.dataset.max} counted)` : ''}` : val;
  });
  const flagged = new Set(problems.map(p => p.where));
  document.querySelectorAll('[data-where]').forEach(el => el.classList.toggle('over', flagged.has(el.dataset.where)));
  // More activities than a maximum allows is fine: only the maximum is counted, so say what was counted.
  for (const [id, v] of [['cat1CapNote', values.p42], ['cat2CapNote', values.p43], ['cat3CapNote', values.p44]])
    document.getElementById(id).textContent = v.capped ? `(your entries add up to ${v.raw}; ${v.total} counted)` : '';
  const ul = document.getElementById('apiProblems');
  ul.innerHTML = '';
  if (!problems.length) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = 'No problems. The API scores are ready.';
    ul.appendChild(li);
  }
  for (const p of problems) {
    const li = document.createElement('li');
    li.textContent = p.message;
    ul.appendChild(li);
  }
  document.getElementById('apiPreview').innerHTML = previewHtml(values, ly);
}
