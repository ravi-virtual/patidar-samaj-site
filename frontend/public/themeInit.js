// Runs synchronously in <head>, before React, so the correct theme paints first.
// localStorage is only a cache for anonymous visitors and for the last-known account
// preference; a signed-in user's saved choice lives in MongoDB and is applied after login.
(function () {
  var pref = 'system';
  try {
    var stored = window.localStorage.getItem('samaj.theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') pref = stored;
  } catch (_e) {
    /* storage blocked — fall back to system */
  }
  var dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-theme-pref', pref);
  root.style.colorScheme = dark ? 'dark' : 'light';
})();
