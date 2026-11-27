'use strict';
(() => {
  const api = window.desktopAPI;
  const $ = id => document.getElementById(id);
  const header = $('mini-header');
  const actions = $('mini-quick-actions');
  const focus = $('mini-focus');
  const status = $('mini-status');
  let statusTimer,quickSignature;
  let opacity = 1, opaqueOnFocus = true;

  function renderOpacity() {
    header.style.opacity = opaqueOnFocus && document.hasFocus() ? '1' : String(opacity);
  }
  window.addEventListener('focus', renderOpacity);
  window.addEventListener('blur', renderOpacity);

  function notify(message, timeout = 2500) {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = !message;
    if (timeout) statusTimer = setTimeout(() => notify(''), timeout);
  }
  function report(error) {
    notify(String(error.message || error), 5000);
  }
  async function run(action) {
    try {
      const result = await action();
      if (result?.settings) render(result.settings);
      if (result?.notice) notify(result.notice);
      return result;
    } catch (error) { report(error); }
  }
  const anchor = button => {
    const bounds = button.getBoundingClientRect();
    return { x: bounds.left, y: bounds.bottom };
  };

  actions.addEventListener('wheel', event => {
    if (actions.scrollWidth <= actions.clientWidth) return;
    event.preventDefault();
    actions.scrollLeft += event.deltaX || event.deltaY;
  }, { passive: false });

  function render(next) {
    document.documentElement.dataset.theme = next.theme;
    opacity = (next.floatingOpacity ?? 100) / 100;
    opaqueOnFocus = next.floatingOpaqueOnFocus;
    renderOpacity();
    focus.hidden = next.floatingShowFocusButton === false;
    focus.setAttribute('aria-pressed', String(next.focusMode));
    focus.textContent = next.focusMode ? '專注：開' : '專注：關';
    focus.title = next.focusMode ? '關閉專注模式' : '開啟專注模式';
    const itemsToRender = next.floatingShowQuickActions ? next.floatingQuickActions.filter(item => item.enabled) : [];
    const signature = JSON.stringify(itemsToRender);
    if (signature === quickSignature) return;
    quickSignature = signature;
    const focusedId = document.activeElement?.dataset.actionId;
    actions.replaceChildren();
    for (const item of itemsToRender) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.actionId = item.id;
      button.textContent = item.buttonDisplay === 'icon' ? item.icon || item.label
        : item.buttonDisplay === 'text' ? item.label : [item.icon, item.label].filter(Boolean).join(' ');
      button.title = item.label;
      button.setAttribute('aria-label', item.label);
      button.addEventListener('click', () => run(() => api.runQuickAction(item.id, anchor(button))));
      actions.append(button);
      if (focusedId === item.id) button.focus({ preventScroll: true });
    }
  }

  focus.addEventListener('click', () => void run(() => api.toggleFocusMode()));
  window.floatingHeader.init({ header, api, onError: report });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') void run(() => api.hideFloating());
  });

  function isFileDrag(event) { return Array.from(event.dataTransfer?.types || []).includes('Files'); }
  document.addEventListener('dragover', event => {
    event.preventDefault();
    if (!isFileDrag(event)) return;
    event.dataTransfer.dropEffect = 'copy';
    notify('放開以處理檔案或資料夾', 0);
  });
  document.addEventListener('dragleave', event => { if (!event.relatedTarget) notify(''); });
  document.addEventListener('drop', event => {
    event.preventDefault();
    notify('');
    if (!isFileDrag(event)) return;
    void run(async () => {
      const paths = [...event.dataTransfer.files].map(file => window.renameAPI.pathForFile(file)).filter(Boolean);
      if (!paths.length) return;
      const result = await api.dropFiles(paths);
      if (result?.added !== undefined) {
        notify([`新增 ${result.added} 項收藏`, ...(result.issues || [])].join(' · '));
      }
    });
  });
  api.onChanged(result => {
    if (result.settings) render(result.settings);
    if (result.error || result.notice) notify(result.error || result.notice, result.error ? 5000 : 2500);
  });
  void run(() => api.get().then(render));
})();
