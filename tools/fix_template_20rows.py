"""One-time fix: line up the data rows of point 20 (table 4) of ACR_EMPLOYEE_MASTER.docx with its header.

In the header, "University pass %age" is one grid column and "Variation (col. 5-6)" spans two. In the data rows
it was the other way round: the University cell spanned two columns and the Variation cell one, so every
university % sat half under the Variation heading. Official form: PDF page 4.
Refuses to run if the rows are not in exactly that state.
"""
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'


def span(tc):
    g = tc.tcPr.find(qn('w:gridSpan')) if tc.tcPr is not None else None
    return int(g.get(qn('w:val'))) if g is not None else 1


def set_span(tc, n):
    g = tc.tcPr.find(qn('w:gridSpan'))
    if n == 1:
        if g is not None:
            tc.tcPr.remove(g)
        return
    if g is None:
        g = OxmlElement('w:gridSpan')
        tc.tcPr.insert(1 if tc.tcPr.find(qn('w:tcW')) is not None else 0, g)
    g.set(qn('w:val'), str(n))


def main():
    doc = Document(MASTER)
    trs = doc.tables[4]._tbl.tr_lst
    header = [span(tc) for tc in trs[2].tc_lst]
    if header[:8] != [1, 1, 1, 1, 1, 1, 2, 1]:
        raise SystemExit('Table 4: column-number row not as expected; nothing changed.')
    rows = trs[3:]
    if not rows or any([span(tc) for tc in tr.tc_lst][:7] != [1, 1, 1, 1, 1, 2, 1] for tr in rows):
        raise SystemExit('Table 4: data rows not in the expected misaligned state; nothing changed.')
    for tr in rows:
        tcs = tr.tc_lst
        if any(''.join(tc.itertext()).strip() for tc in tcs):
            raise SystemExit('Table 4: data rows are not empty; nothing changed.')
        set_span(tcs[5], 1)
        set_span(tcs[6], 2)
        # keep the cell widths in step with the header's cells for the same grid columns
        for i in (5, 6):
            w_src = trs[2].tc_lst[i].tcPr.find(qn('w:tcW'))
            w_dst = tcs[i].tcPr.find(qn('w:tcW'))
            if w_src is not None and w_dst is not None:
                w_dst.set(qn('w:w'), w_src.get(qn('w:w')))
                w_dst.set(qn('w:type'), w_src.get(qn('w:type')))
    doc.save(MASTER)
    print(f'Fixed table 4: {len(rows)} data rows now line up with the header (point 20).')


if __name__ == '__main__':
    main()
