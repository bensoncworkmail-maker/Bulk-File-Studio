'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
// The sandboxed preload keeps this bridge self-contained (no local requires).
const operationListeners=new Set(),activeOperations=new Map();let operationSequence=0;
const operationLabels={
 'move-sources':'核對搬移來源','move-preview':'檢查搬移預覽','move-files':'搬移檔案／資料夾','rename':'批次重新命名','undo':'檢查及復原上一批',
 'preview':'產生命名預覽','add-paths':'讀取來源檔案','choose-files':'選擇及讀取檔案','choose-folder':'讀取資料夾檔案',
 'favorites-import-preview':'檢查路徑與標籤','favorites-import-paths':'匯入收藏連結','favorites-list':'讀取收藏狀態','favorites-remove':'處理收藏移除要求','favorites-manage-tag':'更新標籤與收藏',
 'favorites-add':'加入收藏','favorites-update':'儲存收藏','favorites-add-tags':'更新收藏標籤','floating-collect':'加入收藏位置',
 'favorites-to-rename':'讀取收藏檔案','notes-get':'讀取資料工作區','notes-favorites':'讀取連結位置','studio-search':'搜尋應用程式資料','studio-home':'載入工作台',
 'favorites-choose':'讀取選取位置','favorites-open-locations':'定位檔案位置','favorites-batch-open-confirmed':'開啟已確認檔案','notes-tabular-file':'讀取試算表檔案','floating-quick-action':'開啟快捷動作','export-csv':'匯出檔案預覽','export-settings':'匯出設定','everything-search':'搜尋本機檔案','everything-favorite':'加入搜尋結果','everything-to-rename':'讀取搜尋結果'
};
function notifyOperation(event){for(const listener of operationListeners)try{listener(event);}catch{/* A UI listener must not prevent an operation or its completion. */}}
async function invoke(channel,...args){
 const title=operationLabels[channel]||(/^notes-/.test(channel)&&!/^notes-share-/.test(channel)&&/(?:save|commit|preview|restore|batch|trash|remove|duplicate|template|client-details)/.test(channel)?'處理資料工作區操作':null);
 if(!title)return ipcRenderer.invoke(channel,...args);
 const id=++operationSequence,event={type:'start',id,channel,title,detail:channel==='move-files'?'正在檢查、搬移及校驗，完成後自動關閉。':'處理中，請稍候。完成後自動關閉。'};
 activeOperations.set(id,event);notifyOperation(event);
 try{return await ipcRenderer.invoke(channel,...args,...(['rename','undo'].includes(channel)?[{operationId:id}]:[]));}finally{activeOperations.delete(id);notifyOperation({type:'end',id});}
}
ipcRenderer.on('rename-progress',(_,value)=>{
 if(!value||!Number.isSafeInteger(value.id)||typeof value.title!=='string'||typeof value.detail!=='string')return;const current=activeOperations.get(value.id);if(!current||!['rename','undo'].includes(current.channel))return;
 const next={...current,title:value.title.slice(0,200),detail:value.detail.slice(0,1000)};activeOperations.set(value.id,next);notifyOperation({...next,type:'update'});
});
contextBridge.exposeInMainWorld('operationAPI',Object.freeze({onChange:callback=>{if(typeof callback!=='function')throw new Error('操作監聽無效');operationListeners.add(callback);for(const event of activeOperations.values())try{callback(event);}catch{/* Ignore a failing UI subscriber. */}return ()=>operationListeners.delete(callback);}}));

