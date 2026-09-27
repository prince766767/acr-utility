"""One-time fix: replace the text boxes of points 17, 18 and 19(b) in ACR_EMPLOYEE_MASTER.docx with ordinary
paragraphs that have a box border, at the same indent and width (official form, PDF page 2: plain bordered boxes).

Text boxes cannot split across pages, and the floating ones (18, 19(b)) covered the next question when an answer
was long. A bordered paragraph grows with its text, pushes the following content down and splits across pages.
(A one-cell table would do the same but would shift the numbering of every later table the generator uses.)
Also sets Word's "don't expand character spaces on a line ending with a line break" option so multi-line answers
in justified paragraphs are not stretched.
Refuses to run if the template is not in the expected state.
"""
from copy import deepcopy
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'
WP = '{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}'
MC = '{http://schemas.openxmlformats.org/markup-compatibility/2006}'
TOKENS = ('{{P17}}', '{{P18}}', '{{P19B}}')
EMU_PER_TWIP = 635
# Order of paragraph-property children in the OOXML schema (pBdr before ind before jc).
PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr',
             'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap',
             'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid',
             'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
             'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange']


def el(tag, **attrs):
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn(k), str(v))
    return e


def put_in_order(ppr, child):
    name = child.tag.split('}')[1]
    old = ppr.find(child.tag)
    if old is not None:
        ppr.remove(old)
    rank = PPR_ORDER.index(name)
    for i, existing in enumerate(ppr):
        ename = existing.tag.split('}')[1]
        if ename in PPR_ORDER and PPR_ORDER.index(ename) > rank:
            ppr.insert(i, child)
            return
    ppr.append(child)


def text_width(body, host):
    """Text width (twips) of the section the host paragraph belongs to."""
    sect = None
    for p in [host] + list(host.itersiblings()):
        ppr = p.find(qn('w:pPr')) if p.tag == qn('w:p') else None
        if ppr is not None and ppr.find(qn('w:sectPr')) is not None:
            sect = ppr.find(qn('w:sectPr'))
            break
    if sect is None:
        sect = body.find(qn('w:sectPr'))
    pg, mar = sect.find(qn('w:pgSz')), sect.find(qn('w:pgMar'))
    return int(pg.get(qn('w:w'))) - int(mar.get(qn('w:left'))) - int(mar.get(qn('w:right')))


def main():
    doc = Document(MASTER)
    body = doc.element.body
    for tok in TOKENS:
        choice = [t for t in body.iter(qn('w:t')) if t.text == tok and any(a.tag == MC + 'Choice' for a in t.iterancestors())]
        if len(choice) != 1:
            raise SystemExit(f'{tok}: expected one text box holding it; nothing changed.')
        t = choice[0]
        run = [a for a in t.iterancestors(qn('w:r')) if a.find(MC + 'AlternateContent') is not None]
        if len(run) != 1 or run[0].getparent().getparent() is not body:
            raise SystemExit(f'{tok}: text box is not in a body paragraph; nothing changed.')
        run = run[0]
        host = run.getparent()
        others = [r for r in host.findall(qn('w:r'))
                  if r is not run and ''.join(x.text or '' for x in r.iter(qn('w:t'))).strip()]
        if others:
            raise SystemExit(f'{tok}: the text box line has other text; nothing changed.')
        draw = run.find('.//' + WP + 'inline')
        if draw is None:
            draw = run.find('.//' + WP + 'anchor')
        width = int(draw.find(WP + 'extent').get('cx')) // EMU_PER_TWIP
        if draw.tag == WP + 'anchor':
            left = int(draw.find(WP + 'positionH').findtext(WP + 'posOffset')) // EMU_PER_TWIP
        else:
            hppr = host.find(qn('w:pPr'))
            ind = hppr.find(qn('w:ind')) if hppr is not None else None
            left = int(ind.get(qn('w:left'))) if ind is not None and ind.get(qn('w:left')) else 0
        right = max(0, text_width(body, host) - left - width)

        answer = deepcopy(t.getparent().getparent())  # the paragraph holding the token inside the text box
        ppr = answer.find(qn('w:pPr'))
        if ppr is None:
            ppr = el('w:pPr')
            answer.insert(0, ppr)
        bdr = el('w:pBdr')
        for side in ('top', 'left', 'bottom', 'right'):
            bdr.append(el(f'w:{side}', **{'w:val': 'single', 'w:sz': 4, 'w:space': 4, 'w:color': 'auto'}))
        put_in_order(ppr, bdr)
        put_in_order(ppr, el('w:ind', **{'w:left': left, 'w:right': right}))
        host.addprevious(answer)
        host.remove(run)  # the host line stays as an empty spacer before the next question
        print(f'{tok}: text box -> bordered paragraph, indent left {left} right {right} twips (width {width})')

    compat = doc.settings.element.find(qn('w:compat'))
    if compat is None or compat.find(qn('w:doNotExpandShiftReturn')) is not None:
        raise SystemExit('Settings: compat block missing or option already set; nothing changed.')
    after = compat.find(qn('w:ulTrailSpace'))
    opt = el('w:doNotExpandShiftReturn')
    if after is not None:
        after.addnext(opt)
    else:
        compat.insert(0, opt)
    doc.save(MASTER)
    print('Set "do not expand character spaces on a line ending with a line break".')


if __name__ == '__main__':
    main()
