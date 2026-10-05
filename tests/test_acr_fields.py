import json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from acr_fields import (parse_dob, dob_words, dob_digits, variation, field_problems,  # noqa: E402
                        token_values, part_tables, TOKENS)

CASES = json.loads((ROOT / 'tests' / 'fixtures' / 'field_cases.json').read_text(encoding='utf-8'))
FULL = json.loads((ROOT / 'tests' / 'fixtures' / 'full_record.acr.json').read_text(encoding='utf-8'))


class Dob(unittest.TestCase):
    def test_shared_cases(self):
        for c in CASES['dob']:
            with self.subTest(c['in']):
                state, dob = parse_dob(c['in'])
                self.assertEqual(state, c['state'])
                if state == 'ok':
                    self.assertEqual(dob_words(*dob), c['words'])
                    self.assertEqual(dob_digits(*dob), c['digits'])


class Variation(unittest.TestCase):
    def test_values(self):
        self.assertEqual(variation(92.5, 88), '+4.5')
        self.assertEqual(variation(80, '85.25'), '-5.25')
        self.assertEqual(variation('90', '90'), '0')
        self.assertEqual(variation('', 50), '')
        self.assertEqual(variation('100', '0'), '+100')
        self.assertEqual(variation('33.333', '33.33'), '0')
        self.assertEqual(variation('66.667', '66.66'), '+0.01')
        self.assertEqual(variation('abc', 50), '')


    def test_shared_cases(self):
        cases = json.loads((ROOT / 'tests' / 'fixtures' / 'variation_cases.json').read_text(encoding='utf-8'))
        for c, u, expected in cases:
            with self.subTest(c=c, u=u):
                self.assertEqual(variation(c, u), expected)


class Problems(unittest.TestCase):
    def test_shared_cases(self):
        for c in CASES['problems']:
            with self.subTest(c['name']):
                self.assertEqual(field_problems(c['data']), c['expected'])


class Tokens(unittest.TestCase):
    def test_full_record(self):
        v = token_values(FULL)
        self.assertEqual(set(v), set(TOKENS))
        self.assertEqual(v['COLLEGE_PLACE'], 'District Beta, State Epsilon, 171001')
        self.assertEqual(v['PAY_INFO'], 'Level 13A; Basic Pay 131400')
        self.assertEqual(v['PROMOTION'], 'No promotion')
        self.assertEqual(v['DOB_WORDS'], 'Fifth November Nineteen Hundred Eighty')
        self.assertEqual([v['ADDR1'], v['ADDR2'], v['ADDR3']], ['House 12', 'Ward 3', 'Town Delta, PIN 176001'])
        self.assertEqual(v['PLACE'], 'Govt College Alpha, 171001')
        self.assertEqual(v['REPORT_DATE'], '15/05/2032')
        self.assertEqual(v['CERT_DESIGNATION'], 'Associate Professor')
        self.assertEqual(v['P17'], 'Contribution line 1\nContribution line 2')

    def test_empty_record(self):
        v = token_values({})
        self.assertEqual(set(v), set(TOKENS))
        self.assertTrue(all(x == '' for k, x in v.items() if k != 'CERT_COLLEGE'))
        self.assertEqual(v['CERT_COLLEGE'], 'Govt. Degree College.')   # the form's own words when no college is given

    def test_cert_college_is_the_college_name(self):
        self.assertEqual(token_values({'profile': {'collegeName': ' Govt College Alpha '}})['CERT_COLLEGE'], 'Govt College Alpha')

    def test_partial_joins(self):
        v = token_values({'profile': {'basicPay': '5000', 'collegePin': '171001', 'promotionDate': 'P'}})
        self.assertEqual(v['PAY_INFO'], 'Basic Pay 5000')
        self.assertEqual(v['COLLEGE_PLACE'], '171001')
        self.assertEqual(v['PLACE'], '171001')
        self.assertEqual(v['PROMOTION'], 'P')


