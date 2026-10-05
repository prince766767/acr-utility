"""One-time fix of the certificate layout on page 11 of ACR_EMPLOYEE_MASTER.docx (official form: PDF page 12).

1. The signature-side items were placed with runs of default tabs after text of varying length, so once a place,
   date or designation was filled in they drifted (differently in Word, the app's Preview and Google Docs).
   Now each starts in one column, COL twips from the left margin, reached by a single tab stop:
   "Signature of the reported on officer" / "Designation, ..." and the Principal's dotted line, "Signature (with
   stamp) of Principal", the college ({{CERT_COLLEGE}}, in place of the form's "Govt. Degree College.") and
   "Name of the Principal: ...". Lines with Date:/Place: on the left wrap back to the column (hanging indent).
2. The "not satisfied" box was a grouped drawing (several text boxes and lines), which the Preview cannot draw
   and Google Docs redraws badly. It becomes bordered paragraphs of about the same height, as in
   tools/fix_template_textboxes.py, with the same signature column (a tab stop: Word draws one box only when the
   paragraphs share their indents) and the college and Principal's name filled in.
3. The lines that reach the column with a tab get the paragraph style "Signature Column" (Body Text otherwise).
   It changes nothing in Word or Google Docs; the app's Preview, which does not use tab stops, finds these lines
   by it and moves the text after the tab to the column (alignSignatureColumn in preview_fix.js).
Refuses to run if the template does not look exactly as expected.

Usage: python tools/fix_template_page11_layout.py
"""
import copy
import sys
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.style import WD_STYLE_TYPE

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER, make_minimal  # noqa: E402

COL = 7000          # signature column, twips from the left margin ("Signature (with stamp) of Principal" ends near the right margin)
LEFT = 933          # where Place:/Date: start, as in the form
DOTS = '-' * 42     # about as wide as "Signature (with stamp) of Principal"
BOX_BLANK_LINES = 18  # room for the Principal's reasons; keeps the box about as tall as the drawing it replaces
BOX_LINE = 276      # exact line height of the box's lines, twips
LABEL, BLUE = '221F20', '0000CC'
STYLE_NAME, STYLE_ID = 'Signature Column', 'SignatureColumn'
WPS_TXBX = '{http://schemas.microsoft.com/office/word/2010/wordprocessingShape}txbx'
PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers',
             'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE',
             'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents',
             'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle',
             'rPr', 'sectPr', 'pPrChange']


def text(p, tabs=True):
    return ''.join((e.text or '') if e.tag == qn('w:t') else ('\t' if tabs else '') if e.tag == qn('w:tab') and e.getparent().tag == qn('w:r') else ''
                   for e in p.iter() if not any(a.tag == qn('w:txbxContent') for a in e.iterancestors()))   # not text-box contents


def el(tag, **attrs):
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn('w:' + k), str(v))
    return e


def put(ppr, new):
    """Put new into pPr in schema order, replacing one with the same tag."""
    name = new.tag.split('}')[1]
    old = ppr.find(new.tag)
    if old is not None:
        ppr.replace(old, new)
        return
    later = PPR_ORDER[PPR_ORDER.index(name) + 1:]
    for child in ppr:
        if child.tag.split('}')[1] in later:
            child.addprevious(new)
            return
    ppr.append(new)


def drop(ppr, name):
    e = ppr.find(qn('w:' + name))
    if e is not None:
        ppr.remove(e)


def run(rpr, s, colour):
    """A run with rpr's look in colour; tabs in s become w:tab."""
    r = OxmlElement('w:r')
    rp = copy.deepcopy(rpr)
    c = rp.find(qn('w:color'))
    if c is None:
        c = el('w:color')
        rp.append(c)
    c.set(qn('w:val'), colour)
    r.append(rp)
    for i, part in enumerate(s.split('\t')):
        if i:
            r.append(OxmlElement('w:tab'))
        if part:
            t = OxmlElement('w:t')
            t.text = part
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            r.append(t)
    return r


def refill(p, parts, rpr, left, hanging=0, tab=None):
    """Replace p's runs with parts [(text, colour)], at indent left (hanging) with one left tab stop at tab."""
    ppr = p.find(qn('w:pPr'))
    for child in [c for c in p if c is not ppr]:
        p.remove(child)
    ind = el('w:ind', left=left)
    if hanging:
        ind.set(qn('w:hanging'), str(hanging))
    put(ppr, ind)
    drop(ppr, 'jc')
    drop(ppr, 'tabs')
    if tab is not None:
        tabs = el('w:tabs')
        tabs.append(el('w:tab', val='left', pos=tab))
        put(ppr, tabs)
    for s, colour in parts:
        p.append(run(rpr, s, colour))


def mark(p):
    """Give p the Signature Column style."""
    put(p.find(qn('w:pPr')), el('w:pStyle', val=STYLE_ID))


def one(paras, test, what):
    hits = [p for p in paras if test(p)]
    if len(hits) != 1:
        raise SystemExit(f'Page 11: {what} found {len(hits)} times, expected once; nothing changed.')
    return hits[0]


