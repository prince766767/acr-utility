"""One-time fix: keep point 16 on page 1 when Google Docs makes the PDF.

Word squeezes points 10 and 14 onto one line each with condensed letter spacing, which Google Docs ignores,
so Google needed two more lines on page 1 and pushed point 16 onto page 2. Of the three empty lines between
point 12 and point 13 only one is kept, and the empty line between 13(b) and 14 is shrunk - the official
form has no such gaps either. Points 13-16 move up a little in Word. So that Part II still starts on page 2
(it would otherwise move up into the freed space), its heading gets "page break before". Refuses to run twice.
"""
import sys
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER, make_minimal  # noqa: E402


def text(e):
    return ' '.join(''.join(x.text or '' for x in e.iter(qn('w:t'))).split())


def main():
    doc = Document(MASTER)
    body = list(doc.element.body)
    k13 = next(k for k, e in enumerate(body) if text(e).startswith('a) Roll no (with session)'))
    k14 = next(k for k, e in enumerate(body) if text(e).startswith('Any other major assignment in addition to Tea'))
    gap13 = body[k13 - 3:k13]
    gap14 = [body[k14 - 1]]
    targets = gap13[1:] + gap14
    if any(text(p) or p.tag != qn('w:p') for p in gap13 + gap14):
        raise SystemExit('Page 1 not in the expected state; nothing changed.')
    sp = lambda p: p.find(qn('w:pPr') + '/' + qn('w:spacing'))
    if any(sp(p) is not None and sp(p).get(qn('w:line')) == '20' for p in targets):
        raise SystemExit('Already fixed; nothing changed.')
    part2 = next(e for e in body if text(e).startswith('PART-II: SECTION-I'))
    ppr = part2.find(qn('w:pPr'))
    if ppr.find(qn('w:pageBreakBefore')) is not None:
        raise SystemExit('Part II already starts a new page; nothing changed.')
    for p in targets:
        make_minimal(p)
    # CT_PPr order: pStyle, keepNext, keepLines, pageBreakBefore, ...
    pbb = OxmlElement('w:pageBreakBefore')
    after = [qn(t) for t in ('w:pStyle', 'w:keepNext', 'w:keepLines')]
    idx = next((i for i, ch in enumerate(ppr) if ch.tag not in after), len(ppr))
    ppr.insert(idx, pbb)
    doc.save(MASTER)
    print('Shrank 3 empty lines on page 1 (before points 13 and 14); Part II starts a new page.')


if __name__ == '__main__':
    main()
