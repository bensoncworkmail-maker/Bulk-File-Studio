'use strict';
const { randomUUID } = require('node:crypto');
const { fitBounds, FLOATING_WIDTH } = require('./desktop-state');

const HEIGHT = 40;
function windowDefaults(settings) {
  return { width: settings.floatingCollapsedWidth, height: HEIGHT, minWidth: FLOATING_WIDTH.min, minHeight: HEIGHT };
}
function initialBounds(desktop, screen) {
  const defaults = windowDefaults(desktop.settings);
  const saved = desktop.remembers('floating') ? desktop.data.windows.floating : null;
  const position = saved?.launcherBounds || saved?.bounds;
  return fitBounds(position && { ...position, width: defaults.width, height: HEIGHT }, screen.getAllDisplays(), defaults);
}

class FloatingWindow {
  constructor(window, desktop, screen) {
    Object.assign(this, { window, desktop, screen });
    this.drag = null;
    window.setResizable(false);
    desktop.attach('floating', window);
    window.on('focus', () => this.opacity(true));
    window.on('blur', () => this.opacity(false));
    window.on('hide', () => {
      if (this.drag) this.place(this.drag.bounds);
      this.drag = null;
    });
    this.apply();
  }
  liveBounds() { return this.window.getContentBounds(); }
  place(bounds) {
    const { x, y, width, height } = fitBounds(bounds, this.screen.getAllDisplays(), windowDefaults(this.desktop.settings));
    this.window.setContentBounds({ x, y, width, height });
    return width;
  }
  opacity(focused = this.window.isFocused()) {
    const settings = this.desktop.settings;
    this.window.setOpacity(settings.floatingOpaqueOnFocus && focused ? 1 : settings.floatingOpacity / 100);
  }
  record() { this.desktop.record('floating', this.window); }
  ensureVisible() {
    if (this.drag) return;
    const bounds = this.liveBounds();
    this.place({ ...bounds, width: this.desktop.settings.floatingCollapsedWidth, height: HEIGHT });
    this.record();
  }
  apply() {
    const width = this.desktop.settings.floatingCollapsedWidth;
    if (width !== this.appliedWidth) {
      this.drag = null;
      this.ensureVisible();
      this.appliedWidth = width;
    }
    this.opacity();
  }
  startDrag(mode = 'move') {
    if (!['move', 'resize-left', 'resize-right'].includes(mode)) throw Error('不支援的拖曳操作');
    if (this.window.isDestroyed() || !this.window.isVisible()) throw Error('浮動工具未顯示');
    this.drag = { token: randomUUID(), bounds: this.liveBounds(), mode };
    return { token: this.drag.token };
  }
  moveDrag(token, dx, dy) {
    if (!this.drag || token !== this.drag.token) throw Error('拖曳已結束');
    if (![dx, dy].every(value => Number.isFinite(value) && Math.abs(value) <= 100000)) throw Error('拖曳位置無效');
    const { bounds, mode } = this.drag;
    if (mode === 'move') {
      this.place({ ...bounds, x: Math.round(bounds.x + dx), y: Math.round(bounds.y + dy) });
      return;
    }
    const left = mode === 'resize-left';
    const width = Math.max(FLOATING_WIDTH.min, Math.min(FLOATING_WIDTH.max, Math.round(bounds.width + (left ? -dx : dx))));
    this.drag.width = this.place({ ...bounds, width, x: bounds.x + (left ? bounds.width - width : 0) });
  }
  endDrag(token) {
    if (!this.drag || token !== this.drag.token) return;
    const { mode, width } = this.drag;
    this.drag = null;
    if (mode !== 'move' && width !== undefined) {
      const settings = this.desktop.update({ floatingCollapsedWidth: width });
      this.appliedWidth = settings.floatingCollapsedWidth;
      this.record();
      return { settings };
    }
    this.record();
  }
}
module.exports = { FloatingWindow, initialBounds };
