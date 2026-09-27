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


if __name__ == '__main__':
    unittest.main()
