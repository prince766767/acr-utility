import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRating, stars, canSend, feedbackMail } from '../feedback.js';

const TO = 'dev@example.com';
const parts = url => { const u = new URL(url); return { to: u.pathname, subject: u.searchParams.get('subject'), body: u.searchParams.get('body') }; };

test('a rating is a whole number from 1 to 5, anything else is no rating', () => {
  assert.deepEqual([1, '5', 0, 6, 2.5, '', 'abc', null].map(cleanRating), [1, 5, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([stars(0), stars(3), stars(5)], ['☆☆☆☆☆', '★★★☆☆', '★★★★★']);
});

test('nothing to send without a rating and without text', () => {
  assert.equal(canSend(0, '   '), false);
  assert.equal(feedbackMail({ to: TO, rating: 0, text: ' ' }), '');
  assert.equal(feedbackMail({ to: '', rating: 5, text: 'Good' }), '');
});

test('rating and feedback go into the subject and body of the email', () => {
  const m = parts(feedbackMail({ to: TO, rating: 4, text: ' Very useful.\nPlease add Hindi & more. ' }));
  assert.deepEqual(m, { to: TO, subject: 'ACR Utility feedback - 4/5',
    body: 'Rating: ★★★★☆ (4 out of 5 - Very good)\r\n\r\nFeedback:\r\nVery useful.\r\nPlease add Hindi & more.' });
});

test('a rating alone, or feedback alone, can be sent', () => {
  assert.equal(parts(feedbackMail({ to: TO, rating: 5, text: '' })).body, 'Rating: ★★★★★ (5 out of 5 - Excellent)');
  assert.deepEqual(parts(feedbackMail({ to: TO, rating: 0, text: 'Thanks' })), { to: TO, subject: 'ACR Utility feedback', body: 'Feedback:\r\nThanks' });
});

test('the link is safely encoded', () => {
  const url = feedbackMail({ to: TO, rating: 0, text: 'a&b=c? #d' });
  assert.ok(url.startsWith('mailto:dev@example.com?subject='));
  assert.ok(!/[ #]/.test(url) && url.split('&').length === 2);
});
