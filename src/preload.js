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
 'favorites-choose':'讀取選取位置','favorites-open-locations':'定位檔案位置','favorites-batch-open-confirmed':'開啟已確認檔案','notes-tabular-file':'讀取試算表檔案','notes-tabular-export':'匯出 Excel','floating-quick-action':'開啟快捷動作','export-csv':'匯出檔案預覽','export-settings':'匯出設定','everything-search':'搜尋本機檔案','everything-favorite':'加入搜尋結果','everything-to-rename':'讀取搜尋結果'
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
  chooseMoveFolder:filepath=>invoke('choose-move-folder',filepath),
  chooseMoveSources:paths=>invoke('choose-move-sources',paths),
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
  chooseLink:(id,filepath)=>invoke('favorites-choose-link',id,filepath),
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
 toggleFloatingSearch:(query,anchor)=>invoke('floating-search-toggle',query,anchor),prepareFloatingSearch:(query,key)=>invoke('floating-search-prepare',query,key),previewFloatingSearch:(query,key,activate)=>invoke('floating-search-preview',query,key,activate),cancelFloatingSearch:key=>invoke('floating-search-cancel',key),openFloatingSearch:query=>invoke('floating-search-open',query),openDrafts:()=>invoke('draft-open'),quickActionOptions:()=>invoke('quick-action-options'),runQuickAction:(id,anchor)=>invoke('floating-quick-action',id,anchor),
 defaults:()=>invoke('desktop-settings-defaults'),
 openFloatingHeaderMenu:()=>invoke('floating-header-menu'),
 headerDoubleClick:()=>invoke('floating-header-double-click'),
 beginFloatingDrag:mode=>invoke('floating-drag-start',mode),moveFloatingDrag:(token,dx,dy)=>invoke('floating-drag-move',token,dx,dy),endFloatingDrag:token=>invoke('floating-drag-end',token),
 openFloatingTagMenu:(tag,query)=>invoke('floating-tag-menu',tag,query),
 openFloatingItemMenu:id=>invoke('floating-item-menu',id),
 floatingTagOptions:()=>invoke('floating-tag-options'),
 setFloatingCollapsed:value=>invoke('floating-collapse',value),compactFloatingSize:()=>invoke('floating-compact-size'),
 setFloatingCompact:value=>invoke('floating-tools',value),
 openStartupSettings:()=>invoke('startup-open-settings'),startup:()=>invoke('startup-get'),setStartup:enabled=>invoke('startup-set',enabled),hideToTray:()=>invoke('app-hide-to-tray'),
 openFloatingPanel:kind=>invoke('floating-panel-open',kind),
 floatingPanelData:(kind,filters)=>invoke('floating-panel-data',kind,filters),
 floatingPanelAction:(kind,action,value,customer)=>invoke('floating-panel-action',kind,action,value,customer),
 onFloatingPanelOpen:callback=>ipcRenderer.on('floating-panel-open',(_,kind)=>callback(kind)),
 onFloatingPanelChanged:callback=>ipcRenderer.on('floating-panel-changed',(_,kind)=>callback(kind)),
 newWorkspaceMaster:()=>invoke('floating-workspace-new'),workspaceList:query=>invoke('floating-workspace-list',query),workspaceOpen:(id,action)=>invoke('floating-workspace-open',id,action),onWorkspaceChanged:callback=>ipcRenderer.on('notes-changed',()=>callback()),
 setFloatingView:mode=>invoke('floating-view',mode),
 importPaths:tag=>invoke('floating-import',tag),togglePin:()=>invoke('floating-pin'),
 diagnosticsStatus:recent=>invoke('diagnostics-status',recent),openDiagnostics:()=>invoke('diagnostics-open'),exportDiagnostics:()=>invoke('diagnostics-export'),clearDiagnostics:()=>invoke('diagnostics-clear'),
 resizeMain:(width,height)=>invoke('desktop-main-size',width,height),onOpenPage:callback=>ipcRenderer.on('open-app-page',(_,page)=>callback(page)),get:()=>invoke('desktop-settings-get'),configure:patch=>invoke('desktop-settings-set',patch),setFloatingLayoutOrder:order=>invoke('floating-layout-order',order),
 resetWindow:()=>invoke('desktop-reset-window'),showFloating:()=>invoke('floating-show'),hideFloating:()=>invoke('floating-hide'),showMain:tag=>invoke('floating-main',tag),
 onChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('desktop-settings-changed',listener);return ()=>ipcRenderer.removeListener('desktop-settings-changed',listener);}
}));

