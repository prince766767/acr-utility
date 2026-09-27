"""One-time fix of two certificate lines on page 11 of ACR_EMPLOYEE_MASTER.docx (official form: PDF page 12).

1. "Place: {{COLLEGE_PIN}}, {{COLLEGE_NAME}}" printed "Place: ," when the college details were empty.
   It becomes "Place: {{PLACE}}"; generate_acr.py builds PLACE from whichever parts are filled.
2. The Principal's signature line read "Signature (with stamp)" / line break / "Principal".
   The form reads "Signature (with stamp) of Principal" on one line.
Refuses to run if the template does not look exactly as expected.
"""
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

MASTER = Path(__file__).resolve().parents[1] / 'ACR_EMPLOYEE_MASTER.docx'
PLACE_OLD = 'Place: {{COLLEGE_PIN}}, {{COLLEGE_NAME}}'
PLACE_NEW = 'Place: {{PLACE}}'


def main():
    doc = Document(MASTER)
    body = doc.element.body
    place = [t for t in body.iter(qn('w:t')) if t.text == PLACE_OLD]
    sig = [t for t in body.iter(qn('w:t')) if t.text == 'Signature (with stamp)']
    if len(place) != 1 or len(sig) != 1:
        raise SystemExit('Page 11 lines not in the expected state; nothing changed.')

    place[0].text = PLACE_NEW

    # Remove everything between "Signature (with stamp)" and the "Principal" text that follows it
    # (a line break and tabs), then remove "Principal" itself and say "of Principal" on the same line.
    sig_t = sig[0]
    sig_run = sig_t.getparent()
    para = sig_run.getparent()
    runs = para.findall(qn('w:r'))
    start = runs.index(sig_run)
    doomed = []
    elements = [ch for r in runs[start:] for ch in r if ch.tag != qn('w:rPr')]
    after = elements[elements.index(sig_t) + 1:]
    found = False
    for ch in after:
        if ch.tag in (qn('w:br'), qn('w:tab')):
            doomed.append(ch)
        elif ch.tag == qn('w:t') and ch.text == 'Principal':
            doomed.append(ch)
            found = True
            break
        elif ch.tag == qn('w:t') and not (ch.text or '').strip():
            continue
        else:
            break
    if not found:
        raise SystemExit('"Principal" not found after "Signature (with stamp)"; nothing changed.')
    for ch in doomed:
        ch.getparent().remove(ch)
    sig_t.text = 'Signature (with stamp) of Principal'
    doc.save(MASTER)
    print('Fixed page 11: "Place: {{PLACE}}" and "Signature (with stamp) of Principal".')


if __name__ == '__main__':
    main()
