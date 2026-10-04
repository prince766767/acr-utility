// Builds the ACR Word file in the app, exactly as generate_acr.py does on a PC
// (spec docs/superpowers/specs/2026-09-27-word-file-in-app-design.md). It follows python-docx 1.2's rules for cells,
// text and run properties so that tests/test_parity.py finds the two files identical. Change both together.
import { tally, toCents, fmt, isEmptyEntry, lastYearProblems, lastYearCells, LEVEL_TEXT, scoreText } from './api_tally.js';
import { fieldProblems, tokenValues, partTables, TITLES, RELATIONS } from './acr_fields.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const BLUE = '0000CC';
const FORM_FONT = 'Times New Roman';
export const STYLE_FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Verdana']; // also in Google Docs
export const STYLE_SIZES = [10, 11, 12];
export const DEFAULT_STYLE = { color: '0000CC', font: '', size: 0, bold: false, italic: false };
const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow',
  'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz',
  'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
  'specVanish', 'oMath'];
// Point 44 "API Score reported in self appraisal" cells: code -> [table, row, column, start of Max. Score text].
const P44_CELLS = {
  A1: [27, 3, 4, '15/'], A2: [27, 4, 4, '10/'], B1a: [27, 5, 4, '10/'], B1b: [27, 6, 4, '5/'],
  B2: [28, 0, 4, '10/'], B3a: [28, 1, 4, '50/'], B3b: [28, 2, 4, '25/'], B3c: [28, 3, 4, '15/'],
  C1a: [28, 4, 4, '20/'], C1b: [28, 5, 4, '15/'], C1c: [28, 6, 4, '10/'],
  C2: [29, 0, 5, '10/'], C3: [29, 1, 5, '20/'], C4: [29, 2, 5, '30/'],
  D1: [29, 3, 5, '3/'], D2a: [29, 4, 5, '10/'], D2b: [29, 5, 5, '7/'],
  E1a: [29, 6, 5, '20/'], E1b: [29, 7, 5, '10/'],
  E2a: [29, 8, 5, '10/'], E2b: [29, 9, 5, '7.5/'], E2c: [29, 10, 5, '5/'], E2d: [29, 11, 5, '3/'],
  E3a: [30, 0, 4, '10/'], E3b: [30, 1, 4, '5/'],
};

export class ProblemsError extends Error {
  constructor(problems) {
    super(problems.map(p => p.message).join('\n'));
    this.name = 'ProblemsError';
    this.problems = problems;
  }
}

// ---- XML helpers (namespace-aware; the browser DOM and @xmldom/xmldom both support these) ----
const isW = (n, local) => !!n && n.nodeType === 1 && n.namespaceURI === W && n.localName === local;
const kids = (el, local) => { const out = []; for (let n = el.firstChild; n; n = n.nextSibling) if (isW(n, local)) out.push(n); return out; };
const kid = (el, local) => (el ? kids(el, local)[0] || null : null);
const all = (el, local) => Array.from(el.getElementsByTagNameNS(W, local));
const wGet = (el, name) => (el.hasAttributeNS(W, name) ? el.getAttributeNS(W, name) : null);
const wSet = (el, name, value) => el.setAttributeNS(W, 'w:' + name, value);
const wEl = (xml, local) => xml.createElementNS(W, 'w:' + local);
const norm = s => (s || '').replace(/\s+/g, '');
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function setText(el, text) { while (el.firstChild) el.removeChild(el.firstChild); el.appendChild(el.ownerDocument.createTextNode(text)); }
function insertAfter(ref, el) { ref.parentNode.insertBefore(el, ref.nextSibling); return el; }
function check(ok, ti, what) {
  if (!ok) throw new Error(`Template table ${ti}: expected ${what}. The template layout has changed; nothing was written.`);
}

