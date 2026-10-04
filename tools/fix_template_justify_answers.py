"""One-time fix: long answers print justified, as teachers' finished ACRs do.

17, 18, 19(b) and 19(g) already were; 19(f), 21(i), 23, 24 (reasons) and 25 were left-aligned. Their answer
paragraphs get "justified". Refuses to run if they are already justified.
"""
import re
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'
TOKENS = ('P19F', 'P21I', 'P23', 'P24_REASONS', 'P25')
# CT_PPr children that come before w:jc
BEFORE_JC = ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl', 'w:numPr',
             'w:suppressLineNumbers', 'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap',
             'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd',
             'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap']


def answer_paragraphs(doc):
    found = {}
    for p in doc.element.body.iter(qn('w:p')):
        text = ''.join(t.text or '' for t in p.iter(qn('w:t')))
        for tok in re.findall(r'\{\{([A-Z0-9_]+)\}\}', text):
            if tok in TOKENS:
                found[tok] = p
    return found


def main():
    doc = Document(MASTER)
    found = answer_paragraphs(doc)
    missing = [t for t in TOKENS if t not in found]
    if missing:
        raise SystemExit(f'Answer paragraphs not found: {missing}; nothing changed.')
    jcs = [found[t].find(qn('w:pPr') + '/' + qn('w:jc')) for t in TOKENS]
    if all(j is not None and j.get(qn('w:val')) == 'both' for j in jcs):
        raise SystemExit('Already justified; nothing changed.')
    for tok in TOKENS:
        p = found[tok]
        ppr = p.find(qn('w:pPr'))
        if ppr is None:
            ppr = OxmlElement('w:pPr')
            p.insert(0, ppr)
        jc = ppr.find(qn('w:jc'))
        if jc is None:
            jc = OxmlElement('w:jc')
            idx = next((i for i, ch in enumerate(ppr) if ch.tag not in [qn(t) for t in BEFORE_JC]), len(ppr))
            ppr.insert(idx, jc)
        jc.set(qn('w:val'), 'both')
    doc.save(MASTER)
    print(f'Justified the answers for {", ".join(TOKENS)}.')


if __name__ == '__main__':
    main()
