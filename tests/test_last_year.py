import json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api_tally import last_year_problems, last_year_cells  # noqa: E402

CASES = json.loads((ROOT / 'tests' / 'fixtures' / 'last_year_cases.json').read_text(encoding='utf-8'))


class LastYear(unittest.TestCase):
    def test_shared_cases(self):
        for c in CASES:
            with self.subTest(c['name']):
                self.assertEqual(last_year_problems(c['ly']), c['problems'])
                self.assertEqual(last_year_cells(c['ly']), c['cells'])


if __name__ == '__main__':
    unittest.main()
