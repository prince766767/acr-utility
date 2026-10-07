"""One-time fix: keep point 46's signature block on the same page as the grading line, in every viewer.

After tools/fix_template_sign_41_46.py the block sat in a section of its own (a continuous section break right after
the grading line). Word keeps a continuous section on the same page, but the app's Preview (docx-preview) starts a
new page at every section, so the block landed on the next page. The four lines move up into the grading line's
section, straight after "( Below Average / ... )" with room above them to sign, and the now-empty continuous
section is removed (what follows, PART IV, already starts on a new page through its own section).
Refuses to run if the template does not look exactly as expected.

Usage: python tools/fix_template_sign_46_same_page.py
"""
import sys
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER  # noqa: E402
from fix_template_page11_layout import text  # noqa: E402

SIGN_ROOM = 520   # twips above "Signature of Reporting Officer": about two lines, room to sign


def sect_of(p):
    return p.find(qn('w:pPr') + '/' + qn('w:sectPr'))


def main():
    doc = Document(MASTER)
    body = doc.element.body
    paras = [p for p in body if p.tag == qn('w:p')]
    flat = lambda p: text(p, tabs=False)
    hits = [i for i, p in enumerate(paras) if flat(p).startswith('(Below') and flat(p).endswith('Excellent)')]
    if len(hits) != 1:
        raise SystemExit(f'Point 46: grading choices found {len(hits)} times, expected once; nothing changed.')
    g = hits[0]
    gap, page_end = paras[g + 1], paras[g + 2]
    block, end = paras[g + 3:g + 7], paras[g + 7]
    if flat(block[0]) != 'Signature of Reporting Officer':
        raise SystemExit('Point 46: the signature block is not straight after the section break (already fixed?); nothing changed.')
    if (flat(gap) or sect_of(gap) is not None or flat(page_end) or sect_of(page_end) is None
            or [flat(p).rstrip('….') for p in block[1:]] != ['Name in block letter', 'Designation', 'Date']
            or flat(end) or sect_of(end) is None or sect_of(end).find(qn('w:type')) is None
            or sect_of(end).find(qn('w:type')).get(qn('w:val')) != 'continuous'
            or any(e.tag != qn('w:p') for e in body[list(body).index(page_end):list(body).index(end) + 1])):
        raise SystemExit('Point 46: the paragraphs around the signature block are not as expected; nothing changed.')
    nxt = next((p for p in paras[g + 8:] if sect_of(p) is not None), None)
    kind = None if nxt is None else sect_of(nxt).find(qn('w:type'))
    if nxt is None or (kind is not None and kind.get(qn('w:val')) == 'continuous'):
        raise SystemExit('Point 46: what follows does not start on a new page by itself; nothing changed.')

    for p in block:
        gap.addprevious(p)
    sp = block[0].find(qn('w:pPr') + '/' + qn('w:spacing'))
    sp.set(qn('w:before'), str(SIGN_ROOM))
    body.remove(end)
    doc.save(MASTER)
    print(f'Point 46: signature block moved under the grading line ({SIGN_ROOM} twips to sign); empty continuous section removed.')


if __name__ == '__main__':
    main()
