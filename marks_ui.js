// B / I / x² buttons for answer boxes: they put **bold**, *italic* or ^superscript^ marks around the selected words,
// which the Word file prints as real formatting (inline_marks in acr_fields).
export const MARK_BUTTONS = [['**', 'B', 'Bold'], ['*', 'I', 'Italic'], ['^', 'x²', 'Superscript']];

// Wrap the selection [start, end) of value in mark; with nothing selected, insert an empty pair with the cursor inside.
// Spaces at the edges of the selection stay outside the marks (a mark with a space just inside it does not count).
export function wrapSelection(value, start, end, mark) {
  let a = start, b = end;
  while (a < b && /\s/.test(value[a])) a++;
  while (b > a && /\s/.test(value[b - 1])) b--;
  const inner = value.slice(a, b);
  if (inner.startsWith(mark) && inner.endsWith(mark) && inner.length > 2 * mark.length) {
    const plain = inner.slice(mark.length, -mark.length);   // pressed again: take the marks off
    return { value: value.slice(0, a) + plain + value.slice(b), start: a, end: a + plain.length };
  }
  const out = value.slice(0, a) + mark + inner + mark + value.slice(b);
  return { value: out, start: a + mark.length, end: a + mark.length + inner.length };
}

export function initMarks(root) {
  const bar = document.createElement('div');
  bar.className = 'mark-bar hidden';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Text formatting');
  for (const [mark, label, title] of MARK_BUTTONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = `${title}: select words, then press`;
    b.dataset.mark = mark;
    bar.appendChild(b);
  }
  const hint = document.createElement('span');
  hint.className = 'mark-hint';
  hint.textContent = 'Select words, then B / I / x². Shown as **bold**, *italic*, ^sup^ here; printed formatted in Word.';
  bar.appendChild(hint);
  let box = null;
  root.addEventListener('focusin', e => {
    const t = e.target;
    if (!(t instanceof HTMLTextAreaElement) || !t.matches('[data-marks]')) return;
    box = t;
    t.parentNode.insertBefore(bar, t);
    bar.classList.remove('hidden');
  });
  root.addEventListener('focusout', e => {
    if (e.relatedTarget && bar.contains(e.relatedTarget)) return;
    setTimeout(() => { if (!bar.contains(document.activeElement) && document.activeElement !== box) bar.classList.add('hidden'); }, 150);
  });
  // mousedown keeps the selection in the box; the click does the work (also for touch and keyboard)
  bar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !box) return;
    const r = wrapSelection(box.value, box.selectionStart, box.selectionEnd, b.dataset.mark);
    box.value = r.value;
    box.focus();
    box.setSelectionRange(r.start, r.end);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
