import json, shutil, sys, tempfile, unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generate_acr  # noqa: E402

WORKED = json.loads((ROOT / 'tests' / 'fixtures' / 'cases.json').read_text(encoding='utf-8'))[0]['api']


def cells(doc, t, col):
    return [doc.tables[t].rows[r].cells[col].text.strip() for r in (1, 2, 3, 4)]


class Point45(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def gen(self, ly):
        api = dict(WORKED)
        if ly is not None:
            api['lastAcademicYear'] = ly
        out = self.tmp / 'p45.docx'
        generate_acr.generate({'session': '2025-26', 'api': api}, out)
        return Document(out)

    def test_last_year_and_this_year(self):
        d = self.gen({'cat1': '90', 'cat2': '20', 'total12': 'stale', 'cat3': '12.5', 'source': 'typed'})
        self.assertEqual(cells(d, 23, 2), ['90', '20', '110', '12.5'])          # point 29 col 3
        self.assertEqual(cells(d, 31, 2), ['90', '20', '110', '12.5'])          # point 45 col 3
        self.assertEqual(cells(d, 31, 3), cells(d, 23, 3))                      # point 45 col 4 = point 29 col 4
        self.assertEqual(cells(d, 31, 3), ['106.75', '25', '131.75', '193'])
        self.assertEqual(cells(d, 31, 4), ['', '', '', ''])                     # Principal column untouched

    def test_no_last_year_prints_blank(self):
        d = self.gen(None)
        self.assertEqual(cells(d, 23, 2), ['', '', '', ''])
        self.assertEqual(cells(d, 31, 2), ['', '', '', ''])
        self.assertEqual(cells(d, 31, 3), ['106.75', '25', '131.75', '193'])

    def test_invalid_typed_figures_block(self):
        out = self.tmp / 'bad.docx'
        api = dict(WORKED, lastAcademicYear={'cat1': '130', 'cat2': '20', 'cat3': '5'})
        with self.assertRaises(generate_acr.ProblemsError) as ctx:
            generate_acr.generate({'api': api}, out)
        self.assertEqual(ctx.exception.problems[-1]['message'], "Last academic year I is 130; the form's maximum is 125.")
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
