"""One-time fix: split the merged API Score cell in point 26(iv) of ACR_EMPLOYEE_MASTER.docx.

In table 11 the API Score cells of the two entry rows were vertically merged, so the second duty's
score overwrote the first. The official form (PDF page 7) has a separate API Score cell in every row.
Refuses to run if the table does not look exactly as expected.
"""
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'


def vmerge(tc):
    pr = tc.tcPr
    return pr.find(qn('w:vMerge')) if pr is not None else None


def main():
    doc = Document(MASTER)
    t = doc.tables[11]
    trs = t._tbl.tr_lst
    cells = [trs[1].tc_lst[4], trs[2].tc_lst[4]]
    marks = [vmerge(tc) for tc in cells]
    if not t.rows[3].cells[1].text.startswith('Total Score') or None in marks \
            or marks[0].get(qn('w:val')) != 'restart' or any(''.join(tc.itertext()).strip() for tc in cells):
        raise SystemExit('Table 11 is not in the expected merged state; nothing changed.')
    for tc, mark in zip(cells, marks):
        tc.tcPr.remove(mark)
    doc.save(MASTER)
    print('Fixed table 11 (point 26(iv)).')


if __name__ == '__main__':
    main()
