'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('renameAPI', Object.freeze({
  exportSettings:input=>ipcRenderer.invoke('export-settings',input),
  appInfo:()=>ipcRenderer.invoke('app-info'),
  chooseMoveFolder:()=>ipcRenderer.invoke('choose-move-folder'),
  movePreview:(paths,folder)=>ipcRenderer.invoke('move-preview',paths,folder),
  moveFiles:(paths,folder,expected)=>ipcRenderer.invoke('move-files',paths,folder,expected),
  chooseFiles: () => ipcRenderer.invoke('choose-files'),
  chooseFolder: (recursive) => ipcRenderer.invoke('choose-folder', recursive),
  addPaths: (paths, recursive) => ipcRenderer.invoke('add-paths', paths, recursive),
  preview: (paths, rules) => ipcRenderer.invoke('preview', paths, rules),
  rename: (paths, rules, plan) => ipcRenderer.invoke('rename', paths, rules, plan),
  undo: () => ipcRenderer.invoke('undo'),
  history: () => ipcRenderer.invoke('history'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  dataLocation:()=>ipcRenderer.invoke('data-location'),
  openDataLocation:()=>ipcRenderer.invoke('open-data-location'),
  exportCSV: (paths, rules) => ipcRenderer.invoke('export-csv', paths, rules),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  pathForFile: (file) => webUtils.getPathForFile(file)
}));
contextBridge.exposeInMainWorld('favoritesAPI', Object.freeze({
  previewImport:(text,tags)=>ipcRenderer.invoke('favorites-import-preview',text,tags),
  importPaths:(text,tags,token)=>ipcRenderer.invoke('favorites-import-paths',text,tags,token),
  collectFloating:(paths,tag)=>ipcRenderer.invoke('floating-collect',paths,tag),
  addTags:(ids,tags)=>ipcRenderer.invoke('favorites-add-tags',ids,tags),
  acknowledgeTags:ids=>ipcRenderer.invoke('favorites-tags-ack',ids),
  list:()=>ipcRenderer.invoke('favorites-list'),
  add:(paths,tags=[])=>ipcRenderer.invoke('favorites-add',paths,tags),
  choose:kind=>ipcRenderer.invoke('favorites-choose',kind),
  update:(ids,changes)=>ipcRenderer.invoke('favorites-update',ids,changes),
  remove:ids=>ipcRenderer.invoke('favorites-remove',ids),
  bulkOpen:ids=>ipcRenderer.invoke('favorites-bulk-open',ids),
  copyMany:ids=>ipcRenderer.invoke('favorites-copy-many',ids),
  open:id=>ipcRenderer.invoke('favorites-open',id),
  show:id=>ipcRenderer.invoke('favorites-show',id),
  copy:id=>ipcRenderer.invoke('favorites-copy',id),
  chooseLink:id=>ipcRenderer.invoke('favorites-choose-link',id),
  toRename:(ids,recursive)=>ipcRenderer.invoke('favorites-to-rename',ids,recursive),
  contextStatus:()=>ipcRenderer.invoke('context-menu-status'),
  setContext:enabled=>ipcRenderer.invoke('context-menu-set',enabled),
  onChanged:callback=>{
    const listener=(_,payload)=>callback(payload);
    ipcRenderer.on('favorites-changed',listener);
    return ()=>ipcRenderer.removeListener('favorites-changed',listener);
  }
}));

contextBridge.exposeInMainWorld('desktopAPI',Object.freeze({
 setFloatingCompact:value=>ipcRenderer.invoke('floating-tools',value),
 startup:()=>ipcRenderer.invoke('startup-get'),setStartup:enabled=>ipcRenderer.invoke('startup-set',enabled),hideToTray:()=>ipcRenderer.invoke('app-hide-to-tray'),
 setFloatingView:mode=>ipcRenderer.invoke('floating-view',mode),
 importPaths:tag=>ipcRenderer.invoke('floating-import',tag),togglePin:()=>ipcRenderer.invoke('floating-pin'),
 get:()=>ipcRenderer.invoke('desktop-settings-get'),configure:patch=>ipcRenderer.invoke('desktop-settings-set',patch),
 resetWindow:()=>ipcRenderer.invoke('desktop-reset-window'),showFloating:()=>ipcRenderer.invoke('floating-show'),hideFloating:()=>ipcRenderer.invoke('floating-hide'),showMain:tag=>ipcRenderer.invoke('floating-main',tag),
 onChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('desktop-settings-changed',listener);return ()=>ipcRenderer.removeListener('desktop-settings-changed',listener);}
}));
