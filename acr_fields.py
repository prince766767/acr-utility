"""Values for the cover page, Part I, Part II, point 30 and the teacher's certificate of the Word ACR.

Reads the app's saved file as it is. parse_dob, dob_words and field_problems mirror acr_fields.js;
both are checked against tests/fixtures/field_cases.json.
"""
import re
from decimal import Decimal, ROUND_HALF_UP

from api_tally import is_empty_entry

TITLES = ('Dr.', 'Shri', 'Smt', 'Kumari')
RELATIONS = ('Father', 'Husband')
TOKENS = ('SESSION', 'COLLEGE_NAME', 'COLLEGE_PLACE', 'FULL_NAME', 'FATHER_HUSBAND', 'EMPLOYEE_CODE', 'SUBJECT',
          'APPOINTMENT_DATE', 'DESIGNATION', 'PAY_INFO', 'PROMOTION', 'ACADEMIC_QUAL', 'PROFESSIONAL_QUAL',
          'RESEARCH_DEGREE', 'DOB_WORDS', 'SERVICE_STATUS', 'COLLEGES_SERVED', 'DEPT_EXAM', 'HINDI_DETAILS',
          'OTHER_ASSIGNMENT', 'ADDR1', 'ADDR2', 'ADDR3', 'LANDLINE', 'MOBILE', 'EMAIL', 'P17', 'P18', 'P19B', 'P19F',
          'P19G', 'P21I', 'RESEARCH_YES_NO', 'P23', 'P24_SATISFIED', 'P24_REASONS', 'P25', 'PLACE', 'REPORT_DATE',
          'CERT_DESIGNATION', 'PRINCIPAL_NAME')

ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
        'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
            'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth',
            'Eighteenth', 'Nineteenth', 'Twentieth']
MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
          'November', 'December']
_DOB_RE = re.compile(r'([0-9]{2})/([0-9]{2})/([0-9]{4})')
_NUM_RE = re.compile(r'-?[0-9]+(\.[0-9]+)?')


def _dict(x):
    return x if isinstance(x, dict) else {}


def _list(x):
    return x if isinstance(x, list) else []


def _s(v):
    return '' if v is None else str(v).replace('\r\n', '\n').strip()


def _join(*parts, sep=', '):
    return sep.join(p for p in (_s(x) for x in parts) if p)


def parse_dob(v):
    if v is None:
        return ('empty', None)
    if not isinstance(v, str):
        return ('bad', None)
    s = v.strip()
    if s == '':
        return ('empty', None)
    m = _DOB_RE.fullmatch(s)
    if not m:
        return ('bad', None)
    d, mo, y = (int(x) for x in m.groups())
    if not (1900 <= y <= 2099 and 1 <= mo <= 12):
        return ('bad', None)
    leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
    days = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
    if not 1 <= d <= days:
        return ('bad', None)
    return ('ok', (d, mo, y))


