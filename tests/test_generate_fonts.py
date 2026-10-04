import json, shutil, sys, tempfile, unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generate_acr  # noqa: E402

FIXTURES = ROOT / 'tests' / 'fixtures'


class TableValueFonts(unittest.TestCase):
    """Values written into table cells must not fall back to the template's default font (Calibri)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        full = json.loads((FIXTURES / 'full_record.acr.json').read_text(encoding='utf-8'))
        full['api'] = json.loads((FIXTURES / 'cases.json').read_text(encoding='utf-8'))[0]['api']
        full['style'] = {'chosen': True, 'color': '0000CC'}   # answers stay blue here, so they can be found by colour
        generate_acr.generate(full, cls.tmp / 'all.docx')
        cls.doc = Document(cls.tmp / 'all.docx')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_every_table_value_has_its_own_font(self):
        missing, calibri, checked = [], [], 0
        for ti, t in enumerate(self.doc.tables):
            for r in t._tbl.iter(qn('w:r')):
                text = ''.join(x.text or '' for x in r.iter(qn('w:t'))).strip()
                rpr = r.find(qn('w:rPr'))
                colour = rpr.find(qn('w:color')) if rpr is not None else None
                if not text or colour is None or colour.get(qn('w:val')).upper() != '0000CC':
                    continue
                checked += 1
                fonts = rpr.find(qn('w:rFonts'))
                if fonts is None or not fonts.get(qn('w:ascii')):
                    missing.append((ti, text))
                elif fonts.get(qn('w:ascii')) == 'Calibri':
                    calibri.append((ti, text))
        self.assertGreater(checked, 100)
        self.assertEqual(missing, [])
        self.assertEqual(calibri, [])


if __name__ == '__main__':
    unittest.main()
