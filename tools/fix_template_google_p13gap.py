"""One-time fix: shrink the two blank paragraphs between point 41's dotted line and "Signature of Reporting
Officer" (end of the Part-III points 35-41 page).

Google Docs lays that full page out a little taller than Word, so the last lines ("Designation", "Date",
the N.B.) spilled onto an extra page. Shrinking these blanks moves the signature block up about 0.5 inch in
Word too (the heading keeps its own space above). The official form spaces this part differently anyway.
Refuses to run twice.
"""
import sys
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER, make_minimal  # noqa: E402


def text(e):
    return ' '.join(''.join(x.text or '' for x in e.iter(qn('w:t'))).split())


def main():
    doc = Document(MASTER)
    body = list(doc.element.body)
    sig = next(k for k, e in enumerate(body) if text(e) == 'Signature of Reporting Officer'
               and any(text(body[j]).startswith('HIS ATTITUDE TOWARDS') for j in range(max(0, k - 6), k)))
    blanks = []
    j = sig - 1
    while not text(body[j]):
        blanks.append(body[j])
        j -= 1
    def done(p):
        sp = p.find(qn('w:pPr') + '/' + qn('w:spacing'))
        return sp is not None and sp.get(qn('w:line')) == '20'
    if len(blanks) != 2 or all(done(p) for p in blanks):
        raise SystemExit('Not in the expected state (already fixed?); nothing changed.')
    for p in blanks:
        make_minimal(p)
    doc.save(MASTER)
    print('Shrank 2 blank paragraphs above "Signature of Reporting Officer".')


if __name__ == '__main__':
    main()