// ---- text, as python-docx reads it ----
function runText(r) {
  let s = '';
  for (let n = r.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1 || n.namespaceURI !== W) continue;
    const name = n.localName;
    if (name === 't') s += n.textContent;
    else if (name === 'tab' || name === 'ptab') s += '\t';
    else if (name === 'cr') s += '\n';
    else if (name === 'br') { const type = wGet(n, 'type'); if (type === null || type === 'textWrapping') s += '\n'; }
    else if (name === 'noBreakHyphen') s += '-';
  }
  return s;
}
function paraText(p) {
  let s = '';
  for (let n = p.firstChild; n; n = n.nextSibling) {
    if (isW(n, 'r')) s += runText(n);
    else if (isW(n, 'hyperlink')) s += kids(n, 'r').map(runText).join('');
  }
  return s;
}
const cellText = tc => kids(tc, 'p').map(paraText).join('\n');
const deepText = el => all(el, 't').map(t => t.textContent).join('');

// ---- tables, as python-docx addresses them ----
function gridSpan(tc) { const g = kid(kid(tc, 'tcPr'), 'gridSpan'); return g ? parseInt(wGet(g, 'val'), 10) : 1; }
function vMerge(tc) { const v = kid(kid(tc, 'tcPr'), 'vMerge'); return v ? (wGet(v, 'val') || 'continue') : null; }
function gridBefore(tr) { const g = kid(kid(tr, 'trPr'), 'gridBefore'); return g ? parseInt(wGet(g, 'val'), 10) : 0; }
function gridOffset(tc) {
  let off = gridBefore(tc.parentNode);
  for (const t of kids(tc.parentNode, 'tc')) { if (t === tc) return off; off += gridSpan(t); }
  throw new Error('Template: cell not found in its row.');
}
function tcAtGridOffset(tr, offset) {
  let remaining = offset - gridBefore(tr);
  for (const tc of kids(tr, 'tc')) {
    if (remaining < 0) break;
    if (remaining === 0) return tc;
    remaining -= gridSpan(tc);
  }
  throw new Error(`Template: no cell at grid offset ${offset}.`);
}
function tcAbove(tc) {
  let tr = tc.parentNode.previousSibling;
  while (tr && !isW(tr, 'tr')) tr = tr.previousSibling;
  if (!tr) throw new Error('Template: no row above the top row.');
  return tcAtGridOffset(tr, gridOffset(tc));
}

class Table {
  constructor(tbl) { this.tbl = tbl; }
  get rows() { return kids(this.tbl, 'tr'); }
  get colCount() { const g = kid(this.tbl, 'tblGrid'); return g ? kids(g, 'gridCol').length : 0; }
  cell(r, c) {  // python-docx Table.cell(): the _cells grid
    const cc = this.colCount, cells = [];
    for (const tr of this.rows) {
      for (const tc of kids(tr, 'tc')) {
        for (let i = 0; i < gridSpan(tc); i++) {
          if (vMerge(tc) === 'continue') cells.push(cells[cells.length - cc]);
          else if (i > 0) cells.push(cells[cells.length - 1]);
          else cells.push(tc);
        }
      }
    }
    const tc = cells[r * cc + c];
    if (!tc) throw new Error(`Template: table cell (${r}, ${c}) does not exist.`);
    return tc;
  }
  rowCells(r) {  // python-docx _Row.cells
    const out = [];
    const add = tc => { if (vMerge(tc) === 'continue') { add(tcAbove(tc)); return; } for (let i = 0; i < gridSpan(tc); i++) out.push(tc); };
    for (const tc of kids(this.rows[r], 'tc')) add(tc);
    return out;
  }
  text(r, c) { return cellText(this.rowCells(r)[c]); }
}

class Doc {
  constructor(xml) { this.xml = xml; this.body = kid(xml.documentElement, 'body'); }
  get tables() { return kids(this.body, 'tbl').map(t => new Table(t)); }
}

