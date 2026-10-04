/* ===================== GOOGLE SIGN-IN (Google Identity Services) =====================
   Lazy by design: nothing here runs, and no request to accounts.google.com is made,
   until a teacher has previously signed in (authBoot) or clicks Sign in (authSignIn).
   This file knows nothing about Google Drive or the ACR document model — see drive.js
   and drivesync.js for that.
========================================================================================= */

const AUTH_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const AUTH_MARKER_KEY = 'acr.auth.account';

const AUTH = { state: 'signed-out', token: null, tokenExpiry: 0, account: null };
let AUTH_LISTENERS = [];
let AUTH_TOKEN_CLIENT = null;
let AUTH_GIS_PROMISE = null;

function onAuthChange(fn) { AUTH_LISTENERS.push(fn); }
/* Each listener runs in its own try/catch so one broken listener can't stop the others —
   but the failure must never be silently discarded, or whatever's wrong becomes invisible
   to everyone, including the person debugging it. Never logs the token or account details,
   only the error itself. */
function authFireChange() {
  AUTH_LISTENERS.forEach((fn) => {
    try { fn(AUTH); }
    catch (e) { console.error('[ACR Utility] a sign-in listener failed:', e); }
  });
}

function authClientId() {
  const m = document.querySelector('meta[name="google-client-id"]');
  return (m && m.content || '').trim();
}
function authAvailable() { return location.protocol !== 'file:' && !!authClientId(); }

function authLoadGis() {
  if (AUTH_GIS_PROMISE) return AUTH_GIS_PROMISE;
  AUTH_GIS_PROMISE = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google Sign-In. Check your internet connection.'));
    document.head.appendChild(s);
  });
  return AUTH_GIS_PROMISE;
}

function authEnsureTokenClient() {
  if (AUTH_TOKEN_CLIENT) return AUTH_TOKEN_CLIENT;
  AUTH_TOKEN_CLIENT = google.accounts.oauth2.initTokenClient({
    client_id: authClientId(),
    scope: AUTH_SCOPES,
    callback: () => {} // overridden per-call in authRequestToken
  });
  return AUTH_TOKEN_CLIENT;
}

function authRequestToken(promptMode) {
  console.log('[ACR-sync] requesting access token (prompt="' + promptMode + '")');
  return authLoadGis().then(() => new Promise((resolve, reject) => {
    const client = authEnsureTokenClient();
    client.callback = (resp) => {
      if (resp && resp.access_token) { console.log('[ACR-sync] token callback received: success'); resolve(resp); }
      else { console.log('[ACR-sync] token callback received: no access_token in response'); reject(Object.assign(new Error('Sign-in was not completed.'), { needsSignIn: true })); }
    };
    client.error_callback = (err) => { console.log('[ACR-sync] token error_callback received'); reject(Object.assign(new Error((err && err.message) || 'Sign-in failed.'), { needsSignIn: true })); };
    client.requestAccessToken({ prompt: promptMode });
  }));
}

async function authFetchUserinfo(token) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Could not read the signed-in account.');
  const j = await r.json();
  return { sub: j.sub, email: j.email || '', name: j.name || '' };
}

async function authSignIn() {
  if (!authAvailable()) throw new Error(location.protocol === 'file:'
    ? 'Google sign-in needs the hosted version of this app.'
    : 'Google sign-in is not configured for this deployment yet.');
  AUTH.state = 'signing-in'; authFireChange();
  try {
    const resp = await authRequestToken('consent');
    AUTH.token = resp.access_token;
    AUTH.tokenExpiry = Date.now() + (Number(resp.expires_in) || 3300) * 1000;
    AUTH.account = await authFetchUserinfo(AUTH.token);
    gRawSet(AUTH_MARKER_KEY, JSON.stringify(AUTH.account));
    AUTH.state = 'signed-in'; authFireChange();
  } catch (e) {
    AUTH.state = 'error'; authFireChange();
    throw e;
  }
}

async function authSignOut() {
  const token = AUTH.token;
  AUTH.token = null; AUTH.tokenExpiry = 0; AUTH.account = null; AUTH.state = 'signed-out';
  gRawDel(AUTH_MARKER_KEY);
  authFireChange();
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
  }
}

/* authGetToken() can legitimately be called concurrently — e.g. authBoot()'s own background
   refresh and drivesyncRun()'s call both fire from the same sign-in event. Google's token
   client is one shared object (authEnsureTokenClient()): calling requestAccessToken() a
   second time before the first has responded overwrites client.callback/error_callback,
   silently orphaning the first caller's promise forever (root cause of a real bug — sync
   would hang indefinitely, never erroring, never completing). Every concurrent caller must
   therefore share the one real in-flight request instead of each starting a new one. */
let AUTH_TOKEN_INFLIGHT = null;

async function authGetToken() {
  if (AUTH.token && Date.now() < AUTH.tokenExpiry - 30000) return AUTH.token;
  if (AUTH_TOKEN_INFLIGHT) { console.log('[ACR-sync] token request already in flight, joining it instead of starting another'); return AUTH_TOKEN_INFLIGHT; }
  AUTH_TOKEN_INFLIGHT = (async () => {
    try {
      const resp = await authRequestToken('');
      AUTH.token = resp.access_token;
      AUTH.tokenExpiry = Date.now() + (Number(resp.expires_in) || 3300) * 1000;
      if (!AUTH.account) AUTH.account = await authFetchUserinfo(AUTH.token);
      AUTH.state = 'signed-in'; authFireChange();
      return AUTH.token;
    } catch (e) {
      AUTH.state = 'error'; authFireChange();
      throw Object.assign(e, { needsSignIn: true });
    } finally {
      AUTH_TOKEN_INFLIGHT = null;
    }
  })();
  return AUTH_TOKEN_INFLIGHT;
}

function authBoot() {
  const raw = gRawGet(AUTH_MARKER_KEY);
  if (!raw) return; // never signed in on this device — make zero network calls
  try { AUTH.account = JSON.parse(raw); AUTH.state = 'signed-in'; } catch (e) { return; }
  authFireChange();
  // attempt a silent token refresh in the background so sync can start without a click
  authGetToken().catch(() => { AUTH.state = 'error'; authFireChange(); });
}
