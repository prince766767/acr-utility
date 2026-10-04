/* ===================== HTML RENDERER (preview + print/PDF) ===================== */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
/* keep the leading spaces that indent sub-items such as "  (b) Professional" */
const keepIndent = (s) => esc(s).replace(/^ +/, (m) => '&nbsp;'.repeat(m.length));
const ALIGN = { l: 'left', c: 'center', r: 'right' };

/* isAns: a cell holds something the teacher entered, so it is tinted with the
   chosen answer colour and stands apart from the printed form text. */
function cellHTML(c, tag, isAns) {
  const o = (typeof c === 'object' && c !== null) ? c : { text: c };
  const at = [];
  if (o.span) at.push('colspan="' + o.span + '"');
  if (o.rspan) at.push('rowspan="' + o.rspan + '"');
  const ans = o.a !== undefined ? o.a : !!isAns;
  const st = [];
  if (o.align) st.push('text-align:' + ALIGN[o.align]);
  if (o.bold) st.push('font-weight:bold');
  if (o.italic) st.push('font-style:italic');
  if (st.length) at.push('style="' + st.join(';') + '"');
  if (ans && String(o.text ?? '').trim()) at.push('class="av"');
  const txt = nl2br(o.text ?? '');
  return '<' + tag + ' ' + at.join(' ') + '>' + (txt || '&nbsp;') + '</' + tag + '>';
}

function tableHTML(b) {
  const tiny = b.o.tiny ? ' style="font-size:8.5pt"' : '';
  let h = '<table class="f"' + tiny + '>';
  if (b.cols && b.cols.length) {
    h += '<colgroup>' + b.cols.map((w) => '<col style="width:' + w + '%">').join('') + '</colgroup>';
  }
  if (b.head && b.head.length) {
    h += '<thead>' + b.head.map((r) => '<tr>' + r.map((c) => cellHTML(c, 'th')).join('') + '</tr>').join('') + '</thead>';
  }
  h += '<tbody>';
  const n = b.rows.length;
  b.rows.forEach((r, i) => {
    const isTot = b.o.totLast && i === n - 1;
    h += '<tr' + (isTot ? ' class="tot"' : '') + '>' +
      r.map((c) => cellHTML(c, 'td', b.o.ansBody)).join('') + '</tr>';
  });
  if (!n) h += '<tr><td colspan="' + (b.cols ? b.cols.length : 1) + '" class="blankcell">&nbsp;</td></tr>';
  h += '</tbody></table>';
  /* the wrapper only scrolls on small screens (see the screen media query);
     in print it is an inert block so rows still break across pages */
  return '<div class="tblscroll">' + h + '</div>';
}

function blockHTML(b) {
  switch (b.t) {
    case 'p': {
      const st = [];
      if (b.o.align) st.push('text-align:' + ALIGN[b.o.align]);
      if (b.o.bold) st.push('font-weight:bold');
      if (b.o.italic) st.push('font-style:italic');
      if (b.o.size) st.push('font-size:' + b.o.size + 'pt');
      st.push('margin:4pt 0');
      return '<p class="' + (b.o.ans ? 'av' : '') + '" style="' + st.join(';') + '">' + nl2br(b.text) + '</p>';
    }
    case 'banner':
      return '<div class="banner">' + b.lines.map((l) => {
        if (!l.text) return '<div style="height:' + (l.size || 6) + 'pt"></div>';
        const st = ['margin:1pt 0'];
        if (l.bold) st.push('font-weight:bold');
        if (l.italic) st.push('font-style:italic');
        if (l.size) st.push('font-size:' + l.size + 'pt');
        return '<div style="' + st.join(';') + '">' + esc(l.text) + '</div>';
      }).join('') + '</div>';
    case 'parthead':
      return '<div class="parthead">' + esc(b.text) +
        (b.sub ? '<div style="font-size:10pt;font-weight:normal;margin-top:2pt">' + esc(b.sub) + '</div>' : '') + '</div>';
    case 'sechead': return '<div class="sechead">' + esc(b.text) + '</div>';
    case 'q': return '<div class="qn">' + esc(b.n) + '.&nbsp; ' + esc(b.text) + '</div>';
    case 'ans': {
      const empty = String(b.text || '').trim() === '';
      return '<div class="ans' + (empty ? ' blank' : ' av') + '">' + (empty ? '&nbsp;' : nl2br(b.text)) + '</div>';
    }
    case 'kv':
      return '<dl class="kv">' + b.rows.map(([k, v]) => {
        const filled = String(v ?? '').trim() !== '';
        return '<dt>' + keepIndent(k) + '</dt><dd class="' + (filled ? 'plain av' : '') + '">' +
          (filled ? nl2br(v) : '&nbsp;') + '</dd>';
      }).join('') + '</dl>';
    case 'dob':
      return '<div class="dobrow">' +
        '<span class="dlab">' + esc(b.label) + '</span>' +
        '<table class="dobbox"><tr>' + ['D', 'D', 'M', 'M', 'Y', 'Y', 'Y', 'Y']
          .map((x) => '<th>' + x + '</th>').join('') + '</tr><tr>' +
        b.digits.map((x) => '<td class="av">' + esc(x || '') + '</td>').join('') + '</tr></table>' +
        '<span class="dwords">In words&nbsp; <span class="av">' + esc(b.words || '') + '</span></span>' +
        '</div>';
    case 'table': return tableHTML(b);
    case 'ol': return '<ol class="enc" start="' + b.start + '">' + b.items.map((i) => '<li>' + nl2br(i) + '</li>').join('') + '</ol>';
    case 'sig':
      return '<div class="sig"><div class="b">' + b.left.map(esc).join('<br>') +
        '</div><div class="b r">' + b.right.map(esc).join('<br>') + '</div></div>';
    case 'rule': return '<hr class="rule">';
    case 'box': return '<div class="fillbox ' + (b.h === 'tall' ? 'tall' : b.h === 'short' ? 'short' : '') + '"></div>';
    case 'choices': return '<div class="choices">' + b.items.map((i) => '<div>' + esc(i) + '</div>').join('') + '</div>';
    case 'sp': return '<div style="height:' + b.h + 'pt"></div>';
    default: return '';
  }
}

/* Split on page-break markers; each part becomes its own A4 sheet.
   A part that overruns A4 simply grows and continues onto the next printed
   page — exactly what the browser will do, so preview matches print. */
function renderHTML(blocks, meta) {
  const styleVars = 'style="--ans:' + (meta.answerColor || '#1a3a8f') + ';' +
    '--answ:' + (meta.answerBold ? '600' : 'inherit') + '"';
  const pages = [[]];
  blocks.forEach((b) => { if (b.t === 'pb') pages.push([]); else pages[pages.length - 1].push(b); });
  let label = '';
  return pages.map((pg, pi) => {
    const ph = pg.find((b) => b.t === 'parthead');
    if (ph) label = ph.text.replace(/\s+·.*$/, '');
    const foot = '<div class="foot"><span>' + esc(meta.left) + '</span><span>' + esc(meta.right) +
      '</span><span>' + esc(label) + '</span></div>';
    return '<div class="doc' + (pi === pages.length - 1 ? ' lastdoc' : '') + '" ' + styleVars + '>' +
      pg.map(blockHTML).join('') + foot + '</div>';
  }).join('') +
    /* out-of-flow running footer used only when printing, so it can never
       push content onto an extra sheet the way an in-flow footer would */
    '<div id="printfoot"><span>' + esc(meta.left) + '</span><span>' + esc(meta.right) + '</span></div>';
}
