'use strict';
// Run before CSS so the saved theme is applied before the first paint.
(() => {
  let settings;
  try {settings=globalThis.studioSettingsModel.load(localStorage);}
  catch {settings={...globalThis.studioSettingsModel.DEFAULTS};}
  globalThis.studioInitialSettings=Object.freeze(settings);
  globalThis.studioSettingsModel.applyRoot(document.documentElement,settings);
  document.documentElement.dataset.ruleTab='presets';
})();
