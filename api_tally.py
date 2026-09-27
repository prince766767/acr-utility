"""Tally of teacher-entered API scores (points 26-28) into points 29, 42, 43 and 44.

Line-for-line mirror of api_tally.js; both are checked against tests/fixtures/cases.json.
Scores are handled in whole hundredths so decimal sums are exact.
"""
import math
import re

ROW_CHOICES = {
    'journals': ['A1', 'A2'],
    'chapters': ['B1a', 'B1b'],
    'proceedings': ['B2'],
    'books': ['B3a', 'B3b', 'B3c'],
    'ongoing': ['C1a', 'C1b', 'C1c', 'C2'],
    'completed': ['C3', 'C4'],
    'training': ['E1a', 'E1b'],
    'papers': ['E2a', 'E2b', 'E2c', 'E2d'],
    'lectures': ['E3a', 'E3b'],
}
C3_WHERE = {
    'journals': '28 A', 'chapters': '28 B(i)', 'proceedings': '28 B(ii)', 'books': '28 B(iii)',
    'ongoing': '28 C(i & ii)', 'completed': '28 C(iii & iv)', 'training': '28 E(i)', 'papers': '28 E(ii)', 'lectures': '28 E(iii)',
}
P44_ORDER = ['A1', 'A2', 'B1a', 'B1b', 'B2', 'B3a', 'B3b', 'B3c', 'C1a', 'C1b', 'C1c', 'C2', 'C3', 'C4',
             'D1', 'D2a', 'D2b', 'E1a', 'E1b', 'E2a', 'E2b', 'E2c', 'E2d', 'E3a', 'E3b']
# Printed in the "Whether international/National/State..." column of 28 E(ii) and E(iii).
LEVEL_TEXT = {'E2a': 'International', 'E2b': 'National', 'E2c': 'Regional / State', 'E2d': 'Local - University / College',
              'E3a': 'International', 'E3b': 'National'}

_SCORE_RE = re.compile(r'[0-9]+(\.[0-9]{1,2})?')


def to_cents(v):
    if v is None:
        return ('missing', None)
    if isinstance(v, bool):
        return ('bad', None)
    if isinstance(v, (int, float)):
        if isinstance(v, float) and not math.isfinite(v):
            return ('bad', None)
        s = str(v)
    elif isinstance(v, str):
        s = v.strip()
    else:
        return ('bad', None)
    if s == '':
        return ('missing', None)
    if not _SCORE_RE.fullmatch(s):
        return ('bad', None)
    whole, _, frac = s.partition('.')
    return ('ok', int(whole) * 100 + int((frac + '00')[:2]))


def fmt(cents):
    whole, frac = divmod(cents, 100)
    if frac == 0:
        return str(whole)
    if frac % 10 == 0:
        return f'{whole}.{frac // 10}'
    return f'{whole}.{frac:02d}'


def score_text(v):
    state, c = to_cents(v)
    return fmt(c) if state == 'ok' else ''


def is_empty_entry(e):
    if not isinstance(e, dict):
        return True
    return all(v is None or (isinstance(v, str) and v.strip() == '') for v in e.values())


def _group(obj, key):
    x = obj.get(key) if isinstance(obj, dict) else None
    return x if isinstance(x, dict) else {}


def _list(obj, key):
    x = obj.get(key)
    return x if isinstance(x, list) else []


