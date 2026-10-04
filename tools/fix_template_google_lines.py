"""One-time fix: on two full pages, give text paragraphs exact line heights equal to Word's own.

Google Docs (which makes the PDF for Share / Save to Google Drive) uses slightly taller "single" lines than
Word, so two pages that Word fills to the bottom spilled a line or two onto an extra page:
  - points 35-41 (Part-III, reporting officer) - "Date ..." spilled
  - the Category-III table on the page starting "ii) Full papers in conference" - "/humanities /" spilled
Word's single line for Times New Roman is 1.149 x the font size; each auto-spaced paragraph with text gets
exactly that (times its own multiple). Word's layout stays the same (checked against all 30 pages).
Refuses to run twice.
"""
import sys
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER  # noqa: E402
from fix_template_textboxes import put, PPR_BEFORE_PBDR  # noqa: E402

TNR_LINE = 1.149  # Times New Roman: (ascent + descent + line gap) / em, as Word uses it


def text(e):
    return ' '.join(''.join(x.text or '' for x in e.iter(qn('w:t'))).split())


def target_paragraphs(body):
    a = next(k for k, e in enumerate(body) if text(e).startswith('ZEAL, DILIGENCE'))
    b = next(k for k in range(a, len(body)) if text(body[k]).startswith('N. B.:- Overall'))
    tbl = next(e for e in body if e.tag == qn('w:tbl') and text(e).startswith('ii)Full papers in conference'))
    out = []
    for e in body[a:b + 1] + [tbl]:
        out.extend([e] if e.tag == qn('w:p') else list(e.iter(qn('w:p'))))
    return out


def font_size(p, doc):
    sizes = [int(s.get(qn('w:val'))) for r in p.iter(qn('w:r')) if r.find('.//' + qn('w:t')) is not None
             for s in r.iter(qn('w:sz'))]
    if sizes:
        return max(sizes) / 2
    ppr = p.find(qn('w:pPr'))
    sid = ppr.find(qn('w:pStyle')).get(qn('w:val')) if ppr is not None and ppr.find(qn('w:pStyle')) is not None else 'Normal'
    st = next((s for s in doc.styles if getattr(s, 'style_id', None) == sid), None)
    while st is not None:
        if st.font.size:
            return st.font.size.pt
        st = st.base_style
    return 11.0  # document default (w:sz 22)


def main():
    doc = Document(MASTER)
    changed = 0
    for p in target_paragraphs(list(doc.element.body)):
        if not text(p):
            continue
        ppr = p.find(qn('w:pPr'))
        if ppr is None:
            ppr = OxmlElement('w:pPr')
            p.insert(0, ppr)
        sp = ppr.find(qn('w:spacing'))
        if sp is not None and sp.get(qn('w:lineRule')) in ('exact', 'atLeast'):
            continue
        line = int(sp.get(qn('w:line'), 240)) if sp is not None else 240
        if sp is None:
            sp = OxmlElement('w:spacing')
            put(ppr, sp, PPR_BEFORE_PBDR + ['w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku',
                                            'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE',
                                            'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd', 'w:snapToGrid'])
        sp.set(qn('w:line'), str(round(line / 240 * TNR_LINE * font_size(p, doc) * 20)))
        sp.set(qn('w:lineRule'), 'exact')
        changed += 1
    if not changed:
        raise SystemExit('Nothing to change (already fixed?); nothing changed.')
    doc.save(MASTER)
    print(f'Gave {changed} paragraph(s) exact line heights.')


if __name__ == '__main__':
    main()
