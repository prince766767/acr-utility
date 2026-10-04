/* ===================== .DOCX WRITER (no dependencies) =====================
   Builds a real OOXML package in the browser: a stored (uncompressed) ZIP
   containing WordprocessingML. Opens in Word, LibreOffice, Google Docs,
   WPS and the Android/iOS Word apps.
=========================================================================== */

/* ---------- tiny ZIP (store method) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() / 2)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  files.forEach(({ name, data }) => {
    const nameBuf = enc.encode(name);
    const body = typeof data === 'string' ? enc.encode(data) : data;
    const crc = crc32(body);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, body.length, true);
    lh.setUint16(26, nameBuf.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameBuf, body);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, body.length, true);
    ch.setUint16(28, nameBuf.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameBuf);
    offset += 30 + nameBuf.length + body.length;
  });

  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true); eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
  const all = parts.concat(central, [new Uint8Array(eocd.buffer)]);
  const total = all.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0; all.forEach((a) => { out.set(a, p); p += a.length; });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------- WordprocessingML helpers ---------- */
const X = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const CW = 10318;                    // usable width in twips (A4 minus 14 mm margins)
const BASE = 21;                     // 10.5 pt, in half-points
const HEADFILL = 'E8EEF4';

/* Answer runs are tinted with the colour chosen in the app. DOCX wants a bare
   RRGGBB hex, so strip any leading '#'. */
let ANSWER_COLOR = '1A3A8F', ANSWER_BOLD = false;
function setAnswerStyle(hex, bold) {
  ANSWER_COLOR = String(hex || '#1A3A8F').replace('#', '').toUpperCase().slice(0, 6) || '1A3A8F';
  ANSWER_BOLD = !!bold;
}

