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
