/* ===================== APP ===================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/* ---------- storage (localStorage, with graceful degradation) ---------- */
const LS_INDEX = 'acr.index.v1';
const LS_DOC = (id) => 'acr.doc.' + id;
const LS_CUR = 'acr.current.v1';
let memStore = {}, storageOK = true;

/* Which signed-in Google account's workspace is active, e.g. 'acct.<sub>.' — '' means the
   plain, unsigned-in workspace, so a teacher who never signs in gets byte-identical storage
   keys to before this feature existed. Only acr.auth.account (the sign-in marker itself)
   deliberately bypasses this — see auth.js — since it's what decides which namespace to use. */
let ACTIVE_NS = '';
function nsKey(k) { return ACTIVE_NS ? ACTIVE_NS + k : k; }
function lsGet(k) {
  try { return localStorage.getItem(nsKey(k)); } catch (e) { storageOK = false; return memStore[nsKey(k)] ?? null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(nsKey(k), v); } catch (e) { storageOK = false; memStore[nsKey(k)] = v; }
}
function lsDel(k) {
  try { localStorage.removeItem(nsKey(k)); } catch (e) { delete memStore[nsKey(k)]; }
}
/* Raw, never-namespaced storage — used only for the sign-in identity marker
   (auth.js's AUTH_MARKER_KEY), which by definition must be readable before any
   account namespace has been chosen. Everything else uses lsGet/lsSet/lsDel above. */
function gRawGet(k) { try { return localStorage.getItem(k); } catch (e) { return memStore[k] ?? null; } }
function gRawSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { memStore[k] = v; } }
function gRawDel(k) { try { localStorage.removeItem(k); } catch (e) { delete memStore[k]; } }
function loadIndex() { try { return JSON.parse(lsGet(LS_INDEX) || '[]'); } catch (e) { return []; } }
function saveIndex(ix) { lsSet(LS_INDEX, JSON.stringify(ix)); }
function loadDocById(id) { try { return JSON.parse(lsGet(LS_DOC(id))); } catch (e) { return null; } }
/* touch:false writes the record without claiming it was edited. Merges compare
   updatedAt, so merely opening the app must never make this copy look newer
   than a real edit made on the other machine. */
function persist(d, opts) {
  if (!opts || opts.touch !== false) { d.updatedAt = nowISO(); d.touched = true; d.rev = (d.rev || 0) + 1; }
  lsSet(LS_DOC(d.id), JSON.stringify(d));
  const ix = loadIndex().filter((r) => r.id !== d.id);
  ix.unshift({ id: d.id, session: d.session, name: d.p1.fullName, updatedAt: d.updatedAt });
  saveIndex(ix); lsSet(LS_CUR, d.id);
  if (typeof syncSchedule === 'function') syncSchedule();
  if (typeof drivesyncSchedule === 'function') drivesyncSchedule();
}

/* ---------- state ---------- */
const S = { doc: null, section: 'profile', timer: null, dirty: false };

function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) {
  const ks = p.split('.'); let t = o;
  for (let i = 0; i < ks.length - 1; i++) { if (t[ks[i]] == null) t[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; t = t[ks[i]]; }
  t[ks[ks.length - 1]] = v;
}

function markDirty() {
  S.dirty = true;
  const el = $('#saveStatus'); el.textContent = 'Saving…'; el.className = 'status dirty';
  clearTimeout(S.timer);
  S.timer = setTimeout(() => {
    persist(S.doc); S.dirty = false;
    el.textContent = 'Saved · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.className = 'status saved';
    refreshLiveScores();
  }, 400);
}
function saveNow() {
  clearTimeout(S.timer);
  if (S.dirty) { persist(S.doc); S.dirty = false; }
  const el = $('#saveStatus'); el.textContent = 'Saved'; el.className = 'status saved';
}
/* for changes applied straight to S.doc without going through an input event */
function saveNowForced() { S.dirty = true; saveNow(); }

function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), ms || 2600);
}

