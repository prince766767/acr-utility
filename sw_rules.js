// Which GET requests the service worker answers from its cache (sw.js; tests/sw_rules.test.js).
// Only the app's own files and the Firebase SDK; Google API replies hold the teacher's data and must never be cached.
// The earlier v0.4 utility (served at v0.4/) is left alone so it always loads fresh, as it did before.
function shouldCache(url, origin) {
  const u = new URL(url);
  if (u.origin === origin) return !/\/v0\.4(\/|$)/.test(u.pathname);
  return u.href.startsWith('https://www.gstatic.com/firebasejs/');
}
// The Client ID file changes after publishing, so it is fetched fresh (cache only as the offline fallback).
function networkFirst(url, origin) {
  const u = new URL(url);
  return u.origin === origin && u.pathname.endsWith('/google-config.js');
}
