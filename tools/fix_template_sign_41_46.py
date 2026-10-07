"""One-time fix of the Reporting Officer's signature blocks after point 41 and in point 46 of ACR_EMPLOYEE_MASTER.docx.

The official form (UGC_ACR_Form.pdf, PDF pages 15 and 23) prints both blocks the same way: four bold lines, one under
the other, starting a little right of the middle, with the dots straight after each label:
    Signature of Reporting Officer / Name in block letter..... / Designation..... / Date.....
1. After point 41 the lines were reached with runs of default tabs, and "Name in block letter" and "Designation"
   shared one paragraph that only broke because it wrapped. Now they are four paragraphs with a left indent
   (no tabs, so Word, the app's Preview and Google Docs agree), kept together, and the N. B. line under them is
   bold and upright as in the form, a little below the block.
2. Point 46 put the block in the right column of a two-column section, after a column break and 31 empty
   paragraphs, so it sat far below the grading line. The empty paragraphs and the column break go, the section
   becomes one column with the page's own margins, and the block is indented like the one after point 41,
   a line and a half below "( Below Average / ... )".
Refuses to run if the template does not look exactly as expected.

Usage: python tools/fix_template_sign_41_46.py
"""
import copy
import sys
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER  # noqa: E402
from fix_template_page11_layout import el, put, drop, run, text  # noqa: E402

COL_41 = 5360   # twips from the left margin (709) of the page with point 41: as far across the page as in the form
COL_46 = 4900   # twips from the left margin (851) of the page with point 46
LINE = 265      # exact line height of the block's lines, twips (as the Date line had)
LABEL = '221F20'
ELL = '…'
# Dots end a little past "Signature of Reporting Officer", as in the form (Times bold draws ... wider than the form's font).
LINES = ['Signature of Reporting Officer', 'Name in block letter' + ELL * 8 + '.', 'Designation' + ELL * 11 + '..',
         'Date' + ELL * 15 + '.']


def flat(p):
    return text(p, tabs=False)


def one(paras, test, what):
    hits = [p for p in paras if test(p)]
    if len(hits) != 1:
        raise SystemExit(f'Signature blocks: {what} found {len(hits)} times, expected once; nothing changed.')
    return hits[0]


def block_paragraph(pattern, rpr, s, left, before, keep_next):
    p = OxmlElement('w:p')
    ppr = copy.deepcopy(pattern)
    for name in ('pStyle', 'tabs', 'jc', 'ind', 'keepNext', 'sectPr'):
        drop(ppr, name)
    if keep_next:
        put(ppr, el('w:keepNext'))
    put(ppr, el('w:spacing', before=before, after=0, line=LINE, lineRule='exact'))
    put(ppr, el('w:ind', left=left))
    p.append(ppr)
    p.append(run(rpr, s, LABEL))
    return p


def replace_block(first, old, left, before):
    """Put the four block lines in place of the paragraphs old (first is the one whose look they take)."""
    pattern = first.find(qn('w:pPr'))
    rpr = copy.deepcopy(next(r for r in first.findall(qn('w:r')) if r.find(qn('w:t')) is not None).find(qn('w:rPr')))
    if rpr.find(qn('w:b')) is None:
        raise SystemExit('Signature blocks: the block is not bold as expected; nothing changed.')
    new = [block_paragraph(pattern, rpr, s, left, before if i == 0 else 0, i < len(LINES) - 1) for i, s in enumerate(LINES)]
    for p in new:
        old[0].addprevious(p)
    for p in old:
        p.getparent().remove(p)
    return new


def main():
    doc = Document(MASTER)
    body = doc.element.body
    paras = [p for p in body if p.tag == qn('w:p')]
    if any(flat(p) == LINES[1] for p in paras):
        raise SystemExit('Signature blocks already fixed; nothing changed.')

    # After point 41.
    sig41 = one(paras, lambda p: text(p) == '\t' * 6 + 'Signature of Reporting Officer', 'the signature line after point 41')
    i = paras.index(sig41)
    name41, date41, nb = paras[i + 1], paras[i + 2], paras[i + 3]
    if (not flat(name41).startswith('Name in block letter') or 'Designation' not in flat(name41)
            or not flat(date41).startswith('Date') or not flat(nb).startswith('N. B.:- Overall Assessment of Part-III')):
        raise SystemExit('Signature blocks: the lines after point 41 are not as expected; nothing changed.')
    replace_block(sig41, [sig41, name41, date41], COL_41, 200)
    put(nb.find(qn('w:pPr')), el('w:spacing', before=240, line=LINE, lineRule='exact'))
    for rpr in [r.find(qn('w:rPr')) for r in nb.iter(qn('w:r'))] + [nb.find(qn('w:pPr')).find(qn('w:rPr'))]:
        if rpr is None:
            continue
        for name in ('i', 'iCs'):
            drop(rpr, name)
        if rpr.find(qn('w:b')) is None:
            rpr.insert(0, el('w:b'))   # w:b comes before colour, size etc. (fonts are not set on these runs)
        fonts = rpr.find(qn('w:rFonts'))
        if fonts is not None:
            rpr.remove(fonts)
            rpr.insert(0, fonts)       # rFonts must stay first

    # Point 46.
    paras = [p for p in body if p.tag == qn('w:p')]
    grading = one(paras, lambda p: flat(p).startswith('(Below') and flat(p).endswith('Excellent)'), 'the grading choices of point 46')
    g = paras.index(grading)
    sig46 = one(paras[g:], lambda p: text(p) == 'Signature of Reporting Officer', 'the signature line of point 46')
    s = paras.index(sig46)
    name46, date46, end = paras[s + 1], paras[s + 2], paras[s + 3]
    page_end = paras[g + 2]
    page_sect, cols_sect = page_end.find(qn('w:pPr') + '/' + qn('w:sectPr')), end.find(qn('w:pPr') + '/' + qn('w:sectPr'))
    between = paras[g + 3:s]
    breaks = [p for p in between if p.find('.//' + qn('w:br')) is not None]
    if (page_sect is None or cols_sect is None or flat(paras[g + 1]) or flat(end)
            or not flat(name46).startswith('Name in block letter') or not flat(date46).startswith('Date')
            or any(flat(p) for p in between) or len(breaks) != 1
            or breaks[0].find('.//' + qn('w:br')).get(qn('w:type')) != 'column'
            or cols_sect.find(qn('w:cols')).get(qn('w:num')) != '2'):
        raise SystemExit('Signature blocks: point 46 is not as expected; nothing changed.')
    if any(e.tag != qn('w:p') for e in body[list(body).index(page_end) + 1:list(body).index(end)]):
        raise SystemExit('Signature blocks: point 46 holds more than paragraphs; nothing changed.')
    for p in between:
        p.getparent().remove(p)
    replace_block(sig46, [sig46, name46, date46], COL_46, 360)
    cols_sect.replace(cols_sect.find(qn('w:pgMar')), copy.deepcopy(page_sect.find(qn('w:pgMar'))))
    cols_sect.replace(cols_sect.find(qn('w:cols')), el('w:cols', space=720))

    doc.save(MASTER)
    print(f'Signature blocks: after point 41 at {COL_41} twips; point 46 at {COL_46} twips, '
          f'{len(between)} empty paragraphs and the two columns removed.')


if __name__ == '__main__':
    main()
