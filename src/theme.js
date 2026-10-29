'use strict';
// Run before CSS so the saved theme is applied before the first paint.
(() => {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('brs-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch { /* Use the default if storage is unavailable. */ }
  document.documentElement.dataset.theme = theme;
})();
