// Accepting the privacy policy (privacy.html). Two steps (app.js; tests/privacy_consent.test.js):
//  1. Every teacher accepts once on each device before the form can be used (this covers those who never sign in).
//  2. Every Google account (email) accepts once on each device, straight after it signs in.
// Both answers are kept only in the browser.
export const CONSENT_KEY = 'acrUtility:privacy:accepted';
export const EMAILS_KEY = 'acrUtility:privacy:emails';
export const DECLINED = 'The Google features need this Google account to accept the Privacy Policy.';

const cleanEmail = v => String(v ?? '').trim().toLowerCase();

// `ask({ email })` shows the question and resolves true (accepted) or false (not now).
// With no email it is the device question, which has no "not now".
export function createConsent({ store, ask, now = () => new Date().toISOString() }) {
  const deviceAccepted = () => Boolean(store.getItem(CONSENT_KEY));
  let devicePending = null;
  function ensureDevice() {
    if (deviceAccepted()) return Promise.resolve();
    if (devicePending) return devicePending;
    devicePending = (async () => {
      while (!(await ask({ email: '' }))) { /* the form stays closed until it is accepted */ }
      store.setItem(CONSENT_KEY, now());
    })().finally(() => { devicePending = null; });
    return devicePending;
  }

  function emails() {
    try { const v = JSON.parse(store.getItem(EMAILS_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    catch { return {}; }
  }
  const emailAccepted = email => Boolean(cleanEmail(email) && emails()[cleanEmail(email)]);
  // An email that could not be read ('') is asked every time and not remembered.
  async function ensureEmail(email) {
    const e = cleanEmail(email);
    if (emailAccepted(e)) return;
    if (!(await ask({ email: e || 'your Google account' }))) throw new Error(DECLINED);
    if (e) store.setItem(EMAILS_KEY, JSON.stringify({ ...emails(), [e]: now() }));
  }

  // The token source with the email question put straight after every new sign-in.
  // `getEmail(token)` reads the signed-in account's email; `tokens.forget()` drops a token that was not accepted.
  function guard(tokens, getEmail) {
    let okToken = null, checking = null;
    async function getToken(o) {
      const token = await tokens.getToken(o);
      if (token === okToken) return token;
      if (!checking) {
        checking = (async () => {
          const email = await Promise.resolve().then(() => getEmail(token)).catch(() => '');
          try { await ensureEmail(email); okToken = token; }
          catch (err) { tokens.forget(); throw err; }
        })().finally(() => { checking = null; });
      }
      await checking;
      return token;
    }
    // A token whose account has not accepted yet does not count as signed in.
    const current = () => { const t = tokens.current(); return t && t === okToken ? t : null; };
    return { ...tokens, getToken, current };
  }
  return { deviceAccepted, ensureDevice, emailAccepted, ensureEmail, guard };
}
