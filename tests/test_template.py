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


if __name__ == '__main__':
    unittest.main()
