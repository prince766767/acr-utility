"""The teacher's text style (colour, font, size, bold, italic) applies to every filled-in answer, nothing else."""
import json, sys, tempfile, unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generate_acr  # noqa: E402

FULL = json.loads((ROOT / 'tests' / 'fixtures' / 'full_record.acr.json').read_text(encoding='utf-8'))


def make(style):
    data = json.loads(json.dumps(FULL))
    if style is not None:
        data['style'] = style
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / 'x.docx'
        generate_acr.generate(data, out)
        return Document(out), out.read_bytes()


def runs_with_text(doc):
    for r in doc.element.body.iter(qn('w:r')):
        if ''.join(t.text or '' for t in r.iter(qn('w:t'))).strip():
            yield r


def color(r):
    c = r.find(qn('w:rPr') + '/' + qn('w:color')) if r.find(qn('w:rPr')) is not None else None
    return c.get(qn('w:val')) if c is not None else None


class TextStyle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plain, _ = make({'chosen': True, 'color': '0000CC'})   # a teacher who chose blue: the template's own look
        cls.blue_runs = [r for r in runs_with_text(cls.plain) if color(r) == '0000CC']

    def test_no_choice_prints_black_in_the_form_font(self):
        doc, _ = make(None)
        self.assertFalse([r for r in runs_with_text(doc) if color(r) == '0000CC'])
        black = [r for r in runs_with_text(doc) if color(r) == '000000']
        self.assertGreaterEqual(len(black), len(self.blue_runs))
        name = next(r for r in black if ''.join(t.text or '' for t in r.iter(qn('w:t'))) == 'ASHA DEVI')
        rpr = name.find(qn('w:rPr'))
        self.assertIsNone(rpr.find(qn('w:b')))
        self.assertEqual(rpr.find(qn('w:rFonts')).get(qn('w:ascii')), 'Times New Roman')

    def test_style_saved_before_choosing_was_possible_counts_as_no_choice(self):
        doc, _ = make({'color': '0000CC', 'font': '', 'size': 0, 'bold': False, 'italic': False})
        self.assertFalse([r for r in runs_with_text(doc) if color(r) == '0000CC'])

    def test_style_applies_to_every_filled_answer_only(self):
        doc, _ = make({'chosen': True, 'color': '1F3864', 'font': 'Arial', 'size': 11, 'bold': True, 'italic': True})
        styled = [r for r in runs_with_text(doc) if color(r) == '1F3864']
        self.assertEqual(len(styled), len(self.blue_runs))
        self.assertFalse([r for r in runs_with_text(doc) if color(r) == '0000CC'])
        texts = {''.join(t.text or '' for t in r.iter(qn('w:t'))) for r in styled}
        self.assertIn('ASHA DEVI', texts)
        for r in styled:
            rpr = r.find(qn('w:rPr'))
            fonts = rpr.find(qn('w:rFonts'))
            self.assertEqual((fonts.get(qn('w:ascii')), fonts.get(qn('w:hAnsi')), fonts.get(qn('w:cs'))), ('Arial',) * 3)
            self.assertIsNone(fonts.get(qn('w:asciiTheme')))
            self.assertEqual(rpr.find(qn('w:sz')).get(qn('w:val')), '22')
            self.assertEqual(rpr.find(qn('w:szCs')).get(qn('w:val')), '22')
            self.assertIsNotNone(rpr.find(qn('w:b')))
            self.assertIsNotNone(rpr.find(qn('w:i')))
        # paragraph marks of answers take the colour only (their size would change line heights)
        marks = [c for c in doc.element.body.iter(qn('w:color')) if c.getparent().getparent().tag == qn('w:pPr')]
        self.assertFalse([c for c in marks if c.get(qn('w:val')) == '0000CC'])
        # printed form text keeps its own look
        heading = next(r for r in runs_with_text(doc) if 'PART-I PERSONAL DATA' in ''.join(t.text or '' for t in r.iter(qn('w:t'))))
        self.assertNotEqual(color(heading), '1F3864')

    def test_bad_values_fall_back_to_defaults(self):
        self.assertEqual(generate_acr.normalize_style({'chosen': True, 'color': 'red', 'font': 'Comic Sans', 'size': 40, 'bold': 'yes'}),
                         {'color': '000000', 'font': '', 'size': 0, 'bold': False, 'italic': False, 'chosen': True})
        self.assertEqual(generate_acr.normalize_style({'chosen': True, 'color': '#1f3864', 'size': '12'}),
                         {'color': '1F3864', 'font': '', 'size': 12, 'bold': False, 'italic': False, 'chosen': True})
        self.assertEqual(generate_acr.normalize_style({'color': '#1f3864'}),   # not chosen: the default
                         {'color': '000000', 'font': '', 'size': 0, 'bold': False, 'italic': False, 'chosen': False})


if __name__ == '__main__':
    unittest.main()
