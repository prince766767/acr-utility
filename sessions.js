// One saved record per session in browser storage, and the "last academic year" lookup
// (spec docs/superpowers/specs/2026-09-27-sessions-last-year-point45-design.md, sections 3 and 4).
// Pure functions over any object with the localStorage API, so they are tested with a fake store.
import { tally } from './api_tally.js';

export const SESSION_PREFIX = 'acrUtility:session:';
export const DRAFT_KEY = 'acrUtility:draft';
export const CURRENT_KEY = 'acrUtility:current';
export const OLD_KEY = 'acrUtilityDraftV01';
const SESSION_RE = /^([0-9]{4})-([0-9]{2})$/;

export function isSession(s) {
  if (typeof s !== 'string') return false;
  const m = SESSION_RE.exec(s);
  return !!m && Number(m[2]) === (Number(m[1]) + 1) % 100;
}

export function previousSession(s) {
  if (!isSession(s)) return '';
  const y = Number(s.slice(0, 4)) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function parse(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

const keyFor = session => (isSession(session) ? SESSION_PREFIX + session : DRAFT_KEY);

export function readRecord(store, session) {
  const raw = store.getItem(keyFor(session));
  return raw === null ? null : parse(raw);
}

export function hasRecord(store, session) {
  return isSession(session) && store.getItem(SESSION_PREFIX + session) !== null;
}

export function saveRecord(store, record) {
  store.setItem(keyFor(record.session), JSON.stringify(record));
}

export function writeRecord(store, record) {
  saveRecord(store, record);
  store.setItem(CURRENT_KEY, isSession(record.session) ? record.session : '');
}

export function listSessions(store) {
  const out = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(SESSION_PREFIX) && isSession(k.slice(SESSION_PREFIX.length))) out.push(k.slice(SESSION_PREFIX.length));
  }
  return out.sort();
}

export function loadCurrent(store) {
  const cur = store.getItem(CURRENT_KEY);
  return readRecord(store, isSession(cur) ? cur : '');
}

// Moves the single draft of earlier versions into the per-session keys. Returns notices for the teacher.
export function migrate(store) {
  const raw = store.getItem(OLD_KEY);
  if (raw === null) return [];
  const rec = parse(raw);
  const session = rec && isSession(rec.session) ? rec.session : '';
  if (session && store.getItem(SESSION_PREFIX + session) === null) {
    store.setItem(SESSION_PREFIX + session, raw);
    store.setItem(CURRENT_KEY, session);
    store.removeItem(OLD_KEY);
    return [];
  }
  if (store.getItem(DRAFT_KEY) !== null) {
    return ['An older draft is still stored and was not moved, because an unnamed draft already exists.'];
  }
  store.setItem(DRAFT_KEY, raw);
  store.setItem(CURRENT_KEY, '');
  store.removeItem(OLD_KEY);
  return session ? [`A saved ${session} record already existed, so the older draft was kept as the unnamed draft.`] : [];
}

export function decideSwitch(current, target, targetExists) {
  if (target === current) return 'same';
  if (!isSession(target)) return 'invalid';
  if (!isSession(current)) return targetExists ? 'ask-open-existing' : 'name-draft';
  return targetExists ? 'open' : 'new';
}

export function newRecordFrom(record, session) {
  const profile = record && typeof record.profile === 'object' && record.profile ? JSON.parse(JSON.stringify(record.profile)) : {};
  return {
    session, profile, part1: {}, part2: {}, teaching: [], assignments: [], results: [], activities: [],
    orientation: [], research: [], otherInfo: [], api: {}, enclosures: [], ui: { section: 'profile' },
  };
}

function totals(api) {
  const { values, problems } = tally(api);
  const p = values.p29;
  return { values: { cat1: p.I, cat2: p.II, total12: p.I_II, cat3: p.III }, problems };
}

export function lastYear(store, session) {
  if (!isSession(session)) return { state: 'no-session', from: '', message: 'Choose the session first.' };
  const from = previousSession(session);
  const rec = readRecord(store, from);
  if (!rec) {
    return { state: 'none', from, message: `No ${from} record on this device. Type last year's figures, or import last year's file.` };
  }
  const t = totals(rec.api);
  if (t.problems.length) {
    return { state: 'record-problems', from, problems: t.problems,
      message: `The ${from} record has problems, so its totals cannot be used. Open ${from} to fix them.` };
  }
  return { state: 'record', from, message: `From the ${from} record.`, values: t.values };
}

export function checkLastYearFile(file, session) {
  if (!isSession(session)) return { ok: false, message: 'Choose the session first.' };
  const from = previousSession(session);
  const fileSession = file && isSession(file.session) ? file.session : '';
  if (fileSession !== from) {
    return { ok: false, message: `This file is for ${fileSession || 'no session'}; last year for ${session} is ${from}.` };
  }
  const t = totals(file.api);
  if (t.problems.length) {
    return { ok: false, message: `The ${from} file has problems, so its totals cannot be used.`, problems: t.problems };
  }
  return { ok: true };
}
