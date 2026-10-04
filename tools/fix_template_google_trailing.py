"""One-time follow-up to fix_template_google_breaks.py: shrink the empty spacer paragraph(s) at the bottom
of the Part-III (reporting officer) page that ends with point 34(d) "...Just good enough.", directly before
its section break.

Google Docs lays out slightly taller than Word, so the spacer spilled onto a blank page of its own. It is
at the very end of that page, so shrinking it moves nothing in Word (checked: all 30 Word pages are
pixel-identical). Other spacers before section breaks are NOT touched: some are not at a page end and
shrinking them moved content in Word. Refuses to run twice.
"""
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

from fix_template_google_breaks import MASTER, is_empty, make_minimal, new_page_section_paras


ANCHOR = 'Just good enough.'


def text(p):
    return ''.join(t.text or '' for t in p.iter(qn('w:t')))


def trailing_empties(paras):
    for i, _ in new_page_section_paras(paras):
        j = i - 1
        while (j >= 0 and paras[j].getnext() is paras[j + 1] and is_empty(paras[j])
               and paras[j].find('.//' + qn('w:drawing')) is None
               and paras[j].find(qn('w:pPr') + '/' + qn('w:sectPr')) is None):
            yield paras[j]
            j -= 1


def main():
    doc = Document(MASTER)
    paras = [el for el in doc.element.body if el.tag == qn('w:p')]
    targets = []
    for p in trailing_empties(paras):
        k = paras.index(p)
        while k >= 0 and not text(paras[k]).strip():
            k -= 1
        if k >= 0 and text(paras[k]).strip().startswith(ANCHOR):
            targets.append(p)
    def done(p):
        sp = p.find(qn('w:pPr') + '/' + qn('w:spacing'))
        return sp is not None and (sp.get(qn('w:line')), sp.get(qn('w:lineRule'))) == ('20', 'exact')
    if not targets or all(done(p) for p in targets):
        raise SystemExit('Template not in the expected state (already fixed?); nothing changed.')
    for p in targets:
        make_minimal(p)
    doc.save(MASTER)
    print(f'Made {len(targets)} spacer paragraph(s) before section breaks minimal.')


if __name__ == '__main__':
    main()
