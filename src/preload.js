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
  copyFloatingPaths:ids=>ipcRenderer.invoke('floating-copy-paths',ids),
  collectFloating:(paths,tag)=>ipcRenderer.invoke('floating-collect',paths,tag),
  manageTag:(name,replacement,count)=>ipcRenderer.invoke('favorites-manage-tag',name,replacement,count),
  addTags:(ids,tags)=>ipcRenderer.invoke('favorites-add-tags',ids,tags),
  acknowledgeTags:ids=>ipcRenderer.invoke('favorites-tags-ack',ids),
  list:()=>ipcRenderer.invoke('favorites-list'),
  add:(paths,tags=[])=>ipcRenderer.invoke('favorites-add',paths,tags),
  choose:kind=>ipcRenderer.invoke('favorites-choose',kind),
  update:(ids,changes)=>ipcRenderer.invoke('favorites-update',ids,changes),
  remove:ids=>ipcRenderer.invoke('favorites-remove',ids),
  openLocations:ids=>ipcRenderer.invoke('favorites-open-locations',ids),
  batchOpenConfirmed:ids=>ipcRenderer.invoke('favorites-batch-open-confirmed',ids),
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
 defaults:()=>ipcRenderer.invoke('desktop-settings-defaults'),
 openFloatingHeaderMenu:()=>ipcRenderer.invoke('floating-header-menu'),
 headerDoubleClick:()=>ipcRenderer.invoke('floating-header-double-click'),
 beginFloatingDrag:mode=>ipcRenderer.invoke('floating-drag-start',mode),moveFloatingDrag:(token,dx,dy)=>ipcRenderer.invoke('floating-drag-move',token,dx,dy),endFloatingDrag:token=>ipcRenderer.invoke('floating-drag-end',token),
 openFloatingTagMenu:(tag,query)=>ipcRenderer.invoke('floating-tag-menu',tag,query),
 openFloatingItemMenu:id=>ipcRenderer.invoke('floating-item-menu',id),
 floatingTagOptions:()=>ipcRenderer.invoke('floating-tag-options'),
 setFloatingCollapsed:value=>ipcRenderer.invoke('floating-collapse',value),compactFloatingSize:()=>ipcRenderer.invoke('floating-compact-size'),
 setFloatingCompact:value=>ipcRenderer.invoke('floating-tools',value),
 startup:()=>ipcRenderer.invoke('startup-get'),setStartup:enabled=>ipcRenderer.invoke('startup-set',enabled),hideToTray:()=>ipcRenderer.invoke('app-hide-to-tray'),
 newWorkspaceMaster:()=>ipcRenderer.invoke('floating-workspace-new'),workspaceList:query=>ipcRenderer.invoke('floating-workspace-list',query),workspaceOpen:(id,action)=>ipcRenderer.invoke('floating-workspace-open',id,action),onWorkspaceChanged:callback=>ipcRenderer.on('notes-changed',()=>callback()),
 setFloatingView:mode=>ipcRenderer.invoke('floating-view',mode),
 importPaths:tag=>ipcRenderer.invoke('floating-import',tag),togglePin:()=>ipcRenderer.invoke('floating-pin'),
 get:()=>ipcRenderer.invoke('desktop-settings-get'),configure:patch=>ipcRenderer.invoke('desktop-settings-set',patch),
 resetWindow:()=>ipcRenderer.invoke('desktop-reset-window'),showFloating:()=>ipcRenderer.invoke('floating-show'),hideFloating:()=>ipcRenderer.invoke('floating-hide'),showMain:tag=>ipcRenderer.invoke('floating-main',tag),
 onChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('desktop-settings-changed',listener);return ()=>ipcRenderer.removeListener('desktop-settings-changed',listener);}
}));

contextBridge.exposeInMainWorld('everythingAPI',Object.freeze({status:()=>ipcRenderer.invoke('everything-status'),configure:(enabled,instance)=>ipcRenderer.invoke('everything-configure',enabled,instance),choose:()=>ipcRenderer.invoke('everything-choose'),search:input=>ipcRenderer.invoke('everything-search',input),cancel:()=>ipcRenderer.invoke('everything-cancel'),favorite:(token,indices,tags)=>ipcRenderer.invoke('everything-favorite',token,indices,tags),toRename:(token,indices)=>ipcRenderer.invoke('everything-to-rename',token,indices)}));