def box_paragraph(pattern, parts, rpr, tab):
    """A paragraph of the box: pattern's spacing, borders all round, no indent, one tab stop at tab."""
    p = OxmlElement('w:p')
    ppr = copy.deepcopy(pattern)
    drop(ppr, 'jc')
    bdr = el('w:pBdr')
    for side in ('top', 'left', 'bottom', 'right'):
        bdr.append(el('w:' + side, val='single', sz=6, space=4, color='auto'))
    put(ppr, bdr)
    put(ppr, el('w:spacing', line=BOX_LINE, lineRule='exact'))
    put(ppr, el('w:ind', left=0, right=0))
    if tab is not None:
        tabs = el('w:tabs')
        tabs.append(el('w:tab', val='left', pos=tab))
        put(ppr, tabs)
    p.append(ppr)
    for s, colour in parts:
        p.append(run(rpr, s, colour))
    return p


def main():
    doc = Document(MASTER)
    paras = [p for p in doc.element.body if p.tag == qn('w:p')]
    flat = lambda p: text(p, tabs=False)
    place = one(paras, lambda p: flat(p) == 'Place: {{PLACE}}Signature of the reported on officer', 'the teacher\'s Place line')
    date = one(paras, lambda p: flat(p) == 'Date: {{REPORT_DATE}}Designation, {{CERT_DESIGNATION}}', 'the teacher\'s Date line')
    sig = one(paras, lambda p: flat(p) == 'Date:Signature (with stamp) of Principal', 'the Principal\'s signature line')
    i = paras.index(sig)
    dots, college, name = paras[i - 1], paras[i + 1], paras[i + 2]
    if (flat(dots).strip('-') or len(flat(dots)) != 33 or flat(college).replace(' ', '') != 'Place:Govt.DegreeCollege.'
            or flat(name) != 'Name of the Principal: {{PRINCIPAL_NAME}}'):
        raise SystemExit('Page 11: the lines around the Principal\'s signature are not as expected; nothing changed.')
    host = one(paras, lambda p: 'not satisfied with the reporting' in ''.join(t.text or '' for t in p.iter(qn('w:t'))), 'the not-satisfied box')
    boxes = [b for b in host.iter(WPS_TXBX)]
    intro = next((p for b in boxes for p in b.find(qn('w:txbxContent')).findall(qn('w:p')) if ''.join(x.text or '' for x in p.iter(qn('w:t'))).startswith('In case the Principal')), None)
    if intro is None or text(host).strip() or len(host.findall(qn('w:r'))) != 1:
        raise SystemExit('Page 11: the not-satisfied box is not as expected; nothing changed.')

    if STYLE_NAME in [s.name for s in doc.styles]:
        raise SystemExit(f'Style "{STYLE_NAME}" already exists (already fixed?); nothing changed.')
    style = doc.styles.add_style(STYLE_NAME, WD_STYLE_TYPE.PARAGRAPH)
    style.base_style = doc.styles['Body Text']
    style.hidden = True   # not offered in Word's style gallery

    label = copy.deepcopy(place.find(qn('w:r')).find(qn('w:rPr')))   # Times New Roman, form colour
    refill(place, [('Place: ', LABEL), ('{{PLACE}}', BLUE), ('\tSignature of the reported on officer', LABEL)], label, LEFT, tab=COL)
    refill(date, [('Date: ', LABEL), ('{{REPORT_DATE}}', BLUE), ('\tDesignation, ', LABEL), ('{{CERT_DESIGNATION}}', BLUE)], label, LEFT, tab=COL)
    refill(dots, [(DOTS, LABEL)], label, COL)
    refill(sig, [('Date:\tSignature (with stamp) of Principal', LABEL)], label, COL, COL - LEFT, COL)
    refill(college, [('Place:\t', LABEL), ('{{CERT_COLLEGE}}', BLUE)], label, COL, COL - LEFT, COL)
    refill(name, [('Name of the Principal: ', LABEL), ('{{PRINCIPAL_NAME}}', BLUE)], label, COL)
    drop(name.find(qn('w:pPr')), 'spacing')
    for p in (place, date, sig, college):
        mark(p)

    # The box: the form's words (kept with their bold parts), room to write, then the signature column.
    box_rpr = copy.deepcopy(intro.find(qn('w:r')).find(qn('w:rPr')))   # the box's own font, form colour
    pattern = intro.find(qn('w:pPr'))
    first = box_paragraph(pattern, [], box_rpr, None)
    for r in intro.findall(qn('w:r')):
        first.append(copy.deepcopy(r))
    put(first.find(qn('w:pPr')), el('w:jc', val='both'))
    put(first.find(qn('w:pPr')), el('w:spacing', line=236, lineRule='exact'))   # as in the drawing
    new = [first] + [box_paragraph(pattern, [], box_rpr, None) for _ in range(BOX_BLANK_LINES)] + [
        box_paragraph(pattern, [('\t' + DOTS, LABEL)], box_rpr, COL),
        box_paragraph(pattern, [('\tSignature (with stamp) of Principal', LABEL)], box_rpr, COL),
        box_paragraph(pattern, [('Place:\t', LABEL), ('{{CERT_COLLEGE}}', BLUE)], box_rpr, COL),
        box_paragraph(pattern, [('Date:\t', LABEL), ('Name of the Principal: ', LABEL), ('{{PRINCIPAL_NAME}}', BLUE)], box_rpr, COL),
    ]
    for p in new[-4:]:
        mark(p)
    for p in new:
        host.addprevious(p)
    host.remove(host.find(qn('w:r')))
    make_minimal(host)
    doc.save(MASTER)
    print(f'Page 11: certificate lines now in one column at {COL} twips; the not-satisfied box is {len(new)} bordered paragraphs.')


if __name__ == '__main__':
    main()
