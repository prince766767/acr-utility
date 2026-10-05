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
