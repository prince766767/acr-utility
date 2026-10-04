"""One-time fix: turn Word text boxes that Google Docs redraws badly into ordinary bordered paragraphs.

Google Docs (which makes the PDF for Share / Save to Google Drive) converts floating text boxes into
drawings with its own fonts and positions; the "NOTE:- (*), (**)" box under point 44 even landed inside the
point 45 table. Paragraphs with a border (one box around them) look the same in Word and stay in place in
Google Docs. Paragraphs, not a table: generate_acr.py and docx_engine.js find tables by position, so no
table may be added. The box's own paragraphs are moved out unchanged apart from the border and indents.
Refuses to run if a box is not found.

Usage: python tools/fix_template_textboxes.py
"""
import copy
import sys
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER, make_minimal  # noqa: E402
WPS_TXBX = '{http://schemas.microsoft.com/office/word/2010/wordprocessingShape}txbx'
WP = '{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}'
EMU_PER_TWIP = 635
MC_ALT = '{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent'

# (text the box starts with, space before the first paragraph in twips, where they go relative to the box's
#  paragraph, line spacing to use or None to keep). The paragraph that only held the box is then shrunk.
BOXES = [
    ('NOTE:- (*), (**)', 0, 'before', None),      # under the point 44 table, before heading 45
    # point 47, Part IV. The box was too short and hid its last (dotted) line, which the official form shows;
    # showing it costs a line, won back by 1.25 instead of 1.5 line spacing so page 21 still fits.
    ('Teacher Name', 0, 'before', 300),
    ('Overall performance in percentage', 0, 'before', None),  # these two share one paragraph: keep this order
    ('Note:-', 0, 'before', None),
]


def text(el):
    return ' '.join(''.join(t.text or '' for t in el.iter(qn('w:t'))).split())


def find_box(body, start):
    for tb in body.iter(WPS_TXBX):
        if text(tb).startswith(start):
            alt = tb
            while alt is not None and alt.tag != MC_ALT:
                alt = alt.getparent()
            host = alt
            while host is not None and host.tag != qn('w:p'):
                host = host.getparent()
            return tb, alt, host
    return None


def el(tag, **attrs):
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn('w:' + k), str(v))
    return e


PPR_BEFORE_PBDR = ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl', 'w:numPr', 'w:suppressLineNumbers']
PPR_BEFORE_IND = PPR_BEFORE_PBDR + ['w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap', 'w:overflowPunct',
                                    'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing']


def put(ppr, new, after_tags):
    """Insert `new` into ppr in schema order (replacing an existing element of the same tag)."""
    old = ppr.find(new.tag)
    if old is not None:
        old.addprevious(new)
        ppr.remove(old)
        return
    for i, ch in enumerate(ppr):
        if ch.tag not in [qn(t) for t in after_tags]:
            ppr.insert(i, new)
            return
    ppr.append(new)


def box_offsets(alt, host, body):
    """(left, right) distance in twips from the section's text margins to the box's edges."""
    anchor = alt.find('.//' + WP + 'anchor')
    sect = None
    for el_ in [host] + list(host.itersiblings()):
        sect = el_.find(qn('w:pPr') + '/' + qn('w:sectPr')) if el_.tag == qn('w:p') else None
        if sect is not None:
            break
    if sect is None:
        sect = body.find(qn('w:sectPr'))
    page_w = int(sect.find(qn('w:pgSz')).get(qn('w:w')))
    mar = sect.find(qn('w:pgMar'))
    m_left, m_right = int(mar.get(qn('w:left'))), int(mar.get(qn('w:right')))
    width = int(anchor.find(WP + 'extent').get('cx')) // EMU_PER_TWIP
    ph = anchor.find(WP + 'positionH')
    frm, off, align = ph.get('relativeFrom'), ph.find(WP + 'posOffset'), ph.find(WP + 'align')
    base, span = (0, page_w) if frm == 'page' else (m_left, page_w - m_left - m_right)
    if off is not None:
        x = base + int(off.text) // EMU_PER_TWIP
    elif align.text == 'center':
        x = base + (span - width) // 2
    elif align.text == 'right':
        x = base + span - width
    else:
        x = base
    return (x - m_left, (page_w - m_right) - (x + width)), page_w - m_left - m_right


