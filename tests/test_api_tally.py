import json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api_tally import tally, fmt, to_cents, score_text, is_empty_entry  # noqa: E402

CASES = json.loads((ROOT / 'tests' / 'fixtures' / 'cases.json').read_text(encoding='utf-8'))


def pick(obj, path):
    for k in path.split('.'):
        obj = obj[k]
    return obj


class SharedCases(unittest.TestCase):
    def test_cases(self):
        for c in CASES:
            with self.subTest(c['name']):
                r = tally(c['api'])
                if 'values' in c:
                    self.assertEqual(r['values'], c['values'])
                for path, expected in c.get('checks', {}).items():
                    self.assertEqual(pick(r['values'], path), expected, path)
                self.assertEqual(r['problems'], c['problems'])

    def test_invariants(self):
        for c in CASES:
            v = tally(c['api'])['values']
            self.assertEqual(v['p29']['I'], v['p42']['total'])
            self.assertEqual(v['p29']['II'], v['p43']['total'])
            self.assertEqual(v['p29']['III'], v['p44']['total'])


class Helpers(unittest.TestCase):
    def test_fmt(self):
        self.assertEqual([fmt(2000), fmt(750), fmt(1225), fmt(5), fmt(0)], ['20', '7.5', '12.25', '0.05', '0'])

    def test_to_cents(self):
        self.assertEqual(to_cents(''), ('missing', None))
        self.assertEqual(to_cents(None), ('missing', None))
        self.assertEqual(to_cents('7.50'), ('ok', 750))
        self.assertEqual(to_cents(0.1), ('ok', 10))
        self.assertEqual(to_cents(45.0), ('ok', 4500))
        self.assertEqual(to_cents('1.234'), ('bad', None))
        self.assertEqual(to_cents(-1), ('bad', None))
        self.assertEqual(to_cents(True), ('bad', None))
        self.assertEqual(to_cents('\u0663'), ('bad', None))  # Arabic-Indic digit: JS rejects it too

    def test_score_text_and_empty(self):
        self.assertEqual(score_text(7.5), '7.5')
        self.assertEqual(score_text(''), '')
        self.assertTrue(is_empty_entry({'title': ' ', 'score': ''}))
        self.assertFalse(is_empty_entry({'score': 0}))


if __name__ == '__main__':
    unittest.main()
