'use strict';
// Run before CSS so the saved theme is applied before the first paint.
(() => {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('brs-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch { /* Use the default if storage is unavailable. */ }
  document.documentElement.dataset.theme = theme;
  let fontSize = '13';
  try {
    const saved = localStorage.getItem('brs-font-size');
    if (['12','13','15','17','19'].includes(saved)) fontSize = saved;
  } catch { /* Use the standard font size if storage is unavailable. */ }
  document.documentElement.dataset.fontSize = fontSize;
})();