class Tables(unittest.TestCase):
    def test_full_record(self):
        t = part_tables(FULL)
        self.assertEqual(t['dob_digits'], '05111980')
        self.assertEqual(t['teaching'], [['1', 'B.Sc. I', 'GCA', '6', '150', '100%'], ['2', 'B.Sc. II', 'GCA', '6', '140', '95%']])
        self.assertEqual(t['total_periods'], '24')
        self.assertEqual(t['assignments'], [['1', 'B.Sc. I', '4', '2', 'Register p. 12']])
        self.assertEqual(t['activities'], [['Chem Quiz', 'Inter-class quiz']])
        self.assertEqual(t['results'], [['B.Sc. III', '1 year', '40', '38', '95', '88.5', '+6.5', '+6.5', '10', '20', '8', '2', '']])
        self.assertEqual(t['orientation'], [['Refresher in Chemistry, UGC', 'HRDC Shimla', '21 days', 'RC-7']])
        self.assertEqual(t['research'], [['Green synthesis', 'HPU', 'Minor', 'Ongoing']])
        self.assertEqual(t['other_info'], [['1', 'Reviewer for journal X']])

    def test_empty_rows_skipped_and_numbering(self):
        t = part_tables({'teaching': [{}, {'classCourse': 'X', 'syllabusPct': '80%'}], 'otherInfo': [{'text': ' '}, {'text': 'Y'}]})
        self.assertEqual(t['teaching'], [['1', 'X', '', '', '', '80%']])
        self.assertEqual(t['other_info'], [['1', 'Y']])
        self.assertEqual(t['dob_digits'], '')

    def test_19c_own_or_common_record(self):
        rows = [{'classCourse': 'B.Sc. I', 'assignments': '4 (2 oral)', 'tests': '2', 'record': 'Reg A'}, {'classCourse': 'B.Sc. II', 'assignments': '3', 'tests': '1', 'record': 'Reg B'}]
        own = part_tables({'assignments': rows})
        self.assertEqual(own['assignments'], [['1', 'B.Sc. I', '4 (2 oral)', '2', 'Reg A'], ['2', 'B.Sc. II', '3', '1', 'Reg B']])
        self.assertFalse(own['assignments_merged'])
        same = part_tables({'assignments': rows, 'part2': {'p19cSame': 'yes', 'p19cRecord': 'Assignment & Test Register'}})
        self.assertEqual(same['assignments'], [['1', 'B.Sc. I', '4 (2 oral)', '2', 'Assignment & Test Register'], ['2', 'B.Sc. II', '3', '1', '']])
        self.assertTrue(same['assignments_merged'])
        one = part_tables({'assignments': rows[:1], 'part2': {'p19cSame': 'yes', 'p19cRecord': 'Common'}})
        self.assertEqual(one['assignments'], [['1', 'B.Sc. I', '4 (2 oral)', '2', 'Common']])
        self.assertFalse(one['assignments_merged'])

    def test_teaching_text_and_percent_only_on_plain_number(self):
        t = part_tables({'teaching': [{'allocated': '4L + 2P', 'delivered': '60 (Theory)', 'syllabusPct': 'Completed'}, {'syllabusPct': '90.5'}, {'syllabusPct': '90% (Theory)'}],
                         'part2': {'totalPeriodsPerWeek': '18 + 6 (Practical)'}})
        self.assertEqual(t['teaching'], [['1', '', '', '4L + 2P', '60 (Theory)', 'Completed'], ['2', '', '', '', '', '90.5%'], ['3', '', '', '', '', '90% (Theory)']])
        self.assertEqual(t['total_periods'], '18 + 6 (Practical)')


if __name__ == '__main__':
    unittest.main()


class CollegesServedNumbered(unittest.TestCase):
    def test_one_line_per_college_is_numbered(self):
        v = token_values({'part2': {'p12': 'Govt. College Sarkaghat: May 06, 2021 to June 18, 2022\n\n Govt. College Bhoranj: June 18, 2022 to till date '}})
        self.assertEqual(v['COLLEGES_SERVED'], '(1) Govt. College Sarkaghat:\nMay 06, 2021 to June 18, 2022\n(2) Govt. College Bhoranj:\nJune 18, 2022 to till date')

    def test_single_line_or_own_numbers_stay_as_typed(self):
        # one college: not numbered, the dates go on their own line
        self.assertEqual(token_values({'part2': {'p12': 'Govt College Alpha: 01/04/2031 to 31/03/2032'}})['COLLEGES_SERVED'], 'Govt College Alpha:\n01/04/2031 to 31/03/2032')
        self.assertEqual(token_values({'part2': {'p12': 'Govt College Alpha'}})['COLLEGES_SERVED'], 'Govt College Alpha')
        self.assertEqual(token_values({'part2': {'p12': '1. College A\n2. College B'}})['COLLEGES_SERVED'], '1. College A\n2. College B')


class InlineMarks(unittest.TestCase):
    def test_shared_cases(self):
        from acr_fields import inline_marks
        for text, expected in json.loads((ROOT / 'tests' / 'fixtures' / 'mark_cases.json').read_text(encoding='utf-8')):
            with self.subTest(text):
                self.assertEqual([list(x) for x in inline_marks(text)], expected)
