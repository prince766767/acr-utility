"""One-time follow-up to fix_template_google_p13gap.py: the blank line between the headings of points 40 and
41 and their dotted answer lines becomes half height (6.7 pt instead of 13.35 pt), both alike.

Google Docs still pushed the last line of that page (the N.B.) onto an extra page; this wins the line back.
Refuses to run twice.
"""
import sys
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fix_template_google_breaks import MASTER  # noqa: E402

HEADINGS = ('DOES HE/SHE TAKE INTEREST IN USE OF HINDI', 'HIS ATTITUDE TOWARDS')


def text(e):
    return ' '.join(''.join(x.text or '' for x in e.iter(qn('w:t'))).split())


def main():
    doc = Document(MASTER)
    body = list(doc.element.body)
    blanks = []
    for start in HEADINGS:
        k = next(k for k, e in enumerate(body) if text(e).startswith(start))
        if text(body[k + 1]):
            raise SystemExit(f'No blank line under "{start}"; nothing changed.')
        blanks.append(body[k + 1])
    sps = [p.find(qn('w:pPr') + '/' + qn('w:spacing')) for p in blanks]
    if any(sp is None or sp.get(qn('w:line')) != '267' for sp in sps):
        raise SystemExit('Blank lines not in the expected state (already fixed?); nothing changed.')
    for sp in sps:
        sp.set(qn('w:before'), '0')
        sp.set(qn('w:line'), '134')
        sp.set(qn('w:lineRule'), 'exact')
    doc.save(MASTER)
    print('Blank lines under points 40 and 41 are now half height.')


if __name__ == '__main__':
    main()