/* ---------- field helpers ---------- */
function f(path, label, opt) {
  opt = opt || {};
  const v = getPath(S.doc, path) ?? '';
  const cls = 'f' + (opt.wide ? ' wide' : '');
  const hint = opt.hint ? '<small class="hint">' + esc(opt.hint) + '</small>' : '';
  if (opt.type === 'ta') {
    return '<label class="' + cls + '"><span class="lb">' + esc(label) + '</span>' +
      '<textarea data-path="' + path + '" rows="' + (opt.rows || 4) + '" placeholder="' + esc(opt.ph || '') + '">' + esc(v) + '</textarea>' + hint + '</label>';
  }
  if (opt.type === 'select') {
    return '<label class="' + cls + '"><span class="lb">' + esc(label) + '</span><select data-path="' + path + '">' +
      opt.options.map(([val, txt]) => '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(txt) + '</option>').join('') +
      '</select>' + hint + '</label>';
  }
  return '<label class="' + cls + '"><span class="lb">' + esc(label) + '</span>' +
    '<input data-path="' + path + '" type="' + (opt.type || 'text') + '" value="' + esc(v) + '" placeholder="' + esc(opt.ph || '') + '"' +
    (opt.type === 'number' ? ' step="any"' : '') + '>' + hint + '</label>';
}

/* repeatable table editor */
function rep(path, cols, opt) {
  opt = opt || {};
  const rows = getPath(S.doc, path) || [];
  let h = '<div class="tblwrap"><table class="rt"><thead><tr><th style="width:34px">#</th>' +
    cols.map((c) => '<th' + (c.w ? ' style="width:' + c.w + '"' : '') + '>' + esc(c.h) + '</th>').join('') +
    '<th style="width:38px"></th></tr></thead><tbody>';
  if (!rows.length) {
    h += '<tr><td colspan="' + (cols.length + 2) + '" class="emptyrow">' + esc(opt.empty || 'No entries yet.') + '</td></tr>';
  }
  rows.forEach((r, i) => {
    h += '<tr><td class="rowno">' + (i + 1) + '</td>';
    cols.forEach((c) => {
      const p = path + '.' + i + '.' + c.k, v = r[c.k] ?? '';
      if (c.type === 'select') {
        h += '<td><select data-path="' + p + '" data-rerender="1">' + c.options.map(([val, txt]) =>
          '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(txt) + '</option>').join('') + '</select></td>';
      } else if (c.type === 'num') {
        h += '<td class="num"><input data-path="' + p + '" type="text" inputmode="decimal" value="' + esc(v) + '"></td>';
      } else if (c.type === 'txt') {
        h += '<td><input data-path="' + p + '" value="' + esc(v) + '" placeholder="' + esc(c.ph || '') + '"></td>';
      } else {
        h += '<td><textarea data-path="' + p + '" rows="' + (c.rows || 2) + '" placeholder="' + esc(c.ph || '') + '">' + esc(v) + '</textarea></td>';
      }
    });
    h += '<td class="act"><button class="btn sm danger" data-del="' + path + '" data-i="' + i + '" title="Remove row">✕</button></td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="rowtools"><button class="btn sm" data-add="' + path + '" data-tpl="' + esc(JSON.stringify(opt.tpl || {})) + '">+ ' + esc(opt.add || 'Add row') + '</button>';
  if (opt.tools) h += opt.tools;
  h += '</div>';
  return h;
}

/* Category-III block editor with suggested scores */
function c3block(key, title, cols, opt) {
  opt = opt || {};
  const rows = S.doc.s2.c3[key] || [];
  const sug = rows.map((r) => suggested(key, r, S.doc.stream));
  const tot = sumRows(rows, 'score');
  const capped = key === 'Ei' ? Math.min(tot, 30) : tot;
  let h = '<h4 class="sgrp">' + esc(title) + '</h4>';
  h += rep('s2.c3.' + key, cols, {
    tpl: opt.tpl, add: opt.add || 'Add entry', empty: 'NIL — nothing recorded under this head.',
    tools: '<button class="btn sm" data-apply="' + key + '">Apply suggested scores</button>' +
      '<span class="encref" data-sug="' + key + '"></span>'
  });
  h += '<div class="cap" data-cap="c3:' + key + '"></div>';
  return h;
}

/* Cap lines are rewritten by refreshLiveScores() so they stay correct while typing. */
function capHTML(spec) {
  const t = totals(S.doc), [kind, key] = spec.split(':');
  let v, raw, max;
  if (kind === 'c3') {
    raw = sumRows(S.doc.s2.c3[key] || [], 'score');
    max = key === 'Ei' ? 30 : null;
    v = max ? Math.min(raw, max) : raw;
    return 'Sub-total: <b>' + fmt(v) + '</b>' +
      (max && raw > max ? ' <span class="capover">(raw ' + fmt(raw) + ', capped at ' + max + ')</span>' : '');
  }
  const M = {
    'c1:iii': [t.c1.iii, t.c1.iiiRaw, 20], 'c1:iv': [t.c1.iv, t.c1.ivRaw, 25],
    'c2:i': [t.c2.i, t.c2.iRaw, 20], 'c2:ii': [t.c2.ii, t.c2.iiRaw, 15], 'c2:iii': [t.c2.iii, t.c2.iiiRaw, 15]
  }[spec];
  if (!M) return '';
  [v, raw, max] = M;
  return 'Sub-total: <b>' + fmt(v) + '</b> / ' + max +
    (raw > max ? ' <span class="capover">(raw ' + fmt(raw) + ', capped)</span>' : '');
}

const enclOptions = () => (S.doc.enclosures || []).map((e, i) => [String(i + 1), (i + 1) + '. ' + String(e.text).slice(0, 40)]);
const enclCol = () => ({ k: 'encl', h: 'Encl. #', type: 'select', w: '90px', options: [['', '—']].concat(enclOptions()) });

/* ===================== SECTIONS ===================== */
const SECTIONS = [
  ['profile', 'Profile & Part-I'],
  ['teaching', 'Points 17–19'],
  ['results', 'Point 20'],
  ['academic', 'Points 21–25'],
  ['cat1', '26 · Category-I'],
  ['cat2', '27 · Category-II'],
  ['cat3', '28 · Category-III'],
  ['summary', '29 · Summary'],
  ['partb', '30 · Part-B & enclosures'],
  ['years', 'Years & backup'],
  ['help', 'How to use']
];

const PAGES = {
  /* ---------------- Profile ---------------- */
  profile() {
    const d = S.doc;
    return `<div class="card"><h2>College &amp; identity</h2>
      <p class="sub">These carry forward automatically when you start a new year.</p>
      <div class="grid">
        ${f('session', 'Assessment year / session', { ph: '2025-26' })}
        ${f('stream', 'Subject stream (decides project / consultancy score slabs)', { type: 'select', options: [['science', 'Science'], ['arts', 'Arts / Humanities / Social Sciences']] })}
        ${f('college.name', 'Name of the college')}
        ${f('college.district', 'District')}
        ${f('college.pin', 'PIN code')}
        ${f('college.principal', 'Name of the Principal')}
      </div></div>

      <div class="card"><h2>Part-I · Personal data (points 1–16)</h2>
      <div class="grid">
        ${f('p1.fullName', '1. Full name (capitals)')}
        ${f('p1.fatherHusband', '2. Father / Husband name')}
        ${f('p1.empCode', '3. Employee code')}
        ${f('p1.subject', '4. Subject for which appointed')}
        ${f('p1.dateAppointment', '5. Date of appointment (College Cadre)', { ph: 'June 10, 2010' })}
        ${f('p1.designation', '6. Current designation')}
        ${f('p1.payBand', '7. Present pay band with grade pay')}
        ${f('p1.promotion', '8. Date of promotion (if any, past one year)')}
        ${f('p1.qualAcademic', '9(a). Academic qualification')}
        ${f('p1.qualDivision', '9(a). Division')}
        ${f('p1.qualProfessional', '9(b). Professional')}
        ${f('p1.qualResearch', '9(c). Research degree')}
        ${f('p1.dob', '10. Date of birth (DDMMYYYY)', { ph: '30091983', hint: 'Eight digits — printed one per box on the form.' })}
        ${f('p1.dobWords', '10. Date of birth in words')}
        ${f('p1.status', '11. Permanent / Quasi-permanent / Temporary / Contract')}
        ${f('p1.otherAssignment', '14. Any other major assignment in addition to teaching')}
        ${f('p1.deptExamRoll', '13(a). Departmental exam — Roll No.')}
        ${f('p1.deptExamSession', '13(a). Departmental exam — session / date of passing')}
        ${f('p1.hindi', '13(b). Hindi subject — cleared / exempted (details)', { type: 'ta', rows: 3, wide: true })}
        ${f('p1.permAddress', '15. Permanent address (with PIN)', { type: 'ta', rows: 3, wide: true })}
        ${f('p1.landline', '16. Landline telephone No.')}
        ${f('p1.mobile', '16. Mobile No.')}
        ${f('p1.email', '16. Email', { type: 'email' })}
      </div>
      <h3 class="grp">12. Colleges in which served during the year</h3>
      ${rep('p1.served', [{ k: 'name', h: 'College', type: 'txt' }, { k: 'duration', h: 'Duration', type: 'txt' }],
      { tpl: { name: '', duration: '' }, add: 'Add college', empty: 'Add each college with its exact duration.' })}
      </div>

      <div class="card"><h2>Certification block</h2>
      <p class="sub">Printed under your Part-II declaration and under the Principal’s certificate.</p>
      <div class="grid">
        ${f('certify.place', 'Place (yours)')}
        ${f('certify.date', 'Date (yours)', { ph: '29 September 2026' })}
        ${f('certify.designation', 'Your designation as signed')}
        ${f('principalBlock.name', 'Principal’s name')}
        ${f('principalBlock.college', 'Principal’s college line', { wide: true })}
        ${f('principalBlock.place', 'Place (Principal)')}
      </div></div>

      <div class="card"><h2>How answers are printed</h2>
      <p class="sub">Everything you fill in — text, tables, scores — is printed in this colour so it
      stands apart from the form’s own wording. Applies to the preview, the PDF and the Word file.</p>
      <div class="swatches">
        ${[['#1a3a8f', 'Blue'], ['#0b3d2e', 'Dark green'], ['#7a1620', 'Dark red'],
      ['#3b2f7a', 'Indigo'], ['#000000', 'Black']].map(([hex, name]) =>
        '<button class="swatch' + ((S.doc.style.answerColor || '').toLowerCase() === hex ? ' on' : '') +
        '" data-color="' + hex + '" title="' + name + '"><i style="background:' + hex + '"></i>' + name + '</button>').join('')}
      </div>
      <div class="grid" style="margin-top:12px">
        <label class="f"><span class="lb">Or pick any colour</span>
          <input type="color" data-path="style.answerColor" data-rerender="1" value="${esc(S.doc.style.answerColor || '#1a3a8f')}"></label>
        <label class="f"><span class="lb">Weight</span>
          <select data-path="style.answerBold" data-rerender="1">
            <option value="">Normal</option>
            <option value="1" ${S.doc.style.answerBold ? 'selected' : ''}>Semi-bold</option>
          </select></label>
      </div>
      <div class="samplerow" style="--ans:${esc(S.doc.style.answerColor || '#1a3a8f')};--answ:${S.doc.style.answerBold ? '600' : 'inherit'}">
        <span>3. Employee Code</span><b class="av">${esc(S.doc.p1.empCode || '00000')}</b>
      </div>
      <p class="hint">Black prints the answers in the same ink as the form — choose it if your college
      insists on an all-black submission.</p>
      </div>`;
  },

  /* ---------------- 17–19 ---------------- */
  teaching() {
    return `<div class="card"><h2>Points 17 &amp; 18 · Self appraisal</h2>
      <div class="grid one">
        ${f('s1.q17', '17. What do you think has been your most important contribution this year?', { type: 'ta', rows: 6 })}
        ${f('s1.q18', '18. Have you made any contribution in the area of work not assigned to you?', { type: 'ta', rows: 6 })}
      </div></div>

      <div class="card"><h2>19 (a) · Weekly time table (whole academic year)</h2>
      ${rep('s1.q19a', [
      { k: 'cls', h: 'Class / paper' }, { k: 'college', h: 'Name of the college', type: 'txt' },
      { k: 'allocated', h: 'Lectures allocated (per week)', type: 'txt' },
      { k: 'delivered', h: 'Lectures actually delivered', type: 'txt' },
      { k: 'syllabus', h: '% syllabus completed', type: 'txt', w: '110px' }
    ], { tpl: { cls: '', college: '', allocated: '', delivered: '', syllabus: '' }, add: 'Add class' })}
      <div class="grid" style="margin-top:12px">
        ${f('s1.q19aTotal', 'Total periods per week')}
        ${f('s1.q19aNote', 'Note printed beside the total', { ph: 'Note: the practical class is of two hours.' })}
      </div>
      <div class="grid one">${f('s1.q19b', '19 (b). Any special effort made to improve classroom instruction', { type: 'ta', rows: 5 })}</div>
      </div>

      <div class="card"><h2>19 (c) · Assignments and class tests</h2>
      ${rep('s1.q19c', [
      { k: 'cls', h: 'Class' }, { k: 'assignments', h: 'Assignments given', type: 'txt', w: '110px' },
      { k: 'tests', h: 'Class tests given' }, { k: 'remark', h: 'Verifiable record note', rows: 3 }
    ], { tpl: { cls: '', assignments: '', tests: '', remark: '' }, add: 'Add class' })}
      </div>

      <div class="card"><h2>19 (d) · Academic activities organised in the college</h2>
      ${rep('s1.q19d', [{ k: 'title', h: 'Title of the activity', type: 'txt' }, { k: 'detail', h: 'Brief detail', rows: 3 }],
      { tpl: { title: '', detail: '' }, add: 'Add activity' })}
      </div>

      <div class="card"><h2>19 (f) · New books read during the year</h2>
      <p class="sub">The form requires a brief extract of about 50 words per book.</p>
      ${rep('s1.q19f', [
      { k: 'title', h: 'Book title' }, { k: 'author', h: 'Author / editor', type: 'txt' },
      { k: 'publisher', h: 'Publisher', type: 'txt' }, { k: 'pages', h: 'Pages', type: 'txt', w: '80px' },
      { k: 'extract', h: 'Brief extract (~50 words)', rows: 4 }
    ], { tpl: { title: '', author: '', publisher: '', pages: '', extract: '' }, add: 'Add book' })}
      <div class="grid one" style="margin-top:14px">
        ${f('s1.q19g', '19 (g). Vital problems of teaching before you, in order of importance', { type: 'ta', rows: 8, hint: 'One point per line.' })}
      </div></div>`;
  },

  /* ---------------- 20 ---------------- */
  results() {
    return `<div class="card"><h2>Point 20 · Last year’s annual examination results</h2>
      <p class="sub">Serial numbers 19 (a)–(d) and 20 are the entries the Principal personally verifies.</p>
      ${rep('s1.q20', [
      { k: 'cls', h: 'Class' }, { k: 'duration', h: 'Duration taught', type: 'txt', w: '110px' },
      { k: 'appeared', h: 'Appeared', type: 'num', w: '80px' }, { k: 'passed', h: 'Passed', type: 'num', w: '80px' },
      { k: 'collegePct', h: 'College pass %', type: 'txt', w: '95px' }, { k: 'univPct', h: 'University pass %', type: 'txt', w: '110px' },
      { k: 'variation', h: 'Variation (5−6)', type: 'txt', w: '95px' },
      { k: 'd1', h: 'Div. I', type: 'num', w: '70px' }, { k: 'd2', h: 'Div. II', type: 'num', w: '70px' },
      { k: 'd3', h: 'Div. III', type: 'num', w: '70px' }, { k: 'failed', h: 'Failed', type: 'num', w: '70px' },
      { k: 'reason', h: 'Reason for low %, if any' }
    ], { tpl: { cls: '', duration: 'One Session', appeared: '', passed: '', collegePct: '', univPct: 'Not Available', variation: '--', d1: '', d2: '', d3: '', failed: '', reason: '--' }, add: 'Add class result' })}
      </div>`;
  },

  /* ---------------- 21–25 ---------------- */
  academic() {
    return `<div class="card"><h2>21 · Qualifications and courses attended</h2>
      <div class="grid one">${f('s1.q21i', '21 (i). Any degree or fresh academic / professional qualification acquired during the year', { type: 'ta', rows: 4 })}</div>
      <h3 class="grp">21 (ii). Orientation / Refresher Course / Summer School attended</h3>
      ${rep('s1.q21ii', [
      { k: 'name', h: 'Course with sponsoring agency' }, { k: 'place', h: 'Place / ASC', type: 'txt' },
      { k: 'duration', h: 'Duration', type: 'txt' }, { k: 'rc', h: 'RC / OC No. with title', type: 'txt' }
    ], { tpl: { name: '', place: '', duration: '', rc: '' }, add: 'Add course' })}
      </div>

      <div class="card"><h2>22 · Research work</h2>
      <div class="grid one">${f('s1.q22', 'Are you doing any research work? (short answer)', { type: 'ta', rows: 2 })}</div>
      ${rep('s1.q22rows', [
      { k: 'topic', h: 'Topic / title of research project' }, { k: 'univ', h: 'University / institution registered with', type: 'txt' },
      { k: 'nature', h: 'Nature (Minor / Major / Doctoral / Post-Doctoral)', type: 'txt' }, { k: 'status', h: 'Present status', type: 'txt' }
    ], { tpl: { topic: '', univ: '', nature: '', status: '' }, add: 'Add project' })}
      </div>

      <div class="card"><h2>23 – 25</h2>
      <div class="grid one">
        ${f('s1.q23', '23. Honour, prize or award received during the year', { type: 'ta', rows: 3 })}
        ${f('s1.q24', '24. Are you satisfied with your present position / pay?', { type: 'ta', rows: 2 })}
        ${f('s1.q24b', '24. If not, do you want to change the profession? Give reasons.', { type: 'ta', rows: 3 })}
        ${f('s1.q25', '25. Any other significant point not covered above', { type: 'ta', rows: 4 })}
      </div></div>`;
  },

  /* ---------------- 26 ---------------- */
  cat1() {
    const t = totals(S.doc);
    return `<div class="card"><h2>26 · Category-I — Teaching, learning and evaluation</h2>
      <p class="sub">Maximum 125. Minimum required 75.</p>
      <h3 class="grp">(i) Lectures, seminars, tutorials, practicals, contact hours</h3>
      ${rep('s2.c1.rows', [
      { k: 'course', h: 'Course / paper' }, { k: 'level', h: 'Level', type: 'txt', w: '110px' },
      { k: 'mode', h: 'Mode of teaching', rows: 3 },
      { k: 'allotted', h: 'Classes / week allotted', type: 'txt', w: '110px' },
      { k: 'conducted', h: 'Classes conducted', type: 'num', w: '100px' },
      { k: 'pct', h: '% taken', type: 'num', w: '80px' }
    ], { tpl: { course: '', level: '', mode: '', allotted: '', conducted: '', pct: '100' }, add: 'Add course' })}
      <div class="grid" style="margin-top:12px">
        ${f('s2.c1.scoreA', '(a) Classes taken — API score (max 50)', { type: 'text' })}
        ${f('s2.c1.scoreB', '(b) Teaching load in excess of UGC norm (max 10)', { type: 'text' })}
      </div>
      <div class="cap" data-autoa></div>

      <h3 class="grp">(ii) Reading / instructional material and additional resources</h3>
      ${rep('s2.c1.ii.rows', [
      { k: 'course', h: 'Course / paper' }, { k: 'consulted', h: 'Consulted', rows: 3 },
      { k: 'prescribed', h: 'Prescribed', rows: 2 }, { k: 'additional', h: 'Additional resource provided', rows: 2 }
    ], { tpl: { course: '', consulted: '', prescribed: '', additional: '' }, add: 'Add course' })}
      <div class="grid" style="margin-top:12px">
        ${f('s2.c1.ii.note', 'Footnote printed under the table', { type: 'ta', rows: 3, wide: true })}
        ${f('s2.c1.ii.score', 'API score (max 20)', { type: 'text' })}
      </div>

      <h3 class="grp">(iii) Participatory and innovative teaching-learning methodologies</h3>
      ${rep('s2.c1.iii.rows', [{ k: 'desc', h: 'Short description', rows: 3 }, { k: 'score', h: 'API score', type: 'num', w: '90px' }],
      { tpl: { desc: '', score: '' }, add: 'Add item' })}
      <div class="cap" data-cap="c1:iii"></div>

      <h3 class="grp">(iv) Examination duties assigned and performed</h3>
      ${rep('s2.c1.iv.rows', [
      { k: 'type', h: 'Type of examination duty', rows: 2 }, { k: 'assigned', h: 'Duties assigned', type: 'txt', w: '130px' },
      { k: 'extent', h: 'Extent carried out (%)', type: 'txt', w: '110px' }, { k: 'score', h: 'API score', type: 'num', w: '90px' }
    ], { tpl: { type: '', assigned: '', extent: '100%', score: '' }, add: 'Add duty' })}
      <div class="cap" data-cap="c1:iv"></div>

      <div class="scorebar" id="c1bar"></div></div>`;
  },

  /* ---------------- 27 ---------------- */
  cat2() {
    const t = totals(S.doc);
    const tbl = (p, colB) => rep(p, [
      { k: 'activity', h: 'Activity / contribution', rows: 3 },
      { k: 'hours', h: colB, type: 'txt', w: '170px' },
      { k: 'score', h: 'API score', type: 'num', w: '90px' }
    ], { tpl: { activity: '', hours: '', score: '' }, add: 'Add activity' });
    return `<div class="card"><h2>27 · Category-II — Co-curricular, extension, professional development</h2>
      <p class="sub">Sub-maxima 20 / 15 / 15. The official annual total for this category is capped at 25.</p>
      <h3 class="grp">(i) Extension, co-curricular and field-based activities <small class="hint">(max 20)</small></h3>
      ${tbl('s2.c2.i', 'Average hours / week')}
      <div class="cap" data-cap="c2:i"></div>

      <h3 class="grp">(ii) Contribution to corporate life and management of the institution <small class="hint">(max 15)</small></h3>
      ${tbl('s2.c2.ii', 'Yearly / semester-wise responsibility')}
      <div class="cap" data-cap="c2:ii"></div>

      <h3 class="grp">(iii) Professional development activities <small class="hint">(max 15)</small></h3>
      ${tbl('s2.c2.iii', 'Details')}
      <div class="cap" data-cap="c2:iii"></div>

      <div class="scorebar" id="c2bar"></div></div>`;
  },

  /* ---------------- 28 ---------------- */
  cat3() {
    const t = totals(S.doc);
    const A = [
      { k: 'title', h: 'Title with page nos.', rows: 2 }, { k: 'journal', h: 'Journal', type: 'txt' },
      { k: 'issn', h: 'ISSN / ISBN', type: 'txt', w: '110px' },
      { k: 'kind', h: 'Type', type: 'select', w: '150px', options: [['refereed', 'Refereed (15)'], ['recognized', 'Recognised / reputed (10)']] },
      { k: 'impact', h: 'Impact factor', type: 'txt', w: '90px' },
      { k: 'authors', h: 'No. of authors', type: 'num', w: '85px' },
      { k: 'main', h: 'Main author?', type: 'select', w: '95px', options: [['yes', 'Yes'], ['no', 'No']] },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ];
    return `<div class="card"><h2>28 · Category-III — Research, publications and academic contributions</h2>
      <p class="sub">Enter the facts; press <b>Apply suggested scores</b> to fill the API column from the UGC 2010 Table-I rules, then adjust if your committee reads a rule differently. Joint work is shared 60 % to the main author and 40 % among the rest.</p>

      ${c3block('A', 'A · Published papers in journals', A, { tpl: { title: '', journal: '', issn: '', kind: 'refereed', impact: '', authors: '1', main: 'yes', score: '', encl: '' }, add: 'Add paper' })}

      ${c3block('Bi', 'B (i) · Articles / chapters published in books', [
      { k: 'title', h: 'Title with page nos.', rows: 2 }, { k: 'book', h: 'Book title, editor & publisher', rows: 2 },
      { k: 'issn', h: 'ISSN / ISBN', type: 'txt', w: '110px' },
      { k: 'kind', h: 'Publisher', type: 'select', w: '160px', options: [['international', 'International (10)'], ['national', 'National / Indian (5)']] },
      { k: 'authors', h: 'No. of authors', type: 'num', w: '85px' },
      { k: 'main', h: 'Main author?', type: 'select', w: '95px', options: [['yes', 'Yes'], ['no', 'No']] },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', book: '', issn: '', kind: 'national', authors: '1', main: 'yes', score: '', encl: '' }, add: 'Add chapter' })}

      ${c3block('Bii', 'B (ii) · Full papers in conference proceedings', [
      { k: 'title', h: 'Title with page nos.', rows: 2 }, { k: 'conf', h: 'Details of conference publication', rows: 2 },
      { k: 'issn', h: 'ISSN / ISBN', type: 'txt', w: '110px' },
      { k: 'authors', h: 'No. of authors', type: 'num', w: '85px' },
      { k: 'main', h: 'Main author?', type: 'select', w: '95px', options: [['yes', 'Yes'], ['no', 'No']] },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', conf: '', issn: '', authors: '1', main: 'yes', score: '', encl: '' }, add: 'Add proceeding' })}

      ${c3block('Biii', 'B (iii) · Books published as single / co-author or as editor', [
      { k: 'title', h: 'Title with page nos.', rows: 2 },
      { k: 'kind', h: 'Type', type: 'select', w: '210px', options: [['intl_sole', 'International — sole/co-author (50)'], ['intl_chapter', 'International — chapter (10)'], ['natl_sole', 'National — sole/co-author (25)'], ['natl_chapter', 'National — chapter (5)'], ['local_sole', 'Local — sole/co-author (15)'], ['local_chapter', 'Local — chapter (3)']] },
      { k: 'publisher', h: 'Publisher & ISSN/ISBN', rows: 2 }, { k: 'peer', h: 'Peer reviewed?', type: 'txt', w: '110px' },
      { k: 'authors', h: 'No. of authors', type: 'num', w: '85px' },
      { k: 'main', h: 'Main author?', type: 'select', w: '95px', options: [['yes', 'Yes'], ['no', 'No']] },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', kind: 'natl_sole', publisher: '', peer: '', authors: '1', main: 'yes', score: '', encl: '' }, add: 'Add book' })}

      ${c3block('Ci', 'C (i) · Ongoing sponsored projects', [
      { k: 'title', h: 'Title', rows: 2 }, { k: 'agency', h: 'Agency', type: 'txt' },
      { k: 'period', h: 'Period', type: 'txt', w: '120px' },
      { k: 'amount', h: 'Amount (Rs. lakh)', type: 'num', w: '120px' },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', agency: '', period: '', amount: '', score: '', encl: '' }, add: 'Add project' })}

      ${c3block('Cii', 'C (ii) · Consultancy projects', [
      { k: 'title', h: 'Title', rows: 2 }, { k: 'agency', h: 'Agency', type: 'txt' },
      { k: 'period', h: 'Period', type: 'txt', w: '120px' },
      { k: 'amount', h: 'Amount mobilised (Rs. lakh)', type: 'num', w: '140px' },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', agency: '', period: '', amount: '', score: '', encl: '' }, add: 'Add consultancy' })}

      ${c3block('Ciii', 'C (iii) · Completed projects', [
      { k: 'title', h: 'Title', rows: 2 }, { k: 'agency', h: 'Agency', type: 'txt' },
      { k: 'period', h: 'Period', type: 'txt', w: '120px' }, { k: 'amount', h: 'Amount (Rs. lakh)', type: 'num', w: '120px' },
      { k: 'kind', h: 'Size', type: 'select', w: '130px', options: [['major', 'Major (20)'], ['minor', 'Minor (10)']] },
      { k: 'outcome', h: 'Policy document / patent as outcome', type: 'txt' },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', agency: '', period: '', amount: '', kind: 'minor', outcome: '', score: '', encl: '' }, add: 'Add completed project' })}

      ${c3block('Civ', 'C (iv) · Project outcome / outputs (patent, technology transfer, policy document)', [
      { k: 'title', h: 'Details of output', rows: 2 },
      { k: 'kind', h: 'Level', type: 'select', w: '160px', options: [['national', 'National (30)'], ['international', 'International (50)']] },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', kind: 'national', score: '', encl: '' }, add: 'Add output' })}

      ${c3block('D', 'D · Research guidance', [
      { k: 'kind', h: 'Particulars', type: 'select', w: '200px', options: [['mphil_awarded', 'M.Phil. — awarded (3)'], ['phd_awarded', 'Ph.D. — awarded (10)'], ['phd_submitted', 'Ph.D. — thesis submitted (7)']] },
      { k: 'count', h: 'Number', type: 'num', w: '90px' }, { k: 'detail', h: 'Candidate / details', rows: 2 },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { kind: 'phd_awarded', count: '1', detail: '', score: '', encl: '' }, add: 'Add candidate' })}

      ${c3block('Ei', 'E (i) · Training courses / FDPs (not less than one week) — capped at 30', [
      { k: 'programme', h: 'Programme', rows: 3 }, { k: 'duration', h: 'Duration (dates)', type: 'txt', w: '150px' },
      { k: 'weeks', h: 'Length', type: 'select', w: '170px', options: [['one', 'One week (10)'], ['two', 'Two weeks or more (20)']] },
      { k: 'by', h: 'Organised by', rows: 3 },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { programme: '', duration: '', weeks: 'one', by: '', score: '', encl: '' }, add: 'Add programme' })}

      ${c3block('Eii', 'E (ii) · Papers presented in conferences / seminars / workshops', [
      { k: 'title', h: 'Title of the paper presented', rows: 3 }, { k: 'conf', h: 'Title of conference / seminar', rows: 3 },
      { k: 'by', h: 'Organised by (with dates)', rows: 3 },
      { k: 'level', h: 'Level', type: 'select', w: '175px', options: [['international', 'International (10)'], ['national', 'National (7.5)'], ['state', 'Regional / State (5)'], ['local', 'College / University (3)']] },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', conf: '', by: '', level: 'national', score: '', encl: '' }, add: 'Add paper presented' })}

      ${c3block('Eiii', 'E (iii) · Invited lectures and chairmanships', [
      { k: 'title', h: 'Title of lecture / academic session', rows: 3 }, { k: 'conf', h: 'Title of conference / seminar', rows: 3 },
      { k: 'by', h: 'Organised by (with dates)', rows: 3 },
      { k: 'level', h: 'Level', type: 'select', w: '160px', options: [['international', 'International (10)'], ['national', 'National (5)']] },
      { k: 'score', h: 'API score', type: 'num', w: '85px' }, enclCol()
    ], { tpl: { title: '', conf: '', by: '', level: 'national', score: '', encl: '' }, add: 'Add invited lecture' })}

      <div class="scorebar" id="c3bar"></div></div>`;
  },

  /* ---------------- 29 ---------------- */
  summary() {
    const t = totals(S.doc);
    const row = (lab, lastKey, val, ovKey, req) =>
      `<tr><td>${lab}</td>
        <td><input data-path="s2.lastYear.${lastKey}" value="${esc(S.doc.s2.lastYear[lastKey] ?? '')}" placeholder="—"></td>
        <td style="text-align:right;font-weight:600">${fmt(val)}</td>
        <td><input data-path="s2.override.${ovKey}" value="${esc((S.doc.s2.override || {})[ovKey] ?? '')}" placeholder="auto"></td>
        <td class="encref">${req}</td></tr>`;
    return `<div class="card"><h2>29 · Summary of API scores</h2>
      <p class="sub">Computed from your entries. The “Reported” column overrides the computed value in the printed form — use it only when your college asks you to report a different figure.</p>
      <div class="tblwrap"><table class="rt">
        <thead><tr><th>Criteria</th><th style="width:130px">Last academic year</th><th style="width:110px">Computed</th><th style="width:120px">Reported (override)</th><th>Minimum required</th></tr></thead>
        <tbody>
          ${row('I — Teaching, learning and evaluation (max 125)', 'c1', t.c1.total, 'c1', '75')}
          ${row('II — Co-curricular, extension, professional development (max 25)', 'c2', t.c2.total, 'c2', '15')}
          ${row('III — Research and academic contribution', 'c3', t.c3.total, 'c3', '5 – 20 per year depending on stage')}
        </tbody>
      </table></div>
      <div class="scorebar" id="sumbar"></div>
      <div class="notice">Total of Categories I + II must be at least <b>100</b> per year. You are reporting
        <b>${fmt(t.c1.final + t.c2.final)}</b>.</div>
      </div>`;
  },

  /* ---------------- 30 + enclosures ---------------- */
  partb() {
    return `<div class="card"><h2>30 · Part-B — Other relevant information</h2>
      <p class="sub">Any other credential, significant contribution or award not mentioned earlier.</p>
      ${rep('partB', [{ k: 'text', h: 'Details', rows: 3 }], { tpl: { text: '' }, add: 'Add entry' })}
      </div>

      <div class="card"><h2>List of enclosures</h2>
      <p class="sub">Numbered automatically. The numbers appear in the “Encl. #” column of the Category-III tables, so your evidence is cross-referenced in the printed form.</p>
      ${rep('enclosures', [{ k: 'text', h: 'Enclosure', rows: 3 }], { tpl: { text: '' }, add: 'Add enclosure' })}
      <div class="notice">${(S.doc.enclosures || []).length} enclosure(s) listed. Attach them in this order.</div>
      </div>`;
  },

  /* ---------------- archive ---------------- */
  years() {
    const ix = loadIndex();
    const acctStatus = !authAvailable()
      ? '<div class="notice">' + (location.protocol === 'file:'
          ? 'Sign in needs the hosted version of this app — open it from its web address rather than this downloaded file.'
          : 'Sign-in is not configured for this deployment yet.') + '</div>'
      : AUTH.state === 'signed-in'
        ? '<p class="hint">Signed in as <b>' + esc(AUTH.account.email) + '</b>. ' +
          (DRIVESYNC.status === 'idle' ? 'Everything is synced.' :
           DRIVESYNC.status === 'syncing' ? 'Syncing now…' :
           DRIVESYNC.status === 'attention' ? 'Sync needs attention — try signing in again.' :
           'Offline — your work is saved on this device and will sync once you’re back online.') + '</p>' +
          '<div class="rowtools"><button class="btn" id="authArea2" data-auth-action="signOut">Sign out</button>' +
          '<button class="btn" id="syncNowDrive">Sync now</button></div>'
        : '<div class="rowtools"><button class="btn primary" id="authArea2" data-auth-action="signIn">Sign in with Google</button></div>';
    const accountCard = `<div class="card"><h2>Account &amp; cloud sync</h2>
      <p class="sub">Sign in with your Google account to keep every year backed up and available on your other devices, automatically.</p>
      ${acctStatus}</div>`;
    return accountCard + `<div class="card"><h2>Years on this device</h2>
      <p class="sub">Each year is stored separately in this browser. Nothing leaves the device.</p>
      <div class="yearlist">
        ${ix.map((r) => `<div class="yearrow ${r.id === S.doc.id ? 'cur' : ''}">
          <div class="yl"><b>${esc(r.session || 'Untitled session')}</b>
            <span>${esc(r.name || '')} · last saved ${new Date(r.updatedAt).toLocaleString()}</span></div>
          ${r.id === S.doc.id ? '<span class="encref">open</span>'
        : '<button class="btn sm" data-open="' + r.id + '">Open</button>'}
          <button class="btn sm" data-clone="${r.id}">Start next year from this</button>
          <button class="btn sm danger" data-drop="${r.id}">Delete</button>
        </div>`).join('') || '<p class="hint">No saved years yet.</p>'}
      </div>
      <div class="rowtools" style="margin-top:14px">
        <button class="btn" id="newBlank">New blank ACR</button>
        <button class="btn" id="newFromCurrent">New year from the open ACR</button>
      </div></div>

      <div class="card"><h2>Backup &amp; transfer</h2>
      <p class="sub">One file holds every year. Use it to move between your laptop and your phone, or to keep a safety copy in Drive.</p>
      <div class="rowtools">
        <button class="btn primary" id="expAll">Export backup (.acrbak.json)</button>
        <button class="btn" id="expOne">Export this year only</button>
        <button class="btn" id="impBtn">Import a backup</button>
        <input type="file" id="impFile" accept=".json,.acrbak,.acrbak.json" style="display:none">
      </div>
      <p class="hint" id="storageNote"></p>
      </div>

      <div class="card"><h2>Advanced: keep two computers in step without a Google account</h2>
      <p class="sub">Most teachers should use Sign in with Google above instead — this is for anyone who would
      rather not use a Google account. Point this device at one file inside your Google Drive or OneDrive folder.
      Every save is written into it, and every time you open the utility it reads the file back
      and takes whichever version of each year was edited most recently.</p>
      <div class="rowtools">
        <button class="btn primary" id="syncNew">Create a sync file…</button>
        <button class="btn" id="syncOpen">Link an existing one…</button>
        <button class="btn" id="syncNow">Sync now</button>
        <button class="btn danger" id="syncOff">Unlink</button>
      </div>
      <div id="syncNote"></div>
      <div class="notice">Do it once on each computer, choosing <b>the same file</b> — create it on the
      first machine, then use <b>Link an existing one</b> on the second. Give Drive a moment to finish
      uploading before you open the utility on the other machine.<br><br>
      Phones are not covered: neither Android nor iPhone gives a browser a real folder to write into.
      From a phone, use <b>Export backup</b> above and import it on the computer.<br><br>
      Deleting a year removes it from this device only — it will come back at the next sync if the
      file still holds it. Delete it on both, or delete it and then press <b>Sync now</b> before the
      other machine starts.</div>
      </div>`;
  },

  /* ---------------- help ---------------- */
  help() {
    return `<div class="card"><h2>How to use this utility</h2>
      <h3 class="grp">Where your data lives</h3>
      <p>Everything is saved inside this browser on this device, the moment you stop typing. There is no server,
      no account and no internet requirement. Closing the tab, the browser or the whole device is safe — reopen the
      file and you continue exactly where you left off.</p>
      <div class="notice">Because the data lives in the browser, clearing “site data” or “browsing data” will erase it.
      Export a backup from <b>Years &amp; backup</b> after a long working session.</div>

      <h3 class="grp">Filling it in over several sittings</h3>
      <p>Work in any order. The left-hand list (or the drop-down on a phone) moves between parts of the form.
      Points 17–30 are yours; Part-III and Part-IV belong to the Principal and the committee and are printed blank.</p>

      <h3 class="grp">Preview, Word and PDF</h3>
      <p><b>Preview</b> shows the finished ACR exactly as it will print, page by page.</p>
      <p><b>Word (.docx)</b> downloads an editable document — open it in Word, Google Docs, WPS or the mobile Word app
      if you need to fine-tune anything before printing.</p>
      <p><b>PDF</b> opens your device’s print dialog from the preview:</p>
      <ul>
        <li><b>Windows:</b> choose <span class="kbd">Microsoft Print to PDF</span> or <span class="kbd">Save as PDF</span>.</li>
        <li><b>Android:</b> in the print sheet choose <span class="kbd">Save as PDF</span>.</li>
        <li><b>iPhone / iPad:</b> the print preview appears — pinch it outwards, then use the share button to save the PDF.</li>
      </ul>
      <p>Set paper to A4 and margins to <i>Default</i>. Turn <b>off</b> “Headers and footers” in the browser print options —
      the form prints its own footer.</p>

      <h3 class="grp">Moving between devices</h3>
      <p>Export a backup on one device, put the file in Drive / WhatsApp / email, and import it on the other.
      Import adds or updates years; it never deletes what is already there.</p>

      <h3 class="grp">About the API scores</h3>
      <p>Scores are a self-assessment computed from the UGC 2010 Appendix-III Table-I rules, with the caps the form
      states: Category-I 50 / 10 / 20 / 20 / 25 (total 125), Category-II 20 / 15 / 15 (annual total 25),
      Category-III per-item rates with training capped at 30. Joint work is shared 60 % to the main author and 40 %
      among the remaining authors. Every figure remains editable — the competent committee verifies the final score.</p>

      <h3 class="grp">About</h3>
      <p>Utility developed by: Dr. Prince Thakur (Assistant Professor Botany).</p>
      </div>`;
  }
};

/* ---------- live score bars ---------- */
function bar(id, items) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = items.map((i) => '<div class="s ' + (i.cls || '') + '"><b>' + i.v + '</b><span>' + esc(i.k) + '</span></div>').join('');
}
function refreshLiveScores() {
  const t = totals(S.doc);
  bar('c1bar', [
    { k: '(a) classes', v: fmt(t.c1.a) }, { k: '(b) excess load', v: fmt(t.c1.b) },
    { k: '(ii) resources', v: fmt(t.c1.ii) }, { k: '(iii) innovation', v: fmt(t.c1.iii) },
    { k: '(iv) examination', v: fmt(t.c1.iv) },
    { k: 'Category I / 125', v: fmt(t.c1.total), cls: t.c1.total >= 75 ? 'okv' : 'warnv' }
  ]);
  bar('c2bar', [
    { k: '(i) extension', v: fmt(t.c2.i) }, { k: '(ii) corporate life', v: fmt(t.c2.ii) },
    { k: '(iii) professional', v: fmt(t.c2.iii) },
    { k: 'Category II / 25', v: fmt(t.c2.total), cls: t.c2.total >= 15 ? 'okv' : 'warnv' }
  ]);
  bar('c3bar', [
    { k: 'papers + books', v: fmt(t.c3.blocks.A + t.c3.blocks.Bi + t.c3.blocks.Bii + t.c3.blocks.Biii) },
    { k: 'projects', v: fmt(t.c3.blocks.Ci + t.c3.blocks.Cii + t.c3.blocks.Ciii + t.c3.blocks.Civ) },
    { k: 'guidance', v: fmt(t.c3.blocks.D) },
    { k: 'training (cap 30)', v: fmt(t.c3.training) },
    { k: 'conferences + lectures', v: fmt(t.c3.blocks.Eii + t.c3.blocks.Eiii) },
    { k: 'Category III', v: fmt(t.c3.total), cls: 'okv' }
  ]);
  bar('sumbar', [
    { k: 'Category I', v: fmt(t.c1.final), cls: t.c1.final >= 75 ? 'okv' : 'warnv' },
    { k: 'Category II', v: fmt(t.c2.final), cls: t.c2.final >= 15 ? 'okv' : 'warnv' },
    { k: 'I + II (min 100)', v: fmt(t.c1.final + t.c2.final), cls: t.c1.final + t.c2.final >= 100 ? 'okv' : 'warnv' },
    { k: 'Category III', v: fmt(t.c3.final) }
  ]);
  $$('[data-cap]').forEach((el) => { el.innerHTML = capHTML(el.dataset.cap); });
  $$('[data-sug]').forEach((el) => {
    const k = el.dataset.sug, rows = S.doc.s2.c3[k] || [];
    el.textContent = rows.length
      ? 'Rule suggests: ' + rows.map((r) => fmt(suggested(k, r, S.doc.stream))).join(' · ')
      : '';
  });
  const auto = $('[data-autoa]');
  if (auto) auto.textContent = 'Average of the “% taken” column is ' + fmt(t.c1.avg) +
    '% → the rule gives ' + fmt(t.c1.autoA) + '. Leave the box blank to use that figure.';
  const sn = $('#storageNote');
  if (sn) sn.textContent = storageOK
    ? 'Storage: this browser’s local storage. Working normally.'
    : 'Warning — this browser is blocking local storage (private mode?). Your work is only held in memory. Export a backup before closing the tab.';
}

/* ---------- render ---------- */
function renderNav() {
  $('#nav').innerHTML = '<div class="navhead">Your part of the ACR</div>' +
    SECTIONS.slice(0, 9).map(([k, t]) => '<a data-sec="' + k + '" class="' + (S.section === k ? 'active' : '') + '">' + esc(t) + '</a>').join('') +
    '<hr>' + SECTIONS.slice(9).map(([k, t]) => '<a data-sec="' + k + '" class="' + (S.section === k ? 'active' : '') + '">' + esc(t) + '</a>').join('');
  $('#mobsel').innerHTML = SECTIONS.map(([k, t]) => '<option value="' + k + '"' + (S.section === k ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
}
/* Previous / Next along the order of the form, so the whole ACR can be
   worked through without going back to the section list each time. */
function stepNav() {
  const i = SECTIONS.findIndex(([k]) => k === S.section);
  const prev = i > 0 ? SECTIONS[i - 1] : null;
  const next = i > -1 && i < SECTIONS.length - 1 ? SECTIONS[i + 1] : null;
  const btn = (s, dir) => s
    ? '<button class="btn stepbtn" data-sec="' + s[0] + '">' +
      (dir === 'prev' ? '<span class="ar">←</span>' : '') +
      '<span class="lbl"><small>' + (dir === 'prev' ? 'Previous' : 'Next') + '</small>' + esc(s[1]) + '</span>' +
      (dir === 'next' ? '<span class="ar">→</span>' : '') + '</button>'
    : '<span></span>';
  return '<nav class="stepnav">' + btn(prev, 'prev') +
    '<span class="stepcount">' + (i + 1) + ' of ' + SECTIONS.length + '</span>' +
    btn(next, 'next') + '</nav>';
}

function render() {
  renderNav();
  $('#main').innerHTML = PAGES[S.section]() + stepNav();
  refreshLiveScores();
  renderSessionSelect();
  if (typeof syncPaint === 'function') syncPaint();
  if (typeof authPaint === 'function') authPaint();
  if (typeof drivesyncPaint === 'function') drivesyncPaint();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------- Google sign-in status control ---------- */
function authPaint() {
  const el = $('#authArea'); if (!el) return;
  if (location.protocol === 'file:') { el.textContent = ''; el.style.display = 'none'; return; }
  if (!authAvailable()) { el.textContent = 'Sign-in not configured'; el.style.display = ''; el.dataset.authAction = ''; return; }
  el.style.display = '';
  if (AUTH.state === 'signed-in' && AUTH.account) {
    el.textContent = 'Signed in as ' + AUTH.account.email + ' · Sign out';
    el.dataset.authAction = 'signOut';
  } else if (AUTH.state === 'signing-in') {
    el.textContent = 'Signing in…';
    el.dataset.authAction = '';
  } else {
    el.textContent = 'Sign in with Google';
    el.dataset.authAction = 'signIn';
  }
}
if (typeof onAuthChange === 'function') onAuthChange(authPaint);
function step(delta) {
  const i = SECTIONS.findIndex(([k]) => k === S.section) + delta;
  if (i < 0 || i >= SECTIONS.length) return;
  S.section = SECTIONS[i][0]; render();
}
function renderSessionSelect() {
  const ix = loadIndex();
  $('#sessionSel').innerHTML = ix.map((r) =>
    '<option value="' + r.id + '"' + (r.id === S.doc.id ? ' selected' : '') + '>' +
    esc(r.session || 'Untitled') + ' — ' + esc((r.name || '').split(' ')[0] || '') + '</option>').join('');
}

/* ---------- document actions ---------- */
function docMeta() {
  const st = S.doc.style || {};
  return {
    left: 'ACR ' + (S.doc.session || ''),
    right: S.doc.p1.fullName || '',
    title: 'ACR ' + (S.doc.session || '') + ' — ' + (S.doc.p1.fullName || ''),
    author: S.doc.p1.fullName || 'Teacher',
    answerColor: st.answerColor || '#1a3a8f',
    answerBold: !!st.answerBold
  };
}
function openPreview() {
  saveNow();
  $('#pvContent').innerHTML = renderHTML(buildDoc(S.doc), docMeta());
  $('#previewOverlay').classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closePreview() { $('#previewOverlay').classList.remove('on'); document.body.style.overflow = ''; }

function fileBase() {
  const n = (S.doc.p1.fullName || 'ACR').replace(/[^\w]+/g, '_');
  const s = (S.doc.session || 'draft').replace(/[^\w-]+/g, '');
  return 'ACR_' + s + '_' + n;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
}
function downloadDocx() {
  saveNow();
  try {
    const blob = buildDocx(buildDoc(S.doc), docMeta());
    saveBlob(blob, fileBase() + '.docx');
    toast('Word file downloaded.');
  } catch (e) { toast('Could not build the Word file: ' + e.message, 5000); }
}
function doPrint() {
  if (!$('#previewOverlay').classList.contains('on')) openPreview();
  setTimeout(() => window.print(), 350);
}

/* ---------- backup ---------- */
function exportAll() {
  const ix = loadIndex();
  const docs = ix.map((r) => loadDocById(r.id)).filter(Boolean);
  const pack = { kind: 'acr-backup', version: 1, exportedAt: nowISO(), docs };
  saveBlob(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }),
    'ACR_backup_' + new Date().toISOString().slice(0, 10) + '.acrbak.json');
  toast(docs.length + ' year(s) exported.');
}
function exportOne() {
  const pack = { kind: 'acr-backup', version: 1, exportedAt: nowISO(), docs: [S.doc] };
  saveBlob(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }), fileBase() + '.acrbak.json');
}
async function importFile(file) {
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const docs = raw.kind === 'acr-backup' ? raw.docs : (raw.schemaVersion ? [raw] : null);
    if (!docs) throw new Error('Not an ACR backup file.');
    let n = 0;
    docs.forEach((d) => { if (d && d.id) { persist(migrate(d)); n++; } });
    toast(n + ' year(s) imported.');
    render();
  } catch (e) { toast('Import failed: ' + e.message, 5000); }
}

/* ---------- schema migration ---------- */
function migrate(d) {
  const base = blankDoc(d.session);
  const merge = (a, b) => {
    Object.keys(a).forEach((k) => {
      if (b[k] === undefined || b[k] === null) return;
      if (Array.isArray(a[k])) a[k] = Array.isArray(b[k]) ? b[k] : a[k];
      else if (typeof a[k] === 'object') merge(a[k], b[k]);
      else a[k] = b[k];
    });
    return a;
  };
  const out = merge(base, d);
  out.id = d.id || uid();
  out.schemaVersion = SCHEMA_VERSION;
  /* records written before the flag existed hold real work — never treat them
     as a pristine starter year that a merge may discard */
  out.touched = d.touched === undefined ? true : !!d.touched;
  return out;
}

/* ---------- events ---------- */
function bindGlobal() {
  document.addEventListener('input', (e) => {
    const p = e.target.dataset && e.target.dataset.path;
    if (!p) return;
    setPath(S.doc, p, e.target.value);
    markDirty();
  });
  document.addEventListener('change', (e) => {
    const p = e.target.dataset && e.target.dataset.path;
    if (p && e.target.dataset.rerender) { setPath(S.doc, p, e.target.value); saveNowForced(); render(); return; }
    if (p) { setPath(S.doc, p, e.target.value); markDirty(); }
    if (e.target.id === 'impFile') importFile(e.target.files[0]);
    if (e.target.id === 'mobsel') { S.section = e.target.value; render(); }
    if (e.target.id === 'sessionSel') openDoc(e.target.value);
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, a[data-sec]');
    if (!b) return;
    const ds = b.dataset;

    if (ds.sec) { S.section = ds.sec; render(); return; }
    if (ds.color) { S.doc.style.answerColor = ds.color; saveNowForced(); render(); return; }
    if (ds.add) {
      const arr = getPath(S.doc, ds.add) || [];
      arr.push(JSON.parse(ds.tpl || '{}'));
      setPath(S.doc, ds.add, arr); saveNow(); render(); return;
    }
    if (ds.del) {
      const arr = getPath(S.doc, ds.del) || [];
      arr.splice(+ds.i, 1); saveNow(); render(); return;
    }
    if (ds.apply) {
      const rows = S.doc.s2.c3[ds.apply] || [];
      rows.forEach((r) => { r.score = fmt(suggested(ds.apply, r, S.doc.stream)); });
      saveNow(); render(); toast('Suggested scores applied to ' + rows.length + ' row(s).'); return;
    }
    if (ds.open) { openDoc(ds.open); return; }
    if (ds.clone) {
      const src = loadDocById(ds.clone); if (!src) return;
      const next = prompt('Session for the new ACR (e.g. 2025-26):', nextSession(src.session));
      if (next === null) return;
      const nd = cloneForNewYear(migrate(src), next.trim());
      persist(nd); S.doc = nd; S.section = 'profile'; render();
      toast('New year created. Identity and college details carried over.'); return;
    }
    if (ds.drop) {
      if (!confirm('Delete this year permanently from this device? Export a backup first if unsure.')) return;
      lsDel(LS_DOC(ds.drop));
      saveIndex(loadIndex().filter((r) => r.id !== ds.drop));
      if (S.doc.id === ds.drop) { const ix = loadIndex(); S.doc = ix.length ? migrate(loadDocById(ix[0].id)) : blankDoc(''); persist(S.doc); }
      render(); toast('Deleted.'); return;
    }

    switch (b.id) {
      case 'btnPreview': case 'btnPreview2': openPreview(); break;
      case 'btnClosePv': closePreview(); break;
      case 'btnDocx': case 'btnDocx2': downloadDocx(); break;
      case 'btnPdf': case 'btnPdf2': doPrint(); break;
      case 'btnSave': saveNow(); toast('Saved on this device.'); break;
      case 'authArea': case 'authArea2':
        if (b.dataset.authAction === 'signIn') authSignIn().catch((e) => toast(e.message, 5000));
        else if (b.dataset.authAction === 'signOut') authSignOut();
        break;
      case 'syncNowDrive': if (typeof drivesyncRun === 'function') drivesyncRun(); break;
      case 'expAll': exportAll(); if (typeof drivesyncExportBackup === 'function') drivesyncExportBackup(); break;
      case 'expOne': exportOne(); break;
      case 'impBtn': $('#impFile').click(); break;
      case 'syncNew': syncLink('save'); break;
      case 'syncOpen': syncLink('open'); break;
      case 'syncNow': (async () => {
        if (!SYNC.handle) { toast('Link a sync file first.'); return; }
        if ((await syncPermission(true)) !== 'granted') { toast('Permission was not granted.'); return; }
        SYNC.state = 'linked'; await syncRun(true);
      })(); break;
      case 'syncOff': syncUnlink(); break;
      case 'syncStatus':
        if (SYNC.state === 'needs-permission' || SYNC.state === 'error') {
          (async () => {
            if ((await syncPermission(true)) === 'granted') { SYNC.state = 'linked'; await syncRun(true); }
          })();
        }
        break;
      case 'newBlank': {
        const s = prompt('Session for the new blank ACR (e.g. 2025-26):', ''); if (s === null) return;
        const nd = blankDoc(s.trim()); persist(nd); S.doc = nd; S.section = 'profile'; render(); break;
      }
      case 'newFromCurrent': {
        const s = prompt('Session for the new ACR:', nextSession(S.doc.session)); if (s === null) return;
        const nd = cloneForNewYear(S.doc, s.trim()); persist(nd); S.doc = nd; S.section = 'profile'; render();
        toast('New year created.'); break;
      }
    }
  });

  window.addEventListener('beforeunload', () => { if (S.dirty) saveNow(); });
  /* last chance to push before the tab is backgrounded or closed */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (S.dirty) saveNow();
      if (typeof SYNC !== 'undefined' && SYNC.handle && SYNC.state === 'linked') { clearTimeout(SYNC.timer); syncRun(false); }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('Saved.'); }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''));
    if (e.altKey && !typing && e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.altKey && !typing && e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
}

