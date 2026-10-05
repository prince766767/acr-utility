// docx-preview draws every floating Word table (w:tblpPr) as a CSS left float, so the text after a wide one is
// squeezed into the strip beside it (point 19(b) next to the 19(a) table). Word only wraps text beside a floating
// table when there is room, so a wide one has the text below it. Preview only: the Word file is not changed.
const WRAP_ROOM = 0.5;   // a table wider than this share of the column leaves no room for text beside it

export function unfloatWideTables(root, getStyle = getComputedStyle) {
  for (const t of root.querySelectorAll('table')) {
    if (t.style.float !== 'left') continue;
    const col = t.parentElement, cs = getStyle(col);
    const width = col.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (t.getBoundingClientRect().width <= width * WRAP_ROOM) continue;
    t.style.float = 'none';
    t.style.marginLeft = 'auto';
    t.style.marginRight = 'auto';
  }
}

// Word draws paragraphs that follow each other with the same borders as one box (the page 11 "not satisfied"
// box, the answer boxes); docx-preview borders each paragraph, so a box shows a line under every paragraph.
const sides = p => p.style.borderLeft + '|' + p.style.borderRight;   // the top is changed as the box is joined
export function joinBorderedParagraphs(root) {
  for (const p of root.querySelectorAll('p')) {
    const next = p.nextElementSibling;
    if (!p.style.borderLeft || !next || next.tagName !== 'P' || sides(next) !== sides(p)) continue;
    p.style.borderBottom = 'none';
    next.style.borderTop = 'none';
  }
}

// docx-preview draws a tab as a fixed-width space and ignores tab stops. Page 11's signature lines (style
// "Signature Column", tools/fix_template_page11_layout.py) reach their column with a tab, so the text after
// each tab is moved to that column here, as Word does. Other tabs are left as they are.
const COLUMN_PT = 7000 / 20;   // the column, from the left margin
export function alignSignatureColumn(root, sectionOf = p => p.closest('section'), getStyle = getComputedStyle) {
  for (const p of root.querySelectorAll('p.docx_signaturecolumn')) {
    const sec = sectionOf(p);
    const col = sec.getBoundingClientRect().left + parseFloat(getStyle(sec).paddingLeft) + COLUMN_PT * 96 / 72;
    for (const tab of p.querySelectorAll('span')) {
      if (tab.textContent !== '\u2003' || tab.children.length) continue;
      const x = tab.getBoundingClientRect().left;
      tab.style.display = 'inline-block';
      tab.style.width = `${Math.max(4, col - x)}px`;
    }
  }
}
