// The complete PDF: the ACR PDF followed by the teacher's enclosure files
// (spec docs/superpowers/specs/2026-10-07-enclosure-files-design.md). No browser code: PDFLib is passed in.

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const PDF_TOOL_MESSAGE = 'The complete PDF could not be made (PDF tool did not load). Check the connection and try again.';
export const MESSAGES = {
  damaged: name => `${name} could not be read as a PDF.`,
  encrypted: name => `${name} is password-protected. Open it and print it to a new PDF, then attach that.`,
  photo: name => `${name} could not be read as a photo.`,
  tooBig: name => `${name} is larger than 10 MB. Attach a smaller copy.`,
};

// The same rule as insertEnclosures in docx_engine.js, so the PDF's numbers are the Word list's numbers.
export const isTicked = e => Boolean(e) && typeof e === 'object' && !Array.isArray(e)
  && (Object.prototype.hasOwnProperty.call(e, 'checked') ? Boolean(e.checked) : true);

export function enclosureNumbers(enclosures) {
  return (Array.isArray(enclosures) ? enclosures : []).filter(isTicked)
    .map((entry, i) => ({ number: i + 1, label: entry.label === undefined || entry.label === null ? 'None' : String(entry.label), entry }));
}

export const sortedFiles = entry => (Array.isArray(entry?.files) ? entry.files : [])
  .filter(f => f && typeof f === 'object' && f.id).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// have(id): is the file in this browser? Ticked enclosures without files keep their number and give no part.
export function pdfParts(enclosures, have) {
  const parts = [], missing = [];
  for (const { number, label, entry } of enclosureNumbers(enclosures)) {
    const files = [];
    for (const f of sortedFiles(entry)) {
      if (have(f.id)) files.push(f);
      else missing.push({ number, label, name: String(f.name || '') });
    }
    if (files.length) parts.push({ number, label, files });
  }
  return { parts, missing };
}

export const missingText = missing => (missing.length
  ? 'Left out (not on this device): ' + missing.map(m => `Enclosure ${m.number} \u2014 ${m.name}`).join(', ') : '');

export const completePdfName = pdfName => String(pdfName).replace(/\.pdf$/i, '') + ' with enclosures.pdf';

// Helvetica (a standard PDF font) can draw only WinAnsi characters.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export const winAnsiSafe = s => [...String(s)].map(c => {
  const n = c.codePointAt(0);
  return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN_ANSI_EXTRA.has(c) ? c : '?';
}).join('');

export const labelText = (number, label) => winAnsiSafe(`Enclosure ${number} \u2014 ${label}`);

// 'ok', 'encrypted' (password-protected) or 'damaged' (cannot be opened).
export async function checkPdf(bytes, PDFLib) {
  try {
    await PDFLib.PDFDocument.load(bytes);
    return 'ok';
  } catch {
    // pdf-lib's built bundle loses its error classes, so ask again ignoring encryption: it opens only if merely locked.
    try { return (await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true })).isEncrypted ? 'encrypted' : 'damaged'; }
    catch { return 'damaged'; }
  }
}

const A4 = [595.28, 841.89];
const MARGIN = 28;

// A photo on an A4 page (landscape when wider than tall), fitted inside the margins, centred, never stretched.
export function photoPlacement(imgW, imgH) {
  const [w, h] = imgW > imgH ? [A4[1], A4[0]] : A4;
  const s = Math.min((w - 2 * MARGIN) / imgW, (h - 2 * MARGIN) / imgH);
  const width = imgW * s, height = imgH * s;
  return { page: [w, h], x: (w - width) / 2, y: (h - height) / 2, width, height };
}

// "Enclosure n — label" at the top left of the page, on a white box so it stays readable on a scan.
function stamp(page, text, font, rgb) {
  const size = 9, pad = 2;
  const box = page.getMediaBox();
  const x = box.x + MARGIN;
  const y = box.y + box.height - 12 - size;   // the text's top is 12 pt below the top edge
  const w = font.widthOfTextAtSize(text, size);
  page.drawRectangle({ x: x - pad, y: y - pad - 2, width: w + 2 * pad, height: size + 2 * pad + 2, color: rgb(1, 1, 1) });
  page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
}

// Does a page show nothing? (Word's "Save as PDF" often ends with a page holding one space.) Careful: anything that
// may draw - a picture, a form, a shading, a path that is painted, a non-blank string, an annotation - counts as shown.
const PAINT = /(?:^|\s)(?:Do|BI|sh|S|s|f|F|f\*|B|B\*|b|b\*)(?=\s|$)/;
const BLANK_BYTES = new Set([0x00, 0x09, 0x0a, 0x0d, 0x20]);

function contentText(doc, page, PDFLib) {
  const c = page.node.Contents();
  if (!c) return '';
  const streams = c instanceof PDFLib.PDFArray ? c.asArray().map(r => doc.context.lookup(r)) : [c];
  return streams.map(st => {
    const bytes = st instanceof PDFLib.PDFRawStream ? PDFLib.decodePDFRawStream(st).decode() : st.getContents();
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return out;
  }).join('\n');
}

// Splits content into code and strings: "(...)" literals (nested, escaped) and "<...>" hex strings (not "<<").
function splitStrings(text) {
  let code = '', blank = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      let depth = 1, j = i + 1, inner = '';
      for (; j < text.length && depth; j++) {
        if (text[j] === '\\') { inner += text[j + 1] || ''; j++; continue; }
        if (text[j] === '(') depth++;
        else if (text[j] === ')' && !--depth) break;
        inner += text[j];
      }
      if (inner.trim()) blank = false;
      code += ' ';
      i = j;
    } else if (ch === '<' && text[i + 1] !== '<' && text[i - 1] !== '<') {
      const j = text.indexOf('>', i);
      const hex = text.slice(i + 1, j < 0 ? text.length : j).replace(/\s/g, '');
      for (let k = 0; k < hex.length; k += 2) if (!BLANK_BYTES.has(parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16))) blank = false;
      code += ' ';
      i = j < 0 ? text.length : j;
    } else code += ch;
  }
  return { code, blank };
}

export function isBlankPage(doc, index, PDFLib) {
  const page = doc.getPage(index);
  if (page.node.Annots()) return false;
  let text;
  try { text = contentText(doc, page, PDFLib); } catch { return false; }
  const { code, blank } = splitStrings(text);
  return blank && !PAINT.test(code);
}

export async function buildCompletePdf({ acrPdf, parts, PDFLib }) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const out = await PDFDocument.create();
  const acr = await PDFDocument.load(acrPdf);
  for (const p of await out.copyPages(acr, acr.getPageIndices())) out.addPage(p);
  const font = await out.embedFont(StandardFonts.Helvetica);
  for (const part of parts) {
    let first = null;
    for (const f of part.files) {
      if (f.type === 'application/pdf') {
        const src = await PDFDocument.load(f.bytes);
        const shown = src.getPageIndices().filter(i => !isBlankPage(src, i, PDFLib));
        for (const p of await out.copyPages(src, shown.length ? shown : src.getPageIndices())) { out.addPage(p); first ??= p; }
      } else {
        const img = await out.embedJpg(f.bytes);
        const at = photoPlacement(img.width, img.height);
        const page = out.addPage(at.page);
        page.drawImage(img, { x: at.x, y: at.y, width: at.width, height: at.height });
        first ??= page;
      }
    }
    if (first) stamp(first, labelText(part.number, part.label), font, rgb);
  }
  return out.save();
}
