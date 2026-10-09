"""One-time fix of four layout faults seen in a teacher's Google-made PDF (2026-10-09).

1. Page 1: with longer answers point 16 was pushed onto page 2, alone. Six empty lines on page 1 (in the title block,
   above Part I, and the one left above point 13) become half-height lines; the line spacing of the points is kept.
   The empty line after point 16 becomes minimal, so it cannot spill onto a page of its own before Part II.
2. Point 16: "Mobile No.:" and "Email:" were placed with default tab stops (eight tabs before Email), which Google
   measures differently. Both lines now have their own stops: the labels at LABEL_COLUMN, the values at the answer
   column (ANSWER_COLUMN, where the other Part-I answers sit). The Email line keeps one tab before the label.
3. After 19(b): six empty lines and a page break. When 19(b) filled page 3 the empty lines spilled onto page 4 and
   the break left it blank. They are removed; 19(c) gets "page break before", which never makes a blank page.
4. Point 20: the heading (and the empty line under it) and every table row but the last get "keep with next", so the
   heading stays with its table.
5. After "LIST OF ENCLOSURES": four empty lines and a page break, the same trap as 3. They are removed; the teacher's
   certificate ("I certify that the information provided ...") gets "page break before". The generators now put the
   enclosure list under its heading.
Refuses to run twice.
"""
import sys
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER, child_before, make_minimal  # noqa: E402

LABEL_COLUMN = 4900
ANSWER_COLUMN = 6480
HALF_LINE = '134'
# CT_PPr order up to w:spacing
BEFORE_SPACING = ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl',
                  'w:numPr', 'w:suppressLineNumbers', 'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens',
                  'w:kinsoku', 'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN',
                  'w:bidi', 'w:adjustRightInd', 'w:snapToGrid']


def text(e):
    return ' '.join(''.join(x.text or '' for x in e.iter(qn('w:t'))).split())


def ppr_of(p):
    ppr = p.find(qn('w:pPr'))
    if ppr is None:
        ppr = OxmlElement('w:pPr')
        p.insert(0, ppr)
    return ppr


def make_half(p):
    sp = child_before(ppr_of(p), 'w:spacing', BEFORE_SPACING)
    for k in list(sp.attrib):
        del sp.attrib[k]
    sp.set(qn('w:before'), '0')
    sp.set(qn('w:after'), '0')
    sp.set(qn('w:line'), HALF_LINE)
    sp.set(qn('w:lineRule'), 'exact')


def set_flag(p, tag):
    order = ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore']
    child_before(ppr_of(p), tag, order[:order.index(tag)])


def set_tabs(p, stops):
    ppr = ppr_of(p)
    old = ppr.find(qn('w:tabs'))
    if old is not None:
        ppr.remove(old)
    tabs = child_before(ppr, 'w:tabs', ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr',
                                        'w:widowControl', 'w:numPr', 'w:suppressLineNumbers', 'w:pBdr', 'w:shd'])
    for pos in stops:
        t = OxmlElement('w:tab')
        t.set(qn('w:val'), 'left')
        t.set(qn('w:pos'), str(pos))
        tabs.append(t)


def page1_gaps(body):
    """The empty lines on page 1 that become half-height."""
    find = lambda s: next(k for k, e in enumerate(body) if text(e).startswith(s))
    k_dept, k_for = find('EDUCATION DEPARTMENT'), find('(FOR ASSISTANT PROFESSORS')
    k_part1, k_filled = find('PART-I PERSONAL DATA'), find('(To be filled up by the Assistant')
    k13 = find('a) Roll no (with session)')
    return [body[k_dept + 1], body[k_for - 1], body[k_for + 1], body[k_part1 - 1], body[k_filled + 1], body[k13 - 3]]


def point16(body):
    k = next(k for k, e in enumerate(body) if text(e).startswith('Land line telephone No.'))
    return body[k], body[k + 1], body[k + 2]


def main():
    doc = Document(MASTER)
    body = list(doc.element.body)

    gaps = page1_gaps(body)
    phone, email, after16 = point16(body)
    if any(text(p) for p in gaps + [after16]) or not text(email).startswith('Email:'):
        raise SystemExit('Page 1 not in the expected state; nothing changed.')
    if phone.find(qn('w:pPr') + '/' + qn('w:tabs')) is not None:
        raise SystemExit('Already fixed; nothing changed.')

    k19b = next(k for k, e in enumerate(body) if '{{P19B}}' in text(e))
    k19c = next(k for k, e in enumerate(body) if text(e).startswith('How many assignments and class tests'))
    between = body[k19b + 1:k19c]
    brk = between[-1] if between else None
    if (len(between) != 7 or any(text(p) or p.tag != qn('w:p') for p in between)
            or brk.find('.//' + qn('w:br')) is None or brk.find('.//' + qn('w:br')).get(qn('w:type')) != 'page'):
        raise SystemExit('Lines between 19(b) and 19(c) not in the expected state; nothing changed.')

    kl = next(k for k, e in enumerate(body) if text(e).startswith('LIST OF ENCLOSURES'))
    kc = next(k for k, e in enumerate(body) if text(e).startswith('I certify that the information provided'))
    after_list = body[kl + 1:kc]
    if (len(after_list) != 5 or any(text(p) or p.tag != qn('w:p') for p in after_list)
            or after_list[-1].find('.//' + qn('w:br')) is None):
        raise SystemExit('Lines after LIST OF ENCLOSURES not in the expected state; nothing changed.')

    k20 = next(k for k, e in enumerate(body) if text(e) == 'Details of Last year Annual Examination Results')
    table20 = body[k20 + 2]
    if text(body[k20 + 1]) or table20.tag != qn('w:tbl') or not text(table20).startswith('ClassDuration'):
        raise SystemExit('Point 20 not in the expected state; nothing changed.')

    # 1. page 1 gaps
    for p in gaps:
        make_half(p)
    make_minimal(after16)
    # 2. point 16 columns
    set_tabs(phone, [LABEL_COLUMN, ANSWER_COLUMN])
    set_tabs(email, [LABEL_COLUMN, ANSWER_COLUMN])
    lead = []
    for r in email.findall(qn('w:r')):
        if r.find(qn('w:t')) is not None:
            break
        lead.extend(r.findall(qn('w:tab')))
    for t in lead[1:]:
        r = t.getparent()
        r.remove(t)
        if not len([c for c in r if c.tag != qn('w:rPr')]):
            email.remove(r)
    # 3. 19(b) -> 19(c)
    for p in between:
        p.getparent().remove(p)
    set_flag(body[k19c], 'w:pageBreakBefore')
    # 5. enclosure list -> certificate
    for p in after_list:
        p.getparent().remove(p)
    set_flag(body[kc], 'w:pageBreakBefore')
    # 4. point 20 heading with its table
    set_flag(body[k20], 'w:keepNext')
    set_flag(body[k20 + 1], 'w:keepNext')
    rows = table20.findall(qn('w:tr'))
    for tr in rows[:-1]:
        for p in tr.iter(qn('w:p')):
            set_flag(p, 'w:keepNext')

    doc.save(MASTER)
    print('Page 1: 6 half-height gaps; point 16 aligned; no blank page after 19(b); point 20 kept with its table; no blank page after the enclosure list.')


if __name__ == '__main__':
    main()
