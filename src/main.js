'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme, clipboard, screen, globalShortcut, Tray, Menu, nativeImage, utilityProcess, Notification } = require('electron');
const {installOfflinePolicy,assertLocalPath,assertSafeOpen}=require('./offline-policy');
const {resolveMoveSources,planMove,executeRelocation,prepareMoveUndo}=require('./move-core');
const {previewPathImport,importPathList}=require('./path-import-core');
const {createSettingsExport,writeSettingsExport}=require('./settings-export');
const {DesktopState}=require('./desktop-state');
const {DiagnosticLog}=require('./diagnostic-log');
const {Buffer}=require('node:buffer');
const {DraftNotes}=require('./draft-notes');
const {NotesStore}=require('./notes-store');
const {NotesToolsStore}=require('./notes-tools-store');
const {NotesShareProfiles}=require('./notes-share-profiles');
const {writePackageFile,writeWorkspaceFile}=require('./notes-files');
const {openFileInput}=require('./open-file-input');
const {readImportPackageFile,packageImportName}=require('./notes-import-files');
const {DesktopShell}=require('./desktop-shell');
const {FloatingWindow,windowDefaults}=require('./floating-window');
const {FloatingCapture,checkedPaths}=require('./floating-capture');
const {tagMenu,tagListMenu}=require('./floating-tag-menu');
const {prepareBatch,executeBatch}=require('./favorites-batch');
const {tagList,basename}=require('./favorites-model');
let recordReminders,recordNotification,recordAttention,floatingSearch,productivity,toolOverlay,snippetPicker;
const quickActions=require('./quick-actions-model');
const panelModel=require('./floating-panels-model');
const {prepareTrash,executeTrash}=require('./favorites-trash');
const globalShortcuts=require('./global-shortcuts');
const {normalize:normalizeDesktop}=require('./desktop-state');
const {pathToFileURL}=require('node:url');
const fs = require('node:fs');
const path = require('node:path');
const { createPreview, executeMoves, listPaths, snapshotMoves, prepareUndo } = require('./rename-core');
const renameJobs=require('./rename-job');
const {writeHistory}=require('./rename-history');
const { FavoritesStore,inspectPath } = require('./favorites-store');
const {EverythingBridge}=require('./everything-bridge');
const { WindowsContextMenu, favoriteArguments, validFavoritePaths } = require('./windows-context-menu');

