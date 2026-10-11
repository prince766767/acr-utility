// Colours of the section tabs and of the progress line (app.js; tests/tab_status.test.js).
// A tab is 'empty' (light red), 'part' (orange) or 'done' (green); the open tab is always dark blue.
// Nothing here affects the Word file.

const filled = v => (typeof v === 'number' ? true : typeof v === 'string' ? v.trim() !== '' : false);
const rows = x => (Array.isArray(x) ? x : []);
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
// True when anything at all is typed anywhere inside (lists and nested boxes included).
const anyFilled = x => (Array.isArray(x) ? x.some(anyFilled) : x && typeof x === 'object' ? Object.values(x).some(anyFilled) : filled(x));

// State, District and Status start with a value of their own, so they do not count as an entry.
const PROFILE_PRESET = ['collegeState', 'collegeDistrict', 'serviceStatus'];
const PROFILE_MAIN = ['fullName', 'employeeCode', 'subject', 'designation'];
const PART1_ALL = ['p8', 'p12', 'p13a', 'p13b', 'p14'];
const PART1_MAIN = ['p8', 'p12'];
const PART2_MAIN = ['p17', 'p18', 'p19b', 'p21i', 'p25'];
const PART2_TABLES_MAIN = ['teaching', 'assignments', 'results'];
const PART2_TABLES = [...PART2_TABLES_MAIN, 'activities', 'orientation', 'research'];

const grade = (any, done) => (done ? 'done' : any ? 'part' : 'empty');

// `scores` is the result of tally(data.api); `problemCount` is how many problems stop the Word file.
export function tabStatus(data, scores, problemCount) {
  const d = obj(data), profile = obj(d.profile), part2 = obj(d.part2);
  const values = obj(obj(scores).values), p29 = obj(values.p29);
  const apiProblems = rows(obj(scores).problems).length;

  const status = {
    profile: grade(
      Object.entries(profile).some(([k, v]) => !PROFILE_PRESET.includes(k) && filled(v)),
      PROFILE_MAIN.every(k => filled(profile[k]))),
    part1: grade(PART1_ALL.some(k => filled(part2[k])), PART1_MAIN.every(k => filled(part2[k]))),
    part2: grade(
      Object.entries(part2).some(([k, v]) => !PART1_ALL.includes(k) && filled(v)) || PART2_TABLES.some(k => rows(d[k]).length > 0),
      PART2_MAIN.every(k => filled(part2[k])) && PART2_TABLES_MAIN.every(k => rows(d[k]).length > 0)),
    // Categories I and II apply to every teacher; Category III may rightly be nil.
    api: grade(anyFilled(d.api), Number(p29.I) > 0 && Number(p29.II) > 0 && apiProblems === 0),
    enclosures: grade(rows(d.enclosures).some(x => obj(x).custom) || rows(d.otherInfo).length > 0, rows(d.enclosures).some(x => obj(x).checked)),
  };
  // Review is green when nothing stops the Word file - but not while the whole form is still empty.
  const started = Object.values(status).some(s => s !== 'empty');
  status.review = started && !problemCount ? 'done' : 'empty';
  return status;
}

// The percentage on the progress line: the share of the main items that are done, over all tabs.
// At 100% the Profile, Part I, Part II, API and Enclosures tabs are all green.
export function progressPercent(data, scores) {
  const d = obj(data), profile = obj(d.profile), part2 = obj(d.part2);
  const p29 = obj(obj(obj(scores).values).p29), apiOk = rows(obj(scores).problems).length === 0;
  const items = [
    ...PROFILE_MAIN.map(k => filled(profile[k])),
    ...[...PART1_MAIN, ...PART2_MAIN].map(k => filled(part2[k])),
    ...PART2_TABLES_MAIN.map(k => rows(d[k]).length > 0),
    apiOk && Number(p29.I) > 0, apiOk && Number(p29.II) > 0,
    rows(d.enclosures).some(x => obj(x).checked),
  ];
  return Math.round(items.filter(Boolean).length / items.length * 100);
}

export const TAB_WORDS = { empty: 'not filled yet', part: 'partly filled', done: 'filled' };

// Progress line: up to 33% red, 34-66% orange, 67-99% blue, 100% green.
export function progressBand(pct) {
  const p = Number(pct) || 0;
  return p >= 100 ? 'green' : p >= 67 ? 'blue' : p >= 34 ? 'orange' : 'red';
}
