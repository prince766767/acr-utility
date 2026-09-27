"""The app's Word file (docx_engine.js) must be the same as generate_acr.py's for the same record."""
import json, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generate_acr  # noqa: E402

FIX = ROOT / 'tests' / 'fixtures'
FULL = json.loads((FIX / 'full_record.acr.json').read_text(encoding='utf-8'))
WORKED = json.loads((FIX / 'cases.json').read_text(encoding='utf-8'))[0]['api']
TOOL = ROOT / 'tools' / 'make_docx_js.mjs'


def copy(x):
    return json.loads(json.dumps(x))


def records():
    full = copy(FULL)
    full['api'] = dict(copy(WORKED), lastAcademicYear={'cat1': '90', 'cat2': '20', 'cat3': '12.5', 'source': 'typed'})
    long = copy(FULL)
    for k in ('p17', 'p18', 'p19b', 'p19f', 'p19g', 'p25'):
        long['part2'][k] = '\n'.join(f'{k} line {i}: a long answer that wraps over the printed line.' for i in range(1, 11))
    extra = copy(FULL)
    extra['teaching'] = [{'classCourse': f'C{i}', 'college': 'G', 'allocated': 6, 'delivered': 100 + i, 'syllabusPct': 90} for i in range(7)]
    extra['assignments'] = [{'classCourse': f'A{i}', 'assignments': i, 'tests': 1} for i in range(1, 6)]
    extra['activities'] = [{'title': f'T{i}', 'detail': f'D{i}\nsecond line'} for i in range(3)]
    extra['results'] = [{'className': f'R{i}', 'collegePct': str(80 + i), 'universityPct': '79.5'} for i in range(6)]
    extra['orientation'] = [{'course': f'O{i}', 'place': 'P', 'duration': '21 days', 'rcoc': f'RC-{i}'} for i in range(3)]
    extra['research'] = [{'title': f'Rs{i}', 'institution': 'U', 'nature': 'Minor', 'status': 'On'} for i in range(2)]
    extra['otherInfo'] = [{'text': f'Info {i}'} for i in range(3)]
    extra['api'] = {'c1': {'innovative': [{'description': f'm{i}', 'score': 3} for i in range(5)],
                           'exam': [{'type': f'd{i}', 'score': 4} for i in range(5)],
                           'resources': [{'course': f'c{i}'} for i in range(5)], 'resourcesScore': 12},
                    'c2': {'extension': [{'activity': f'e{i}', 'score': 4} for i in range(4)],
                           'professional': [{'activity': f'p{i}', 'score': 2.5} for i in range(3)]},
                    'c3': {'papers': [{'title': f't{i}', 'row': 'E2d', 'score': 3} for i in range(6)]}}
    no_title = copy(FULL)
    no_title['profile']['title'] = ''
    no_title['profile']['relation'] = ''
    return {'full': full, 'long_answers': long, 'extra_rows': extra, 'no_title': no_title, 'empty': {}}


def run_text(r):
    out = ''
    for el in r:
        tag = el.tag.split('}')[1]
        if tag == 't':
            out += el.text or ''
        elif tag in ('tab', 'ptab'):
            out += '\t'
        elif tag in ('br', 'cr'):
            out += '\n'
    return out


def run_props(r):
    rpr = r.find(qn('w:rPr'))
    def el(tag):
        return rpr.find(qn(tag)) if rpr is not None else None
    def onoff(tag):
        e = el(tag)
        return None if e is None else e.get(qn('w:val')) not in ('0', 'false')
    c, f, s = el('w:color'), el('w:rFonts'), el('w:sz')
    return (c.get(qn('w:val')) if c is not None else None, onoff('w:b'), onoff('w:strike'),
            f.get(qn('w:ascii')) if f is not None else None, s.get(qn('w:val')) if s is not None else None)


def dump(path):
    body = Document(path).element.body
    return [[(run_text(r),) + run_props(r) for r in p.findall(qn('w:r')) if run_text(r)] for p in body.iter(qn('w:p'))]


class Parity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def js(self, rec, name):
        src, out = self.tmp / f'{name}.json', self.tmp / f'{name}.js.docx'
        src.write_text(json.dumps(rec), encoding='utf-8')
        r = subprocess.run(['node', str(TOOL), str(src), str(out)], capture_output=True, text=True, cwd=ROOT)
        return r, out

    def test_same_document(self):
        for name, rec in records().items():
            with self.subTest(name):
                py = self.tmp / f'{name}.py.docx'
                generate_acr.generate(copy(rec), py)
                r, js = self.js(rec, name)
                self.assertEqual(r.returncode, 0, r.stderr)
                a, b = dump(py), dump(js)
                self.assertEqual(len(a), len(b), 'number of paragraphs')
                for i, (x, y) in enumerate(zip(a, b)):
                    self.assertEqual(x, y, f'paragraph {i}')

    def test_same_problems(self):
        rec = {'profile': {'dob': '31/02/1990'}, 'results': [{'collegePct': 'x'}],
               'api': {'c1': {'classes': 60}, 'lastAcademicYear': {'cat1': '1'}}}
        with self.assertRaises(generate_acr.ProblemsError) as ctx:
            generate_acr.generate(copy(rec), self.tmp / 'bad.py.docx')
        r, out = self.js(rec, 'bad')
        self.assertEqual(r.returncode, 2, r.stderr)
        self.assertEqual(json.loads(r.stdout), ctx.exception.problems)
        self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
