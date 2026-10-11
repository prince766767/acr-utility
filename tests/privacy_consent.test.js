import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConsent, CONSENT_KEY, EMAILS_KEY, DECLINED } from '../privacy_consent.js';

const fakeStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
// A token source that hands out the tokens given, one per sign-in.
const fakeTokens = (...list) => {
  let cur = null; const t = { signIns: 0, forgot: 0,
    getToken: async () => { if (!cur) { cur = list.shift(); t.signIns++; } return cur; },
    current: () => cur, forget: () => { cur = null; t.forgot++; }, preload: () => {} };
  return t;
};
const NOW = () => '2026-10-11T00:00:00.000Z';

test('device: asked on first opening until accepted, then remembered', async () => {
  const store = fakeStore(); const answers = [false, false, true]; const seen = [];
  const consent = createConsent({ store, ask: async q => { seen.push(q.email); return answers.shift(); }, now: NOW });
  assert.equal(consent.deviceAccepted(), false);
  await consent.ensureDevice();
  assert.deepEqual(seen, ['', '', '']);
  assert.equal(store.getItem(CONSENT_KEY), NOW());
  await createConsent({ store, ask: () => assert.fail('must not ask again') }).ensureDevice();
});

test('device: two calls at once show one question', async () => {
  let asked = 0, answer;
  const consent = createConsent({ store: fakeStore(), ask: () => { asked++; return new Promise(r => { answer = r; }); } });
  const a = consent.ensureDevice(), b = consent.ensureDevice();
  await new Promise(r => setTimeout(r, 0)); answer(true);
  await Promise.all([a, b]);
  assert.equal(asked, 1);
});

test('email: each Google account is asked once after it signs in, whatever its capitals', async () => {
  const store = fakeStore(); const seen = [];
  const consent = createConsent({ store, ask: async q => { seen.push(q.email); return true; }, now: NOW });
  const tokens = fakeTokens('T1', 'T2', 'T3');
  const who = { T1: 'Asha@Gmail.com', T2: 'asha@gmail.com ', T3: 'ravi@gmail.com' };
  const guarded = consent.guard(tokens, async t => who[t]);
  assert.equal(await guarded.getToken(), 'T1');
  assert.equal(await guarded.getToken(), 'T1');          // same sign-in: no second question
  tokens.forget(); assert.equal(await guarded.getToken(), 'T2');   // same account signs in again: not asked
  tokens.forget(); assert.equal(await guarded.getToken(), 'T3');   // another account: asked
  assert.deepEqual(seen, ['asha@gmail.com', 'ravi@gmail.com']);
  assert.deepEqual(JSON.parse(store.getItem(EMAILS_KEY)), { 'asha@gmail.com': NOW(), 'ravi@gmail.com': NOW() });
  assert.equal(consent.emailAccepted('ASHA@gmail.com'), true);
});

test('email: "Not now" drops the sign-in, is not remembered, and is asked again next time', async () => {
  const store = fakeStore(); let asked = 0;
  const tokens = fakeTokens('T1', 'T2');
  const guarded = createConsent({ store, ask: async () => { asked++; return false; } }).guard(tokens, async () => 'asha@gmail.com');
  await assert.rejects(guarded.getToken(), { message: DECLINED });
  assert.deepEqual([tokens.forgot, tokens.current(), guarded.current(), store.getItem(EMAILS_KEY)], [1, null, null, null]);
  await assert.rejects(guarded.getToken(), { message: DECLINED });
  assert.equal(asked, 2);
});

test('email: a signed-in account that has not answered yet does not count as signed in', async () => {
  let answer;
  const tokens = fakeTokens('T1');
  const guarded = createConsent({ store: fakeStore(), ask: () => new Promise(r => { answer = r; }) }).guard(tokens, async () => 'asha@gmail.com');
  const a = guarded.getToken(), b = guarded.getToken();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(guarded.current(), null);
  answer(true);
  assert.deepEqual(await Promise.all([a, b]), ['T1', 'T1']);   // and two callers shared one question
  assert.equal(guarded.current(), 'T1');
});

test('email: if the address cannot be read, the account is still asked, every sign-in, and nothing is stored', async () => {
  const store = fakeStore(); const seen = [];
  const tokens = fakeTokens('T1', 'T2');
  const guarded = createConsent({ store, ask: async q => { seen.push(q.email); return true; } }).guard(tokens, async () => { throw new Error('offline'); });
  assert.equal(await guarded.getToken(), 'T1');
  tokens.forget(); assert.equal(await guarded.getToken(), 'T2');
  assert.deepEqual(seen, ['your Google account', 'your Google account']);
  assert.equal(store.getItem(EMAILS_KEY), null);
});

test('a damaged list of accepted emails is treated as empty', async () => {
  const store = fakeStore(); store.setItem(EMAILS_KEY, '{oops');
  const consent = createConsent({ store, ask: async () => true, now: NOW });
  assert.equal(consent.emailAccepted('a@b.c'), false);
  await consent.ensureEmail('a@b.c');
  assert.deepEqual(JSON.parse(store.getItem(EMAILS_KEY)), { 'a@b.c': NOW() });
});