def bordered_paragraphs(paragraphs, space_before, offsets, default_tab, page_text_width, line=None):
    """Copies of the box's paragraphs with one shared border. Word draws one box around consecutive
    paragraphs only when their borders AND left/right indents match, so every paragraph gets the same
    left/right indent; each keeps its own first-line position through a hanging indent."""
    def ind_of(p):
        ppr = p.find(qn('w:pPr'))
        ind = ppr.find(qn('w:ind')) if ppr is not None else None
        get = (lambda k: int(ind.get(qn('w:' + k), 0))) if ind is not None else (lambda k: 0)
        first = get('firstLine') - get('hanging')
        return get('left'), get('right'), first
    inds = [ind_of(p) for p in paragraphs]
    inner_left = max(i[0] for i in inds) + 144           # 144 twips = the text box's inner margin
    left = inner_left + offsets[0]
    right = max(i[1] for i in inds) + 144 + offsets[1]
    # Word also compares the hanging/first-line indent, so all paragraphs get the same one: the largest
    # hanging indent among them (numbered items keep their look; others move by a hair).
    hangs = [inner_left - (l + 144 + first) for l, r, first in inds]
    shared = max(hangs)
    out = []
    for n, (p, (l, r, first)) in enumerate(zip(paragraphs, inds)):
        p = copy.deepcopy(p)
        ppr = p.find(qn('w:pPr'))
        if ppr is None:
            ppr = el('w:pPr')
            p.insert(0, ppr)
        bdr = el('w:pBdr')
        for side in ('top', 'left', 'bottom', 'right'):
            # 1 point between border and text: with more, Word drops the right border of justified paragraphs
            # with a hanging indent (seen on the point 47 Note)
            bdr.append(el('w:' + side, val='single', sz=4, space=1, color='000000'))
        put(ppr, bdr, PPR_BEFORE_PBDR)
        hang = shared
        new_ind = el('w:ind', left=left, right=right)
        if hang > 0:
            new_ind.set(qn('w:hanging'), str(hang))
        elif hang < 0:
            new_ind.set(qn('w:firstLine'), str(-hang))
        put(ppr, new_ind, PPR_BEFORE_IND)
        # Tab stops count from the text margin: inside the box that was the box's inner edge, outside it is the
        # page margin. Shift explicit stops by that distance and write the box's default stops out explicitly.
        shift = offsets[0] + 144
        tabs = ppr.find(qn('w:tabs'))
        if tabs is None:
            tabs = el('w:tabs')
            put(ppr, tabs, PPR_BEFORE_PBDR + ['w:pBdr', 'w:shd'])
        explicit = []
        for t in tabs.findall(qn('w:tab')):
            pos = int(t.get(qn('w:pos'))) + shift
            t.set(qn('w:pos'), str(pos))
            explicit.append(pos)
        box_text_width = page_text_width - offsets[0] - offsets[1] - 288
        k = 1
        while k * default_tab < box_text_width:
            pos = shift + k * default_tab
            if all(pos > e for e in explicit):   # default stops only count after the last explicit one
                tabs.append(el('w:tab', val='left', pos=pos))
            k += 1
        stops = sorted(tabs.findall(qn('w:tab')), key=lambda t: int(t.get(qn('w:pos'))))
        for t in stops:
            tabs.remove(t)
            tabs.append(t)
        if line:
            sp = ppr.find(qn('w:spacing'))
            if sp is not None and sp.get(qn('w:lineRule'), 'auto') == 'auto':
                sp.set(qn('w:line'), str(line))
        if n == 0 and space_before:
            sp = ppr.find(qn('w:spacing'))
            if sp is None:
                sp = el('w:spacing')
                put(ppr, sp, PPR_BEFORE_PBDR + ['w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap',
                                                'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi',
                                                'w:adjustRightInd', 'w:snapToGrid'])
            sp.set(qn('w:before'), str(space_before))
        out.append(p)
    return out


def main():
    doc = Document(MASTER)
    body = doc.element.body
    dts = doc.settings.element.find(qn('w:defaultTabStop'))
    default_tab = int(dts.get(qn('w:val'))) if dts is not None else 720
    found = [(spec, find_box(body, spec[0])) for spec in BOXES]
    missing = [spec[0] for spec, f in found if f is None]
    if missing:
        raise SystemExit(f'Text box(es) not found (already fixed?): {missing}; nothing changed.')
    hosts = []
    for (start, space_before, where, line), (tb, alt, host) in found:
        content = tb.find(qn('w:txbxContent'))
        if content.find(qn('w:tbl')) is not None:
            raise SystemExit(f'Box "{start}" holds a table; not handled. Nothing changed.')
        offsets, text_width = box_offsets(alt, host, body)
        new = bordered_paragraphs(content.findall(qn('w:p')), space_before, offsets, default_tab, text_width, line)
        run = alt.getparent()
        run.remove(alt)
        if not len([c for c in run if c.tag != qn('w:rPr')]):
            run.getparent().remove(run)
        anchor = host
        for p in (new if where == 'before' else reversed(new)):
            if where == 'before':
                anchor.addprevious(p)
            else:
                anchor.addnext(p)
        hosts.append(host)
        print(f'Converted text box "{start}..." to {len(new)} bordered paragraph(s) {where} its paragraph.')
    for host in hosts:
        if not text(host) and host.find('.//' + qn('w:drawing')) is None and host.find('.//' + qn('w:pict')) is None:
            make_minimal(host)
    doc.save(MASTER)


if __name__ == '__main__':
    main()