contextBridge.exposeInMainWorld('appSearchAPI',Object.freeze({search:(query,options,transient)=>ipcRenderer.invoke('studio-search',query,options,transient),copyPath:value=>ipcRenderer.invoke('studio-search-copy',value)}));
contextBridge.exposeInMainWorld('workspaceAPI',Object.freeze({
 chooseTableFile:()=>ipcRenderer.invoke('notes-tabular-file'),tablePreview:input=>ipcRenderer.invoke('notes-tabular-preview',input),tableCommit:token=>ipcRenderer.invoke('notes-tabular-commit',token),
 tools:()=>ipcRenderer.invoke('notes-tools-get'),saveView:(name,state)=>ipcRenderer.invoke('notes-view-save',name,state),removeTool:(kind,id)=>ipcRenderer.invoke('notes-tool-remove',kind,id),saveTemplate:(name,areaId)=>ipcRenderer.invoke('notes-template-save',name,areaId),applyTemplate:(id,revision)=>ipcRenderer.invoke('notes-template-apply',id,revision),pin:id=>ipcRenderer.invoke('notes-pin',id),batchSheets:(entries,revision)=>ipcRenderer.invoke('notes-batch-sheets',entries,revision),batchAreas:(ids,revision)=>ipcRenderer.invoke('notes-batch-areas',ids,revision),saveCells:(entries,revision)=>ipcRenderer.invoke('notes-grid-save',entries,revision),navigation:()=>ipcRenderer.invoke('notes-navigation'),onNavigate:callback=>ipcRenderer.on('notes-navigate',()=>callback()),onToolsChanged:callback=>ipcRenderer.on('notes-tools-changed',(_,value)=>callback(value)),

 shareStatus:()=>ipcRenderer.invoke('notes-share-status'),shareChoose:()=>ipcRenderer.invoke('notes-share-choose'),shareConfigure:patch=>ipcRenderer.invoke('notes-share-configure',patch),shareCheck:()=>ipcRenderer.invoke('notes-share-check'),sharePublish:()=>ipcRenderer.invoke('notes-share-publish'),shareLoad:name=>ipcRenderer.invoke('notes-share-load',name),onShareChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-share-changed',listener);return ()=>ipcRenderer.removeListener('notes-share-changed',listener);},
 contextMenu:(kind,id)=>ipcRenderer.invoke('notes-context-menu',kind,id),addPaths:paths=>ipcRenderer.invoke('notes-add-paths',paths),choosePaths:kind=>ipcRenderer.invoke('notes-choose-paths',kind),onContextAction:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-context-action',listener);return ()=>ipcRenderer.removeListener('notes-context-action',listener);},
 chooseBackup:()=>ipcRenderer.invoke('notes-backup-choose'),restoreBackup:token=>ipcRenderer.invoke('notes-backup-restore',token),
 get:()=>ipcRenderer.invoke('notes-get'),template:kind=>ipcRenderer.invoke('notes-template',kind),saveArea:input=>ipcRenderer.invoke('notes-area-save',input),removeArea:(id,revision)=>ipcRenderer.invoke('notes-area-remove',id,revision),duplicateRecord:(id,version)=>ipcRenderer.invoke('notes-record-duplicate',id,version),copy:input=>ipcRenderer.invoke('notes-copy',input),saveSheet:input=>ipcRenderer.invoke('notes-sheet-save',input),saveRecord:input=>ipcRenderer.invoke('notes-record-save',input),completeClientDetails:(areaId,revision)=>ipcRenderer.invoke('notes-client-details',areaId,revision),batchTrash:(entries,includeDetails,revision)=>ipcRenderer.invoke('notes-batch-trash',entries,includeDetails,revision),trash:(kind,id,version,restore)=>ipcRenderer.invoke('notes-trash',kind,id,version,restore),
 history:id=>ipcRenderer.invoke('notes-history',id),restoreHistory:(id,historyId,version)=>ipcRenderer.invoke('notes-history-restore',id,historyId,version),favorites:()=>ipcRenderer.invoke('notes-favorites'),openLink:(id,index,action)=>ipcRenderer.invoke('notes-open-link',id,index,action),
 exportPreview:options=>ipcRenderer.invoke('notes-export-preview',options),exportSave:token=>ipcRenderer.invoke('notes-export-save',token),chooseImport:()=>ipcRenderer.invoke('notes-import-choose'),importPreview:mode=>ipcRenderer.invoke('notes-import-preview',mode),importCommit:token=>ipcRenderer.invoke('notes-import-commit',token),
 onChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-changed',listener);return ()=>ipcRenderer.removeListener('notes-changed',listener);}
}));