// Keep the historical packaged profile path after the display-name change.
if(app.isPackaged){const profile=path.join(app.getPath('appData'),'Bulk Rename Studio');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
for(const flag of ['disable-background-networking','disable-component-update','disable-domain-reliability','dns-prefetch-disable'])app.commandLine.appendSwitch(flag);

let capture,drafts,runQuickAction,shortcutRecording=false;
let win, floating, floatingWindow, floatingMenuController, desktop, desktopShell, pendingMaximize=false, shortcutWarning='',shellWarning='';
const diagnostics=new DiagnosticLog(path.join(app.getPath('userData'),'logs'),{getSettings:()=>desktop?.settings,appRoot:__dirname,environment:{version:app.getVersion(),platform:process.platform,arch:process.arch,electron:process.versions.electron||'',node:process.versions.node}});
const monitorException=error=>diagnostics.record('main','uncaughtException',error);
process.on('uncaughtExceptionMonitor',monitorException);
function loggedInvocation(source,action,task){try{const result=task();if(result&&typeof result.then==='function')return result.catch(error=>{diagnostics.record(source,action,error);throw error;});return result;}catch(error){diagnostics.record(source,action,error);throw error;}}
let sharedNotification=null,lastSharedNotification='';
function updateSharedNotification(value){
 try{
  if(!value.enabled||!value.desktopNotifications){sharedNotification?.close();sharedNotification=null;lastSharedNotification='';return;}
  if(!value.notice){sharedNotification?.close();sharedNotification=null;return;}
  if(value.busy||value.notice.name===lastSharedNotification||!Notification?.isSupported?.())return;
  sharedNotification?.close();const notice=new Notification({title:'共享資料包有更新',body:'有待預覽的共享資料更新，按此回到 Bulk File Studio。'});
  notice.on('click',()=>{focusMain();send(win,'notes-share-open-request',{});});notice.on('failed',(_,error)=>diagnostics.record('main','share-notification',String(error||'桌面通知未能顯示')));notice.show();sharedNotification=notice;lastSharedNotification=value.notice.name;
 }catch(error){diagnostics.record('main','share-notification',error);}
}
function closeFloatingMenu(){floatingMenuController?.close();}
function reportSnippetPasteFailure(error){const message=String(error.message||error).slice(0,400);send(win,'desktop-settings-changed',{error:message});if(Notification?.isSupported?.())try{new Notification({title:'文字已複製，未能自動貼上',body:message}).show();}catch{}}
function floatingAction(task){return async()=>{try{await task();}catch(error){diagnostics.record('floating','native-menu',error);send(floating,'desktop-settings-changed',{error:String(error.message||error)});}};}
function popupFloatingMenu(template,options){
 floatingMenuController??=new(require('./floating-menu').FloatingMenu)({Menu,getWindow:()=>floating,showWindow:showFloating,settings:()=>desktop.settings,onError:error=>diagnostics.record('floating','native-menu',error)});
 return floatingMenuController.popup(template,options);
}
const pendingTagIds=new Set();
let queuedFilter=null,pendingImportRequest=null;
const mainDefaults={width:1520,height:930,minWidth:920,minHeight:650};
let favorites,everything;
let notesImportReadVersion=0;
let notes,notesImportDocument,notesImportName='',notesShare,notesTools,pendingNotesNavigation=null,sharedImport=null,sharedImportToken=null;
function invalidateNotesImport(){notesImportReadVersion++;notesImportDocument=null;notesImportName='';sharedImport=null;sharedImportToken=null;if(notes)notes.pending=null;}
function invalidateSharedImport(profileId){if(sharedImport?.profileId===profileId)invalidateNotesImport();}
const shareIdleRequests=new Map();
function shareIdle(){if(!win||win.isDestroyed())return Promise.resolve(false);return new Promise(resolve=>{const id=require('node:crypto').randomUUID(),timer=setTimeout(()=>{shareIdleRequests.delete(id);resolve(false);},1500);shareIdleRequests.set(id,value=>{clearTimeout(timer);shareIdleRequests.delete(id);resolve(value===true);});send(win,'notes-share-idle-query',id);});}
function toolsStore(){if(!notesTools)notesTools=new NotesToolsStore(path.join(app.getPath('userData'),'workspace-tools.json'));return notesTools;}
function toolsChanged(){const result=toolsStore().get();send(win,'notes-tools-changed',result);send(floating,'notes-changed',{});floatingSearch?.invalidate();return result;}
function navigateWorkspace(recordId,sheetId=null){pendingNotesNavigation={recordId,sheetId};focusMain();send(win,'notes-navigate',{});}
function notesStore(){if(!notes)notes=new NotesStore(path.join(app.getPath('userData'),'workspace.sqlite'));return notes;}
function notesChanged(result){try{if(notesShare?.reconcile())notesShare.emit();}catch(error){diagnostics.record('main','share-profiles-reconcile',error);}send(win,'notes-changed',{revision:result.revision});send(floating,'notes-changed',{revision:result.revision});send(floating,'floating-panel-changed','planning');send(capture?.window,'floating-capture-choices-changed',{});floatingSearch?.invalidate();toolOverlay?.invalidate();recordAttention?.sync();return result;}
let fileOperationBusy=false;
function fileOperation(task){if(fileOperationBusy||trashing)throw new Error('另一項改名、搬移或復原仍在執行，請稍候');fileOperationBusy=true;try{const result=task();if(result&&typeof result.then==='function')return result.finally(()=>{fileOperationBusy=false;});fileOperationBusy=false;return result;}catch(error){fileOperationBusy=false;throw error;}}
function renameProgress(event,context){return value=>{if(event.sender!==win?.webContents||!Number.isSafeInteger(context?.operationId)||context.operationId<=0)return;const labels={snapshot:'建立內容校驗（第 1／2 遍）',verify:'執行前複核（第 2／2 遍）','undo-verify':'復原內容檢查（第 1／2 遍）',staging:'暫存檔名',renaming:'套用檔名'},title=labels[value.phase]||'處理改名';const bytes=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(1)+' MB';const detail=typeof value.totalBytes==='number'?`第 ${value.fileIndex}／${value.totalFiles} 個：${value.name}；已讀取 ${bytes(value.completedBytes)}／${bytes(value.totalBytes)}（本階段）`:`${value.fileIndex}／${value.totalFiles} 個：${value.name}`;send(win,'rename-progress',{id:context.operationId,title,detail});};}
function finishRenameJob(result){const warning=syncFavoriteMoves(result.moves);return {...result,warning:[result.warning,warning].filter(Boolean).join('\n')};}
let trashing=false;
async function confirmTrash(ids,validateScope=()=>{}){
 if(fileOperationBusy)throw new Error('檔案操作仍在執行，請完成後再回收檔案');
 if(trashing)throw new Error('另一項回收操作仍在處理');
 trashing=true;
 try{
  validateScope();const plan=prepareTrash(favorites,ids);
  const choice=await dialog.showMessageBox(win,{type:'warning',title:'第二次確認：回收實際檔案／資料夾',message:`將 ${plan.targets.length} 個來源及其內容移至系統資源回收筒，並移除 ${plan.affected.length} 項收藏連結，是否繼續？`,detail:plan.targets.map(target=>target.path+'（含 '+target.entries.length+' 個項目）').join('\n')+'\n其他標籤下的相同收藏及資料夾內的收藏也會移除。工作區內的文字路徑不會自動刪除。若系統無法回收，會保留來源與連結；不會改為永久刪除。',buttons:['移至資源回收筒','取消'],defaultId:1,cancelId:1,noLink:true});
  if(choice.response!==0||win.isDestroyed())return {canceled:true,trashed:0,removed:0,failures:[]};
  validateScope();const result=await executeTrash(favorites,plan,filepath=>shell.trashItem(filepath));notifyFavorites({trashedPaths:result.trashedPaths});return result;
 }finally{trashing=false;}
}
function openFavorite(id,action='open'){return require('./favorites-network').openFavorite({favorites,id,action,shell});}
let batchOpening=false;
async function confirmBatch(ids,kind,parent){
 if(batchOpening)throw new Error('另一項批次開啟仍在處理');
 batchOpening=true;
 try{
  return await require('./intranet-path').withIntranetPaths(favorites.selection(favorites.read(),ids).map(item=>item.path),async()=>{
  const plan=prepareBatch(favorites,ids,kind),locations=kind==='locations';
  const choice=await dialog.showMessageBox(parent,{type:'question',title:locations?'批次開啟所在資料夾':'批次開啟檔案／資料夾',message:`將開啟 ${plan.targets.length} 個${locations?'所在資料夾（已合併相同位置）':'檔案／資料夾'}，是否繼續？`,detail:plan.targets.map(target=>target.path).join('\n'),buttons:['開啟','取消'],defaultId:1,cancelId:1,noLink:true});
  if(choice.response!==0||parent.isDestroyed())return {canceled:true,opened:0,failures:[]};
  return await require('./intranet-path').withIntranetPaths(plan.targets.map(item=>item.path),()=>executeBatch(favorites,plan,filepath=>shell.openPath(filepath)));
  });
 }finally{batchOpening=false;}
}
function reportFloatingBatch(result){send(floating,'desktop-settings-changed',result.failures.length?{error:`已開啟 ${result.opened} 項；${result.failures.join('\n')}`}:{notice:result.canceled?'已取消批次開啟':`已開啟 ${result.opened} 項`});}
let contextMenu;
let queuedFavorites = favoriteArguments(process.argv);
let favoriteActivation = queuedFavorites.length > 0;
let favoriteNotice = null;
function send(window,channel,payload){if(window&&!window.isDestroyed())window.webContents.send(channel,payload);}
function notifyFavorites(payload = {}) {closeFloatingMenu();send(win,'favorites-changed',payload);send(floating,'favorites-changed',{});send(capture?.window,'floating-capture-choices-changed',{});floatingSearch?.invalidate();}
function receiveFavorites(argv, transferredPaths) {
  queuedFavorites.push(...(transferredPaths===undefined?favoriteArguments(argv):validFavoritePaths(transferredPaths)));
  if (queuedFavorites.length && favorites) {
    favoriteActivation = true;
    try {
      const result = favorites.addPaths(queuedFavorites);
      if(desktop.settings.explorerTagPrompt)for(const id of result.ids)pendingTagIds.add(id);
      queuedFavorites = [];
      favoriteNotice = {message:`已收藏 ${result.added} 項，${result.existing} 項已在收藏中。`,issues:result.issues};
    } catch (e) { favoriteNotice = {message:'右鍵收藏未完成',issues:[e.message]}; }
    notifyFavorites({activate:true});
  }
  if (win) { if(win.isMinimized())win.restore();win.show();win.focus(); }
}
function syncFavoriteMoves(moves) {
  try { favorites.applyMoves(moves);notifyFavorites();return ''; }
  catch(e) { return `操作已完成，但收藏位置未能同步；請在「我的收藏」重新連結：${e.message}`; }
}
const historyFile = () => path.join(app.getPath('userData'), 'last-rename.json');
const readHistory = () => {
  try {
    const h = JSON.parse(fs.readFileSync(historyFile(), 'utf8'));
    if (Array.isArray(h.moves) && h.moves.length) return h;
  } catch { /* no prior history */ }
  return null;
};
const saveHistory = history => writeHistory(historyFile(),history,fs);

function searchLocalData(query,options,transient){const warnings=[];let document={areas:[],sheets:[],records:[]},tools={views:[],templates:[]};try{document=notesStore().get().document;}catch(error){warnings.push('工作區讀取失敗：'+error.message);}try{tools=toolsStore().get();}catch(error){warnings.push('檢視／範本讀取失敗：'+error.message);}return {...require('./app-search-model').search({document,favorites:favorites.read().items,tools,transient:transient||{}},query,{...options,criteria:options?.criteria??desktop.settings.globalSearchCriteria,includeAreas:false}),warnings};}
function floatingSearchController(){
 if(!floatingSearch)floatingSearch=new(require('./floating-search').FloatingSearch)({BrowserWindow,screen,secureWindow,remember:window=>rememberAuxSize('search',window),settings:()=>desktop.settings,saveConditions:value=>{if(!desktop.settings.floatingSearchRememberConditions)return {saved:false};const settings=desktop.update({floatingSearchLastState:value});send(win,'desktop-settings-changed',{settings});return {saved:true};},tables:()=>{const doc=notesStore().get().document;return doc.sheets.filter(sheet=>!sheet.deletedAt).map(sheet=>({id:sheet.id,name:sheet.name,parentSheetId:require('./notes-model').parentField(doc,sheet)?.targetSheetId||null}));},parent:()=>{if(!floating||floating.isDestroyed())showFloating();return floating;},returnFocus:()=>{if(floating&&!floating.isDestroyed()&&floating.isVisible())floating.focus();},favorites,run:searchLocalData,copy:value=>clipboard.writeText(value),visit:(item,requestId)=>{const M=require('./notes-model');if(['record','sheet'].includes(item.kind)){const doc=notesStore().get().document;if(item.kind==='record'&&!doc.records.some(record=>record.id===item.id&&M.live(doc,record))||item.kind==='sheet'&&!doc.sheets.some(sheet=>sheet.id===item.id&&!sheet.deletedAt))throw new Error('資料已移除，請重新搜尋');}if(item.kind==='favorite')favorites.get(item.id);focusMain();const target=win,payload=requestId?{...item,requestId}:item;if(target.webContents.isLoadingMainFrame?.())target.webContents.once('did-finish-load',()=>send(target,'studio-search-target',payload));else send(target,'studio-search-target',payload);},fileAction:async(action,item)=>{if(fileOperationBusy)throw new Error('檔案操作進行中，請稍後再試');return require('./intranet-path').withIntranetPaths([require('./notes-location-links').locationPath(item.path)],async()=>{if(action==='show'){require('./favorites-store').inspectPath(item.path);shell.showItemInFolder(item.path);return;}await require('./notes-location-links').safeLocationOpen(item.path);const error=await shell.openPath(item.path);if(error)throw new Error(error);});}});return floatingSearch;
}
function captureController(){
 if(!capture)capture=new FloatingCapture({BrowserWindow,screen,secureWindow,size:()=>desktop.settings.toolWindowSizes.capture,remember:window=>rememberAuxSize('capture',window),parent:()=>{if(!floating||floating.isDestroyed())showFloating();return floating;},settings:()=>desktop.settings,notesStore,favorites,notesChanged,notifyFavorites,choosePaths:async(kind,parent)=>{const value=await dialog.showOpenDialog(parent,{title:kind==='folder'?'連結資料夾':'連結檔案',properties:[kind==='folder'?'openDirectory':'openFile','multiSelections']});return value.canceled?[]:value.filePaths;}});return capture;
}
function openDrafts(){
 if(fs.existsSync(path.join(app.getPath('userData'),'profile-transaction.json')))throw new Error('上次更新未能完成，請重新啟動程式以復原原有資料');
 drafts??=new DraftNotes({BrowserWindow,screen,nativeImage,dialog,secureWindow,desktop,store:notesStore,settings:()=>desktop.settings,
  imageDir:path.join(app.getPath('userData'),'draft-images'),onError:error=>diagnostics.record('main','draft-notes',error),
  onPreview:(filepath,mode,parent)=>productivity.previewFile(filepath,mode,parent),onStandaloneReminder:input=>{const value=recordReminders.save(input);send(win,'record-reminders-changed',value);send(floating,'floating-panel-changed','planning');return value;},onSent:notesChanged,onRemind:recordId=>{
   focusMain();
   const target=win,show=()=>send(target,'record-reminders-open',{recordId});
   if(target.webContents.isLoadingMainFrame?.())target.webContents.once('did-finish-load',show);
   else show();
  },quit:()=>app.quit()});
 closeFloatingMenu();
 return drafts.open();
}
function validatedLinkPaths(paths=[]){
 if(!Array.isArray(paths)||paths.length>100)throw new Error('位置連結資料無效');
 return paths.map(require('./notes-location-links').locationPath);
}
function configuredQuick(id){const action=desktop.settings.floatingQuickActions.find(item=>item.id===id&&item.enabled);if(!action)throw new Error('快捷動作已移除或停用');return action;}
function keepFloatingAfterQuick(){if(!floating||floating.isDestroyed())return;if(desktop.settings.floatingOnTop){floating.pinController?.sync();return;}if(!desktop.settings.floatingKeepAfterQuick)floating.hide();}
function rememberAuxSize(key,window){
 window.on('resized',()=>{
  try{
   if(window.isDestroyed()||window.isMaximized?.())return;
   const {width,height}=window.getNormalBounds();
   const current=desktop.settings;
   if(!current.rememberWindow)return;
   const patch=key==='search'?{floatingSearchWidth:width,floatingSearchHeight:height}:
    {toolWindowSizes:{...current.toolWindowSizes,[key]:{width,height}}};
   const settings=desktop.update(patch);
   send(win,'desktop-settings-changed',{settings});
  }catch(error){diagnostics.record('main','aux-window-size',error);}
 });
}
function focusMain(){
  if(!win||win.isDestroyed())createWindow();if(win.isMinimized())win.restore();win.show();if(pendingMaximize){pendingMaximize=false;win.maximize();}win.focus();
}
function applyMainBounds(requested){
  const bounds=require('./desktop-state').fitBounds(requested,screen.getAllDisplays(),mainDefaults);
  if(win.isMaximized())win.unmaximize();
  win.setMinimumSize(bounds.minWidth,bounds.minHeight);
  win.setBounds(bounds);
  return win.getBounds?.()||bounds;
}
function createWindow(hidden=false) {
  win = new BrowserWindow({
    ...desktop.bounds('main',screen.getAllDisplays(),mainDefaults),
    show:!hidden,
    backgroundColor: '#0b1020',
    title: 'Bulk File Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });
  secureWindow(win);
  desktop.attach('main',win,error=>send(win,'desktop-settings-changed',{error:error.message}));
  pendingMaximize=Boolean(hidden&&desktop.settings.rememberWindow&&desktop.data.windows.main?.maximized);
  if(!hidden&&desktop.settings.rememberWindow&&desktop.data.windows.main?.maximized)win.maximize();
  win.on('blur',endShortcutRecording);win.on('hide',endShortcutRecording);win.webContents.on('render-process-gone',endShortcutRecording);
  win.on('close',event=>{if(desktopShell.onClose(event))return;if(fileOperationBusy||trashing){event.preventDefault();send(win,'desktop-settings-changed',{error:'檔案操作仍在執行，請完成後再關閉'});return;}if(drafts?.requestClose(true)){event.preventDefault();return;}capture?.destroy();drafts?.destroy();floatingSearch?.destroy();recordAttention?.destroyWindow();if(floating&&!floating.isDestroyed()){try{floatingWindow.record();}catch{/* Keep closing available if preferences cannot be saved. */}floating.destroy();}});
  win.on('closed',()=>{win=null;});
  win.loadFile(path.join(__dirname, 'index.html'));
}

function secureWindow(window){
  installOfflinePolicy(window.webContents.session,__dirname);
  window.webContents.on('render-process-gone',(_,details)=>{if(details.reason!=='clean-exit')diagnostics.record(window===win?'main-renderer':window===floating?'floating':window===recordAttention?.window?'reminder-attention':window===floatingSearch?.window?'floating-search':'capture','render-process-gone',new Error(details.reason+' (exit '+details.exitCode+')'));});
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
}
function showFloating(toggle=false){
  if(floating&&!floating.isDestroyed()){
    if(toggle&&floating.isVisible()){floating.hide();return;}
    floating.show();floating.focus();return;
  }
  floating=new BrowserWindow({...desktop.bounds('floating',screen.getAllDisplays(),windowDefaults(desktop.settings)),frame:false,maximizable:false,minimizable:false,fullscreenable:false,title:'Bulk File Studio · '+(desktop.settings.floatingTitle||'浮動工具'),autoHideMenuBar:true,skipTaskbar:true,alwaysOnTop:desktop.settings.floatingOnTop,backgroundColor:desktop.settings.theme==='light'?'#f4f6fb':'#090e1b',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:!app.isPackaged}});
  secureWindow(floating);floating.pinController=new(require('./floating-pin').FloatingPin)(floating,()=>desktop.settings,{onError:error=>diagnostics.record('floating','pin-state',error)});floatingWindow=new FloatingWindow(floating,desktop,screen);
  floating.on('hide',()=>toolOverlay?.closeForParent(floating));
  floating.on('hide',closeFloatingMenu);floating.on('close',closeFloatingMenu);
  floating.on('hide',()=>floatingSearch?.destroy());floating.on('closed',()=>{floatingSearch?.destroy();capture?.destroy();closeFloatingMenu();floating=null;floatingWindow=null;});floating.loadFile(path.join(__dirname,'floating.html'));
}
function setFloatingCollapsed(collapsed){closeFloatingMenu();const settings=desktop.update({floatingCollapsed:collapsed});if(floating&&!floating.isDestroyed())floatingWindow.apply();const result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;}
function toggleFloatingCollapse(){try{if(!floating||floating.isDestroyed()){setFloatingCollapsed(false);showFloating();return;}if(!floating.isVisible()){setFloatingCollapsed(false);floating.showInactive();return;}setFloatingCollapsed(!desktop.settings.floatingCollapsed);}catch(error){send(win,'desktop-settings-changed',{error:error.message});}}
function preparePasteWorker(){const paste=require('./snippet-paste');if((desktop.settings.floatingQuickActions||[]).some(action=>action.enabled&&(action.type==='paste-snippet'||action.type==='open-snippets'&&action.snippetAction==='paste')))paste.warm();else paste.close();}
function registerShortcut(){preparePasteWorker();if(shortcutRecording){globalShortcut.unregisterAll();return '';}return desktopShell.registerShortcuts();}
function endShortcutRecording(){if(!shortcutRecording)return;shortcutRecording=false;shortcutWarning=registerShortcut();send(win,'desktop-settings-changed',{settings:desktop.settings,warning:shortcutWarning});}


if (app.requestSingleInstanceLock({favoritePaths:queuedFavorites})) {
app.on('second-instance', (_, argv, workingDirectory, additionalData) => receiveFavorites(argv,additionalData?.favoritePaths));
app.whenReady().then(() => {
  if(process.platform==='win32')app.setAppUserModelId?.(app.isPackaged?'app.bulkrenamestudio.desktop':process.execPath);
  const handle=(channel,handler)=>ipcMain.handle(channel,(event,...args)=>{
    const main=win&&event?.sender===win.webContents&&event?.senderFrame?.url===pathToFileURL(path.join(__dirname,'index.html')).href;
    const mini=floating&&event?.sender===floating.webContents&&event?.senderFrame?.url===pathToFileURL(path.join(__dirname,'floating.html')).href;
    const floatingAllowed=['draft-open','floating-panel-data','floating-panel-action','floating-layout-order','floating-search-toggle','floating-search-prepare','floating-search-preview','floating-search-cancel','floating-search-open','diagnostics-report','floating-drop','floating-quick-action','floating-workspace-new','floating-workspace-list','floating-workspace-open','favorites-list','favorites-open','favorites-show','favorites-copy','desktop-settings-get','floating-hide','floating-main','floating-pin','floating-view','floating-tools','floating-collect','floating-import','floating-collapse','floating-copy-paths','floating-tag-menu','floating-item-menu','floating-header-double-click','floating-drag-start','floating-drag-move','floating-drag-end','floating-header-menu'];
    return loggedInvocation(main?'main-renderer':mini?'floating':'untrusted',channel,()=>{
      if(!main&&!(mini&&floatingAllowed.includes(channel))&&!(channel==='diagnostics-report'&&(capture?.owns(event)||recordAttention?.owns(event)||floatingSearch?.owns(event))))throw new Error('不受信任的操作來源');
      if(fs.existsSync(path.join(app.getPath('userData'),'profile-transaction.json'))&&!['diagnostics-report','diagnostics-status','app-info'].includes(channel))throw new Error('上次更新未能完成，請重新啟動程式以復原原有資料');
      return handler(event,...args);
    });
  });
  if(fs.existsSync(path.join(app.getPath('userData'),'profile-transaction.json')))require('./profile-service').recoverProfile(app.getPath('userData'),notesStore());
  desktop=new DesktopState(path.join(app.getPath('userData'),'desktop-state.json'));
  desktopShell=new DesktopShell({readLoginRegistration:process.platform==='win32'?require('./startup-registration').readRegistration:undefined,app,Tray,Menu,nativeImage,globalShortcut,platform:process.platform,packaged:app.isPackaged,portable:Boolean(process.env.PORTABLE_EXECUTABLE_FILE),executable:process.execPath,getSettings:()=>desktop.settings,showMain:focusMain,showFloating,toggleFloatingCollapse,showDrafts:floatingAction(openDrafts),showSnippets:floatingAction(()=>openToolOverlay('snippets')),showCalendar:floatingAction(()=>openToolOverlay('planning')),toggleFocusMode:floatingAction(()=>configureDesktop({focusMode:!desktop.settings.focusMode})),extraShortcuts:settings=>[...(settings.floatingQuickActions||[]).filter(item=>item.enabled&&item.shortcut).map(item=>['accelerator:'+item.shortcut,item.label,floatingAction(()=>runShortcutQuickAction(item.id)),'action:'+item.id]),...(productivity?.store.get().snippets||[]).filter(item=>item.shortcut).map(item=>['accelerator:'+item.shortcut,'複製 '+item.name,floatingAction(()=>productivity.copySnippet(item.id,'')),'snippet:'+item.id])],showSearch:floatingAction(()=>{if(!desktop.settings.floatingGlobalSearch)throw new Error('浮動全域搜尋已停用');if(!floating||floating.isDestroyed()||!floating.isVisible())showFloating();return floatingSearchController().open();}),hideMain:()=>win?.hide(),hideFloating:()=>floating?.hide(),openStartupSettings:()=>shell.openExternal('ms-settings:startupapps'),onWarning:message=>{shellWarning=message;send(win,'desktop-settings-changed',{warning:message});}});
  handle('shortcuts-recording',(_,enabled)=>{if(typeof enabled!=='boolean')throw new Error('快捷鍵錄製狀態無效');if(!enabled){endShortcutRecording();return {capturing:false};}if(!win.isFocused())return {capturing:false};shortcutRecording=true;globalShortcut.unregisterAll();return {capturing:true};});
  handle('draft-open',openDrafts);
  const draftHandlers={
   data:()=>drafts.data(),read:id=>notesStore().draft(id),new:()=>notesStore().createDraft(),
   save:(...args)=>drafts.save(...args),configure:patch=>drafts.configure(patch),export:(...args)=>drafts.export(...args),preview:(...args)=>drafts.preview(...args),remind:(...args)=>drafts.remind(...args),
   attach:(...args)=>drafts.attach(...args),paste:(...args)=>drafts.paste(...args),image:(...args)=>drafts.image(...args),
   remove:(...args)=>drafts.removeAttachment(...args),delete:(...args)=>notesStore().deleteDraft(...args),
   masters:id=>drafts.masters(id),send:(...args)=>drafts.send(...args),
   close:event=>{const owner=drafts.window;setImmediate(()=>{if(drafts.window===owner&&drafts.owns(event))drafts.close();});},
   'cancel-close':()=>drafts.cancelClose()
  };
  for(const [name,handler] of Object.entries(draftHandlers)){
   ipcMain.handle('draft-'+name,(event,...args)=>loggedInvocation('draft-notes','draft-'+name,()=>{
    if(!drafts?.owns(event))throw new Error('不受信任的操作來源');
    if(name!=='close'&&name!=='cancel-close'&&fs.existsSync(path.join(app.getPath('userData'),'profile-transaction.json')))throw new Error('上次更新未能完成，請重新啟動程式以復原原有資料');
    if(name==='close')return handler(event);
    return handler(...args);
   }));
  }
  everything=new EverythingBridge(path.join(app.getPath('userData'),'everything-config.json'));
  notesShare=new NotesShareProfiles(path.join(app.getPath('userData'),'workspace-share.json'),{masters:()=>require('./notes-model').masterTableTree(notesStore().get().document).map(branch=>({id:branch.master.id,name:branch.master.name})),canMerge:context=>notesStore().hasSharedBase(context),applyUpdate:async(data,revision,stillEnabled,context)=>{
    if(!await shareIdle()||!stillEnabled()||capture?.window&&!capture.window.isDestroyed()||fileOperationBusy)return {deferred:true,reason:'正在編輯、執行操作或尚未取得主視窗閒置確認，稍後會重試。'};
    try{
     const result=notesStore().importShared(data,revision,context);
     if(result.deferred)return result;
     notesChanged(result);return {revision:result.revision,backup:result.result.backup};
    }catch(error){
     if(error instanceof require('./notes-shared-merge').MergeConflict)return {deferred:true,reason:error.message};
     throw error;
    }
  },snapshot:selection=>{const current=notesStore().get(),scope=require('./notes-sharing-model').scope(selection);return {revision:current.revision,data:require('./notes-sharing-model').shareSnapshot(current.document,scope)};},createWorker:()=>utilityProcess.fork(path.join(__dirname,'notes-share-worker.js'),[],{stdio:'ignore',serviceName:'Studio Workspace Share'}),onChange:value=>{if(value.error)diagnostics.record('main','share-background',value.error);updateSharedNotification(value.notificationState||value);send(win,'notes-share-changed',value);}});
  handle('notes-share-idle',(_,id,idle)=>{const reply=typeof id==='string'?shareIdleRequests.get(id):null;if(reply)reply(idle);return {received:Boolean(reply)};});
  handle('notes-share-ignore',(_,name)=>notesShare.ignore(name));
  handle('notes-share-status',()=>notesShare.status());
  handle('notes-share-select',(_,id)=>{const value=notesShare.select(id);invalidateNotesImport();return value;});
  handle('notes-share-choose',async(_,profileId=notesShare.selected,dropped)=>{notesShare.channel(profileId);const filepath=await openFileInput(dialog,win,{title:'選取共享資料包資料夾（啟用後可能透過區域網路存取）',properties:['openDirectory']},dropped);if(!filepath)return {canceled:true};const folder=require('./notes-share-worker').validateFolder(filepath);await require('./intranet-path').withIntranetPaths([folder],()=>{if(dropped!==undefined&&require('./notes-location-links').inspectLinks([folder])[0].type!=='folder')throw new Error('請拖放一個共享資料夾');});const value=notesShare.choose(folder,profileId);invalidateSharedImport(profileId);return value;});
  handle('notes-share-configure',(_,patch,profileId=notesShare.selected)=>{for(const key of ['publishScope','receiveScope'])if(patch?.[key]?.mode==='masters'){const roots=new Set(require('./notes-model').masterTableTree(notesStore().get().document).map(branch=>branch.master.id));if(require('./notes-sharing-model').scope(patch[key]).masterIds.some(id=>!roots.has(id)))throw new Error('所選主表已變更，請重新整理');}const value=notesShare.configure(patch,profileId);if(patch.publishScope||patch.receiveScope||patch.followSource!==undefined||patch.enabled!==undefined||patch.receiveMode!==undefined)invalidateSharedImport(profileId);return value;});
  handle('notes-share-check',(_,profileId)=>notesShare.check(profileId));
  handle('notes-share-publish',(_,profileId)=>notesShare.publish(profileId));
  handle('notes-share-inspect',async(_,name)=>{const result=await notesShare.read(name),M=require('./notes-model'),doc=M.readPackage(result.data);return {name,source:result.sharing?.source||'未提供',version:result.sharing?.version||null,commit:result.sharing?.commit||null,revision:result.sharing?.revision??null,scope:result.sharing?.scope||{mode:'all',masterIds:[]},masters:M.masterTableTree(doc).map(branch=>({id:branch.master.id,name:branch.master.name,children:branch.children.length,referenceOnly:result.sharing?.scope?.mode==='masters'&&!result.sharing.scope.masterIds.includes(branch.master.id)})),records:doc.records.length,recycled:result.data.tombstones?.length||0};});
  handle('notes-share-load',async(_,name,profileId=notesShare.selected)=>{invalidateNotesImport();const readVersion=notesImportReadVersion;sharedImport={profileId,loading:true};const result=await notesShare.read(name,profileId);if(readVersion!==notesImportReadVersion)throw new Error('匯入來源已變更，請使用最新選擇');notesImportDocument=result.data;notesImportName=name;sharedImport={name,sharing:result.sharing,profileId:result.profileId,scope:require('./notes-sharing-model').receivingScope(result.sharing?.scope,result.receiveScope)};return {name,canceled:false,supportsMerge:Boolean(result.sharing?.source&&Number.isSafeInteger(result.sharing.revision))};});
  handle('studio-home',()=>{const warnings=[];let document={areas:[],sheets:[],records:[]},tools={views:[],pins:[]};try{document=notesStore().get().document;}catch(error){warnings.push('工作區讀取失敗：'+error.message);}try{tools=toolsStore().get();}catch(error){warnings.push('釘選／檢視讀取失敗：'+error.message);}return {...require('./home-model').snapshot({document,tools,favorites:favorites.read().items}),warnings};});
  handle('studio-search',(_,query,options,transient)=>searchLocalData(query,options,transient));
  handle('studio-search-copy',(_,value)=>{clipboard.writeText(require('./notes-model').text(value,4096,'位置文字',true));});
  handle('notes-tools-get',()=>toolsStore().get());
  handle('notes-bookmarks',()=>require('./notes-tools-store').workspaceBookmarks(notesStore().get().document,toolsStore().get()));
  handle('notes-bookmark-set',(_,kind,id,enabled)=>{toolsStore().setBookmark(notesStore().get().document,kind,id,enabled);return toolsChanged();});
  handle('notes-bookmark-tags',(_,kind,id,tags)=>{toolsStore().setBookmarkTags(kind,id,tags);return toolsChanged();});
  handle('notes-view-save',(_,name,state)=>{toolsStore().saveView(name,state);return toolsChanged();});
  handle('notes-tool-remove',(_,kind,id)=>{toolsStore().remove(kind,id);return toolsChanged();});
  handle('notes-template-save',(_,name,areaId)=>{toolsStore().saveTemplate(name,notesStore().get().document,areaId);return toolsChanged();});
  handle('notes-template-apply',(_,id,revision)=>{const template=toolsStore().get().templates.find(item=>item.id===id);if(!template)throw new Error('範本已移除');return notesChanged(notesStore().applyCustomTemplate(template.document,revision));});
  handle('notes-pin',(_,id)=>{toolsStore().pin(notesStore().get().document,id);return toolsChanged();});
  handle('notes-batch-sheets',(_,entries,revision)=>notesChanged(notesStore().batchSheets(entries,revision)));
  handle('notes-batch-areas',(_,ids,revision)=>notesChanged(notesStore().batchAreas(ids,revision)));
  handle('notes-tabular-file',async(_,dropped)=>{const filepath=await openFileInput(dialog,win,{title:'選取 Excel 活頁簿（只讀取儲存值）',filters:[{name:'Excel',extensions:['xlsx']}],properties:['openFile']},dropped);if(!filepath)return {canceled:true};const resultData=await require('./notes-xlsx').readSpreadsheetFile(filepath);return {...resultData,name:path.basename(filepath),canceled:false};});
  handle('notes-tabular-export',async(_,sheetId,ids,revision)=>{
    const state=notesStore().get();
    if(state.revision!==revision)throw new Error('資料工作區已變更，請重新整理後再匯出');
    const rows=require('./notes-model').tabularExport(state.document,sheetId,ids);
    const buffer=await require('./notes-xlsx').writeXlsx(rows);
    const result=await dialog.showSaveDialog(win,{title:'匯出目前表格的篩選結果',
      defaultPath:'BulkFileStudio-紀錄.xlsx',filters:[{name:'Excel 活頁簿',extensions:['xlsx']}]});
    if(result.canceled||!result.filePath)return {canceled:true};
    const extension=path.extname(result.filePath);
    if(extension&&extension.toLowerCase()!=='.xlsx')throw new Error('請使用 .xlsx 副檔名');
    const filename=extension?result.filePath:result.filePath+'.xlsx';
    writeWorkspaceFile(filename,buffer);
    return {canceled:false,count:rows.length-1};
  });
  handle('notes-tabular-preview',(_,input)=>input?.allowIntranet===true?notesStore().tabularPreviewIntranet(input):notesStore().tabularPreview(input));
  handle('notes-tabular-commit',(_,token)=>notesChanged(notesStore().tabularCommit(token)));
  handle('notes-grid-save',(_,entries,revision)=>notesChanged(notesStore().updateCells(entries,revision)));
  handle('notes-navigation',()=>{const next=pendingNotesNavigation;pendingNotesNavigation=null;return next;});
  handle('quick-action-options',()=>{
    const M=require('./notes-model'),doc=notesStore().get().document,live=doc.sheets.filter(sheet=>!sheet.deletedAt),masterSheets=new Set(doc.areas.map(area=>area.masterSheetId));
    return {snippets:productivity.store.get().snippets.map(({id,name,category})=>({id,name,category})),tags:tagList(favorites.read().items),sheets:live.map(sheet=>({id:sheet.id,name:sheet.name,fields:sheet.fields,area:doc.areas.find(area=>area.id===sheet.areaId)?.name||'未分組',parentSheetId:M.parentField(doc,sheet)?.targetSheetId||null})),masters:doc.records.filter(record=>masterSheets.has(record.sheetId)&&M.live(doc,record)).map(record=>({id:record.id,sheetId:record.sheetId,title:record.title}))};
  });
  handle('floating-search-open',(_,query)=>floatingSearchController().open(query));
  handle('studio-search-target-opened',(_,requestId)=>floatingSearch?.targetOpened(requestId)??false);
  handle('floating-layout-order',(_,order)=>{if(!desktop.settings.floatingLayoutEditing)throw new Error('請先在設定啟用浮動版面拖曳');if(!Array.isArray(order)||order.length!==3||new Set(order).size!==3||order.some(key=>!['search','tools','tags'].includes(key)))throw new Error('浮動列順序無效');const settings=desktop.update({floatingControlOrder:order});const result={settings};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;});
  handle('floating-search-toggle',(_,query,anchor)=>{if(floatingSearch?.window&&!floatingSearch.window.isDestroyed()){floatingSearch.destroy();return {closed:true};}if(!floating||floating.isDestroyed())throw new Error('請先開啟浮動工具');const bounds=floating.getContentBounds?.()||floating.getNormalBounds();if(!anchor||!['x','y','width','height'].every(key=>Number.isFinite(anchor[key]))||anchor.x<0||anchor.y<0||anchor.x>bounds.width||anchor.y>bounds.height+8||anchor.width<0||anchor.width>bounds.width||anchor.height<0||anchor.height>bounds.height)throw new Error('搜尋按鈕位置無效');return floatingSearchController().open(query,{anchor:{x:bounds.x+anchor.x,y:bounds.y+anchor.y,width:anchor.width,height:anchor.height}});});
  handle('floating-search-prepare',(_,query,key)=>floatingSearchController().prepareLive(query,key));
  handle('floating-search-cancel',(_,key)=>floatingSearch?.cancelLive(key)||{closed:true});
  handle('floating-search-preview',(_,query,key,activate)=>{if(!floating||floating.isDestroyed()||!floating.isVisible()||!floating.isFocused())return {opened:false};return floatingSearchController().previewLive(query,key,activate);});
  for(const [channel,method] of [['floating-search-get','data'],['floating-search-state-save','saveState'],['floating-search-run','search'],['floating-search-action','action'],['floating-search-close','close']])ipcMain.handle(channel,(event,...args)=>loggedInvocation('floating-search',channel,()=>{if(!floatingSearch?.owns(event))throw new Error('不受信任的搜尋面板來源');return floatingSearch[method](...args);}));
  for(const [channel,method] of [['floating-capture-get','data'],['floating-capture-preview','preview'],['floating-capture-commit','commit'],['floating-capture-save','save'],['floating-capture-choose','choose'],['floating-capture-clear','clearAttachments'],['floating-capture-attach','addAttachments'],['floating-capture-close','close']])ipcMain.handle(channel,(event,...args)=>loggedInvocation('capture',channel,()=>{if(!capture?.owns(event))throw new Error('不受信任的浮動表單來源');return capture[method](...args);}));
  const showTagMenu=(tag,query,{allowCollapsed=false,menuItems}={})=>{
    const result=(Array.isArray(tag)?tagListMenu:tagMenu)(favorites.list(),tag,query,{
      open:id=>floatingAction(()=>openFavorite(id))(),
      main:selected=>{focusMain();favoriteActivation=true;queuedFilter={tag:selected};notifyFavorites({activate:true});},
      copy:ids=>floatingAction(()=>clipboard.writeText(favorites.recordedPaths(ids).join('\r\n')))(),
      batchOpen:ids=>floatingAction(async()=>reportFloatingBatch(await confirmBatch(ids,'open',floating)))(),
      batchLocations:ids=>floatingAction(async()=>reportFloatingBatch(await confirmBatch(ids,'locations',floating)))()
    },menuItems);
    popupFloatingMenu(result.template,{allowCollapsed});return {count:result.count};
  };
  for(const [channel,method] of [['snippet-picker-get','data'],['snippet-picker-select','select'],['snippet-picker-close','close'],['snippet-picker-groups','setGroups']])ipcMain.handle(channel,(event,...args)=>loggedInvocation('snippet-picker',channel,()=>{if(!snippetPicker?.owns(event))throw new Error('不受信任的片段選擇來源');return snippetPicker[method](...args);}));
  let shortcutMenuTrigger,snippetPickerRequest=0;
  async function runShortcutQuickAction(id){
    const action=configuredQuick(id),request=++snippetPickerRequest;snippetPicker?.close();
    let captureFailure;
    const pasteTarget=action.type==='open-snippets'&&action.snippetAction==='paste'?await require('./snippet-paste').capture({onError:error=>{captureFailure=error;diagnostics.record('floating','snippet-target-capture',error);}}):null;
    if(request!==snippetPickerRequest)return {canceled:true};
    if(action.type==='open-snippets'&&action.snippetAction==='paste'&&!pasteTarget){const error=new Error('尚未取得有效貼上目標。'+(captureFailure?String(captureFailure.message||captureFailure).slice(0,300)+'。':'')+'請先在目標程式的文字欄位按一下，再按快捷鍵。');if(Notification?.isSupported?.())try{new Notification({title:'尚未開啟貼上選單',body:error.message}).show();}catch{}throw error;}
    if(action.type==='open-snippets'&&action.snippetAction==='paste'){
      closeFloatingMenu();
      snippetPicker??=new(require('./snippet-picker').SnippetPicker)({BrowserWindow,screen,secureWindow,globalShortcut,settings:()=>desktop.settings,groupStates:()=>desktop.snippetPickerGroups(),saveGroups:changes=>desktop.saveSnippetPickerGroups(changes,productivity.store.get().snippets.map(item=>item.category)),onError:error=>{diagnostics.record('floating','snippet-picker-open',error);send(floating,'desktop-settings-changed',{error:'片段選擇窗未能開啟：'+String(error.message||error)});}});
      const rows=require('./tool-views-model').snippetRows(productivity.store.get().snippets,desktop.settings.floatingPanels.snippetQuery);
      return snippetPicker.open(rows,pasteTarget,async(snippetId,target)=>{try{const current=configuredQuick(id);if(current.type!=='open-snippets'||current.snippetAction!=='paste')throw new Error('快捷動作已變更，請重新開啟');return await productivity.pasteSnippet(snippetId,target);}catch(error){reportSnippetPasteFailure(error);throw error;}});
    }
    if(action.type==='open-tag-menu'||action.display==='menu'){
      closeFloatingMenu();
      shortcutMenuTrigger??=new(require('./shortcut-menu-trigger').ShortcutMenuTrigger)({window:()=>floating,show:()=>{if(!floating||floating.isDestroyed()||!floating.isVisible())showFloating();}});
      return shortcutMenuTrigger.run(floatingAction(()=>runQuickAction(null,id,undefined,pasteTarget)),{released:pasteTarget?.released===true});
    }
    return runQuickAction(null,id);
  }
  runQuickAction=(event,id,anchor,pasteTarget)=>{
    const action=configuredQuick(id);
    if(action.type==='open-tag-menu')return {...showTagMenu(action.tagKeys||action.tag,action.query,{allowCollapsed:true,menuItems:action.menuItems}),menu:true};
    if(action.type==='copy-tag-paths'){const selected=(action.tagKeys?tagListMenu:tagMenu)(favorites.list(),action.tagKeys||action.tag,action.query,{});clipboard.writeText(favorites.recordedPaths(selected.ids).join('\r\n'));return {copied:selected.count};}
    if(action.type==='paste-snippet')return productivity.pasteSnippet(action.snippetId);
    if(action.type==='open-worksets'){
      if(action.display==='main'){focusMain();send(win,'open-app-page',{tool:'worksets'});return {opened:true};}
      const rows=productivity.store.get().worksets;
      popupFloatingMenu(rows.length?rows.map(item=>({label:menuLabel(item.name),click:floatingAction(async()=>{const result=await productivity.openWorkset(item.id);if(result.recordId)navigateWorkspace(result.recordId);})})):[{label:'尚未建立工作集',enabled:false}],{allowCollapsed:true});return {menu:true};
    }
    if(action.type==='open-drafts')return openDrafts();
    if(action.type==='open-search')return {...floatingSearchController().open(action.query),popup:true};
    if(['view-logs','open-planning','open-snippets'].includes(action.type)){
      const kind={'view-logs':'logs','open-planning':'planning','open-snippets':'snippets'}[action.type];
      const config=require('./tool-views-model').configuration({...action,kind});
      if(kind==='snippets')config.snippetAction=action.snippetAction||'copy';
      if(action.display==='menu'){
        if(!floating||floating.isDestroyed()||!floating.isVisible())showFloating();
        return openQuickToolMenu(config,event?.sender===floating.webContents?anchor:undefined,pasteTarget);
      }
      if(action.display==='overlay')return kind==='logs'?toolOverlay.open(config):openInlinePanel(kind);
      focusMain();
      const target=win;
      if(target.webContents.isLoadingMainFrame?.())target.webContents.once('did-finish-load',()=>send(target,'tool-view-open',config));
      else send(target,'tool-view-open',config);
      keepFloatingAfterQuick();
      return {opened:true};
    }
    if(action.type==='open-reminders'){focusMain();send(win,'record-reminders-open',{});keepFloatingAfterQuick();return {opened:true};}
    if(action.type==='open-page'||action.type==='open-tool'||action.type==='open-share'){
      focusMain();
      const target=win,channel=action.type==='open-share'?'notes-share-open-request':'open-app-page';
      const payload=action.type==='open-page'?action.page:action.type==='open-tool'?{tool:action.tool}:{};
      if(target.webContents.isLoadingMainFrame?.())target.webContents.once('did-finish-load',()=>send(target,channel,payload));
      else send(target,channel,payload);
      keepFloatingAfterQuick();
      return {opened:true};
    }
    if(action.type==='share-check')return notesShare.check();
    if(action.type==='share-publish'){const profileId=notesShare.selected,channel=notesShare.channel(profileId),generation=channel.generation;return dialog.showMessageBox(floating||win,{type:'question',buttons:['取消','發佈'],defaultId:0,cancelId:0,message:'發佈「'+(notesShare.status().profiles.find(profile=>profile.id===profileId)?.name||'目前共享設定')+'」資料包？',detail:'資料夾：'+(channel.config.folder||'未設定')+'\n會包含紀錄、筆記與位置；不包含原始檔案。'}).then(result=>{if(result.response!==1)return {canceled:true};if(configuredQuick(id).type!=='share-publish'||notesShare.channel(profileId)!==channel||channel.generation!==generation)throw new Error('共享設定已變更，請重新確認發布來源與資料夾');return notesShare.publish(profileId);});}
    if(desktop.settings.floatingQuickMode==='popup'&&action.type!=='open-sheet'){
      const text=action.type==='import-paths'&&action.useClipboard?clipboard.readText():'';if(Buffer.byteLength(text,'utf8')>2*1024*1024)throw new Error('剪貼簿文字超過 2 MB，請改用手動貼上');return captureController().open({resolve:()=>configuredQuick(id),text});
    }
    if(action.type==='import-paths'){
      if(pendingImportRequest)throw new Error('上一個匯入要求仍待開啟，請先回主視窗完成');
      const text=action.useClipboard?clipboard.readText():'';if(Buffer.byteLength(text,'utf8')>2*1024*1024)throw new Error('剪貼簿文字超過 2 MB，請改用手動貼上');
      pendingImportRequest={tags:action.tags,text};favoriteActivation=true;focusMain();keepFloatingAfterQuick();notifyFavorites({activate:true});return {opened:true};
    }
    if(pendingNotesNavigation)throw new Error('上一個工作區要求仍待開啟，請先儲存或取消主視窗的編輯');
    const M=require('./notes-model'),doc=notesStore().get().document,sheet=doc.sheets.find(sheet=>sheet.id===action.sheetId&&!sheet.deletedAt);if(!sheet)throw new Error('快捷動作的表格已移除，請在設定更改');
    if(action.type==='new-record'){
      const parent=M.parentField(doc,sheet);if(action.masterId&&!doc.records.some(record=>record.id===action.masterId&&record.sheetId===parent?.targetSheetId&&M.live(doc,record)))throw new Error('預設主紀錄已變更，請在設定重新選擇');
      pendingNotesNavigation={newRecordSheetId:sheet.id,masterId:action.masterId||null};
    }else pendingNotesNavigation={openSheetId:sheet.id};
    focusMain();keepFloatingAfterQuick();send(win,'notes-navigate',{});return {opened:true};
  };
  handle('floating-quick-action',runQuickAction);
  handle('floating-workspace-new',()=>{const doc=notesStore().get().document,groups=doc.areas.filter(area=>doc.sheets.some(sheet=>sheet.id===area.masterSheetId&&!sheet.deletedAt));popupFloatingMenu(groups.length?groups.map(area=>({label:'＋ '+area.name,click:()=>{pendingNotesNavigation={newMasterSheetId:area.masterSheetId};focusMain();send(win,'notes-navigate',{});}})):[{label:'請先在主視窗建立群組主表',enabled:false}]);});
  handle('floating-workspace-list',(_,query='')=>require('./notes-tools-store').workspaceItems(notesStore().get().document,toolsStore().get().pins,query));
  handle('floating-workspace-open',(_,id,action='open')=>{if(action==='home'&&id===null){pendingNotesNavigation={home:true};focusMain();send(win,'notes-navigate',{});return;}const M=require('./notes-model'),doc=notesStore().get().document,record=doc.records.find(record=>record.id===id&&M.live(doc,record)&&doc.areas.some(area=>area.masterSheetId===record.sheetId));if(!record)throw new Error('主紀錄已移除');if(action==='copy'){clipboard.writeText(require('./notes-tools-store').contactText(doc,id));return;}if(action==='open'){navigateWorkspace(id);return;}if(action!=='menu')throw new Error('操作無效');const area=doc.areas.find(area=>area.masterSheetId===record.sheetId);popupFloatingMenu([{label:record.title,enabled:false},{label:'在工作區開啟',click:()=>navigateWorkspace(id)},{label:'複製聯絡資訊',click:floatingAction(()=>clipboard.writeText(require('./notes-tools-store').contactText(notesStore().get().document,id)))},{label:toolsStore().get().pins.includes(id)?'取消釘選':'釘選到浮動工具',click:floatingAction(()=>{toolsStore().pin(notesStore().get().document,id);toolsChanged();})},...M.detailSheets(doc,area.id).map(sheet=>({label:'＋ 新增'+sheet.name,click:()=>navigateWorkspace(id,sheet.id)}))]);});
  handle('notes-get',()=>notesStore().get());
  handle('notes-template',(_,kind)=>notesChanged(notesStore().addTemplate(kind)));
  handle('notes-area-save',(_,input)=>notesChanged(notesStore().saveArea(input)));
  handle('notes-area-remove',(_,id,revision)=>notesChanged(notesStore().removeArea(id,revision)));
  handle('notes-record-duplicate',(_,id,version)=>notesChanged(notesStore().duplicateRecord(id,version)));
  handle('notes-copy',(_,input)=>{const value=require('./notes-model').clipboardText(notesStore().get().document,input);if(Buffer.byteLength(value)>2*1024*1024)throw new Error('複製內容超過 2 MB，請改用資料包匯出');clipboard.writeText(value);});
  handle('notes-sheet-preview',(_,input)=>notesStore().sheetPreview(input));
  handle('notes-sheet-commit',(_,token,confirmRemoval)=>notesChanged(notesStore().sheetCommit(token,confirmRemoval)));
  handle('notes-sheet-save',(_,input)=>notesChanged(notesStore().saveSheet(input)));
  handle('notes-record-save',(_,input)=>require('./intranet-path').withIntranetPaths(validatedLinkPaths(input?.directPaths),()=>{
    if(!input||!Array.isArray(input.favoriteIds)||input.favoriteIds.length>100||!Array.isArray(input.keepUnlinked)||input.keepUnlinked.length>100)throw new Error('檔案連結資料無效');
    const old=notesStore().get().document.records.find(record=>record.id===input.id),catalog=favorites.read(),knownIds=new Set(catalog.items.map(item=>item.id)),unlinked=(old?.fileLinks||[]).filter(link=>link.favoriteId===null||!knownIds.has(link.favoriteId)).map(link=>({...link,favoriteId:null}));
    if(input.keepUnlinked.some(value=>typeof value!=='string'||!unlinked.some(link=>link.path===value)))throw new Error('匯入位置連結已變更');
    if(input.directPaths!==undefined&&(!Array.isArray(input.directPaths)||input.directPaths.length>100))throw new Error('位置連結資料無效');
    const direct=input.directPaths?.length?require('./notes-location-links').inspectLinks(input.directPaths).map(item=>({favoriteId:null,path:item.path,type:item.type,label:''})):[];
    const seenPaths=new Set(),fileLinks=[...(input.favoriteIds.length?favorites.selection(catalog,input.favoriteIds).map(item=>({favoriteId:item.id,path:item.path,label:item.label,type:item.type})):[]),...unlinked.filter(link=>input.keepUnlinked.includes(link.path)),...direct].filter(link=>{const key=process.platform==='win32'?link.path.toLowerCase():link.path;if(seenPaths.has(key))return false;seenPaths.add(key);return true;});
    let favoriteTagLinks=old?.favoriteTagLinks||[];
    if(input.favoriteTags!==undefined||input.keepPendingTags!==undefined){const selected=input.favoriteTags||[],pending=input.keepPendingTags||[];if(!Array.isArray(selected)||!Array.isArray(pending)||selected.length+pending.length>20||[...selected,...pending].some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>32))throw new Error('收藏標籤連結無效');const knownTags=new Set(catalog.items.flatMap(item=>item.tags).map(tag=>tag.toLocaleLowerCase())),oldTags=old?.favoriteTagLinks||[];if(selected.some(tag=>!knownTags.has(tag.toLocaleLowerCase())&&!oldTags.some(link=>link.authorized&&link.tag.toLocaleLowerCase()===tag.toLocaleLowerCase())))throw new Error('收藏標籤已變更，請重新選取');if(pending.some(tag=>!oldTags.some(link=>!link.authorized&&link.tag===tag)))throw new Error('分享標籤連結已變更');favoriteTagLinks=[...selected.map(tag=>({tag:tag.trim(),authorized:true})),...pending.map(tag=>({tag,authorized:false}))];}
    if(input.copies!==undefined&&(!Number.isSafeInteger(input.copies)||input.copies<1||input.copies>500||input.id&&input.copies!==1))throw new Error('新增份數請填 1–500');if(input.id&&input.masterIds!==undefined)throw new Error('編輯現有紀錄不能同時跨主紀錄新增');return notesChanged(!input.id&&(input.copies>1||input.masterIds!==undefined)?notesStore().saveCopies({...input,fileLinks,favoriteTagLinks},input.copies||1):notesStore().saveRecord({...input,fileLinks,favoriteTagLinks}));
  }));
  handle('notes-add-paths',(_,paths)=>{if(!Array.isArray(paths)||!paths.length||paths.length>100)throw new Error('每次最多連結 100 個位置');const result=favorites.addPaths(paths,[]);notifyFavorites();return result;});
  handle('notes-choose-paths',async(_,kind)=>{if(!['file','folder'].includes(kind))throw new Error('位置類型無效');const result=await dialog.showOpenDialog(win,{title:'選取位置：加入收藏並連結',properties:[kind==='folder'?'openDirectory':'openFile','multiSelections']});if(result.canceled)return {canceled:true,ids:[]};if(result.filePaths.length>100)throw new Error('每次最多連結 100 個位置');const saved=favorites.addPaths(result.filePaths,[]);notifyFavorites();return saved;});
  handle('notes-context-menu',(_,kind,id)=>{
    if(!['area','sheet'].includes(kind))throw new Error('選單類型無效');const document=notesStore().get().document,area=document.areas.find(area=>area.id===id),sheet=document.sheets.find(sheet=>sheet.id===id&&!sheet.deletedAt),action=(label,command,enabled=true)=>({label,enabled,click:()=>send(win,'notes-context-action',{command,kind,id})});let entries;
    if(kind==='area'){if(id&&!area)throw new Error('群組已移除');const root=document.sheets.find(sheet=>sheet.id===area?.masterSheetId&&!sheet.deletedAt);entries=area?[action('開啟主表','open-area'),action('新增主紀錄','new-master',Boolean(root)),action('新增明細表','new-detail',Boolean(root)),action('匯出主表及明細','export-area')]:[action('新增主表','new-sheet'),action('開啟範本庫','templates')];}
    else{if(!sheet)throw new Error('表格已變更或刪除');entries=[action('開啟表格','open-sheet'),action('欄位與名稱','edit-sheet'),...(!require('./notes-model').parentField(document,sheet)?[action('新增明細表','new-detail')]:[]),action('匯出此表格','export-sheet'),{type:'separator'},action('移至回收筒','trash-sheet')];}
    Menu.buildFromTemplate(entries).popup({window:win});return true;
  });
  handle('notes-client-details',(_,areaId,revision)=>notesChanged(notesStore().completeClientDetails(areaId,revision)));
  handle('notes-bulk-preview',(_,input,revision)=>notesStore().bulkPreview(input,revision));
  handle('notes-bulk-commit',(_,token)=>notesChanged(notesStore().bulkCommit(token)));
  handle('notes-batch-trash',(_,entries,includeDetails,revision)=>notesChanged(notesStore().batchTrash(entries,includeDetails,revision)));
  handle('notes-trash',(_,kind,id,version,restore)=>{if(typeof restore!=='boolean')throw new Error('回收筒操作無效');return notesChanged(notesStore().trash(kind,id,version,restore));});
  handle('notes-history',(_,id)=>notesStore().history(id));
  handle('notes-history-restore',(_,id,historyId,version)=>notesChanged(notesStore().restoreHistory(id,historyId,version)));
  handle('notes-favorites',()=>({items:favorites.list()}));
  handle('notes-inspect-links',(_,paths)=>require('./intranet-path').withIntranetPaths(validatedLinkPaths(paths),()=>require('./notes-location-links').inspectLinks(paths).map(({path,type})=>({path,type}))));
  handle('notes-open-website',(_,recordId,fieldId,action,selected)=>require('./notes-web-links').openRecordWebsite({document:notesStore().get().document,recordId,fieldId,action,selected,shell,clipboard}));
  handle('notes-open-link',(_,recordId,index,action)=>require('./notes-location-links').openRecordLink({document:notesStore().get().document,favorites,recordId,index,action,shell,clipboard}));
  handle('notes-export-preview',(_,options)=>notesStore().exportPreview(options));
  handle('notes-export-save',async(_,token)=>{
    notesStore().takePreview(token,'export');const result=await dialog.showSaveDialog(win,{title:'匯出 Studio 資料包',defaultPath:'BulkFileStudio-Workspace.bfs-workspace.json',filters:[{name:'Studio 資料包',extensions:['json']}]});
    if(result.canceled||!result.filePath)return {canceled:true};const pending=notesStore().takePreview(token,'export');writePackageFile(result.filePath,pending.data);return {canceled:false,path:result.filePath};
  });
  handle('notes-import-choose',async(_,dropped)=>{sharedImport=null;sharedImportToken=null;notesImportReadVersion++;notesImportDocument=null;const readVersion=notesImportReadVersion;if(notes)notes.pending=null;const filepath=await openFileInput(dialog,win,{title:'選取 Studio 資料包（不執行檔案內容）',filters:[{name:'Studio 資料包',extensions:['json']}],properties:['openFile']},dropped);if(!filepath)return {canceled:true};const input=await readImportPackageFile(filepath);if(readVersion!==notesImportReadVersion)throw new Error('已選取另一份資料包，請使用最新選擇');notesImportDocument=input;notesImportName=packageImportName(filepath);return {canceled:false,name:notesImportName};});
  handle('notes-preview-cancel',(_,token)=>notesStore().cancelPreview(token));
  handle('notes-import-details',(_,token,key)=>notesStore().importDetails(token,key));
  handle('notes-import-preview',(_,mode,resolution)=>{if(!notesImportDocument)throw new Error('請先選取資料包');const context=sharedImport?{source:sharedImport.sharing?.source||'未提供來源',sourceRevision:sharedImport.sharing?.revision??null,sourceVersion:sharedImport.sharing?.version??null,sourceCommit:sharedImport.sharing?.commit?.id,scope:sharedImport.scope,profileId:sharedImport.profileId,packageName:sharedImport.name}:{source:'手動選取資料包',packageName:notesImportName};const result=notesStore().importPreview(notesImportDocument,mode,context,{reviewConflicts:Boolean(sharedImport),resolution});sharedImportToken=sharedImport?{token:result.token,mode}:null;return result;});
  handle('notes-backup-choose',async(_,dropped)=>{invalidateNotesImport();const readVersion=notesImportReadVersion;const filepath=await openFileInput(dialog,win,{title:'選取本程式的匯入前／還原前／升級前備份',defaultPath:path.join(app.getPath('userData'),'workspace-backups'),filters:[{name:'Studio 工作區備份',extensions:['sqlite']}],properties:['openFile']},dropped);if(readVersion!==notesImportReadVersion)throw new Error('匯入或還原來源已變更，請使用最新選擇');if(!filepath)return {canceled:true};return notesStore().restorePreview(filepath);});
  handle('notes-backup-restore',(_,token)=>notesChanged(notesStore().restoreCommit(token)));
  handle('notes-import-commit',(_,token,options)=>{const result=notesChanged(notesStore().importCommit(token,options));if(sharedImportToken?.token===token&&sharedImport){try{notesShare.completeImport(sharedImport,result.revision,sharedImportToken.mode);if(notesShare.rollbackNotice)result.result.shareNotice=notesShare.rollbackNotice;}catch(error){diagnostics.record('main','share-baseline',error);result.result.shareWarning='資料已匯入，但接收基準未能保存，請重新手動匯入後再自動接收。';}}sharedImport=null;sharedImportToken=null;return result;});
  handle('everything-status',()=>everything.status());
  handle('everything-configure',(_,enabled,instance)=>everything.configure(enabled,instance));
  handle('everything-choose',async(_,dropped)=>{if(process.platform!=='win32')throw new Error('Everything 整合僅適用於 Windows');const filepath=await openFileInput(dialog,win,{title:'選取官方 ES 命令列工具 es.exe（不是 Everything.exe）',filters:[{name:'ES 命令列工具',extensions:['exe']}],properties:['openFile']},dropped);return !filepath?{canceled:true}:everything.choose(filepath);});
  handle('everything-search',(_,input)=>everything.search(input));
  handle('everything-cancel',()=>everything.cancel());
  handle('everything-favorite',(_,token,indices,tags)=>{const paths=everything.selection(token,indices);const result=favorites.addPaths(paths,tags);notifyFavorites();return result;});
  handle('everything-to-rename',(_,token,indices)=>{const paths=everything.selection(token,indices);for(const file of paths)if(inspectPath(file).type!=='file')throw new Error('加入改名只接受一般檔案，資料夾可先加入收藏');return listPaths(paths,false);});
  favorites = new FavoritesStore(path.join(app.getPath('userData'), 'favorites.json'));
  contextMenu = new WindowsContextMenu({packaged:app.isPackaged,portable:Boolean(process.env.PORTABLE_EXECUTABLE_FILE)});
  handle('favorites-list', event => {
    if(event.sender===floating?.webContents)return {items:favorites.list()};
    const result={items:favorites.list(),activate:favoriteActivation,notice:favoriteNotice,promptIds:desktop.settings.explorerTagPrompt?[...pendingTagIds]:[],filterTag:queuedFilter,importRequest:pendingImportRequest};
    favoriteActivation=false;favoriteNotice=null;queuedFilter=null;pendingImportRequest=null;return result;
  });
  handle('favorites-import-preview',(_,text,tags)=>previewPathImport(favorites,text,tags));
  handle('favorites-import-paths',(_,text,tags,token)=>{const result=importPathList(favorites,text,tags,token);notifyFavorites();return result;});
  handle('favorites-manage-tag',(_,name,replacement,count,options)=>{
    if(options?.trashFiles){
      if(replacement!==null||options.removeFavorites!==true)throw new Error('回收檔案時必須同時移除收藏連結');
      const found=favorites.read().items.filter(item=>item.tags.some(tag=>tag.toLocaleLowerCase()===name.toLocaleLowerCase()));
      if(found.length!==count||!Array.isArray(options.expectedIds)||new Set(options.expectedIds).size!==count||found.some(item=>!options.expectedIds.includes(item.id)))throw new Error('標籤收藏已變更，請重新確認');
      return confirmTrash(options.expectedIds,()=>{const current=favorites.read().items.filter(item=>item.tags.some(tag=>tag.toLocaleLowerCase()===name.toLocaleLowerCase()));if(current.length!==count||current.some(item=>!options.expectedIds.includes(item.id)))throw new Error('標籤收藏已變更，請重新確認');});
    }
    const result=favorites.manageTag(name,replacement,count,options);notifyFavorites();return result;
  });
  handle('favorites-add-tags',(_,ids,tags)=>{const result=favorites.addTags(ids,tags);notifyFavorites();return result;});
  handle('favorites-tags-ack',(_,ids)=>{if(Array.isArray(ids))for(const id of ids)pendingTagIds.delete(id);});
  handle('export-settings',async(_,input)=>{
    const data=createSettingsExport(input,desktop.settings,app.getVersion());
    const result=await dialog.showSaveDialog(win,{title:'匯出設定 JSON',defaultPath:`BulkFileStudio-settings-${app.getVersion()}.json`,filters:[{name:'JSON 設定檔',extensions:['json']}]});
    if(result.canceled||!result.filePath)return {canceled:true};
    writeSettingsExport(result.filePath,data);return {canceled:false,path:result.filePath};
  });
  handle('desktop-settings-defaults',()=>JSON.parse(JSON.stringify(require('./desktop-state').DEFAULTS)));
  handle('desktop-settings-get',()=>({...desktop.settings,shortcutWarning:[shortcutWarning,shellWarning].filter(Boolean).join('\n')}));
  handle('floating-tag-options',()=>tagList(favorites.read().items));
  handle('diagnostics-report',(event,input)=>{
    if(!input||typeof input!=='object'||Array.isArray(input))return {recorded:false};
    const bounded=(key,max)=>typeof input[key]==='string'?input[key].slice(0,max):'';
    const source=event.sender===win?.webContents?'main-renderer':event.sender===floating?.webContents?'floating':'capture';
    return {recorded:Boolean(diagnostics.record(source,bounded('context',120)||'renderer-error',{message:bounded('message',6000)||'未知錯誤',stack:bounded('stack',12000),code:bounded('code',64)}))};
  });
  handle('diagnostics-status',(_,recent=false)=>{if(typeof recent!=='boolean')throw new Error('紀錄查詢無效');return diagnostics.status(recent);});
  handle('diagnostics-open',async()=>{const error=await shell.openPath(diagnostics.prepareFolder());if(error)throw new Error(error);return {opened:true};});
  handle('diagnostics-export',async()=>{
    const data=diagnostics.exportData(),result=await dialog.showSaveDialog(win,{title:'匯出本機錯誤紀錄',defaultPath:'BulkFileStudio-diagnostics-'+new Date().toISOString().slice(0,10)+'.json',filters:[{name:'JSON',extensions:['json']}]});
    if(result.canceled||!result.filePath)return {canceled:true};writeSettingsExport(result.filePath,data);return {canceled:false,path:result.filePath,count:data.entries.length};
  });
  handle('diagnostics-clear',async()=>{
    const result=await dialog.showMessageBox(win,{type:'warning',title:'清除錯誤紀錄',message:'清除所有本機錯誤紀錄？',detail:'不會影響工作區、收藏或復原紀錄。已匯出的副本需另行刪除。',buttons:['清除紀錄','取消'],defaultId:1,cancelId:1,noLink:true});
    return result.response===0?{canceled:false,...diagnostics.clear()}:{canceled:true};
  });
  handle('desktop-main-size',(_,width,height)=>{if(!Number.isFinite(width)||!Number.isFinite(height)||width<800||width>8000||height<500||height>8000)throw new Error('視窗尺寸無效');return applyMainBounds({...win.getNormalBounds(),width,height});});
  handle('notes-check-package',async(_,dropped)=>{const filepath=await openFileInput(dialog,win,{title:'只檢查資料包相容性，不匯入',filters:[{name:'Studio 資料包',extensions:['json']}],properties:['openFile']},dropped);if(!filepath)return {canceled:true};const input=await readImportPackageFile(filepath),projection=require('./notes-sharing-model').project(input),doc=require('./notes-model').readPackage(projection.data);return {packageVersion:input.packageVersion,schemaVersion:input.document.schemaVersion,sheets:doc.sheets.length,records:doc.records.length};});
  recordReminders=new(require('./record-reminders').RecordReminders)(path.join(app.getPath('userData'),'record-reminders.json'),{document:()=>notesStore().get().document,settings:()=>desktop.settings,onError:error=>diagnostics.record('main','record-reminders',error),onDue:value=>{const due=value.items.filter(item=>item.status==='fired'&&item.available),prefs=desktop.settings;const notices=due.filter(item=>['notification','both'].includes(item.delivery==='default'?prefs.reminderDelivery:item.delivery));if(notices.length&&Notification?.isSupported?.()){try{recordNotification?.close?.();const notice=new Notification({title:'紀錄提醒',body:('有 '+notices.length+' 筆紀錄到期，點擊查看。'+notices.filter(item=>item.messageContent).map(item=>'\n'+item.sheet+' ／ '+item.title+'\n'+item.messageContent).join('\n')).slice(0,1200),silent:false});notice.on('click',()=>{focusMain();send(win,'record-reminders-open',{});});notice.on('failed',(_,error)=>diagnostics.record('main','record-reminder-notification',String(error)));recordNotification=notice;notice.show();}catch(error){diagnostics.record('main','record-reminder-notification',error);}}if(prefs.reminderBringToFront&&!capture?.window&&!fileOperationBusy&&due.some(item=>(item.delivery==='default'?prefs.reminderDelivery:item.delivery)!=='attention'))focusMain();recordAttention?.sync();send(win,'record-reminders-changed',{...value,popup:due.some(item=>['overlay','both'].includes(item.delivery==='default'?prefs.reminderDelivery:item.delivery))});}});
  recordAttention=new(require('./reminder-attention').ReminderAttention)({BrowserWindow,screen,secureWindow,size:()=>desktop.settings.toolWindowSizes.reminder,remember:window=>rememberAuxSize('reminder',window),settings:()=>desktop.settings,list:()=>recordReminders.list(),blocked:()=>Boolean(capture?.window&&!capture.window.isDestroyed()||fileOperationBusy),beep:()=>shell.beep(),onError:error=>diagnostics.record('main','reminder-attention',error),act:(kind,id)=>{const value=kind==='ack'?recordReminders.ack(id):recordReminders.snooze(id,desktop.settings.reminderSnoozeMinutes);send(win,'record-reminders-changed',value);send(floating,'floating-panel-changed','planning');}});
  for(const [channel,method] of [['reminder-attention-get','get'],['reminder-attention-ack','ack'],['reminder-attention-snooze','snooze'],['reminder-attention-dismiss','dismiss']])ipcMain.handle(channel,(event,id)=>loggedInvocation('reminder-attention',channel,()=>{if(!recordAttention.owns(event))throw new Error('不受信任的提醒視窗來源');if(method==='get')return recordAttention.data();if(method==='dismiss'){recordAttention.dismiss();return {closed:true};}return recordAttention.action(method,id);}));
  handle('reminders-ready',(_,automatic)=>{if(automatic===true&&!desktop.settings.remindersEnabled)return false;if(capture?.window&&!capture.window.isDestroyed()||fileOperationBusy)return false;if(desktop.settings.reminderBringToFront)focusMain();return true;});
  for(const [channel,method] of [['reminders-list','list'],['reminders-save','save'],['reminders-remove','remove'],['reminders-ack','ack'],['reminders-snooze','snooze']])handle(channel,(_, ...args)=>{const value=recordReminders[method](...args);if(method!=='list'){send(win,'record-reminders-changed',value);send(floating,'floating-panel-changed','planning');recordAttention.sync();toolOverlay?.invalidate('planning');}return value;});
  handle('startup-get',()=>desktopShell.loginStatus());
  handle('startup-open-settings',()=>desktopShell.openLoginSettings());
  handle('startup-set',(_,enabled)=>desktopShell.setLogin(enabled));
  handle('app-hide-to-tray',()=>{if(!desktopShell.hideToTray())throw new Error(shellWarning||'無法隱藏至系統匣');});
  const configureDesktop=patch=>{
    if(fs.existsSync(path.join(app.getPath('userData'),'profile-transaction.json')))throw new Error('上次更新未能完成，請重新啟動程式以復原原有資料');
    const previous=desktop.settings;
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('設定無效');
    for(const key of globalShortcuts.KEYS)if(Object.hasOwn(patch,key)&&globalShortcuts.normalize(patch[key])===null)throw new Error('快捷鍵格式無效，請使用 Ctrl／Alt 組合或 F1–F24');
    if(Object.hasOwn(patch,'diagnosticsRetentionDays')&&![3,7,14,30].includes(patch.diagnosticsRetentionDays))throw new Error('錯誤紀錄保留天數無效');
    if(Object.hasOwn(patch,'floatingSearchLastState'))require('./floating-search-state').normalize(patch.floatingSearchLastState,true);
    if(Object.hasOwn(patch,'floatingSearchTablePresets'))require('./floating-search-state').tablePresets(patch.floatingSearchTablePresets,true);
    if(Object.hasOwn(patch,'floatingSearchDatePresets'))require('./search-date-presets').normalize(patch.floatingSearchDatePresets,true);
    if(Object.hasOwn(patch,'snippetPicker'))require('./snippet-picker-model').normalize(patch.snippetPicker,true);
    if(Object.hasOwn(patch,'floatingPanels'))panelModel.normalize(patch.floatingPanels,true);
    if(Object.hasOwn(patch,'logView'))require('./log-view-settings-model').normalize(patch.logView,true);
    if(Object.hasOwn(patch,'globalSearchCriteria'))require('./search-criteria').normalize(patch.globalSearchCriteria,true);
    if(Object.hasOwn(patch,'renameVerification')&&!['fast','full'].includes(patch.renameVerification))throw new Error('改名校驗模式無效');
    if(Object.hasOwn(patch,'floatingTitle')&&require('./desktop-state').normalizeFloatingTitle(patch.floatingTitle)===null)throw new Error('浮動工具標題最多 40 字元，且不可包含控制字元');
    if(Object.hasOwn(patch,'favoriteShortcuts')&&patch.favoriteShortcuts!==null)require('./shortcuts').validate(patch.favoriteShortcuts);
    if(Object.hasOwn(patch,'floatingQuickActions'))quickActions.normalize(patch.floatingQuickActions,true);
    if(Object.hasOwn(patch,'floatingDropActionId')&&patch.floatingDropActionId!==''&&!quickActions.ID.test(patch.floatingDropActionId))throw new Error('拖放目標無效');
    if(Object.hasOwn(patch,'globalSearchCriteria'))floatingSearch?.invalidate();
    const candidate=normalizeDesktop({...previous,...patch});if(globalShortcuts.KEYS.some(key=>Object.hasOwn(patch,key))||Object.hasOwn(patch,'floatingQuickActions')||Object.hasOwn(patch,'favoriteShortcuts')||Object.hasOwn(patch,'draftLocalShortcuts'))globalShortcuts.validatePair(candidate,productivity?.store.get().snippets||[]);closeFloatingMenu();
    const bindingsChanged=globalShortcuts.KEYS.some(key=>previous[key]!==candidate[key])||JSON.stringify(previous.floatingQuickActions)!==JSON.stringify(candidate.floatingQuickActions);
    const focusChanged=previous.focusMode!==candidate.focusMode||candidate.focusMode&&JSON.stringify(previous.focusShortcutIds)!==JSON.stringify(candidate.focusShortcutIds);
    const changed=bindingsChanged||focusChanged;
    if(changed){
     const warning=desktopShell.registerShortcuts(candidate);
     if(warning&&bindingsChanged){shortcutWarning=desktopShell.registerShortcuts(previous);if(shortcutRecording)globalShortcut.unregisterAll();throw new Error(warning+' 已保留原設定。'+shortcutWarning);}
     shortcutWarning=warning;
     if(shortcutRecording)globalShortcut.unregisterAll();
    }
    let settings;try{settings=desktop.update(patch);preparePasteWorker();}catch(e){if(changed){shortcutWarning=desktopShell.registerShortcuts(previous);if(shortcutRecording)globalShortcut.unregisterAll();}throw e;}
    if(!settings.explorerTagPrompt)pendingTagIds.clear();
    if(settings.closeToTray||settings.startHidden){shellWarning='';desktopShell.ensureTray();}
    const warning=[shortcutWarning,shellWarning].filter(Boolean).join('\n');
    if(floating&&!floating.isDestroyed()){floating.setTitle('Bulk File Studio · '+(settings.floatingTitle||'浮動工具'));floating.setAlwaysOnTop(settings.floatingOnTop);floatingWindow.apply();}
    drafts?.updateSettings();floatingSearch?.updateSettings();toolOverlay?.updateSettings(previous);recordAttention?.sync();const result={settings,warning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  };
  handle('desktop-settings-set',(_,patch)=>configureDesktop(patch));
  handle('snippet-picker-reset-groups',()=>desktop.replaceSnippetPickerGroups([]));
  handle('desktop-reset-window',()=>applyMainBounds(null));
  handle('floating-show',()=>showFloating());
  handle('floating-hide',()=>{floatingSearch?.destroy();floating?.hide();});
  handle('floating-compact-size',()=>{showFloating();floatingWindow.compactSize();});
  handle('floating-drag-start',(_,mode='move')=>{closeFloatingMenu();if(!floatingWindow)throw new Error('浮動工具未顯示');return floatingWindow.startDrag(mode);});
  handle('floating-drag-move',(_,token,dx,dy)=>{if(!floatingWindow)throw new Error('浮動工具未顯示');return floatingWindow.moveDrag(token,dx,dy);});
  handle('floating-drag-end',(_,token)=>{const result=floatingWindow?.endDrag(token);if(result){send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);}return result;});
  handle('floating-header-menu',()=>{
    if(!floatingWindow)throw new Error('浮動工具未顯示');
    const settings=desktop.settings,size=floatingWindow.savedBounds();
    const publish=()=>{const result={settings:desktop.settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);};
    const command=task=>floatingAction(async()=>{await task();publish();});
    popupFloatingMenu([
      {label:settings.floatingCollapsed?'展開浮動工具':'收合浮動工具',click:command(()=>setFloatingCollapsed(!desktop.settings.floatingCollapsed))},
      {label:'保持置頂',type:'checkbox',checked:settings.floatingOnTop,click:command(()=>{const next=desktop.update({floatingOnTop:!desktop.settings.floatingOnTop});floating.setAlwaysOnTop(next.floatingOnTop);toolOverlay?.updateSettings();})},
      {label:'精簡工具列',type:'checkbox',checked:settings.floatingCompact,click:command(()=>desktop.update({floatingCompact:!desktop.settings.floatingCompact}))},
      {label:'編輯控制列版面',type:'checkbox',checked:settings.floatingLayoutEditing,click:command(()=>{const enabled=!desktop.settings.floatingLayoutEditing;if(enabled&&desktop.settings.floatingCollapsed)setFloatingCollapsed(false);desktop.update({floatingLayoutEditing:enabled});})},
      {label:'快速尺寸（設為預設並展開）',submenu:[[260,320,'精簡'],[420,520,'標準'],[600,700,'寬大']].map(([width,height,label])=>({label:label+' '+width+' × '+height,click:command(()=>{desktop.update({floatingDefaultWidth:width,floatingDefaultHeight:height});floatingWindow.restoreDefaultSize();})}))},
      {label:'標題列按鈕',submenu:[['collapse','收合／展開按鈕'],['close','關閉按鈕']].map(([key,label])=>({label,type:'checkbox',checked:!settings.floatingHiddenButtons.includes(key),click:command(()=>{const hidden=desktop.settings.floatingHiddenButtons;desktop.update({floatingHiddenButtons:hidden.includes(key)?hidden.filter(value=>value!==key):[...hidden,key]});})}))},
      {label:'檢視模式',submenu:[['list','清單'],['icons','圖示'],['tags','標籤'],['workspace','工作區'],['mixed','混合']].map(([mode,label])=>({label,type:'radio',checked:settings.floatingView===mode,click:command(()=>desktop.update({floatingView:mode}))}))},
      {type:'separator'},
      {label:`展開並套用預設大小（${settings.floatingDefaultWidth} × ${settings.floatingDefaultHeight}）`,click:command(()=>floatingWindow.restoreDefaultSize())},
      {label:`將目前展開大小存為預設（${size.width} × ${size.height}）`,click:command(()=>floatingWindow.saveDefaultSize())},
      {label:'重設預設大小為 320 × 400 並展開',click:command(()=>{desktop.update({floatingDefaultWidth:320,floatingDefaultHeight:400});floatingWindow.restoreDefaultSize();})},
      {type:'separator'},
      {label:'全域搜尋…',enabled:settings.floatingGlobalSearch,click:floatingAction(()=>floatingSearchController().open())},
      {label:'查看紀錄…',click:floatingAction(()=>openToolOverlay('logs'))},
      ...(!settings.floatingCollapsed||settings.floatingPanels.collapsedMenu?
       panelModel.enabledPanels(settings.floatingPanels).map(kind=>({
        label:panelModel.PANELS[kind]+'…',click:floatingAction(()=>openInlinePanel(kind))
       })):[]),
      {label:'顯示主視窗',click:floatingAction(()=>focusMain())},
      {label:'關閉浮動工具（隱藏）',click:floatingAction(()=>{floatingSearch?.destroy();floating.hide();})}
    ],{allowCollapsed:true});
  });
  handle('floating-header-double-click',()=>{
    if(!floating||floating.isDestroyed()||!floating.isVisible())throw new Error('浮動工具未顯示');
    if(!desktop.settings.floatingHeaderDoubleClick)return {disabled:true};
    const action=desktop.settings.floatingHeaderAction;
    if(action==='collapse')return setFloatingCollapsed(!desktop.settings.floatingCollapsed);
    if(action==='main'){focusMain();return {};}
    const settings=desktop.update(action==='pin'?{floatingOnTop:!desktop.settings.floatingOnTop}:{floatingCompact:!desktop.settings.floatingCompact});
    floating.setAlwaysOnTop(settings.floatingOnTop);toolOverlay?.updateSettings();const result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  });
  handle('floating-collapse',(_,collapsed)=>{if(typeof collapsed!=='boolean')throw new Error('收合設定無效');return setFloatingCollapsed(collapsed);});
  handle('floating-copy-paths',(_,ids)=>{const paths=favorites.recordedPaths(ids);clipboard.writeText(paths.join('\r\n'));return {count:paths.length};});
  handle('floating-item-menu',(_,id)=>{
    const item=favorites.get(id),ready=item.status==='ready';
    popupFloatingMenu([
      {label:(item.label||basename(item.path)).replaceAll('&','&&').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,180),enabled:false},
      {label:'開啟',enabled:ready,click:floatingAction(()=>openFavorite(id))},
      {label:'在檔案總管定位',enabled:ready,click:floatingAction(()=>openFavorite(id,'show'))},
      {label:'複製完整路徑',click:floatingAction(()=>clipboard.writeText(favorites.get(id).path))}
    ]);
  });
  handle('floating-tag-menu',(_,tag,query)=>showTagMenu(tag,query));
  handle('floating-main',(_,tag)=>{
    if(tag!==null&&(typeof tag!=='string'||tag.length>64))throw new Error('標籤無效');
    focusMain();
    favoriteActivation=true;queuedFilter={tag};notifyFavorites({activate:true});
  });
  const floatingTags=tag=>{
    if(tag===null||tag==='')return [];
    if(typeof tag!=='string'||tag.length>64)throw new Error('標籤無效');
    const known=favorites.read().items.flatMap(item=>item.tags).find(value=>value.toLocaleLowerCase()===tag.toLocaleLowerCase());
    if(!known)throw new Error('標籤已不存在，請重新整理後再試');return [known];
  };
  handle('floating-view',(_,mode)=>{
    if(!['list','icons','tags','workspace','mixed'].includes(mode))throw new Error('不支援的浮動檢視模式');
    const settings=desktop.update({floatingView:mode}),result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  });
  handle('floating-tools',(_,compact)=>{
    if(typeof compact!=='boolean')throw new Error('浮動工具顯示設定無效');
    const settings=desktop.update({floatingCompact:compact}),result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  });
  handle('floating-pin',()=>{
    const settings=desktop.update({floatingOnTop:!desktop.settings.floatingOnTop});if(floating&&!floating.isDestroyed())floating.setAlwaysOnTop(settings.floatingOnTop);toolOverlay?.updateSettings();floatingSearch?.updateSettings();
    const result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  });
  handle('floating-collect',(_,paths,tag)=>{const result=favorites.addPaths(paths,floatingTags(tag));notifyFavorites();return result;});
  const dropCapture=(paths,tag,id='')=>{
    const items=checkedPaths(paths),text=items.map(item=>'"'+item.path+'"').join('\n'),resolve=id?()=>configuredQuick(id):()=>({type:'import-paths',label:'匯入標籤連結',tags:floatingTags(tag),enabled:true});
    return captureController().open({resolve,text,paths:items.map(item=>item.path)});
  };
  handle('floating-drop',(_,paths,tag)=>{
    const mode=desktop.settings.floatingDropMode,id=desktop.settings.floatingDropActionId;
    if(mode==='favorites'){const result=favorites.addPaths(paths,floatingTags(tag));notifyFavorites();return result;}
    if(mode==='ask'){
      const items=checkedPaths(paths),sources=items.map(item=>item.path);captureController().assertAvailable();popupFloatingMenu([
        {label:'加入目前標籤的收藏',click:floatingAction(()=>{const result=favorites.addPaths(sources,floatingTags(tag));notifyFavorites();send(floating,'desktop-settings-changed',{notice:`已新增 ${result.added} 個收藏`,...(result.issues.length?{error:result.issues.join('；')}:{})});})},
        {label:'預覽標籤連結匯入…',click:floatingAction(()=>dropCapture(sources,tag))},
        ...desktop.settings.floatingQuickActions.filter(action=>action.enabled&&['new-record','import-paths'].includes(action.type)).map(action=>({label:(action.type==='new-record'?'建立表格紀錄：':'標籤匯入：')+action.label.replaceAll('&','&&'),click:floatingAction(()=>dropCapture(sources,tag,action.id))}))
      ],{allowCollapsed:true});return {menu:true};
    }
    if(mode==='records'&&(!id||configuredQuick(id).type!=='new-record'))throw new Error('請在設定選擇「新增指定表格紀錄」作為拖放目標');
    if(mode==='import'&&id&&configuredQuick(id).type!=='import-paths')throw new Error('請在設定選擇「匯入路徑並套用標籤」或目前標籤');
    return dropCapture(paths,tag,id);
  });
  handle('floating-import',(_,tag)=>{
    if(desktop.settings.floatingQuickMode==='popup')return captureController().open({resolve:()=>({type:'import-paths',label:'匯入標籤連結',tags:floatingTags(tag),enabled:true}),text:''});
    if(pendingImportRequest)throw new Error('上一個匯入要求仍待開啟');pendingImportRequest={tags:floatingTags(tag)};favoriteActivation=true;focusMain();keepFloatingAfterQuick();notifyFavorites({activate:true});return {opened:true};
  });
  handle('favorites-add',(_,paths,tags)=>{if(!Array.isArray(paths)||paths.length>10000)throw new Error('收藏位置資料無效');return require('./intranet-path').withIntranetPaths(paths.map(value=>require('./notes-location-links').locationPath(value)),()=>{const result=favorites.addPaths(paths,tags);notifyFavorites();return result;});});
  handle('favorites-choose', async (_, kind) => {
    if(!['file','folder'].includes(kind))throw new Error('不支援的收藏類型');
    const result=await dialog.showOpenDialog(win,{title:kind==='folder'?'收藏資料夾位置':'收藏檔案',properties:[kind==='folder'?'openDirectory':'openFile','multiSelections']});
    if(result.canceled)return {canceled:true,added:0,existing:0,issues:[]};
    const added=favorites.addPaths(result.filePaths);notifyFavorites();return added;
  });
  handle('favorites-update',(_,ids,changes)=>require('./intranet-path').withIntranetPaths(changes?.path===undefined?[]:[require('./notes-location-links').locationPath(changes.path)],()=>{const result=favorites.update(ids,changes);notifyFavorites();return result;}));
  handle('favorites-remove', (_, ids, options) => {if(options?.trashFiles)return confirmTrash(ids);const result=favorites.remove(ids);notifyFavorites();return result;});
  handle('favorites-open',(_,id)=>openFavorite(id));
  handle('favorites-show',(_,id)=>openFavorite(id,'show'));
  handle('favorites-copy', (_, id) => clipboard.writeText(favorites.get(id).path));
  handle('favorites-choose-link', async (_,id,dropped) => {
    const item=favorites.get(id);let defaultPath;try{defaultPath=assertLocalPath(item.path);}catch{/* Select a local replacement without probing an old network path. */}
    const filepath=await openFileInput(dialog,win,{title:'重新連結收藏（儲存後生效）',defaultPath,properties:[item.type==='folder'?'openDirectory':'openFile']},dropped);
    if(dropped!==undefined&&inspectPath(filepath).type!==item.type)throw new Error('新位置必須與原收藏的檔案／資料夾類型相同');
    return filepath;
  });
  handle('favorites-to-rename', (_, ids, recursive) => listPaths(favorites.readyPaths(ids),Boolean(recursive)));
  handle('favorites-open-locations',(_,ids)=>confirmBatch(ids,'locations',win));
  handle('favorites-batch-open-confirmed',(_,ids)=>confirmBatch(ids,'open',win));
  handle('favorites-bulk-open',async(_,ids)=>{
    return require('./intranet-path').withIntranetPaths(favorites.selection(favorites.read(),ids).map(item=>item.path),async()=>{
    const paths=favorites.readyPaths(ids);if(paths.length>20)throw new Error('每次最多開啟 20 項，避免同時啟動過多程式');
    paths.forEach(require('./notes-location-links').assertOpenableLocation);
    const failures=[];for(const filepath of paths){try{const error=await shell.openPath(filepath);if(error)failures.push(filepath+'：'+error);}catch(e){failures.push(filepath+'：'+e.message);}}
    return {opened:paths.length-failures.length,failures};
    });
  });
  handle('favorites-copy-many',(_,ids)=>clipboard.writeText(favorites.recordedPaths(ids).join('\r\n')));
  handle('app-info',()=>({name:'Bulk File Studio',version:app.getVersion(),history:require('./release-history'),offline:!notesShare?.status().anyEnabled}));
  handle('choose-move-folder',async(_,dropped)=>{
    const filepath=await openFileInput(dialog,win,{title:'選擇搬移目標（可選另一個本機磁碟）',properties:['openDirectory']},dropped);
    if(filepath&&dropped!==undefined&&inspectPath(filepath).type!=='folder')throw new Error('搬移目標須為資料夾');
    return filepath?assertLocalPath(filepath):null;
  });
  handle('choose-move-sources',async(_,dropped)=>{
    if(dropped!==undefined){
      if(!Array.isArray(dropped)||!dropped.length||dropped.length>5000||dropped.some(filepath=>inspectPath(filepath).type!=='folder'))throw new Error('完整來源僅接受資料夾');
      return dropped;
    }
    const result=await dialog.showOpenDialog(win,{title:'選擇要搬移的完整資料夾（包含所有子檔案）',properties:['openDirectory','multiSelections']});
    return result.canceled?[]:result.filePaths.map(assertLocalPath);
  });
  handle('move-sources',(_,paths,scope)=>resolveMoveSources(paths,scope));
  handle('move-preview',(_,paths,folder,options)=>planMove(paths,folder,options));
  handle('move-files',(_,paths,folder,expected,options)=>fileOperation(()=>{
    const moves=planMove(paths,folder,options);
    if(JSON.stringify(moves)!==JSON.stringify(expected))throw new Error('搬移預覽已變更，請重新預覽');
    const record={version:3,kind:'move',state:'pending',createdAt:new Date().toISOString(),moves};saveHistory(record);
    try{executeRelocation(moves,{onPrepared:()=>saveHistory(record)});}catch(e){if(e.recoveryMoves?.length){const warning=syncFavoriteMoves(e.recoveryMoves);if(warning)e.message+='；'+warning;}throw e;}const warning=syncFavoriteMoves(moves);
    try{saveHistory({...record,state:'completed'});}catch(e){return {changed:moves.length,moves,history:false,warning:warning+' 搬移成功，但復原紀錄無法儲存：'+e.message};}
    return {changed:moves.length,moves,history:true,warning};
  }));
  handle('context-menu-status', () => contextMenu.status());
  handle('context-menu-set', (_, enabled) => contextMenu.setEnabled(enabled));
  handle('data-location',()=>app.getPath('userData'));
  handle('open-data-location',async()=>{
    const folder=app.getPath('userData');fs.mkdirSync(folder,{recursive:true});
    const error=await shell.openPath(folder);if(error)throw new Error(error);
  });
  handle('set-theme', (_, theme) => {
    if (!['light', 'dark','graphite'].includes(theme)) throw new Error('不支援的主題');
    nativeTheme.themeSource = theme==='light'?'light':'dark';
    win?.setBackgroundColor(theme === 'light' ? '#f4f6fb' : theme==='graphite'?'#101215':'#090e1b');
  });
  handle('choose-files', async () => {
    const d = await dialog.showOpenDialog(win, { title: '選擇檔案（可多選）', properties: ['openFile', 'multiSelections'] });
    return d.canceled ? { paths: [], ignored: 0 } : listPaths(d.filePaths);
  });
  handle('choose-folder', async (_, recursive) => {
    const d = await dialog.showOpenDialog(win, { title: '選擇要重新命名的資料夾', properties: ['openDirectory'] });
    return d.canceled ? { paths: [], ignored: 0 } : listPaths(d.filePaths, Boolean(recursive));
  });
  handle('add-paths', (_, paths, recursive) => listPaths(paths, Boolean(recursive)));
  handle('preview', (_, paths, rules) => createPreview(paths, rules));
  handle('rename', (event, paths, rules, expectedPlan, expectedVerification,context) => fileOperation(()=> {
    const verification=desktop.settings.renameVerification;if(expectedVerification!==undefined&&expectedVerification!==verification)throw new Error('校驗模式已變更，請重新確認改名');
    const preview = createPreview(paths, rules);
    if (preview.counts.error) throw new Error(`${preview.counts.error} 個檔案存在衝突或名稱錯誤。請先修正，再重新執行。`);
    let moves = preview.rows.filter(x => x.status === 'ready').map(x => ({ source: x.source, destination: x.destination }));
    if (expectedPlan !== undefined && JSON.stringify(expectedPlan) !== JSON.stringify(moves)) {
      throw new Error('預覽結果已變更（檔案名稱、日期或排序可能已改動），操作已取消。請檢查更新後的預覽，再重新確認。');
    }
    if (!moves.length) return { changed: 0, moves: [], history: Boolean(readHistory()) };
    if(verification==='full')return renameJobs.run({kind:'rename',moves,historyPath:historyFile()},renameProgress(event,context)).then(finishRenameJob);
    moves = snapshotMoves(moves,{verification:'fast'});
    const record = { version: 4, kind:'rename',verification:'fast',state: 'pending', createdAt: new Date().toISOString(), moves };
    // Persist evidence before changing any names; incomplete operations fail closed.
    saveHistory(record);
    executeMoves(moves);
    const favoriteWarning=syncFavoriteMoves(moves);
    try { saveHistory({ ...record, state: 'completed' }); }
    catch (e) {
      // Files were renamed; report success but make undo unavailability explicit.
      return { changed: moves.length, moves, history: false, warning: [favoriteWarning,`重新命名成功，但無法完成復原紀錄；自動復原已停用。請手動核對檔案：${e.message}`].filter(Boolean).join('\n') };
    }
    return { changed: moves.length, moves, history: true, warning:favoriteWarning };
  }));
  handle('undo', (event,context) => fileOperation(()=> {
    const h = readHistory();
    if (!h) throw new Error('沒有可復原的上一批操作紀錄');
    if(h.kind!=='move'&&h.version===2)return renameJobs.run({kind:'undo',history:h,historyPath:historyFile()},renameProgress(event,context)).then(finishRenameJob);
    const reversed = h.kind==='move'?prepareMoveUndo(h):prepareUndo(h);
    // Keep interrupted undo from being replayed against a partially restored batch.
    saveHistory({ ...h, state: 'undoing' });
    if(h.kind==='move'){try{executeRelocation(reversed,{onPrepared:()=>saveHistory({...h,state:'undoing',undoMoves:reversed})});}catch(e){if(e.recoveryMoves?.length){const warning=syncFavoriteMoves(e.recoveryMoves);if(warning)e.message+='；'+warning;}throw e;}}else executeMoves(reversed);
    const favoriteWarning=syncFavoriteMoves(reversed);
    try { saveHistory(null); }
    catch (e) { return { changed: reversed.length, moves: reversed, warning: [favoriteWarning,`檔案已還原，但清除復原紀錄時發生錯誤：${e.message}`].filter(Boolean).join('\n') }; }
    return { changed: reversed.length, moves: reversed, warning:favoriteWarning };
  }));
  handle('history', () => {
    const h = readHistory();
    return h ? { count: h.moves.length, createdAt: h.createdAt, state: h.state, kind:h.kind||'rename',verification:h.verification||'full' } : null;
  });
  handle('export-csv', async (_, paths, rules) => {
    const preview = createPreview(paths, rules);
    if (!preview.rows.length) throw new Error('請先加入檔案');
    const d = await dialog.showSaveDialog(win, {
      title: '匯出預覽 CSV', defaultPath: 'rename-preview.csv',
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
    });
    if (d.canceled || !d.filePath) return { canceled: true };
    // Quoting CSV alone does not prevent spreadsheet formula injection.
    const quote = (x) => {
      const value = String(x ?? '');
      const safe = /^[\s\x00-\x1f]*[=+@-]/.test(value) ? "'" + value : value;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const rows = [['資料夾', '原始名稱', '新名稱', '狀態', '備註'],
      ...preview.rows.map(r => [r.dir, r.name, r.targetName, r.status, r.message])];
    assertLocalPath(d.filePath);
    fs.writeFileSync(d.filePath, '\ufeff' + rows.map(r => r.map(quote).join(',')).join('\r\n'), 'utf8');
    return { canceled: false, path: d.filePath, count: preview.rows.length };
  });
  handle('show-in-folder', (_, filePath) => {
    if (typeof filePath !== 'string') return;
    shell.showItemInFolder(assertLocalPath(filePath));
  });
  toolOverlay=new(require('./tool-overlay').ToolOverlay)({
    BrowserWindow,screen,secureWindow,settings:()=>desktop.settings,
    parent:()=>floating&&!floating.isDestroyed()&&floating.isVisible()?floating:undefined,
    size:kind=>desktop.settings.toolWindowSizes[kind]||(kind==='planning'?desktop.settings.toolWindowSizes.snippets:undefined),
    remember:rememberAuxSize,logFilters:config=>desktop.logFilters(config),
    error:error=>diagnostics.record('main','tool-overlay',error)
  });
  const openToolOverlay=kind=>toolOverlay.open(require('./tool-views-model').configuration({kind}));
  function inlinePanelConfig(kind){
    if(typeof kind!=='string'||!Object.hasOwn(panelModel.PANELS,kind)||!desktop.settings.floatingPanels.enabled.includes(kind)){
      throw new Error('此內容分頁未啟用，請到設定 → 浮動工具 → 浮動內容分頁調整');
    }
    return require('./tool-views-model').configuration({kind});
  }
  function openInlinePanel(kind){
    inlinePanelConfig(kind);
    if(desktop.settings.floatingCollapsed)setFloatingCollapsed(false);
    showFloating();
    const target=floating;
    if(target.webContents.isLoadingMainFrame?.()){
      target.webContents.once('did-finish-load',()=>send(target,'floating-panel-open',kind));
    }else send(target,'floating-panel-open',kind);
    return {opened:true,inline:true};
  }
  handle('floating-panel-open',(_,kind)=>openInlinePanel(kind));
  handle('floating-panel-data',(_,kind,filters)=>productivity.viewData(inlinePanelConfig(kind),filters));
  handle('floating-panel-action',(_,kind,action,value,customer)=>{
    const config=inlinePanelConfig(kind);
    if(kind==='planning'&&action==='day-menu'){
      const day=value?.day;
      if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('日期無效');
      const date=new Date(day+'T12:00:00Z');
      if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)throw new Error('日期無效');
      return showToolRows(config,{mode:'calendar',month:day.slice(0,7),day,query:value.query},{anchor:value.anchor});
    }
    return actOnTool(config,action,value,customer);
  });
  const overlayAction=(event,task)=>{
    const entry=toolOverlay.owner(event);
    if(!entry)throw new Error('不受信任的浮動工具來源');
    if(require('node:fs').existsSync(path.join(app.getPath('userData'),'profile-transaction.json')))throw new Error('請先完成資料復原');
    return task(entry);
  };
  ipcMain.handle('tool-overlay-get',event=>overlayAction(event,entry=>toolOverlay.payload(entry)));
  ipcMain.handle('tool-overlay-switch',(event,kind)=>overlayAction(event,entry=>toolOverlay.switchTab(entry,kind)));
  ipcMain.handle('tool-overlay-log-filters',(event,context,filters)=>overlayAction(event,({config})=>{
    if(config.kind!=='logs')throw new Error('只可儲存查看紀錄的篩選');
    if(context!==require('./log-view-settings-model').logFilterKey(config))throw new Error('查看紀錄已切換，請重新選擇');
    desktop.saveLogFilters(config,filters);
  }));
  ipcMain.handle('tool-overlay-data',(event,kind,filters)=>overlayAction(event,({config})=>{
    if(config.kind!==kind)throw new Error('浮動工具已切換分頁');
    return productivity.viewData(config,filters,kind==='logs'?toolsStore().get().logPins||[]:undefined);
  }));
  const menuLabel=text=>text.replace(/[\x00-\x1f\x7f]+/g,' ').slice(0,100).replace(/&/g,'&&');
  function showToolRows(config,filters,{allowCollapsed=false,anchor,back}={}){
    const data=productivity.viewData(config,filters);
    const template=[{label:data.day+' · '+data.total+' 項行程',enabled:false}];
    for(const row of data.rows){
      const label=menuLabel([row.title,row.detail].filter(Boolean).join(' · '));
      template.push({label,toolTip:row.detail,click:floatingAction(()=>actOnTool(config,'visit',row.id))});
    }
    if(!data.rows.length)template.push({label:'當天沒有符合條件的行程',enabled:false});
    const go=page=>floatingAction(()=>showToolRows(config,{...filters,page},{allowCollapsed,anchor,back}));
    if(data.last){
      template.push({type:'separator'},{label:'第 '+(data.page+1)+' / '+(data.last+1)+' 頁',enabled:false},
        {label:'上一頁',enabled:data.page>0,click:go(data.page-1)},
        {label:'下一頁',enabled:data.page<data.last,click:go(data.page+1)});
    }
    if(back)template.push({type:'separator'},{label:'返回月份',click:back});
    popupFloatingMenu(template,{allowCollapsed,anchor});
    return {opened:true,menu:true};
  }
  function openQuickToolMenu(config,anchor,pasteTarget){
    const options={allowCollapsed:true,anchor};
    if(config.kind==='snippets'){
      const {snippetRows}=require('./tool-views-model');
      const groups=new Map();
      const query=desktop.settings.floatingPanels.snippetQuery;
      for(const row of snippetRows(productivity.store.get().snippets,query)){
        const category=row.detail==='未分類'?'':row.detail;
        if(!groups.has(category))groups.set(category,[]);
        groups.get(category).push({label:menuLabel(row.title),toolTip:row.summary,
          click:floatingAction(async()=>{if(config.snippetAction!=='paste')return actOnTool(config,'copy',row.id,'');try{productivity.copySnippet(row.id,'');if(!pasteTarget){closeFloatingMenu();throw new Error('文字已複製，未取得原目標；請在目標欄位按 Ctrl+V。使用全域快捷鍵開啟此選單可記住目標。');}await floatingMenuController?.closeAndWait();return await productivity.pasteSnippet(row.id,pasteTarget);}catch(error){reportSnippetPasteFailure(error);throw error;}})});
      }
      const compare=new Intl.Collator('zh-Hant',{numeric:true});
      const categories=[...groups].sort(([a],[b])=>a&&b?compare.compare(a,b):Number(!a)-Number(!b));
      const menuSize=25;
      function showCategories(page=0){
        const last=Math.max(0,Math.ceil(categories.length/menuSize)-1);
        const template=[{label:'常用文字片段 · '+(config.snippetAction==='paste'?'選取後貼上':'點選複製'),enabled:false}];
        for(const [category,items] of categories.slice(page*menuSize,(page+1)*menuSize)){
          const submenu=items.length<=menuSize?items:Array.from({length:Math.ceil(items.length/menuSize)},(_,index)=>{
            const start=index*menuSize,end=Math.min(start+menuSize,items.length);
            return {label:'第 '+(start+1)+'–'+end+' 項',submenu:items.slice(start,end)};
          });
          template.push({label:menuLabel(category||'未分類')+' · '+items.length+' 項',submenu});
        }
        if(!categories.length)template.push({label:'沒有符合條件的片段',enabled:false});
        if(last)template.push({type:'separator'},
          {label:'上一頁分類',enabled:page>0,click:floatingAction(()=>showCategories(page-1))},
          {label:'下一頁分類',enabled:page<last,click:floatingAction(()=>showCategories(page+1))});
        popupFloatingMenu(template,options);
        return {opened:true,menu:true};
      }
      return showCategories();
    }
    function showMonth(month){
      const data=productivity.viewData(config,{mode:'calendar',month});
      const template=[{label:data.month+' · 選擇行程日期',enabled:false}];
      for(const [day,count] of Object.entries(data.counts)){
        template.push({label:day+' · '+count+' 項',click:floatingAction(()=>showToolRows(
          config,{mode:'calendar',month:data.month,day},
          {...options,back:floatingAction(()=>showMonth(data.month))}))});
      }
      if(!Object.keys(data.counts).length)template.push({label:'本月沒有行程',enabled:false});
      const move=delta=>floatingAction(()=>{
        const next=new Date(data.month+'-15T12:00:00Z');
        next.setUTCMonth(next.getUTCMonth()+delta);
        if(next.getUTCFullYear()<1||next.getUTCFullYear()>9999)return;
        showMonth(next.toISOString().slice(0,7));
      });
      template.push({type:'separator'},{label:'上個月',click:move(-1)},{label:'下個月',click:move(1)});
      popupFloatingMenu(template,options);
      return {opened:true,menu:true};
    }
    return showMonth();
  }
  function actOnTool(config,action,value,customer){
    const {kind}=config;
    if(config.kind==='snippets'&&action==='copy')return productivity.copySnippet(value,customer);
    if(config.kind==='snippets')throw new Error('此工具只可複製文字片段');
    if(action==='main'&&config.kind==='planning'){focusMain();send(win,'open-app-page','planning');return;}
    if(action!=='visit'&&!(kind==='logs'&&action==='reminder'))throw new Error('操作無效');
    if(kind==='planning'&&recordReminders.list().items.some(item=>item.id===value&&item.standalone&&item.available)){focusMain();send(win,'record-reminders-open',{});return;}
    const M=require('./notes-model'),doc=notesStore().get().document;
    const {allowedSheet}=require('./log-view-settings-model');
    if(!doc.records.some(record=>record.id===value&&M.live(doc,record)&&
     (kind!=='logs'||allowedSheet(config,desktop.settings.logView,record.sheetId)))){
      throw new Error('紀錄已移除或不在選定表格');
    }
    focusMain();
    if(action==='reminder'){
     const target=win,show=()=>send(target,'record-reminders-open',{recordId:value});
     if(target.webContents.isLoadingMainFrame?.())target.webContents.once('did-finish-load',show);else show();
    }else send(win,'studio-search-target',{kind:'record',id:value});
  }
  ipcMain.handle('tool-overlay-action',(event,kind,action,value,customer)=>overlayAction(event,({config})=>{
    if(config.kind!==kind)throw new Error('浮動工具已切換分頁');
    return actOnTool(config,action,value,customer);
  }));
  ipcMain.handle('tool-overlay-log-record',(event,context,action,id,pinned)=>overlayAction(event,entry=>{
    const {config}=entry;
    if(config.kind!=='logs'||context!==require('./log-view-settings-model').logFilterKey(config))throw new Error('查看紀錄已切換，請重新選擇');
    const model=require('./tool-views-model'),doc=notesStore().get().document;
    const record=model.logRecord(doc,config,desktop.settings.logView,id);
    if(action==='pin'){
      toolsStore().setLogPin(doc,id,pinned);
      toolsChanged();return;
    }
    if(action==='detail')return model.logDetail(doc,record);
    if(action==='edit'){
      if(!(toolsStore().get().logPins||[]).includes(id))throw new Error('紀錄已取消釘選');
      if(pendingNotesNavigation)throw new Error('請先完成主視窗待開啟的操作');
      pendingNotesNavigation={recordId:id,editRecord:true};
      focusMain();send(win,'notes-navigate',{});
      return;
    }
    throw new Error('紀錄操作無效');
  }));
  ipcMain.handle('tool-overlay-log-window',(event,context,pinned)=>overlayAction(event,entry=>{
    if(entry.config.kind!=='logs'||context!==require('./log-view-settings-model').logFilterKey(entry.config))throw new Error('查看紀錄已切換，請重新選擇');
    return toolOverlay.setPinned(entry,pinned);
  }));
  ipcMain.handle('tool-overlay-close',event=>overlayAction(event,({window})=>window.close()));
  handle('tool-view-open',(_,input)=>toolOverlay.open(require('./tool-views-model').configuration(input)));
  productivity=require('./productivity-ipc').registerProductivity({handle,root:app.getPath('userData'),notes:notesStore,favorites,tools:toolsStore,desktop:()=>desktop,reminders:()=>recordReminders,dialog,parent:()=>win,clipboard,BrowserWindow,fileOperation,changed:notesChanged,validateShortcuts:snippets=>globalShortcuts.validatePair(desktop.settings,snippets),shortcutsChanged:()=>{const warning=registerShortcut();if(warning)throw new Error(warning);},overlayChanged:()=>{send(win,'shortcut-sources-changed',{});toolOverlay.invalidate('snippets');send(floating,'floating-panel-changed','snippets');},previewSize:()=>desktop.settings.toolWindowSizes.pdf,rememberPreview:window=>rememberAuxSize('pdf',window),screen,notifyFavorites,navigate:navigateWorkspace,openPath:filepath=>shell.openPath(filepath),onIncomplete:()=>{notesShare.close();recordReminders.close();capture?.destroy();},blocked:ignoreFile=>Boolean(!ignoreFile&&fileOperationBusy||trashing||capture?.window&&!capture.window.isDestroyed()||[...notesShare.channels.values()].some(channel=>channel.active||channel.checking)),pauseSharing:()=>{for(const [id,channel] of notesShare.channels)if(channel.config.enabled)notesShare.configure({enabled:false,autoPublish:false,receiveMode:'remind'},id);invalidateNotesImport();capture?.destroy();},reload:()=>{notesTools=null;desktop.data=new DesktopState(desktop.filename).data;recordReminders.reload();floatingSearch?.invalidate();if(floating&&!floating.isDestroyed())floatingWindow.apply();send(floating,'desktop-settings-changed',{settings:desktop.settings});shortcutWarning=registerShortcut();nativeTheme.themeSource=desktop.settings.theme==='light'?'light':'dark';send(win,'desktop-settings-changed',{settings:desktop.settings});toolsChanged();toolOverlay.invalidate('logs');send(win,'record-reminders-changed',recordReminders.list());}});
  const initiallyHidden=desktop.settings.startHidden&&!queuedFavorites.length&&desktopShell.ensureTray();
  if(desktop.settings.closeToTray)desktopShell.ensureTray();
  createWindow(initiallyHidden);Promise.resolve().then(()=>{recordReminders.tick();recordAttention.sync();}).catch(error=>diagnostics.record('main','record-reminders-startup',error));
  if(queuedFavorites.length)receiveFavorites([]);
  shortcutWarning=registerShortcut();if(shortcutWarning)send(win,'desktop-settings-changed',{warning:shortcutWarning});
  if(desktop.settings.floatingStartup)showFloating();
  Promise.resolve().then(()=>{return notesShare.tick();}).catch(error=>diagnostics.record('main','share-startup',error));
  app.on('activate',focusMain);
});
app.on('before-quit',event=>{if(fileOperationBusy||trashing){event?.preventDefault();send(win,'desktop-settings-changed',{error:'檔案操作仍在執行，請完成後再結束程式'});return;}if(drafts?.requestClose(true)){event?.preventDefault();return;}recordReminders?.close();recordAttention?.close();if(desktopShell)desktopShell.quitting=true;});
app.on('will-quit',()=>{snippetPicker?.close();require('./snippet-paste').close();toolOverlay?.close();productivity?.close();recordReminders?.close();recordAttention?.close();recordNotification?.close?.();process.removeListener('uncaughtExceptionMonitor',monitorException);sharedNotification?.close();for(const reply of shareIdleRequests.values())reply(false);capture?.destroy();drafts?.destroy();floatingSearch?.destroy();everything?.cancel();notesShare?.close();notes?.close();desktopShell?.destroy();});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
} else {
  app.quit();
}
