'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('renameAPI', Object.freeze({
  chooseFiles: () => ipcRenderer.invoke('choose-files'),
  chooseFolder: (recursive) => ipcRenderer.invoke('choose-folder', recursive),
  addPaths: (paths, recursive) => ipcRenderer.invoke('add-paths', paths, recursive),
  preview: (paths, rules) => ipcRenderer.invoke('preview', paths, rules),
  rename: (paths, rules, plan) => ipcRenderer.invoke('rename', paths, rules, plan),
  undo: () => ipcRenderer.invoke('undo'),
  history: () => ipcRenderer.invoke('history'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  exportCSV: (paths, rules) => ipcRenderer.invoke('export-csv', paths, rules),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  pathForFile: (file) => webUtils.getPathForFile(file)
}));
