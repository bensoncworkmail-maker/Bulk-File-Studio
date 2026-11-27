'use strict';
(() => {
  const api = window.desktopAPI;
  const $ = id => document.getElementById(id);
  const header = $('mini-header');
  const actions = $('mini-actions');
  const status = $('mini-status');
  let settings = {};
  let statusTimer,quickSignature;

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
  const click = (id, action) => $(id).addEventListener('click', event => {
    void run(() => action(event.currentTarget));
  });
  const anchor = button => {
    const bounds = button.getBoundingClientRect();
    return { x: bounds.left, y: bounds.bottom };
  };

  const overflow = $('mini-overflow');
  function updateOverflow() {
    // Measure against the space with the overflow control out of the way.
    overflow.hidden = true;
    overflow.hidden = actions.scrollWidth <= actions.clientWidth;
  }
  new ResizeObserver(updateOverflow).observe(header);
  actions.addEventListener('wheel', event => {
    if (actions.scrollWidth <= actions.clientWidth) return;
    event.preventDefault();
    actions.scrollLeft += event.deltaX || event.deltaY;
  }, { passive: false });

  function render(next) {
    settings = next;
    document.documentElement.dataset.theme = next.theme;
    const items = next.floatingCollapsedItems;
    const title = $('mini-title');
    title.textContent = next.floatingTitle;
    title.hidden = !items.includes('caption') || !next.floatingTitle;
    $('mini-focus').hidden = !items.includes('focus');
    $('mini-focus').setAttribute('aria-pressed', String(next.focusMode));
    $('mini-focus').textContent = next.focusMode ? '專注：開' : '專注：關';
    $('mini-main').hidden = !items.includes('main');
    $('mini-pin').hidden = !items.includes('pin');
    $('mini-close').hidden = !items.includes('close');
    $('mini-pin').setAttribute('aria-pressed', String(next.floatingOnTop));
    $('mini-search').hidden = !next.floatingGlobalSearch;
    $('mini-new-master').hidden = !next.floatingShowQuickActions || !next.floatingShowNewMaster;
    const itemsToRender = next.floatingShowQuickActions ? next.floatingQuickActions.filter(item => item.enabled) : [];
    const signature = JSON.stringify(itemsToRender);
    updateOverflow();
    if (signature === quickSignature) return;
    quickSignature = signature;
    const quick = $('mini-quick-actions');
    const focusedId = document.activeElement?.dataset.actionId;
    quick.replaceChildren();
    for (const item of itemsToRender) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.actionId = item.id;
      button.textContent = item.buttonDisplay === 'icon' ? item.icon
        : item.buttonDisplay === 'text' ? item.label : [item.icon, item.label].filter(Boolean).join(' ');
      button.title = item.label;
      button.setAttribute('aria-label', item.label);
      button.addEventListener('click', () => run(() => api.runQuickAction(item.id, anchor(button))));
      quick.append(button);
      if (focusedId === item.id) button.focus({ preventScroll: true });
    }
    updateOverflow();
  }

  click('mini-menu', () => api.openFloatingHeaderMenu());
  click('mini-overflow', button => api.openFloatingHeaderMenu(anchor(button)));
  click('mini-focus', () => api.toggleFocusMode());
  click('mini-pin', () => api.togglePin());
  click('mini-close', () => api.hideFloating());
  click('mini-main', () => api.showMain());
  click('mini-search', button => api.openFloatingSearch(undefined, anchor(button)));
  click('mini-draft', () => api.openDrafts());
  click('mini-stickers', button => api.openStickerMenu(anchor(button)));
  click('mini-new-master', () => api.newWorkspaceMaster());

  window.floatingHeader.init({
    header, api, getSettings: () => settings, onError: report,
    dragControl: event => Boolean(event.target.closest('#mini-menu'))
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') void run(() => api.hideFloating());
    if (event.ctrlKey && event.key.toLowerCase() === 'f' && settings.floatingGlobalSearch) {
      event.preventDefault();
      void run(() => api.openFloatingSearch());
    }
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
  document.addEventListener('contextmenu', event => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    void run(() => api.openFloatingHeaderMenu({ x: event.clientX, y: event.clientY }));
  });
  api.onChanged(result => {
    if (result.settings) render(result.settings);
    if (result.error || result.notice) notify(result.error || result.notice, result.error ? 5000 : 2500);
  });
  void run(() => api.get().then(render));
})();
