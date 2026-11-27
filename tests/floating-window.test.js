'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { normalize } = require('../src/desktop-state');
const { initialBounds, FloatingWindow } = require('../src/floating-window');

function createToolbar(settings = {}, saved) {
  let displays = [{ workArea: { x: 0, y: 0, width: 1600, height: 900 } }];
  const screen = { getAllDisplays: () => displays };
  const desktop = {
    settings: normalize(settings),
    data: { windows: { floating: saved } },
    remembers: () => desktop.settings.rememberWindow,
    update(patch) { this.settings = normalize({ ...this.settings, ...patch }); return this.settings; },
    record(key, window) { if (this.remembers()) this.data.windows[key] = { bounds: window.getContentBounds() }; },
    attach() {}
  };
  const window = Object.assign(new EventEmitter(), {
    bounds: initialBounds(desktop, screen),
    getContentBounds() { return this.bounds; },
    setContentBounds(bounds) { this.bounds = bounds; },
    isDestroyed: () => false,
    isFocused: () => false,
    isVisible: () => true,
    setResizable(value) { this.resizable = value; },
    setOpacity(value) { this.opacity = value; }
  });
  const toolbar = new FloatingWindow(window, desktop, screen);
  return { toolbar, desktop, window, screen, setDisplays: value => { displays = value; } };
}

test('legacy launcher position migrates to a fixed-height toolbar and width stays saved', () => {
  const h = createToolbar({ floatingCollapsedWidth: 92, floatingLauncher: 'bubble', floatingCollapsed: false }, {
    bounds: { x: 180, y: 90, width: 700, height: 500 },
    launcherBounds: { x: 360, y: 170, width: 60, height: 60 }
  });
  assert.deepEqual(h.window.bounds, { x: 360, y: 170, width: 560, height: 40 });
  assert.equal(h.window.resizable, false);
  assert.equal(h.desktop.settings.floatingCollapsed, undefined);
  const resize = h.toolbar.startDrag('resize-left');
  h.toolbar.moveDrag(resize.token, 100, 400);
  assert.deepEqual(h.window.bounds, { x: 460, y: 170, width: 460, height: 40 });
  assert.equal(h.toolbar.endDrag(resize.token).settings.floatingCollapsedWidth, 460);
  assert.deepEqual(createToolbar(h.desktop.settings, h.desktop.data.windows.floating).window.bounds, h.window.bounds);
});

test('the toolbar fits a replacement display and recovers its width on a larger monitor', () => {
  const h = createToolbar({ floatingCollapsedWidth: 760, rememberWindow: false });
  h.setDisplays([{ workArea: { x: -600, y: 0, width: 600, height: 320 } }]);
  h.toolbar.ensureVisible();
  assert.equal(h.window.bounds.x, -600);
  assert.equal(h.window.bounds.width, 600);
  assert.equal(h.window.bounds.height, 40);
  assert.equal(h.desktop.settings.floatingCollapsedWidth, 760);
  h.setDisplays([{ workArea: { x: -1800, y: 0, width: 1800, height: 900 } }]);
  h.toolbar.ensureVisible();
  assert.equal(h.window.bounds.width, 760);
});

test('the toolbar can resize below 220 px and remembers 92 px without resetting', () => {
  const h = createToolbar({ floatingCollapsedWidth: 220 }, {
    bounds: { x: 260, y: 90, width: 220, height: 40 }
  });
  const right = h.toolbar.startDrag('resize-right');
  h.toolbar.moveDrag(right.token, -128, 0);
  assert.equal(h.toolbar.endDrag(right.token).settings.floatingCollapsedWidth, 92);
  const reopened = createToolbar(h.desktop.settings, h.desktop.data.windows.floating);
  assert.equal(reopened.window.bounds.width, 92);
  const left = reopened.toolbar.startDrag('resize-left');
  reopened.toolbar.moveDrag(left.token, 40, 0);
  assert.deepEqual(reopened.window.bounds, { x: 272, y: 90, width: 80, height: 40 });
  assert.equal(reopened.toolbar.endDrag(left.token).settings.floatingCollapsedWidth, 80);
});
