"""One-time fix: the 26(i) table (Course/Paper, Level, Mode of Teaching, ...) had its "Mode of Teaching" cells merged
across the entry rows (left over from a filled-in form). Each entry row needs its own cells now that the app prints
one row per course, so the merge is removed. Refuses to run if the table is not in that state.
"""
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'


def main():
    doc = Document(MASTER)
    t = doc.tables[7]
    if not t.rows[0].cells[1].text.strip().startswith('Course'):
        raise SystemExit('Table 7 is not the 26(i) table; nothing changed.')
    merges = [tc.tcPr.find(qn('w:vMerge')) for tr in t._tbl.tr_lst for tc in tr.tc_lst if tc.tcPr is not None]
    merges = [m for m in merges if m is not None]
    if not merges:
        raise SystemExit('No merged cells in the 26(i) table (already fixed?); nothing changed.')
    for m in merges:
        m.getparent().remove(m)
    doc.save(MASTER)
    print(f'Removed {len(merges)} vertical merge(s) from the 26(i) table.')


if __name__ == '__main__':
    main()