function runs(text, r) {
  r = r || {};
  const bold = r.bold || (r.ans && ANSWER_BOLD);
  const rpr = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
    (bold ? '<w:b/>' : '') + (r.italic ? '<w:i/>' : '') +
    (r.ans ? '<w:color w:val="' + ANSWER_COLOR + '"/>' : '') +
    '<w:sz w:val="' + (r.size ? Math.round(r.size * 2) : BASE) + '"/>' +
    '<w:szCs w:val="' + (r.size ? Math.round(r.size * 2) : BASE) + '"/></w:rPr>';
  const lines = String(text ?? '').split('\n');
  return lines.map((ln, i) =>
    '<w:r>' + rpr + (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + X(ln) + '</w:t></w:r>').join('');
}
function para(text, o) {
  o = o || {};
  let ppr = '<w:pPr>';
  if (o.border) {
    ppr += '<w:pBdr>';
    if (o.border === 'left') ppr += '<w:left w:val="single" w:sz="12" w:space="6" w:color="9AA9B8"/>';
    if (o.border === 'bottom') ppr += '<w:bottom w:val="single" w:sz="12" w:space="2" w:color="000000"/>';
    if (o.border === 'dot') ppr += '<w:bottom w:val="dotted" w:sz="6" w:space="1" w:color="555555"/>';
    ppr += '</w:pBdr>';
  }
  if (o.fill) ppr += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>';
  ppr += '<w:spacing w:before="' + (o.before ?? 40) + '" w:after="' + (o.after ?? 40) + '" w:line="240" w:lineRule="auto"/>';
  if (o.indent) ppr += '<w:ind w:left="' + o.indent + '"/>';
  if (o.align) ppr += '<w:jc w:val="' + ({ l: 'left', c: 'center', r: 'right' }[o.align] || o.align) + '"/>';
  ppr += '</w:pPr>';
  return '<w:p>' + ppr + runs(text, o) + '</w:p>';
}
const emptyPara = (pt) => '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="' +
  Math.max(2, Math.round((pt || 6) * 2)) + '"/></w:rPr></w:pPr></w:p>';
const pageBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

function gridify(cols, headRows, bodyRows) {
  const W = cols.length, out = [];
  const carry = new Array(W).fill(0), carryW = new Array(W).fill(1);
  const all = (headRows || []).map((r) => ({ cells: r, head: true }))
    .concat((bodyRows || []).map((r) => ({ cells: r, head: false })));
  all.forEach((ro) => {
    const row = []; let ci = 0, src = 0;
    while (ci < W) {
      if (carry[ci] > 0) {
        const sp = carryW[ci];
        row.push({ text: '', vmerge: 'cont', span: sp, _col: ci, head: ro.head });
        for (let k = 0; k < sp && ci + k < W; k++) carry[ci + k]--;
        ci += sp; continue;
      }
      const c = ro.cells[src++];
      if (c === undefined) { row.push({ text: '', span: 1, _col: ci, head: ro.head }); ci++; continue; }
      const o = (typeof c === 'object' && c !== null) ? Object.assign({}, c) : { text: c };
      const sp = o.span || 1;
      if (o.rspan && o.rspan > 1) {
        o.vmerge = 'restart';
        for (let k = 0; k < sp && ci + k < W; k++) { carry[ci + k] = o.rspan - 1; carryW[ci + k] = sp; }
      }
      o.span = sp; o._col = ci; o.head = ro.head;
      row.push(o); ci += sp;
    }
    out.push(row);
  });
  return out;
}

function tableXML(cols, headRows, bodyRows, opt) {
  opt = opt || {};
  const widths = cols.map((p) => Math.round((p / 100) * CW));
  const bd = opt.noBorder
    ? '<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>'
    : '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => '<w:' + s + ' w:val="single" w:sz="6" w:space="0" w:color="000000"/>').join('') + '</w:tblBorders>';
  let x = '<w:tbl><w:tblPr><w:tblW w:w="' + CW + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' + bd +
    '<w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="60" w:type="dxa"/>' +
    '<w:bottom w:w="30" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    '<w:tblGrid>' + widths.map((w) => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';

  const grid = gridify(cols, headRows, bodyRows);
  const nHead = (headRows || []).length;
  const nBody = (bodyRows || []).length;
  grid.forEach((row, ri) => {
    const isHead = ri < nHead;
    const isTot = opt.totLast && ri === nHead + nBody - 1;
    x += '<w:tr><w:trPr><w:cantSplit/>' + (isHead ? '<w:tblHeader/>' : '') +
      (opt.rowHeight ? '<w:trHeight w:val="' + opt.rowHeight + '"/>' : '') + '</w:trPr>';
    row.forEach((c) => {
      let w = 0;
      for (let k = 0; k < c.span; k++) w += widths[c._col + k] || 0;
      let tcpr = '<w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>';
      if (c.span > 1) tcpr += '<w:gridSpan w:val="' + c.span + '"/>';
      if (c.vmerge) tcpr += '<w:vMerge' + (c.vmerge === 'restart' ? ' w:val="restart"' : '') + '/>';
      if (c.underline) tcpr += '<w:tcBorders><w:bottom w:val="dotted" w:sz="6" w:space="0" w:color="555555"/></w:tcBorders>';
      const fill = isHead ? HEADFILL : (isTot ? 'F2F4F7' : (c.fill || null));
      if (fill) tcpr += '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>';
      tcpr += '<w:vAlign w:val="top"/></w:tcPr>';
      const align = c.align || (isHead ? 'c' : 'l');
      const ans = c.a !== undefined ? c.a : (!isHead && !!opt.ansBody);
      x += '<w:tc>' + tcpr + para(c.text, {
        bold: !!(c.bold || isHead || isTot), italic: !!c.italic, align, ans: ans && !isHead,
        size: opt.tiny ? 8.5 : (c.size || 9.5), before: 20, after: 20
      }) + '</w:tc>';
    });
    x += '</w:tr>';
  });
  return x + '</w:tbl>' + emptyPara(4);
}

function blockDOCX(b) {
  switch (b.t) {
    case 'p': return para(b.text, { bold: b.o.bold, italic: b.o.italic, size: b.o.size, align: b.o.align, ans: b.o.ans });
    case 'dob': {
      /* label | eight fixed 300-twip boxes | "In words …" — a nested table so
         the strip keeps its own narrow width instead of filling the page */
      const cell = (t, head) =>
        '<w:tc><w:tcPr><w:tcW w:w="300" w:type="dxa"/>' +
        (head ? '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>' : '') +
        '<w:vAlign w:val="center"/></w:tcPr>' +
        para(t, { align: 'c', size: head ? 9.5 : 11, before: 0, after: 0, ans: !head }) + '</w:tc>';
      const strip =
        '<w:tbl><w:tblPr><w:tblW w:w="2400" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
        '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
          .map((s) => '<w:' + s + ' w:val="single" w:sz="6" w:space="0" w:color="000000"/>').join('') +
        '</w:tblBorders><w:tblCellMar><w:top w:w="10" w:type="dxa"/><w:left w:w="10" w:type="dxa"/>' +
        '<w:bottom w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
        '<w:tblGrid>' + '<w:gridCol w:w="300"/>'.repeat(8) + '</w:tblGrid>' +
        '<w:tr>' + ['D', 'D', 'M', 'M', 'Y', 'Y', 'Y', 'Y'].map((t) => cell(t, true)).join('') + '</w:tr>' +
        '<w:tr>' + b.digits.map((t) => cell(t, false)).join('') + '</w:tr></w:tbl>' + emptyPara(2);
      const outerCell = (w, inner) =>
        '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>' + inner + '</w:tc>';
      return '<w:tbl><w:tblPr><w:tblW w:w="' + CW + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
        '<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/>' +
        '<w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>' +
        '<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
        '<w:tblGrid><w:gridCol w:w="2050"/><w:gridCol w:w="2450"/><w:gridCol w:w="' + (CW - 4500) + '"/></w:tblGrid>' +
        '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
        outerCell(2050, para(b.label, { bold: true, before: 60, after: 60 })) +
        outerCell(2450, strip) +
        outerCell(CW - 4500, para('In words   ' + (b.words || ''), { before: 60, after: 60, ans: true, size: 10 })) +
        '</w:tr></w:tbl>' + emptyPara(4);
    }
    case 'banner':
      return tableXML([100], [], [[{
        text: b.lines.filter((l) => l.text).map((l) => l.text).join('\n'), align: 'c', bold: true
      }]], { noBorder: false }).replace(/<w:sz w:val="19"\/>/g, '<w:sz w:val="24"/>');
    case 'parthead':
      return tableXML([100], [], [[{
        text: b.text + (b.sub ? '\n' + b.sub : ''), align: 'c', bold: true, fill: HEADFILL, size: 11.5
      }]], {});
    case 'sechead': return para(b.text, { bold: true, size: 11.5, border: 'bottom' });
    case 'q': return para(b.n + '.  ' + b.text, { bold: true, before: 120 });
    case 'ans': {
      const empty = String(b.text || '').trim() === '';
      return para(empty ? ' ' : b.text, { border: 'left', indent: 120, after: 120, ans: !empty }) +
        (empty ? emptyPara(14) : '');
    }
    case 'kv':
      /* empty values get a dotted rule so the sheet can be completed by hand */
      return tableXML([44, 56], [], b.rows.map(([k, v]) => {
        const filled = String(v ?? '').trim() !== '';
        return [{ text: k, size: 10, a: false }, { text: filled ? v : ' ', size: 10, underline: !filled, a: filled }];
      }), { noBorder: true });
    case 'table': return tableXML(b.cols, b.head, b.rows, b.o);
    case 'ol': return b.items.map((it, i) => para((b.start + i) + '.  ' + it, { indent: 240 })).join('');
    case 'sig':
      return tableXML([50, 50], [], [[
        { text: b.left.join('\n'), size: 10 }, { text: b.right.join('\n'), size: 10 }
      ]], { noBorder: true });
    case 'rule': return para(' ', { border: 'bottom', size: 2 });
    case 'box':
      return tableXML([100], [], [[{ text: ' ' }]],
        { rowHeight: b.h === 'tall' ? 2200 : b.h === 'short' ? 700 : 1300 });
    case 'choices': return b.items.map((i) => para(i, { indent: 300, before: 10, after: 10, size: 10 })).join('');
    case 'sp': return emptyPara(b.h);
    case 'pb': return pageBreak();
    default: return '';
  }
}

function buildDocx(blocks, meta) {
  setAnswerStyle(meta.answerColor, meta.answerBold);
  const body = blocks.map(blockDOCX).join('');
  const sect = '<w:sectPr><w:footerReference w:type="default" r:id="rId10"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="794" w:right="794" w:bottom="794" w:left="794" w:header="397" w:footer="397" w:gutter="0"/>' +
    '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>';
  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:body>' + body + sect + '</w:body></w:document>';

  const footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="2" w:color="999999"/></w:pBdr>' +
    '<w:tabs><w:tab w:val="right" w:pos="10318"/></w:tabs><w:jc w:val="left"/></w:pPr>' +
    '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="16"/><w:color w:val="555555"/></w:rPr>' +
    '<w:t xml:space="preserve">' + X(meta.left + '   ·   ' + meta.right) + '</w:t></w:r>' +
    '<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:tab/></w:r>' +
    '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="16"/><w:color w:val="555555"/></w:rPr><w:t>Page </w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>' +
    '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="16"/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>' +
    '</w:p></w:ftr>';

  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
    '<w:sz w:val="' + BASE + '"/><w:szCs w:val="' + BASE + '"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '</w:styles>';

  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';

  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>';

  const drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
    '</Relationships>';

  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + X(meta.title) + '</dc:title><dc:creator>' + X(meta.author) + '</dc:creator>' +
    '<cp:lastModifiedBy>' + X(meta.author) + '</cp:lastModifiedBy>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().slice(0, 19) + 'Z</dcterms:created>' +
    '</cp:coreProperties>';

  return zipStore([
    { name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: rels },
    { name: 'docProps/core.xml', data: core },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: drels },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/footer1.xml', data: footer }
  ]);
}
