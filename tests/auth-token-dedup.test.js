const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Regression test for the bug reported live: authBoot()'s own background token refresh and
// drivesyncRun()'s call both call authGetToken() concurrently on page load. Before the fix,
// each concurrent call issued its own requestAccessToken() against the ONE shared GIS token
// client, and the second call's client.callback assignment silently overwrote the first's —
// orphaning the first caller's promise forever (it never resolved OR rejected). This test
// fakes just enough of Google Identity Services to prove two concurrent authGetToken() calls
// now share a single real request instead of racing.

let requestAccessTokenCalls = 0;

global.document = {
  querySelector: (sel) => (sel.includes('google-client-id') ? { content: 'fake-client-id.apps.googleusercontent.com' } : null),
  createElement: () => {
    const el = {};
    Object.defineProperty(el, 'onload', { set(fn) { setTimeout(fn, 0); } });
    Object.defineProperty(el, 'onerror', { set(fn) {} });
    return el;
  },
  head: { appendChild: () => {} }
};
global.google = {
  accounts: {
    oauth2: {
      initTokenClient: (cfg) => {
        const client = { callback: cfg.callback, error_callback: null };
        client.requestAccessToken = () => {
          requestAccessTokenCalls++;
          // Simulate the real delay before Google responds — this is exactly the window
          // during which the old code let a second concurrent call clobber the callback.
          setTimeout(() => client.callback({ access_token: 'fake-token-value', expires_in: 3600 }), 20);
        };
        return client;
      }
    }
  }
};
global.fetch = async () => ({ ok: true, json: async () => ({ sub: 'user123', email: 'test@example.com', name: 'Test User' }) });

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'auth.js'), 'utf8'), { filename: 'auth.js' });

(async () => {
  AUTH.account = { sub: 'user123', email: 'test@example.com', name: 'Test User' }; // pre-set: skip the userinfo call, keep this test focused on token dedup
  const p1 = authGetToken(); // e.g. drivesyncRun()'s call
  const p2 = authGetToken(); // e.g. authBoot()'s own concurrent background-refresh call
  const [t1, t2] = await Promise.all([p1, p2]);
  assert.equal(t1, 'fake-token-value', 'the first caller must actually receive a resolved token, not hang forever');
  assert.equal(t2, 'fake-token-value', 'the second, concurrent caller must receive the same token');
  assert.equal(requestAccessTokenCalls, 1, 'two concurrent authGetToken() calls must result in exactly ONE requestAccessToken() call, not two racing on the shared client');
  console.log('auth-token-dedup test passed');
})();
