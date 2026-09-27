"""One-time fix: restore point 27(iii) in ACR_EMPLOYEE_MASTER.docx to the official form (PDF page 8).

Table 12's "(iii)" row was overwritten with sample data and its two blank entry rows were missing.
Refuses to run if the table does not look exactly as expected, so it cannot damage a fixed template.
"""
from copy import deepcopy
from pathlib import Path
from docx import Document

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'


def main():
    doc = Document(MASTER)
    t = doc.tables[12]
    row9, blank = t.rows[9], t.rows[6]
    runs = row9.cells[1].paragraphs[0].runs
    if len(t.rows) != 12 or not row9.cells[1].text.startswith('(iii) Chaired') or row9.cells[3].text.strip() != '02':
        raise SystemExit('Table 12 is not in the expected damaged state; nothing changed.')
    if any(c.text.strip() for c in blank.cells):
        raise SystemExit('Row 6 of table 12 is not blank; nothing changed.')
    # Keep run 0 ("(iii) ", bold) and its formatting; replace the sample text.
    runs[1].text = 'Professional Development Activities'
    for r in runs[2:]:
        r.text = ''
    for c in (2, 3):
        for p in row9.cells[c].paragraphs:
            for r in p.runs:
                r.text = ''
    row9._tr.addnext(deepcopy(blank._tr))
    row9._tr.addnext(deepcopy(blank._tr))
    doc.save(MASTER)
    print('Fixed table 12 (point 27(iii)).')


if __name__ == '__main__':
    main()
