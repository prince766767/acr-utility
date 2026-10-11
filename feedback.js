// Rating and feedback on the Review tab (app.js; tests/feedback.test.js). The app has no server:
// "Send" opens the teacher's own email app with the rating and the text ready, and they press Send there.
// Nothing from the ACR itself is put in the email.

// The developer's address the feedback goes to. While it is empty the section is not shown.
export const FEEDBACK_EMAIL = 'princethakur@gmail.com';

export const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

// A whole number 1-5, or 0 for no rating.
export function cleanRating(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

export const stars = rating => '★'.repeat(cleanRating(rating)) + '☆'.repeat(5 - cleanRating(rating));

// There must be a rating or some text before anything is sent.
export const canSend = (rating, text) => cleanRating(rating) > 0 || String(text ?? '').trim() !== '';

// The mailto: link that opens the email app, or '' when there is nothing to send.
export function feedbackMail({ to, rating, text }) {
  const r = cleanRating(rating), t = String(text ?? '').trim();
  if (!to || !canSend(r, t)) return '';
  const subject = r ? `ACR Utility feedback - ${r}/5` : 'ACR Utility feedback';
  const lines = [];
  if (r) lines.push(`Rating: ${stars(r)} (${r} out of 5 - ${RATING_WORDS[r]})`, '');
  if (t) lines.push('Feedback:', t.replace(/\r\n?/g, '\n'));
  const body = lines.join('\n').trim().replace(/\n/g, '\r\n');
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
