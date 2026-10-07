// The files attached to one ticked enclosure on the Enclosures tab, and the list arithmetic behind it.
import { enclosureNumbers, sortedFiles } from './enclosure_pdf.js';

export const WARN_BYTES = 20 * 1024 * 1024;
export const MISSING_NOTE = 'This file is on another device — attach it again, or turn on Keep my draft in Google Drive.';

export const formatSize = n => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function sizeSummary(enclosures) {
  const files = enclosureNumbers(enclosures).flatMap(({ entry }) => sortedFiles(entry));
  if (!files.length) return { text: '', warn: '' };
  const bytes = files.reduce((s, x) => s + (Number(x.size) || 0), 0);
  return {
    text: `${files.length} file${files.length === 1 ? '' : 's'}, ${formatSize(bytes)} attached`,
    warn: bytes > WARN_BYTES ? 'Email may refuse a file this large; saving to Google Drive still works.' : '',
  };
}

const renumber = list => list.map((x, i) => ({ ...x, order: i }));
export const addFiles = (entry, metas) => renumber([...sortedFiles(entry), ...metas]);
export const removeFile = (entry, id) => renumber(sortedFiles(entry).filter(x => x.id !== id));
export function moveFile(entry, id, dir) {
  const list = sortedFiles(entry);
  const i = list.findIndex(x => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return renumber(list);
  [list[i], list[j]] = [list[j], list[i]];
  return renumber(list);
}

function button(doc, text, cls, onClick) {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// The attach button and the file list for one ticked enclosure.
export function fileBlock(doc, { entry, have, canStore, onAttach, onMove, onRemove }) {
  const box = doc.createElement('div');
  box.className = 'encl-files';
  const files = sortedFiles(entry);
  files.forEach((x, i) => {
    const row = doc.createElement('div');
    row.className = 'encl-file';
    const name = doc.createElement('span');
    name.textContent = `${x.name} (${formatSize(Number(x.size) || 0)})`;
    row.appendChild(name);
    if (!have.has(x.id)) {
      const note = doc.createElement('span');
      note.className = 'encl-missing';
      note.textContent = MISSING_NOTE;
      row.appendChild(note);
    }
    if (i > 0) row.appendChild(button(doc, '↑', 'secondary', () => onMove(x.id, -1)));
    if (i < files.length - 1) row.appendChild(button(doc, '↓', 'secondary', () => onMove(x.id, 1)));
    row.appendChild(button(doc, 'Remove', 'danger', () => onRemove(x.id)));
    box.appendChild(row);
  });
  const input = doc.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';
  input.className = 'hidden';
  input.addEventListener('change', () => { if (input.files && input.files.length) onAttach(input.files); input.value = ''; });
  const attach = button(doc, 'Attach PDF / photo', 'secondary', () => input.click());
  attach.disabled = !canStore;
  box.append(attach, input);
  return box;
}
