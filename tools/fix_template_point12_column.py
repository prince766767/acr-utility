"""One-time fix: point 12's answer (the colleges served) keeps to the answer column on every line.

The line was "label, TAB, TAB, answer", so a second line of the answer started under the label. Now the paragraph has
its own tab stop at the answer column (6480 twips, where the other Part-I answers already sit) and one TAB before
the answer; the generators start every further line of the answer with a TAB, which lands on that same stop.
Refuses to run if the line is not in its old state.
"""
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'
ANSWER_COLUMN = 6480
LABEL = 'College/Colleges in which served'


def point12_paragraph(doc):
    for p in doc.element.body.iter(qn('w:p')):
        if ''.join(t.text or '' for t in p.iter(qn('w:t'))).startswith(LABEL):
            return p
    raise SystemExit('Point 12 line not found; nothing changed.')


def main():
    doc = Document(MASTER)
    p = point12_paragraph(doc)
    seq = [(r, ch) for r in p.findall(qn('w:r')) for ch in r if ch.tag in (qn('w:tab'), qn('w:t'))]
    tok = next(i for i, (_, ch) in enumerate(seq) if ch.tag == qn('w:t') and '{{COLLEGES_SERVED}}' in (ch.text or ''))
    before = [ch for _, ch in seq[:tok]]
    if len(before) < 2 or before[-1].tag != qn('w:tab') or before[-2].tag != qn('w:tab'):
        raise SystemExit('Point 12 line is not "label, TAB, TAB, answer" (already fixed?); nothing changed.')
    second = seq[tok - 1]
    second[0].remove(second[1])
    ppr = p.find(qn('w:pPr'))
    tabs = OxmlElement('w:tabs')
    tab = OxmlElement('w:tab')
    tab.set(qn('w:val'), 'left')
    tab.set(qn('w:pos'), str(ANSWER_COLUMN))
    tabs.append(tab)
    # CT_PPr order: pStyle, keepNext, keepLines, pageBreakBefore, framePr, widowControl, numPr, suppressLineNumbers, pBdr, shd, tabs, ...
    before_tabs = [qn(t) for t in ('w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl',
                                   'w:numPr', 'w:suppressLineNumbers', 'w:pBdr', 'w:shd')]
    idx = next((i for i, ch in enumerate(ppr) if ch.tag not in before_tabs), len(ppr))
    ppr.insert(idx, tabs)
    doc.save(MASTER)
    print('Point 12: one TAB to a tab stop at the answer column.')


if __name__ == '__main__':
    main()