def _two_digit_words(n):
    if n < 20:
        return ONES[n]
    return TENS[n // 10] + (' ' + ONES[n % 10] if n % 10 else '')


def _ordinal(d):
    if d <= 20:
        return ORDINALS[d]
    if d == 30:
        return 'Thirtieth'
    return TENS[d // 10] + '-' + ORDINALS[d % 10].lower()


def dob_words(d, m, y):
    head = 'Nineteen Hundred' if y < 2000 else 'Two Thousand'
    rest = _two_digit_words(y % 100)
    return f'{_ordinal(d)} {MONTHS[m]} {head}' + (f' {rest}' if rest else '')


def dob_digits(d, m, y):
    return f'{d:02d}{m:02d}{y:04d}'


def _number(v):
    if v is None:
        return ('empty', None)
    if isinstance(v, bool):
        return ('bad', None)
    s = str(v).strip()
    if s == '':
        return ('empty', None)
    if not _NUM_RE.fullmatch(s):
        return ('bad', None)
    return ('ok', Decimal(s))


def variation(college, university):
    """Point 20 column 7: college pass % minus university pass %, 2 decimals, '+' when positive."""
    a, b = _number(college), _number(university)
    if a[0] != 'ok' or b[0] != 'ok':
        return ''
    v = (a[1] - b[1]).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    if v == 0:
        return '0'
    s = format(v.normalize(), 'f')
    return '+' + s if v > 0 else s


def field_problems(data):
    problems = []
    dob = _dict(_dict(data).get('profile')).get('dob')
    if parse_dob(dob)[0] == 'bad':
        problems.append({'code': 'BAD_DOB', 'where': 'Point 10',
                         'message': f'Point 10: date of birth "{dob}" is not a real date (use DD/MM/YYYY).'})
    for i, r in enumerate(_list(_dict(data).get('results')), 1):
        r = _dict(r)
        for key, label in (('collegePct', 'college pass %'), ('universityPct', 'university pass %')):
            if _number(r.get(key))[0] == 'bad':
                where = f'Point 20, row {i}'
                problems.append({'code': 'BAD_NUMBER', 'where': where,
                                 'message': f'{where}: {label} "{r.get(key)}" is not a number.'})
    return problems


def token_values(data):
    data = _dict(data)
    p, a = _dict(data.get('profile')), _dict(data.get('part2'))
    state, dob = parse_dob(p.get('dob'))
    lines = [ln.strip() for ln in _s(p.get('permanentAddress')).split('\n') if ln.strip()]
    basic = _s(p.get('basicPay'))
    return {
        'SESSION': _s(data.get('session')),
        'COLLEGE_NAME': _s(p.get('collegeName')),
        'COLLEGE_PLACE': _join(p.get('collegeDistrict'), p.get('collegeState'), p.get('collegePin')),
        'FULL_NAME': _s(p.get('fullName')),
        'FATHER_HUSBAND': _s(p.get('fatherHusband')),
        'EMPLOYEE_CODE': _s(p.get('employeeCode')),
        'SUBJECT': _s(p.get('subject')),
        'APPOINTMENT_DATE': _s(p.get('appointmentDate')),
        'DESIGNATION': _s(p.get('designation')),
        'PAY_INFO': _join(p.get('payBand'), f'Basic Pay {basic}' if basic else '', sep='; '),
        'PROMOTION': _s(a.get('p8')) or _s(p.get('promotionDate')),
        'ACADEMIC_QUAL': _s(p.get('academicQualification')),
        'PROFESSIONAL_QUAL': _s(p.get('professionalQualification')),
        'RESEARCH_DEGREE': _s(p.get('researchDegree')),
        'DOB_WORDS': dob_words(*dob) if state == 'ok' else '',
        'SERVICE_STATUS': _s(p.get('serviceStatus')),
        'COLLEGES_SERVED': numbered_lines(_s(a.get('p12'))),
        'DEPT_EXAM': _s(a.get('p13a')),
        'HINDI_DETAILS': _s(a.get('p13b')),
        'OTHER_ASSIGNMENT': _s(a.get('p14')),
        'ADDR1': lines[0] if lines else '',
        'ADDR2': lines[1] if len(lines) > 1 else '',
        'ADDR3': ', '.join(lines[2:]),
        'LANDLINE': _s(p.get('landline')),
        'MOBILE': _s(p.get('mobile')),
        'EMAIL': _s(p.get('email')),
        'P17': _s(a.get('p17')),
        'P18': _s(a.get('p18')),
        'P19B': _s(a.get('p19b')),
        'P19F': _s(a.get('p19f')),
        'P19G': _s(a.get('p19g')),
        'P21I': _s(a.get('p21i')),
        'RESEARCH_YES_NO': _s(a.get('researchYesNo')),
        'P23': _s(a.get('p23')),
        'P24_SATISFIED': _s(a.get('p24Satisfied')),
        'P24_REASONS': _s(a.get('p24Reasons')),
        'P25': _s(a.get('p25')),
        'PLACE': _join(p.get('collegeName'), p.get('collegePin')),
        'REPORT_DATE': _s(p.get('submissionDate')),
        'CERT_DESIGNATION': _s(p.get('designation')),
        'PRINCIPAL_NAME': _s(p.get('principalName')),
    }


def _rows(data, key):
    return [e for e in _list(_dict(data).get(key)) if isinstance(e, dict) and not is_empty_entry(e)]


def part_tables(data):
    data = _dict(data)
    p, a = _dict(data.get('profile')), _dict(data.get('part2'))
    state, dob = parse_dob(p.get('dob'))
    teaching = []
    for i, e in enumerate(_rows(data, 'teaching'), 1):
        pct = _s(e.get('syllabusPct'))
        teaching.append([_s(e.get('srNo')) or str(i), _s(e.get('classCourse')), _s(e.get('college')),
                         _s(e.get('allocated')), _s(e.get('delivered')), pct if not pct or pct.endswith('%') else pct + '%'])
    results = []
    for e in _rows(data, 'results'):
        var = variation(e.get('collegePct'), e.get('universityPct'))
        results.append([_s(e.get(k)) for k in ('className', 'duration', 'appeared', 'passed', 'collegePct', 'universityPct')]
                       + [var, var] + [_s(e.get(k)) for k in ('divI', 'divII', 'divIII', 'failed', 'reason')])
    return {
        'dob_digits': dob_digits(*dob) if state == 'ok' else '',
        'teaching': teaching,
        'total_periods': _s(a.get('totalPeriodsPerWeek')),
        'assignments': [[str(i), _s(e.get('classCourse')), _s(e.get('assignments')), _s(e.get('tests')), '']
                        for i, e in enumerate(_rows(data, 'assignments'), 1)],
        'activities': [[_s(e.get('title')), _s(e.get('detail'))] for e in _rows(data, 'activities')],
        'results': results,
        'orientation': [[_s(e.get(k)) for k in ('course', 'place', 'duration', 'rcoc')] for e in _rows(data, 'orientation')],
        'research': [[_s(e.get(k)) for k in ('title', 'institution', 'nature', 'status')] for e in _rows(data, 'research')],
        'other_info': [[str(i), _s(e.get('text'))] for i, e in enumerate(_rows(data, 'otherInfo'), 1)],
    }


def numbered_lines(text):
    """Point 12: one line per college, printed "(1) College:" with its dates on the next line, as teachers write it.
    A single college is not numbered; lines the teacher numbered themselves stay as typed."""
    lines = [l.strip() for l in str(text or '').split('\n') if l.strip()]
    if any(re.match(r'^\(?\d+[.)]', l) for l in lines):
        return str(text or '').strip()
    split = lambda l: l.replace(': ', ':\n', 1)
    if len(lines) == 1:
        return split(lines[0])
    return '\n'.join(f'({i}) {split(l)}' for i, l in enumerate(lines, 1))


_MARKS = (('**', 'b'), ('*', 'i'), ('^', 's'))
_SPACE = ' \t\u00a0'


def inline_marks(text):
    """Answers may mark **bold**, *italic* and ^superscript^ (the B / I / x² buttons). Returns [(text, letters b, i, s)].
    A mark counts only when closed on the same line with no space just inside it, so "5 * 3" and a lone "*" stay as typed.
    Same rules as inlineMarks in acr_fields.js; both are checked against tests/fixtures/mark_cases.json."""
    out = []

    def add(s, fmt):
        if not s:
            return
        if out and out[-1][1] == fmt:
            out[-1] = (out[-1][0] + s, fmt)
        else:
            out.append((s, fmt))

    def walk(s, fmt):
        buf, i = '', 0
        while i < len(s):
            for mark, f in _MARKS:
                if s.startswith(mark, i):
                    j = s.find(mark, i + len(mark))
                    inner = s[i + len(mark):j] if j > 0 else ''
                    if inner and inner[0] not in _SPACE and inner[-1] not in _SPACE and f not in fmt:
                        add(buf, fmt)
                        buf = ''
                        walk(inner, ''.join(sorted(fmt + f)))
                        i = j + len(mark)
                        break
            else:
                buf += s[i]
                i += 1
        add(buf, fmt)

    for n, line in enumerate(str(text).split('\n')):
        if n:
            add('\n', '')
        walk(line, '')
    return out