function nextSession(s) {
  const m = String(s || '').match(/^(\d{4})\s*[-–/]\s*(\d{2,4})$/);
  if (!m) return '';
  const a = +m[1] + 1, b = String(+m[2] + 1).padStart(m[2].length, '0');
  return a + '-' + b;
}
function openDoc(id) {
  const d = loadDocById(id); if (!d) return;
  S.doc = migrate(d); lsSet(LS_CUR, id); S.section = 'profile'; render();
}

/* ---------- workspace loading (shared by boot and account switching) ---------- */
function loadActiveDoc() {
  const ix = loadIndex();
  const curId = lsGet(LS_CUR);
  let d = null;
  if (curId) d = loadDocById(curId);
  if (!d && ix.length) d = loadDocById(ix[0].id);
  if (!d) d = blankDoc('');
  return migrate(d);
}
/* Called whenever the active account namespace changes (sign-in, sign-out, switch account)
   so the screen reflects that account's own years rather than the previous namespace's. */
function reloadWorkspace() {
  S.doc = loadActiveDoc();
  persist(S.doc, { touch: false });
  S.section = 'profile';
  render();
}

/* ---------- boot ---------- */
(function boot() {
  S.doc = loadActiveDoc();
  persist(S.doc, { touch: false });
  bindGlobal();
  if (typeof authBoot === 'function') authBoot();
  render();
  if (!storageOK) toast('This browser is blocking local storage. Export a backup before you close the tab.', 6000);
  syncBoot();
})();