def tally(api):
    c1, c2, c3 = _group(api, 'c1'), _group(api, 'c2'), _group(api, 'c3')
    problems = []

    def add(code, where, message):
        problems.append({'code': code, 'where': where, 'message': message})

    def bad(where):
        add('BAD_SCORE', where, f'{where}: score must be a number (0 or more) with at most 2 decimals.')

    def single(v, where):
        state, c = to_cents(v)
        if state == 'bad':
            bad(where)
            return None
        return c

    def list_sum(entries, where):
        total = 0
        for idx, e in enumerate(entries, 1):
            if is_empty_entry(e):
                continue
            w = f'{where}, entry {idx}'
            state, c = to_cents(e.get('score'))
            if state == 'missing':
                add('NO_SCORE', w, f'{w}: score is missing.')
                continue
            if state == 'bad':
                bad(w)
                continue
            total += c
        return total

    a = single(c1.get('classes'), '26(i)(a)')
    b = single(c1.get('excess'), '26(i)(b)')
    ii = single(c1.get('resourcesScore'), '26(ii)')
    iii = list_sum(_list(c1, 'innovative'), '26(iii)')
    iv = list_sum(_list(c1, 'exam'), '26(iv)')
    e1 = list_sum(_list(c2, 'extension'), '27(i)')
    e2 = list_sum(_list(c2, 'management'), '27(ii)')
    e3 = list_sum(_list(c2, 'professional'), '27(iii)')

    p44 = {k: 0 for k in P44_ORDER}
    fed = {k: False for k in P44_ORDER}
    for name, choices in ROW_CHOICES.items():
        where = C3_WHERE[name]
        for idx, e in enumerate(_list(c3, name), 1):
            if is_empty_entry(e):
                continue
            w = f'{where}, entry {idx}'
            row = None
            if len(choices) == 1:
                row = choices[0]
            else:
                r = e.get('row')
                r = r.strip() if isinstance(r, str) else ''
                if r == '':
                    add('NO_ROW', w, f'{w}: choose the point-44 row.')
                elif r not in choices:
                    add('BAD_ROW', w, f'{w}: "{r}" is not a valid point-44 row for this table.')
                else:
                    row = r
            state, c = to_cents(e.get('score'))
            if state == 'missing':
                add('NO_SCORE', w, f'{w}: score is missing.')
                continue
            if state == 'bad':
                bad(w)
                continue
            if row is None:
                continue
            p44[row] += c
            fed[row] = True
    g = _group(c3, 'guidance')
    d1 = single(g.get('mphilScore'), '28 D M.Phil score')
    d2a = single(g.get('phdAwardedScore'), '28 D Ph.D awarded score')
    d2b = single(g.get('phdSubmittedScore'), '28 D Ph.D thesis submitted score')
    for key, c in (('D1', d1), ('D2a', d2a), ('D2b', d2b)):
        if c is not None:
            p44[key] += c
            fed[key] = True

    cat1 = (a or 0) + (b or 0) + (ii or 0) + iii + iv
    raw2 = e1 + e2 + e3
    cat2 = min(raw2, 2500)
    cat3 = sum(p44[k] for k in P44_ORDER)
    e1_total = p44['E1a'] + p44['E1b']

    def over(c, max_c, where):
        if c is not None and c > max_c:
            add('OVER_MAX', where, f"{where} is {fmt(c)}; the form's maximum is {fmt(max_c)}.")

    over(a, 5000, '26(i)(a)')
    over(b, 1000, '26(i)(b)')
    over(ii, 2000, '26(ii)')
    over(iii, 2000, '26(iii) total')
    over(iv, 2500, '26(iv) total')
    over(cat1, 12500, 'Category I total')
    over(e1, 2000, '27(i) total')
    over(e2, 1500, '27(ii) total')
    over(e3, 1500, '27(iii) total')
    over(e1_total, 3000, '28 E(i) total')

    def opt(c):
        return '' if c is None else fmt(c)

    p44v = {k: (fmt(p44[k]) if fed[k] else '') for k in P44_ORDER}
    p44v['total'] = fmt(cat3)
    return {
        'values': {
            'p42': {'i_a': opt(a), 'i_b': opt(b), 'ii': opt(ii), 'iii': fmt(iii), 'iv': fmt(iv), 'total': fmt(cat1)},
            'p43': {'i': fmt(e1), 'ii': fmt(e2), 'iii': fmt(e3), 'total': fmt(cat2), 'raw': fmt(raw2), 'capped': raw2 > 2500},
            'p44': p44v,
            'p29': {'I': fmt(cat1), 'II': fmt(cat2), 'I_II': fmt(cat1 + cat2), 'III': fmt(cat3)},
            'p28': {'phd': '' if d2a is None and d2b is None else fmt((d2a or 0) + (d2b or 0)), 'e1Total': fmt(e1_total)},
        },
        'problems': problems,
    }


# Last academic year (points 29 and 45, column 3): I, II and III of last year; I+II is always I + II.
LY_PARTS = (('cat1', 'I', 12500), ('cat2', 'II', 2500), ('cat3', 'III', None))


def last_year_problems(ly):
    src = ly if isinstance(ly, dict) else {}
    parsed = [to_cents(src.get(key)) for key, _, _ in LY_PARTS]
    filled = sum(1 for state, _ in parsed if state != 'missing')
    if filled == 0:
        return []
    if filled < len(LY_PARTS):
        return [{'code': 'LY_PARTIAL', 'where': 'Last academic year',
                 'message': 'Last academic year: fill I, II and III, or leave all three empty.'}]
    problems = []
    for (_, label, _), (state, _) in zip(LY_PARTS, parsed):
        if state == 'bad':
            where = f'Last academic year {label}'
            problems.append({'code': 'BAD_SCORE', 'where': where,
                             'message': f'{where}: score must be a number (0 or more) with at most 2 decimals.'})
    for (_, label, max_c), (state, c) in zip(LY_PARTS, parsed):
        if max_c is not None and state == 'ok' and c > max_c:
            where = f'Last academic year {label}'
            problems.append({'code': 'OVER_MAX', 'where': where,
                             'message': f"{where} is {fmt(c)}; the form's maximum is {fmt(max_c)}."})
    return problems


def last_year_cells(ly):
    src = ly if isinstance(ly, dict) else {}
    parsed = [to_cents(src.get(key)) for key, _, _ in LY_PARTS]
    if any(state != 'ok' for state, _ in parsed):
        return {'cat1': '', 'cat2': '', 'total12': '', 'cat3': ''}
    a, b, c = (cents for _, cents in parsed)
    return {'cat1': fmt(a), 'cat2': fmt(b), 'total12': fmt(a + b), 'cat3': fmt(c)}