contextBridge.exposeInMainWorld('everythingAPI',Object.freeze({status:()=>invoke('everything-status'),configure:(enabled,instance)=>invoke('everything-configure',enabled,instance),choose:filepath=>invoke('everything-choose',filepath),search:input=>invoke('everything-search',input),cancel:()=>invoke('everything-cancel'),favorite:(token,indices,tags)=>invoke('everything-favorite',token,indices,tags),toRename:(token,indices)=>invoke('everything-to-rename',token,indices)}));

contextBridge.exposeInMainWorld('appSearchAPI',Object.freeze({search:(query,options,transient)=>invoke('studio-search',query,options,transient),copyPath:value=>invoke('studio-search-copy',value),onTarget:callback=>{const listener=(_,item)=>callback(item);ipcRenderer.on('studio-search-target',listener);return ()=>ipcRenderer.removeListener('studio-search-target',listener);}}));
contextBridge.exposeInMainWorld('workspaceAPI',Object.freeze({
 openDrafts:()=>invoke('draft-open'),checkPackage:filepath=>invoke('notes-check-package',filepath),chooseTableFile:filepath=>invoke('notes-tabular-file',filepath),exportTable:(sheetId,ids,revision)=>invoke('notes-tabular-export',sheetId,ids,revision),tablePreview:input=>invoke('notes-tabular-preview',input),tableCommit:token=>invoke('notes-tabular-commit',token),
 tools:()=>invoke('notes-tools-get'),saveView:(name,state)=>invoke('notes-view-save',name,state),removeTool:(kind,id)=>invoke('notes-tool-remove',kind,id),saveTemplate:(name,areaId)=>invoke('notes-template-save',name,areaId),applyTemplate:(id,revision)=>invoke('notes-template-apply',id,revision),pin:id=>invoke('notes-pin',id),batchSheets:(entries,revision)=>invoke('notes-batch-sheets',entries,revision),batchAreas:(ids,revision)=>invoke('notes-batch-areas',ids,revision),saveCells:(entries,revision)=>invoke('notes-grid-save',entries,revision),navigation:()=>invoke('notes-navigation'),onNavigate:callback=>ipcRenderer.on('notes-navigate',()=>callback()),onToolsChanged:callback=>ipcRenderer.on('notes-tools-changed',(_,value)=>callback(value)),

 onShareOpenRequest:callback=>ipcRenderer.on('notes-share-open-request',()=>callback()),cancelPreview:token=>invoke('notes-preview-cancel',token),importDetails:(token,key)=>invoke('notes-import-details',token,key),
 shareIgnore:name=>invoke('notes-share-ignore',name),replyShareIdle:(id,idle)=>ipcRenderer.invoke('notes-share-idle',id,idle),onShareIdleQuery:callback=>ipcRenderer.on('notes-share-idle-query',(_,id)=>callback(id)),
 shareInspect:name=>invoke('notes-share-inspect',name),shareStatus:()=>invoke('notes-share-status'),shareSelect:id=>invoke('notes-share-select',id),shareChoose:(profileId,filepath)=>invoke('notes-share-choose',profileId,filepath),shareConfigure:(patch,profileId)=>invoke('notes-share-configure',patch,profileId),shareCheck:profileId=>invoke('notes-share-check',profileId),sharePublish:profileId=>invoke('notes-share-publish',profileId),shareLoad:(name,profileId)=>invoke('notes-share-load',name,profileId),onShareChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-share-changed',listener);return ()=>ipcRenderer.removeListener('notes-share-changed',listener);},
 contextMenu:(kind,id)=>invoke('notes-context-menu',kind,id),addPaths:paths=>invoke('notes-add-paths',paths),choosePaths:kind=>invoke('notes-choose-paths',kind),onContextAction:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-context-action',listener);return ()=>ipcRenderer.removeListener('notes-context-action',listener);},
 chooseBackup:filepath=>invoke('notes-backup-choose',filepath),restoreBackup:token=>invoke('notes-backup-restore',token),
 get:()=>invoke('notes-get'),template:kind=>invoke('notes-template',kind),saveArea:input=>invoke('notes-area-save',input),removeArea:(id,revision)=>invoke('notes-area-remove',id,revision),duplicateRecord:(id,version)=>invoke('notes-record-duplicate',id,version),copy:input=>invoke('notes-copy',input),saveSheet:input=>invoke('notes-sheet-save',input),saveRecord:input=>invoke('notes-record-save',input),completeClientDetails:(areaId,revision)=>invoke('notes-client-details',areaId,revision),batchTrash:(entries,includeDetails,revision)=>invoke('notes-batch-trash',entries,includeDetails,revision),trash:(kind,id,version,restore)=>invoke('notes-trash',kind,id,version,restore),
 history:id=>invoke('notes-history',id),restoreHistory:(id,historyId,version)=>invoke('notes-history-restore',id,historyId,version),favorites:()=>invoke('notes-favorites'),openLink:(id,index,action)=>invoke('notes-open-link',id,index,action),inspectLinks:paths=>invoke('notes-inspect-links',paths),
 exportPreview:options=>invoke('notes-export-preview',options),exportSave:token=>invoke('notes-export-save',token),chooseImport:filepath=>invoke('notes-import-choose',filepath),importPreview:(mode,resolution)=>invoke('notes-import-preview',mode,resolution),importCommit:(token,options)=>invoke('notes-import-commit',token,options),
 onChanged:callback=>{const listener=(_,payload)=>callback(payload);ipcRenderer.on('notes-changed',listener);return ()=>ipcRenderer.removeListener('notes-changed',listener);}
}));

