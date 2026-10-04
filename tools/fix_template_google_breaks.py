"""One-time fix so Google Docs (which makes the PDF for Share / Save to Google Drive) does not add blank pages.

Word quietly merges two page breaks in a row; Google Docs prints both, so it added blank pages:
1. A paragraph that starts a new page ("page break before") right after a section break, which already
   starts a new page. The extra setting is removed.
2. Empty paragraphs that only carry a section break, sitting under a table that fills the page. Google
   Docs lays out a little taller than Word, so the empty paragraph spilled onto a page of its own before
   the section break. Those paragraphs are made as small as possible (no spacing, 1-point line).
Only section breaks that start a new page are touched; continuous ones (two-column parts) are left alone.
Word's layout does not change. Refuses to run if the template is not in the expected state.
"""
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'


def new_page_section_paras(paras):
    for i, p in enumerate(paras):
        sect = p.find(qn('w:pPr') + '/' + qn('w:sectPr'))
        if sect is None:
            continue
        kind = sect.find(qn('w:type'))
        if kind is None or kind.get(qn('w:val')) != 'continuous':
            yield i, p


def is_empty(p):
    return not ''.join(t.text or '' for t in p.iter(qn('w:t'))).strip()


def child_before(ppr, tag, after_tags):
    """Return ppr's `tag` child, creating it in schema order (before the first of the tags not in after_tags)."""
    el = ppr.find(qn(tag))
    if el is None:
        el = OxmlElement(tag)
        for i, ch in enumerate(ppr):
            if ch.tag not in [qn(t) for t in after_tags]:
                ppr.insert(i, el)
                break
        else:
            ppr.append(el)
    return el


def make_minimal(p):
    """Shrink an empty paragraph to no spacing and a 1-point line."""
    ppr = p.find(qn('w:pPr'))
    if ppr is None:
        ppr = OxmlElement('w:pPr')
        p.insert(0, ppr)
    # w:spacing comes after pStyle..suppressAutoHyphens and before ind/jc/rPr/sectPr in CT_PPr order
    spacing = child_before(ppr, 'w:spacing', ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore',
                                              'w:framePr', 'w:widowControl', 'w:numPr', 'w:suppressLineNumbers',
                                              'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku',
                                              'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE',
                                              'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd', 'w:snapToGrid'])
    for k in list(spacing.attrib):
        del spacing.attrib[k]
    spacing.set(qn('w:before'), '0')
    spacing.set(qn('w:after'), '0')
    spacing.set(qn('w:line'), '20')
    spacing.set(qn('w:lineRule'), 'exact')
    rpr = ppr.find(qn('w:rPr'))
    if rpr is None:
        rpr = OxmlElement('w:rPr')
        tail = next((ch for ch in ppr if ch.tag in (qn('w:sectPr'), qn('w:pPrChange'))), None)
        if tail is None:
            ppr.append(rpr)
        else:
            tail.addprevious(rpr)
    later = [qn(t) for t in ('w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign',
                             'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath')]
    for tag in ('w:sz', 'w:szCs'):
        el = rpr.find(qn(tag))
        if el is None:
            el = OxmlElement(tag)
            nxt = next((ch for ch in rpr if ch.tag in later), None)
            if nxt is None:
                rpr.append(el)
            else:
                nxt.addprevious(el)
        el.set(qn('w:val'), '2')


def main():
    doc = Document(MASTER)
    paras = [el for el in doc.element.body if el.tag == qn('w:p')]
    sections = list(new_page_section_paras(paras))
    doubled = [paras[i + 1] for i, _ in sections
               if i + 1 < len(paras) and paras[i + 1].find(qn('w:pPr') + '/' + qn('w:pageBreakBefore')) is not None]
    empty = [p for _, p in sections if is_empty(p)]
    already = all((p.find(qn('w:pPr') + '/' + qn('w:spacing')) is not None
                   and p.find(qn('w:pPr') + '/' + qn('w:spacing')).get(qn('w:line')) == '20') for p in empty)
    if not doubled or len(empty) < 10 or already:
        raise SystemExit('Template not in the expected state (already fixed?); nothing changed.')

    for p in doubled:
        pb = p.find(qn('w:pPr') + '/' + qn('w:pageBreakBefore'))
        pb.getparent().remove(pb)

    for p in empty:
        make_minimal(p)
    doc.save(MASTER)
    print(f'Removed {len(doubled)} doubled page break(s); made {len(empty)} section-break paragraph(s) minimal.')


if __name__ == '__main__':
    main()
