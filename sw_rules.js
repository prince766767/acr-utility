// Which GET requests the service worker answers from its cache (sw.js; tests/sw_rules.test.js).
// Only the app's own files and the Firebase SDK; Google API replies hold the teacher's data and must never be cached.
function shouldCache(url, origin) {
  const u = new URL(url);
  return u.origin === origin || u.href.startsWith('https://www.gstatic.com/firebasejs/');
}