contextBridge.exposeInMainWorld('homeAPI',Object.freeze({snapshot:()=>invoke('studio-home')}));
contextBridge.exposeInMainWorld('productivityAPI',Object.freeze({
 get:()=>invoke('productivity-get'),save:(kind,input)=>invoke('productivity-save',kind,input),remove:(kind,id)=>invoke('productivity-remove',kind,id),folder:filepath=>invoke('productivity-folder',filepath),
 repairPreview:(from,to)=>invoke('productivity-repair-preview',from,to),repairApply:(token,keys,ui)=>invoke('productivity-repair-apply',token,keys,ui),
 backupCreate:ui=>invoke('productivity-backup-create',ui),backupExport:name=>invoke('productivity-backup-export',name),backupPreview:(name,filepath)=>invoke('productivity-backup-preview',name,filepath),backupRestore:(token,ui)=>invoke('productivity-backup-restore',token,ui),restoredUI:()=>invoke('productivity-restored-ui'),ackRestored:()=>invoke('productivity-restored-ack'),
 rulesChoose:()=>invoke('productivity-rules-choose'),rulesPreview:(id,paths)=>invoke('productivity-rules-preview',id,paths),rulesAction:(token,paths,action)=>invoke('productivity-rules-action',token,paths,action),
 viewData:(config,filters)=>invoke('tool-view-data',config,filters),openOverlay:config=>invoke('tool-view-open',config),onToolOpen:callback=>ipcRenderer.on('tool-view-open',(_,config)=>callback(config)),
 snippetList:()=>invoke('productivity-snippet-list'),snippetText:(id,customer)=>invoke('productivity-snippet-text',id,customer),
 snippetCopy:(id,customer)=>invoke('productivity-snippet-copy',id,customer),worksetOpen:id=>invoke('productivity-workset-open',id),previewChoose:filepath=>invoke('productivity-preview-choose',filepath),previewLink:(recordId,index)=>invoke('productivity-preview-link',recordId,index),boardMove:(recordId,fieldId,value,revision)=>invoke('productivity-board-move',recordId,fieldId,value,revision)
}));

contextBridge.exposeInMainWorld('diagnosticsAPI',Object.freeze({report:entry=>ipcRenderer.invoke('diagnostics-report',entry)}));

contextBridge.exposeInMainWorld('remindersAPI',Object.freeze({canPresent:automatic=>invoke('reminders-ready',automatic),list:()=>invoke('reminders-list'),save:input=>invoke('reminders-save',input),remove:id=>invoke('reminders-remove',id),ack:id=>invoke('reminders-ack',id),snooze:(id,minutes)=>invoke('reminders-snooze',id,minutes),onOpen:callback=>ipcRenderer.on('record-reminders-open',()=>callback()),onChanged:callback=>ipcRenderer.on('record-reminders-changed',(_,value)=>callback(value))}));