contextBridge.exposeInMainWorld('renameAPI', Object.freeze({
  exportSettings:input=>invoke('export-settings',input),
  appInfo:()=>invoke('app-info'),
  chooseMoveFolder:()=>invoke('choose-move-folder'),
  chooseMoveSources:()=>invoke('choose-move-sources'),
  movePreview:(paths,folder,options)=>invoke('move-preview',paths,folder,options),
  moveSources:(paths,scope)=>invoke('move-sources',paths,scope),
  moveFiles:(paths,folder,expected,options)=>invoke('move-files',paths,folder,expected,options),
  chooseFiles: () => invoke('choose-files'),
  chooseFolder: (recursive) => invoke('choose-folder', recursive),
  addPaths: (paths, recursive) => invoke('add-paths', paths, recursive),
  preview: (paths, rules) => invoke('preview', paths, rules),
  rename: (paths, rules, plan,verification) => invoke('rename', paths, rules, plan,verification),
  undo: () => invoke('undo'),
  history: () => invoke('history'),
  setTheme: (theme) => invoke('set-theme', theme),
  dataLocation:()=>invoke('data-location'),
  openDataLocation:()=>invoke('open-data-location'),
  exportCSV: (paths, rules) => invoke('export-csv', paths, rules),
  showInFolder: (p) => invoke('show-in-folder', p),
  pathForFile: (file) => webUtils.getPathForFile(file)
}));
contextBridge.exposeInMainWorld('favoritesAPI', Object.freeze({
  previewImport:(text,tags)=>invoke('favorites-import-preview',text,tags),
  importPaths:(text,tags,token)=>invoke('favorites-import-paths',text,tags,token),
  copyFloatingPaths:ids=>invoke('floating-copy-paths',ids),
  collectFloating:(paths,tag)=>invoke('floating-collect',paths,tag),
  manageTag:(name,replacement,count,options)=>invoke('favorites-manage-tag',name,replacement,count,options),
  addTags:(ids,tags)=>invoke('favorites-add-tags',ids,tags),
  acknowledgeTags:ids=>invoke('favorites-tags-ack',ids),
  list:()=>invoke('favorites-list'),
  add:(paths,tags=[])=>invoke('favorites-add',paths,tags),
  choose:kind=>invoke('favorites-choose',kind),
  update:(ids,changes)=>invoke('favorites-update',ids,changes),
  remove:(ids,options)=>invoke('favorites-remove',ids,options),
  openLocations:ids=>invoke('favorites-open-locations',ids),
  batchOpenConfirmed:ids=>invoke('favorites-batch-open-confirmed',ids),
  bulkOpen:ids=>invoke('favorites-bulk-open',ids),
  copyMany:ids=>invoke('favorites-copy-many',ids),
  open:id=>invoke('favorites-open',id),
  show:id=>invoke('favorites-show',id),
  copy:id=>invoke('favorites-copy',id),
  chooseLink:id=>invoke('favorites-choose-link',id),
  toRename:(ids,recursive)=>invoke('favorites-to-rename',ids,recursive),
  contextStatus:()=>invoke('context-menu-status'),
  setContext:enabled=>invoke('context-menu-set',enabled),
  onChanged:callback=>{
    const listener=(_,payload)=>callback(payload);
    ipcRenderer.on('favorites-changed',listener);
    return ()=>ipcRenderer.removeListener('favorites-changed',listener);
  }
}));

contextBridge.exposeInMainWorld('desktopAPI',Object.freeze({
 dropFiles:(paths,tag)=>invoke('floating-drop',paths,tag),
 quickActionOptions:()=>invoke('quick-action-options'),runQuickAction:id=>invoke('floating-quick-action',id),
 defaults:()=>invoke('desktop-settings-defaults'),
 openFloatingHeaderMenu:()=>invoke('floating-header-menu'),
 headerDoubleClick:()=>invoke('floating-header-double-click'),
 beginFloatingDrag:mode=>invoke('floating-drag-start',mode),moveFloatingDrag:(token,dx,dy)=>invoke('floating-drag-move',token,dx,dy),endFloatingDrag:token=>invoke('floating-drag-end',token),
 openFloatingTagMenu:(tag,query)=>invoke('floating-tag-menu',tag,query),
 openFloatingItemMenu:id=>invoke('floating-item-menu',id),
 floatingTagOptions:()=>invoke('floating-tag-options'),
 setFloatingCollapsed:value=>invoke('floating-collapse',value),compactFloatingSize:()=>invoke('floating-compact-size'),
 setFloatingCompact:value=>invoke('floating-tools',value),
 startup:()=>invoke('startup-get'),setStartup:enabled=>invoke('startup-set',enabled),hideToTray:()=>invoke('app-hide-to-tray'),
 newWorkspaceMaster:()=>invoke('floating-workspace-new'),workspaceList:query=>invoke('floating-workspace-list',query),workspaceOpen:(id,action)=>invoke('floating-workspace-open',id,action),onWorkspaceChanged:callback=>ipcRenderer.on('notes-changed',()=>callback()),
 setFloatingView:mode=>invoke('floating-view',mode),
 importPaths:tag=>invoke('floating-import',tag),togglePin:()=>invoke('floating-pin'),
 get:()=>invoke('desktop-settings-get'),configure:patch=>invoke('desktop-settings-set',patch),
 resetWindow:()=>invoke('desktop-reset-window'),showFloating:()=>invoke('floating-show'),hideFloating:()=>invoke('floating-hide'),showMain:tag=>invoke('floating-main',tag),
 onChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('desktop-settings-changed',listener);return ()=>ipcRenderer.removeListener('desktop-settings-changed',listener);}
}));

