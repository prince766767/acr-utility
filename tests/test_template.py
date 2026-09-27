import sys, unittest
from pathlib import Path
from docx import Document

ROOT = Path(__file__).resolve().parents[1]


class Template27iii(unittest.TestCase):
    def test_27iii_matches_official_form(self):
        t = Document(ROOT / 'ACR_EMPLOYEE_MASTER.docx').tables[12]
        col1 = [r.cells[1].text.strip() for r in t.rows]
        self.assertEqual(len(t.rows), 14)
        self.assertEqual(col1[9], '(iii) Professional Development Activities')
        self.assertEqual([t.rows[9].cells[c].text.strip() for c in (0, 2, 3)], ['', '', ''])
        for r in (10, 11):
            self.assertEqual([c.text.strip() for c in t.rows[r].cells], ['', '', '', ''])
        self.assertEqual(col1[12], 'Total (Max.15)')
        self.assertTrue(col1[13].startswith('Total Score (I+II+III)'))
        self.assertNotIn('Chaired', ' '.join(col1))
        heading = [(r.font.color.rgb, r.bold) for r in t.rows[9].cells[1].paragraphs[0].runs[:2]]
        reference = [(r.font.color.rgb, r.bold) for r in t.rows[5].cells[1].paragraphs[0].runs[:2]]
        self.assertEqual(heading, reference)

    def test_entry_rows_have_no_merged_cells(self):
        # Every entry row of the point 26-28 tables needs its own cells, or one score overwrites another.
        from docx.oxml.ns import qn
        doc = Document(ROOT / 'ACR_EMPLOYEE_MASTER.docx')
        for ti in (10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22):
            for r, tr in enumerate(doc.tables[ti]._tbl.tr_lst):
                for tc in tr.tc_lst:
                    self.assertIsNone(tc.tcPr.find(qn('w:vMerge')) if tc.tcPr is not None else None, f'table {ti} row {r}')


class TemplateIsBlank(unittest.TestCase):
    """The master must match the blank official form: no teacher's leftover entries."""
    @classmethod
    def setUpClass(cls):
        cls.doc = Document(ROOT / 'ACR_EMPLOYEE_MASTER.docx')

    def test_no_leftover_entries(self):
        from docx.oxml.ns import qn
        left = []
        for r in self.doc.element.body.iter(qn('w:r')):
            rpr = r.find(qn('w:rPr'))
            c = rpr.find(qn('w:color')) if rpr is not None else None
            text = ''.join(t.text or '' for t in r.iter(qn('w:t'))).strip()
            if c is not None and (c.get(qn('w:val')) or '').upper() in ('0000CC', '006600', 'FF0000') and text and '{{' not in text:
                left.append(text)
        self.assertEqual(left, [])
        full = ' '.join(t.text or '' for t in self.doc.element.body.iter(qn('w:t')))  # paragraphs and tables
        for s in ('NIL', '2024-25'):
            self.assertNotIn(s, full)

    def test_no_auto_numbering_in_entry_rows(self):
        from docx.oxml.ns import qn
        for ti in range(7, 23):
            for tr in self.doc.tables[ti]._tbl.tr_lst[1:]:
                self.assertEqual(tr.findall('.//' + qn('w:numPr')), [], f'table {ti}')

    def test_26ii_has_no_leftover_note_and_44_has_E_ii_label(self):
        self.assertFalse(any('Besides' in r.cells[0].text for r in self.doc.tables[9].rows))
        self.assertEqual(self.doc.tables[29].rows[8].cells[0].text.strip(), 'E (ii)')


class TemplatePage11(unittest.TestCase):
    def test_certificate_lines_match_form(self):
        doc = Document(ROOT / 'ACR_EMPLOYEE_MASTER.docx')
        texts = [p.text for p in doc.paragraphs]
        self.assertIn('Place: {{PLACE}}Signature of the reported on officer', [t.replace('	', '') for t in texts])
        self.assertFalse(any('{{COLLEGE_PIN}}, {{COLLEGE_NAME}}' in t for t in texts))
        sig = [t for t in texts if 'Signature (with stamp)' in t]
        self.assertEqual(len(sig), 1)
        self.assertEqual(sig[0].replace('	', '').strip(), 'Date:Signature (with stamp) of Principal')


if __name__ == '__main__':
    unittest.main()