// ---- runs, as python-docx writes them ----
function insertOrdered(parent, el, order) {
  const rank = order.indexOf(el.localName);
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && n.namespaceURI === W && order.indexOf(n.localName) > rank) { parent.insertBefore(el, n); return el; }
  }
  parent.appendChild(el);
  return el;
}
function getOrAdd(parent, local, order) { return kid(parent, local) || insertOrdered(parent, wEl(parent.ownerDocument, local), order); }
function getOrAddRPr(r) {
  const existing = kid(r, 'rPr');
  if (existing) return existing;
  const rpr = wEl(r.ownerDocument, 'rPr');
  r.insertBefore(rpr, r.firstChild);
  return rpr;
}
function setRunText(r, text) {
  const xml = r.ownerDocument;
  for (const n of Array.from(r.childNodes)) if (n.nodeType === 1 && !isW(n, 'rPr')) r.removeChild(n);
  let buf = '';
  const flush = () => {
    if (buf) {
      const t = wEl(xml, 't');
      t.appendChild(xml.createTextNode(buf));
      if (buf.trim().length < buf.length) t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      r.appendChild(t);
    }
    buf = '';
  };
  for (const ch of String(text)) {
    if (ch === '\t') { flush(); r.appendChild(wEl(xml, 'tab')); }
    else if (ch === '\r' || ch === '\n') { flush(); r.appendChild(wEl(xml, 'br')); }
    else buf += ch;
  }
  flush();
}
function setColor(r, hex) {
  const rpr = getOrAddRPr(r);
  for (const c of kids(rpr, 'color')) rpr.removeChild(c);
  const color = insertOrdered(rpr, wEl(r.ownerDocument, 'color'), RPR_ORDER);
  wSet(color, 'val', hex);
}
// The teacher's text style for filled-in answers (same rules as normalize_style in generate_acr.py).
export function normalizeStyle(style) {
  const s = obj(style);
  const color = String(s.color || '').replace(/^#/, '').toUpperCase();
  const size = parseInt(s.size || 0, 10);
  return {
    color: /^[0-9A-F]{6}$/.test(color) ? color : DEFAULT_STYLE.color,
    font: STYLE_FONTS.includes(s.font) ? s.font : '',
    size: STYLE_SIZES.includes(size) ? size : 0,
    bold: s.bold === true, italic: s.italic === true,
  };
}
function setOn(rpr, local) {
  const el = getOrAdd(rpr, local, RPR_ORDER);
  el.removeAttributeNS(W, 'val');
}
// Every filled-in answer is a blue (0000CC) run: give each the teacher's colour, font, size, bold and italic.
function applyTextStyle(xml, style) {
  const st = normalizeStyle(style);
  if (Object.keys(DEFAULT_STYLE).every(k => st[k] === DEFAULT_STYLE[k])) return;
  const body = all(xml.documentElement, 'body')[0];
  for (const r of all(body, 'r')) {
    const rpr = kid(r, 'rPr');
    const c = kid(rpr, 'color');
    if (!c || (wGet(c, 'val') || '').toUpperCase() !== BLUE) continue;
    if (st.font) {
      const fonts = getOrAdd(rpr, 'rFonts', RPR_ORDER);
      for (const a of Array.from(fonts.attributes)) if (a.namespaceURI === W && a.localName.endsWith('Theme')) fonts.removeAttributeNode(a);
      for (const k of ['ascii', 'hAnsi', 'cs', 'eastAsia']) wSet(fonts, k, st.font);
    }
    if (st.size) {
      wSet(getOrAdd(rpr, 'sz', RPR_ORDER), 'val', String(st.size * 2));
      wSet(getOrAdd(rpr, 'szCs', RPR_ORDER), 'val', String(st.size * 2));
    }
    if (st.bold) { setOn(rpr, 'b'); setOn(rpr, 'bCs'); }
    if (st.italic) { setOn(rpr, 'i'); setOn(rpr, 'iCs'); }
    wSet(c, 'val', st.color);
  }
  // Paragraph marks of answers (they colour automatic numbers): colour only, their size would change line heights.
  for (const c of all(body, 'color')) {
    if (isW(c.parentNode && c.parentNode.parentNode, 'pPr') && (wGet(c, 'val') || '').toUpperCase() === BLUE) wSet(c, 'val', st.color);
  }
}
function setStrike(r, on) {
  const strike = getOrAdd(getOrAddRPr(r), 'strike', RPR_ORDER);
  if (on) strike.removeAttributeNS(W, 'val'); else wSet(strike, 'val', '0');
}
function giveCellFont(p, r) {
  const own = kid(r, 'rPr');
  if (own && kid(own, 'rFonts')) return;
  const mark = kid(kid(p, 'pPr'), 'rPr');
  const fonts = kid(mark, 'rFonts');
  const rpr = getOrAddRPr(r);
  const rfonts = getOrAdd(rpr, 'rFonts', RPR_ORDER);
  if (fonts && wGet(fonts, 'ascii')) {
    for (const a of Array.from(fonts.attributes)) if (a.namespaceURI !== XMLNS_NS) rfonts.setAttributeNS(a.namespaceURI, a.name, a.value);
  } else {
    for (const k of ['ascii', 'hAnsi', 'cs']) wSet(rfonts, k, FORM_FONT);
  }
  const sz = kid(mark, 'sz');
  if (sz && !kid(rpr, 'sz')) {
    const mine = insertOrdered(rpr, wEl(r.ownerDocument, 'sz'), RPR_ORDER);
    wSet(mine, 'val', String(parseInt(wGet(sz, 'val'), 10)));
    const szcs = kid(mark, 'szCs');
    if (szcs && !kid(rpr, 'szCs')) insertAfter(mine, szcs.cloneNode(true));
  }
}

// ---- the steps of generate_acr.py ----
function setCell(doc, ti, row, col, text) {
  const tc = doc.tables[ti].cell(row, col);
  if (!kids(tc, 'p').length) tc.appendChild(wEl(doc.xml, 'p'));
  const p = kids(tc, 'p')[0];
  const runs = kids(p, 'r');
  const r = runs.length ? runs[0] : p.appendChild(wEl(doc.xml, 'r'));
  setRunText(r, String(text || ''));
  setColor(r, BLUE);
  giveCellFont(p, r);
  for (const rr of kids(p, 'r').slice(1)) setRunText(rr, '');
}
function cloneRow(table, idx) { const tr = table.rows[idx]; insertAfter(tr, tr.cloneNode(true)); }
function fillRows(doc, ti, rows, start = 1) {
  const t = doc.tables[ti];
  const existing = Math.max(0, t.rows.length - start);
  for (let k = 0; k < rows.length - existing; k++) cloneRow(t, start);
  rows.forEach((row, i) => { for (let c = 0; c < t.colCount; c++) setCell(doc, ti, start + i, c, c < row.length ? row[c] : ''); });
}
function findRow(table, col, prefix, start = 0) {
  for (let r = start; r < table.rows.length; r++) if (norm(table.text(r, col)).startsWith(norm(prefix))) return r;
  throw new Error(`Template: no row starting with "${prefix}" in column ${col}.`);
}
function fillBetween(doc, ti, first, end, rows) {
  const t = doc.tables[ti];
  for (let k = 0; k < rows.length - (end - first); k++) cloneRow(t, end - 1);
  rows.forEach((vals, i) => vals.forEach((v, c) => setCell(doc, ti, first + i, c, v)));
}
function entries(api, group, name) {
  const g = obj(api[group]);
  return (Array.isArray(g[name]) ? g[name] : []).filter(e => !isEmptyEntry(e));
}
const field = (e, key) => (e[key] === undefined || e[key] === null ? '' : String(e[key]));
const sc = e => scoreText(e.score);
const level = e => (typeof e.row === 'string' && has(LEVEL_TEXT, e.row) ? LEVEL_TEXT[e.row] : '');

function fillApiTables(doc, api, v) {
  const T = doc.tables;
  check(norm(T[8].text(1, 0)) === '(a)' && norm(T[8].text(2, 0)) === '(b)', 8, '(a)/(b) rows');
  setCell(doc, 8, 1, 2, v.p42.i_a);
  setCell(doc, 8, 2, 2, v.p42.i_b);
  fillBetween(doc, 9, 1, findRow(doc.tables[9], 0, 'API score based'),
    entries(api, 'c1', 'resources').map((e, i) => [i + 1, field(e, 'course'), field(e, 'consulted'), field(e, 'prescribed'), field(e, 'additional')]));
  const scoreRow = findRow(doc.tables[9], 0, 'APIscorebased') + 1;
  check(norm(doc.tables[9].text(scoreRow - 1, 4)) === 'APIScore', 9, '"API Score" above the 26(ii) score cell');
  setCell(doc, 9, scoreRow, 4, v.p42.ii);
  fillBetween(doc, 10, 1, findRow(doc.tables[10], 1, 'Total Score'),
    entries(api, 'c1', 'innovative').map((e, i) => [i + 1, field(e, 'description'), sc(e)]));
  setCell(doc, 10, findRow(doc.tables[10], 1, 'Total Score'), 2, v.p42.iii);
  fillBetween(doc, 11, 1, findRow(doc.tables[11], 1, 'Total Score'),
    entries(api, 'c1', 'exam').map((e, i) => [i + 1, field(e, 'type'), field(e, 'assigned'), field(e, 'extent'), sc(e)]));
  setCell(doc, 11, findRow(doc.tables[11], 1, 'Total Score'), 4, v.p42.iv);
  for (const [heading, totalLabel, name, col2, total] of [['(i)', 'Total (Max.20)', 'extension', 'hours', v.p43.i],
    ['(ii)', 'Total (Max.15)', 'management', 'responsibility', v.p43.ii], ['(iii)', 'Total (Max.15)', 'professional', 'details', v.p43.iii]]) {
    const h = findRow(doc.tables[12], 1, heading);
    const end = findRow(doc.tables[12], 1, totalLabel, h + 1);
    fillBetween(doc, 12, h + 1, end, entries(api, 'c2', name).map((e, i) => [i + 1, field(e, 'activity'), field(e, col2), sc(e)]));
    setCell(doc, 12, findRow(doc.tables[12], 1, totalLabel, h + 1), 3, total);
  }
  setCell(doc, 12, findRow(doc.tables[12], 1, 'Total Score'), 3, v.p43.total);
  const c3 = (name, cols) => entries(api, 'c3', name).map((e, i) => [i + 1, ...cols.map(k => field(e, k)), sc(e)]);
  fillRows(doc, 13, c3('journals', ['title', 'journal', 'issn', 'peer', 'coauthors', 'mainAuthor']), 1);
  fillRows(doc, 14, c3('chapters', ['title', 'book', 'issn', 'peer', 'coauthors', 'mainAuthor']), 1);
  fillRows(doc, 15, c3('proceedings', ['title', 'conference', 'issn', 'coauthors', 'mainAuthor']), 1);
  fillRows(doc, 16, c3('books', ['title', 'type', 'publisher', 'peer', 'coauthors', 'mainAuthor']), 1);
  fillRows(doc, 17, c3('ongoing', ['title', 'agency', 'period', 'amount']), 1);
  fillRows(doc, 18, c3('completed', ['title', 'agency', 'period', 'amount', 'outcome']), 1);
  const g = obj(obj(api.c3).guidance);
  check(doc.tables[19].text(1, 0).startsWith('M.Phil') && doc.tables[19].text(2, 0).startsWith('Ph.D'), 19, 'M.Phil / Ph.D rows');
  [[1, 'mphilEnrolled'], [2, 'mphilSubmitted'], [3, 'mphilAwarded']].forEach(([c, k]) => setCell(doc, 19, 1, c, field(g, k)));
  setCell(doc, 19, 1, 4, v.p44.D1);
  [[1, 'phdEnrolled'], [2, 'phdSubmitted'], [3, 'phdAwarded']].forEach(([c, k]) => setCell(doc, 19, 2, c, field(g, k)));
  setCell(doc, 19, 2, 4, v.p28.phd);
  fillRows(doc, 20, entries(api, 'c3', 'training').map((e, i) => [i + 1, field(e, 'programme'), field(e, 'duration'), field(e, 'organisedBy'), sc(e)]), 1);
  fillRows(doc, 21, entries(api, 'c3', 'papers').map((e, i) => [i + 1, field(e, 'title'), field(e, 'conference'), field(e, 'organisedBy'), level(e), sc(e)]), 1);
  fillRows(doc, 22, entries(api, 'c3', 'lectures').map((e, i) => [i + 1, field(e, 'title'), field(e, 'conference'), field(e, 'organisedBy'), level(e), sc(e)]), 1);
  const ly = lastYearCells(api.lastAcademicYear);
  check(norm(doc.tables[31].text(0, 2)).startsWith('LastAcademic'), 31, 'the "Last Academic Year" header of point 45');
  for (const [r, label, key, value] of [[1, 'Teaching', 'cat1', v.p29.I], [2, 'Co-curricular', 'cat2', v.p29.II],
    [3, 'Total', 'total12', v.p29.I_II], [4, 'Research', 'cat3', v.p29.III]]) {
    for (const ti of [23, 31]) {
      check(norm(doc.tables[ti].text(r, 1)).startsWith(label), ti, `row ${r} starting "${label}"`);
      setCell(doc, ti, r, 2, ly[key]);
      setCell(doc, ti, r, 3, value);
    }
  }
  for (const [r, label, key] of [[3, '(i)a', 'i_a'], [4, '(i)b', 'i_b'], [5, '(ii)', 'ii'], [6, '(iii)', 'iii'], [7, '(iv)', 'iv']]) {
    check(norm(doc.tables[25].text(r, 0)) === label, 25, `row ${r} "${label}"`);
    setCell(doc, 25, r, 3, v.p42[key]);
  }
  check(norm(doc.tables[25].text(8, 1)).startsWith('TotalScore'), 25, 'Total Score row');
  setCell(doc, 25, 8, 3, v.p42.total);
  for (const [r, label, key] of [[3, '(i)', 'i'], [4, '(ii)', 'ii'], [5, '(iii)', 'iii']]) {
    check(norm(doc.tables[26].text(r, 0)) === label, 26, `row ${r} "${label}"`);
    setCell(doc, 26, r, 3, v.p43[key]);
  }
  check(norm(doc.tables[26].text(6, 1)).startsWith('TotalScore'), 26, 'Total Score row');
  setCell(doc, 26, 6, 3, v.p43.total);
  for (const [code, [ti, r, c, maxPrefix]] of Object.entries(P44_CELLS)) {
    check(norm(doc.tables[ti].text(r, c - 1)).startsWith(maxPrefix), ti, `row ${r} Max. Score "${maxPrefix}" for ${code}`);
    check(doc.tables[ti].text(r, c).trim() === '', ti, `empty API cell for ${code}`);
    setCell(doc, ti, r, c, v.p44[code]);
  }
  check(norm(doc.tables[30].text(2, 1)) === 'Total', 30, 'Total row');
  setCell(doc, 30, 2, 4, v.p44.total);
}

function fillPartTables(doc, t) {
  const T = doc.tables;
  check(T[0].rows.length === 1 && T[0].rowCells(0).length === 8, 0, 'the 8 date-of-birth boxes');
  Array.from(t.dob_digits || ' '.repeat(8)).forEach((ch, c) => setCell(doc, 0, 0, c, ch.trim()));
  check(norm(T[1].text(0, 0)).startsWith('Sr.'), 1, 'the 19(a) header');
  fillBetween(doc, 1, 1, findRow(doc.tables[1], 0, 'Total periods per week'), t.teaching);
  setCell(doc, 1, findRow(doc.tables[1], 0, 'Total periods per week'), 3, t.total_periods);
  check(norm(T[2].text(0, 0)).startsWith('Sr.'), 2, 'the 19(c) header');
  fillRows(doc, 2, t.assignments, 1);
  check(norm(T[3].text(0, 0)).startsWith('Titleoftheactivity'), 3, 'the 19(d) header');
  fillRows(doc, 3, t.activities, 1);
  check(norm(T[4].text(2, 0)) === '1', 4, 'the column-number row of point 20');
  fillRows(doc, 4, t.results, 3);
  check(norm(T[5].text(0, 0)).startsWith('NameoftheSummer'), 5, 'the 21(ii) header');
  fillRows(doc, 5, t.orientation, 1);
  check(norm(T[6].text(0, 0)).startsWith('Topictitle'), 6, 'the 22 header');
  fillRows(doc, 6, t.research, 1);
  check(norm(T[24].text(0, 0)) === 'S.No.', 24, 'the point 30 header');
  fillRows(doc, 24, t.other_info, 1);
}

function strikeUnchosen(doc, startsWith, options, chosen) {
  for (const p of all(doc.body, 'p')) {
    if (!deepText(p).startsWith(startsWith)) continue;
    const runs = {};
    for (const r of kids(p, 'r')) runs[deepText(r)] = r;
    if (!options.every(o => has(runs, o))) throw new Error(`Template: "${startsWith}" line has no separate runs for ${options}.`);
    for (const o of options) setStrike(runs[o], options.includes(chosen) && o !== chosen);
    return;
  }
  throw new Error(`Template: no line starting with "${startsWith}".`);
}

function replaceTokens(xml, values) {
  const map = Object.entries(values).map(([k, v]) => ['{{' + k + '}}', String(v || '')]);
  const root = xml.documentElement;
  for (const t of all(root, 't')) {
    const txt = t.textContent;
    let out = txt;
    for (const [tok, val] of map) if (out.includes(tok)) out = out.split(tok).join(val);
    if (out !== txt) setText(t, out);
  }
  for (const t of all(root, 't')) {
    if (!t.textContent.includes('\n')) continue;
    const parts = t.textContent.split('\n');
    setText(t, parts[0]);
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    let prev = t;
    for (const part of parts.slice(1)) {
      const br = insertAfter(prev, wEl(xml, 'br'));
      const nt = wEl(xml, 't');
      nt.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      setText(nt, part);
      prev = insertAfter(br, nt);
    }
  }
  for (const p of all(root, 'p')) {
    const full = deepText(p);
    if (!map.some(([tok]) => full.includes(tok))) continue;
    let changed = full;
    for (const [tok, val] of map) if (changed.includes(tok)) changed = changed.split(tok).join(val);
    const texts = all(p, 't');
    if (!texts.length) { const r = p.appendChild(wEl(xml, 'r')); const t = r.appendChild(wEl(xml, 't')); setText(t, changed); continue; }
    setText(texts[0], changed);
    for (const tt of texts.slice(1)) setText(tt, '');
  }
}

function insertEnclosures(doc, data) {
  const selected = (Array.isArray(data.enclosures) ? data.enclosures : [])
    .filter(x => x && typeof x === 'object' && !Array.isArray(x) && (has(x, 'checked') ? x.checked : true))
    .map(x => (x.label === undefined || x.label === null ? 'None' : String(x.label)));
  if (!selected.length) return;
  const at = kids(doc.body, 'p').find(p => paraText(p).trim().startsWith('I certify that the information provided'));
  if (!at) return;
  selected.forEach((label, i) => {
    const p = wEl(doc.xml, 'p');
    at.parentNode.insertBefore(p, at);
    const r = p.appendChild(wEl(doc.xml, 'r'));
    setRunText(r, `☑ ${i + 1}. ${label}`);
    setColor(r, BLUE);
  });
}

// Returns the Word file (Uint8Array). deps: { JSZip, DOMParser, XMLSerializer }.
export async function generateDocx(data, templateBytes, { JSZip, DOMParser, XMLSerializer }) {
  data = obj(data);
  const api = obj(data.api);
  const result = tally(api);
  const problems = [...fieldProblems(data), ...result.problems, ...lastYearProblems(api.lastAcademicYear)];
  if (problems.length) throw new ProblemsError(problems);
  const v = result.values;
  const profile = obj(data.profile);
  const zip = await JSZip.loadAsync(templateBytes);
  const xml = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
  const doc = new Doc(xml);
  fillPartTables(doc, partTables(data));
  strikeUnchosen(doc, 'Appraisal of work and conduct', TITLES, profile.title);
  strikeUnchosen(doc, 'Father/Husband', RELATIONS, profile.relation);
  fillApiTables(doc, api, v);
  replaceTokens(xml, tokenValues(data));
  insertEnclosures(doc, data);
  applyTextStyle(xml, data.style);
  let out = new XMLSerializer().serializeToString(xml);
  if (!out.startsWith('<?xml')) out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
  zip.file('word/document.xml', out);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