contextBridge.exposeInMainWorld('everythingAPI',Object.freeze({status:()=>invoke('everything-status'),configure:(enabled,instance)=>invoke('everything-configure',enabled,instance),choose:()=>invoke('everything-choose'),search:input=>invoke('everything-search',input),cancel:()=>invoke('everything-cancel'),favorite:(token,indices,tags)=>invoke('everything-favorite',token,indices,tags),toRename:(token,indices)=>invoke('everything-to-rename',token,indices)}));

contextBridge.exposeInMainWorld('appSearchAPI',Object.freeze({search:(query,options,transient)=>invoke('studio-search',query,options,transient),copyPath:value=>invoke('studio-search-copy',value)}));
contextBridge.exposeInMainWorld('workspaceAPI',Object.freeze({
 chooseTableFile:()=>invoke('notes-tabular-file'),tablePreview:input=>invoke('notes-tabular-preview',input),tableCommit:token=>invoke('notes-tabular-commit',token),
 tools:()=>invoke('notes-tools-get'),saveView:(name,state)=>invoke('notes-view-save',name,state),removeTool:(kind,id)=>invoke('notes-tool-remove',kind,id),saveTemplate:(name,areaId)=>invoke('notes-template-save',name,areaId),applyTemplate:(id,revision)=>invoke('notes-template-apply',id,revision),pin:id=>invoke('notes-pin',id),batchSheets:(entries,revision)=>invoke('notes-batch-sheets',entries,revision),batchAreas:(ids,revision)=>invoke('notes-batch-areas',ids,revision),saveCells:(entries,revision)=>invoke('notes-grid-save',entries,revision),navigation:()=>invoke('notes-navigation'),onNavigate:callback=>ipcRenderer.on('notes-navigate',()=>callback()),onToolsChanged:callback=>ipcRenderer.on('notes-tools-changed',(_,value)=>callback(value)),

 shareStatus:()=>invoke('notes-share-status'),shareChoose:()=>invoke('notes-share-choose'),shareConfigure:patch=>invoke('notes-share-configure',patch),shareCheck:()=>invoke('notes-share-check'),sharePublish:()=>invoke('notes-share-publish'),shareLoad:name=>invoke('notes-share-load',name),onShareChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-share-changed',listener);return ()=>ipcRenderer.removeListener('notes-share-changed',listener);},
 contextMenu:(kind,id)=>invoke('notes-context-menu',kind,id),addPaths:paths=>invoke('notes-add-paths',paths),choosePaths:kind=>invoke('notes-choose-paths',kind),onContextAction:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-context-action',listener);return ()=>ipcRenderer.removeListener('notes-context-action',listener);},
 chooseBackup:()=>invoke('notes-backup-choose'),restoreBackup:token=>invoke('notes-backup-restore',token),
 get:()=>invoke('notes-get'),template:kind=>invoke('notes-template',kind),saveArea:input=>invoke('notes-area-save',input),removeArea:(id,revision)=>invoke('notes-area-remove',id,revision),duplicateRecord:(id,version)=>invoke('notes-record-duplicate',id,version),copy:input=>invoke('notes-copy',input),saveSheet:input=>invoke('notes-sheet-save',input),saveRecord:input=>invoke('notes-record-save',input),completeClientDetails:(areaId,revision)=>invoke('notes-client-details',areaId,revision),batchTrash:(entries,includeDetails,revision)=>invoke('notes-batch-trash',entries,includeDetails,revision),trash:(kind,id,version,restore)=>invoke('notes-trash',kind,id,version,restore),
 history:id=>invoke('notes-history',id),restoreHistory:(id,historyId,version)=>invoke('notes-history-restore',id,historyId,version),favorites:()=>invoke('notes-favorites'),openLink:(id,index,action)=>invoke('notes-open-link',id,index,action),
 exportPreview:options=>invoke('notes-export-preview',options),exportSave:token=>invoke('notes-export-save',token),chooseImport:()=>invoke('notes-import-choose'),importPreview:mode=>invoke('notes-import-preview',mode),importCommit:token=>invoke('notes-import-commit',token),
 onChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-changed',listener);return ()=>ipcRenderer.removeListener('notes-changed',listener);}
}));

contextBridge.exposeInMainWorld('homeAPI',Object.freeze({snapshot:()=>invoke('studio-home')}));
