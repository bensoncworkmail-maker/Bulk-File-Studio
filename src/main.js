'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme, clipboard, screen, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const {installOfflinePolicy,assertLocalPath,assertSafeOpen}=require('./offline-policy');
const {planMove,executeRelocation,prepareMoveUndo}=require('./move-core');
const {previewPathImport,importPathList}=require('./path-import-core');
const {createSettingsExport,writeSettingsExport}=require('./settings-export');
const {DesktopState}=require('./desktop-state');
const {DesktopShell}=require('./desktop-shell');
const {FloatingWindow,DEFAULTS:floatingDefaults}=require('./floating-window');
const globalShortcuts=require('./global-shortcuts');
const {normalize:normalizeDesktop}=require('./desktop-state');
const {pathToFileURL}=require('node:url');
const fs = require('node:fs');
const path = require('node:path');
const { createPreview, executeMoves, listPaths, snapshotMoves, prepareUndo } = require('./rename-core');
const { FavoritesStore,inspectPath } = require('./favorites-store');
const {EverythingBridge}=require('./everything-bridge');
const { WindowsContextMenu, favoriteArguments, validFavoritePaths } = require('./windows-context-menu');

// Keep the historical packaged profile path after the display-name change.
if(app.isPackaged){const profile=path.join(app.getPath('appData'),'Bulk Rename Studio');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
for(const flag of ['disable-background-networking','disable-component-update','disable-domain-reliability','dns-prefetch-disable'])app.commandLine.appendSwitch(flag);

let win, floating, floatingWindow, desktop, desktopShell, pendingMaximize=false, shortcutWarning='',shellWarning='';
const pendingTagIds=new Set();
let queuedFilter=null,pendingImportRequest=null;
const mainDefaults={width:1520,height:930,minWidth:920,minHeight:650};
let favorites,everything;
let contextMenu;
let queuedFavorites = favoriteArguments(process.argv);
let favoriteActivation = queuedFavorites.length > 0;
let favoriteNotice = null;
function send(window,channel,payload){if(window&&!window.isDestroyed())window.webContents.send(channel,payload);}
function notifyFavorites(payload = {}) {send(win,'favorites-changed',payload);send(floating,'favorites-changed',{});}
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
const saveHistory = (history) => {
  const filepath = historyFile();
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  if (!history) { try { fs.unlinkSync(filepath); } catch (e) { if (e.code !== 'ENOENT') throw e; } return; }
  const temp = filepath + '.new';
  fs.writeFileSync(temp, JSON.stringify(history, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, filepath);
};

function focusMain(){
  if(!win||win.isDestroyed())createWindow();if(win.isMinimized())win.restore();win.show();if(pendingMaximize){pendingMaximize=false;win.maximize();}win.focus();
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
  win.on('close',event=>{if(desktopShell.onClose(event))return;if(floating&&!floating.isDestroyed()){try{floatingWindow.record();}catch{/* Keep closing available if preferences cannot be saved. */}floating.destroy();}});
  win.on('closed',()=>{win=null;});
  win.loadFile(path.join(__dirname, 'index.html'));
}

function secureWindow(window){
  installOfflinePolicy(window.webContents.session,__dirname);
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
}
function showFloating(toggle=false){
  if(floating&&!floating.isDestroyed()){
    if(toggle&&floating.isVisible()){floating.hide();return;}
    floating.show();floating.focus();return;
  }
  floating=new BrowserWindow({...desktop.bounds('floating',screen.getAllDisplays(),floatingDefaults),frame:false,maximizable:false,minimizable:false,fullscreenable:false,title:'Bulk File Studio · 浮動收藏',autoHideMenuBar:true,skipTaskbar:true,alwaysOnTop:desktop.settings.floatingOnTop,backgroundColor:desktop.settings.theme==='light'?'#f4f6fb':'#090e1b',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:!app.isPackaged}});
  secureWindow(floating);floatingWindow=new FloatingWindow(floating,desktop,screen);
  floating.on('closed',()=>{floating=null;floatingWindow=null;});floating.loadFile(path.join(__dirname,'floating.html'));
}
function registerShortcut(){return desktopShell.registerShortcuts();}


if (app.requestSingleInstanceLock({favoritePaths:queuedFavorites})) {
app.on('second-instance', (_, argv, workingDirectory, additionalData) => receiveFavorites(argv,additionalData?.favoritePaths));
app.whenReady().then(() => {
  const handle=(channel,handler)=>ipcMain.handle(channel,(event,...args)=>{
    const main=win&&event?.sender===win.webContents&&event?.senderFrame?.url===pathToFileURL(path.join(__dirname,'index.html')).href;
    const mini=floating&&event?.sender===floating.webContents&&event?.senderFrame?.url===pathToFileURL(path.join(__dirname,'floating.html')).href;
    const floatingAllowed=['favorites-list','favorites-open','favorites-show','favorites-copy','desktop-settings-get','floating-hide','floating-main','floating-pin','floating-view','floating-tools','floating-collect','floating-import','floating-collapse','floating-copy-paths'];
    if(!main&&!(mini&&floatingAllowed.includes(channel)))throw new Error('不受信任的操作來源');
    return handler(event,...args);
  });
  desktop=new DesktopState(path.join(app.getPath('userData'),'desktop-state.json'));
  desktopShell=new DesktopShell({app,Tray,Menu,nativeImage,globalShortcut,platform:process.platform,packaged:app.isPackaged,portable:Boolean(process.env.PORTABLE_EXECUTABLE_FILE),executable:process.execPath,getSettings:()=>desktop.settings,showMain:focusMain,showFloating,hideMain:()=>win?.hide(),hideFloating:()=>floating?.hide(),onWarning:message=>{shellWarning=message;send(win,'desktop-settings-changed',{warning:message});}});
  everything=new EverythingBridge(path.join(app.getPath('userData'),'everything-config.json'));
  handle('everything-status',()=>everything.status());
  handle('everything-configure',(_,enabled,instance)=>everything.configure(enabled,instance));
  handle('everything-choose',async()=>{if(process.platform!=='win32')throw new Error('Everything 整合僅適用於 Windows');const result=await dialog.showOpenDialog(win,{title:'選取官方 ES 命令列工具 es.exe（不是 Everything.exe）',filters:[{name:'ES 命令列工具',extensions:['exe']}],properties:['openFile']});return result.canceled?{canceled:true}:everything.choose(result.filePaths[0]);});
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
  handle('favorites-manage-tag',(_,name,replacement,count)=>{const result=favorites.manageTag(name,replacement,count);notifyFavorites();return result;});
  handle('favorites-add-tags',(_,ids,tags)=>{const result=favorites.addTags(ids,tags);notifyFavorites();return result;});
  handle('favorites-tags-ack',(_,ids)=>{if(Array.isArray(ids))for(const id of ids)pendingTagIds.delete(id);});
  handle('export-settings',async(_,input)=>{
    const data=createSettingsExport(input,desktop.settings,app.getVersion());
    const result=await dialog.showSaveDialog(win,{title:'匯出設定 JSON',defaultPath:`BulkFileStudio-settings-${app.getVersion()}.json`,filters:[{name:'JSON 設定檔',extensions:['json']}]});
    if(result.canceled||!result.filePath)return {canceled:true};
    writeSettingsExport(result.filePath,data);return {canceled:false,path:result.filePath};
  });
  handle('desktop-settings-get',()=>({...desktop.settings,shortcutWarning:[shortcutWarning,shellWarning].filter(Boolean).join('\n')}));
  handle('startup-get',()=>desktopShell.loginStatus());
  handle('startup-set',(_,enabled)=>desktopShell.setLogin(enabled));
  handle('app-hide-to-tray',()=>{if(!desktopShell.hideToTray())throw new Error(shellWarning||'無法隱藏至系統匣');});
  handle('desktop-settings-set',(_,patch)=>{
    const previous=desktop.settings;
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('設定無效');
    for(const key of ['mainShortcut','floatingShortcut'])if(Object.hasOwn(patch,key)&&globalShortcuts.normalize(patch[key])===null)throw new Error('快捷鍵格式無效，請使用 Ctrl／Alt 組合或 F1–F24');
    const candidate=normalizeDesktop({...previous,...patch});globalShortcuts.validatePair(candidate);
    const changed=previous.floatingShortcut!==candidate.floatingShortcut||previous.mainShortcut!==candidate.mainShortcut;
    if(changed){const warning=desktopShell.registerShortcuts(candidate);if(warning){shortcutWarning=desktopShell.registerShortcuts(previous);throw new Error(warning+' 已保留原設定。'+shortcutWarning);}}
    let settings;try{settings=desktop.update(patch);}catch(e){if(changed)shortcutWarning=desktopShell.registerShortcuts(previous);throw e;}
    if(changed)shortcutWarning='';
    if(!settings.explorerTagPrompt)pendingTagIds.clear();
    if(settings.closeToTray||settings.startHidden){shellWarning='';desktopShell.ensureTray();}
    const warning=[shortcutWarning,shellWarning].filter(Boolean).join('\n');
    if(floating&&!floating.isDestroyed()){floating.setAlwaysOnTop(settings.floatingOnTop);floatingWindow.apply();}
    const result={settings,warning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  });
  handle('desktop-reset-window',()=>{win.unmaximize();win.setBounds(desktop.bounds('reset',screen.getAllDisplays(),mainDefaults));});
  handle('floating-show',()=>showFloating());
  handle('floating-hide',()=>floating?.hide());
  handle('floating-compact-size',()=>{showFloating();floatingWindow.compactSize();});
  handle('floating-collapse',(_,collapsed)=>{if(typeof collapsed!=='boolean')throw new Error('收合設定無效');const settings=desktop.update({floatingCollapsed:collapsed});if(floating&&!floating.isDestroyed())floatingWindow.apply();const result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;});
  handle('floating-copy-paths',(_,ids)=>{const paths=favorites.recordedPaths(ids);clipboard.writeText(paths.join('\r\n'));return {count:paths.length};});
  handle('floating-main',(_,tag)=>{
    if(tag!==null&&(typeof tag!=='string'||tag.length>32))throw new Error('標籤無效');
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
    if(!['list','icons'].includes(mode))throw new Error('不支援的浮動檢視模式');
    const settings=desktop.update({floatingView:mode}),result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  });
  handle('floating-tools',(_,compact)=>{
    if(typeof compact!=='boolean')throw new Error('浮動工具顯示設定無效');
    const settings=desktop.update({floatingCompact:compact}),result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  });
  handle('floating-pin',()=>{
    const settings=desktop.update({floatingOnTop:!desktop.settings.floatingOnTop});if(floating&&!floating.isDestroyed())floating.setAlwaysOnTop(settings.floatingOnTop);
    const result={settings,warning:shortcutWarning};send(win,'desktop-settings-changed',result);send(floating,'desktop-settings-changed',result);return result;
  });
  handle('floating-collect',(_,paths,tag)=>{const result=favorites.addPaths(paths,floatingTags(tag));notifyFavorites();return result;});
  handle('floating-import',(_,tag)=>{
    pendingImportRequest={tags:floatingTags(tag)};favoriteActivation=true;if(!win||win.isDestroyed())createWindow();if(floating&&!floating.isDestroyed())floating.hide();if(win.isMinimized())win.restore();win.show();win.focus();notifyFavorites({activate:true});
  });
  handle('favorites-add', (_, paths, tags) => {
    const result=favorites.addPaths(paths,tags);notifyFavorites();return result;
  });
  handle('favorites-choose', async (_, kind) => {
    if(!['file','folder'].includes(kind))throw new Error('不支援的收藏類型');
    const result=await dialog.showOpenDialog(win,{title:kind==='folder'?'收藏資料夾位置':'收藏檔案',properties:[kind==='folder'?'openDirectory':'openFile','multiSelections']});
    if(result.canceled)return {canceled:true,added:0,existing:0,issues:[]};
    const added=favorites.addPaths(result.filePaths);notifyFavorites();return added;
  });
  handle('favorites-update', (_, ids, changes) => {const result=favorites.update(ids,changes);notifyFavorites();return result;});
  handle('favorites-remove', (_, ids) => {const result=favorites.remove(ids);notifyFavorites();return result;});
  handle('favorites-open', async (_, id) => {
    const item=favorites.get(id,true);assertSafeOpen(item.path);const error=await shell.openPath(item.path);
    if(error)throw new Error(error);
  });
  handle('favorites-show', (_, id) => shell.showItemInFolder(assertLocalPath(favorites.get(id,true).path)));
  handle('favorites-copy', (_, id) => clipboard.writeText(favorites.get(id).path));
  handle('favorites-choose-link', async (_, id) => {
    const item=favorites.get(id);let defaultPath;try{defaultPath=assertLocalPath(item.path);}catch{/* Select a local replacement without probing an old network path. */}
    const result=await dialog.showOpenDialog(win,{title:'重新連結收藏（儲存後生效）',defaultPath,properties:[item.type==='folder'?'openDirectory':'openFile']});
    return result.canceled ? null : result.filePaths[0];
  });
  handle('favorites-to-rename', (_, ids, recursive) => listPaths(favorites.readyPaths(ids),Boolean(recursive)));
  handle('favorites-bulk-open',async(_,ids)=>{
    const paths=favorites.readyPaths(ids);if(paths.length>20)throw new Error('每次最多開啟 20 項，避免同時啟動過多程式');
    paths.forEach(assertSafeOpen);
    const failures=[];for(const filepath of paths){try{const error=await shell.openPath(filepath);if(error)failures.push(filepath+'：'+error);}catch(e){failures.push(filepath+'：'+e.message);}}
    return {opened:paths.length-failures.length,failures};
  });
  handle('favorites-copy-many',(_,ids)=>clipboard.writeText(favorites.recordedPaths(ids).join('\r\n')));
  handle('app-info',()=>({name:'Bulk File Studio',version:app.getVersion(),offline:true}));
  handle('choose-move-folder',async()=>{const result=await dialog.showOpenDialog(win,{title:'選擇搬移目標（同一磁碟）',properties:['openDirectory']});return result.canceled?null:assertLocalPath(result.filePaths[0]);});
  handle('move-preview',(_,paths,folder)=>planMove(paths,folder));
  handle('move-files',(_,paths,folder,expected)=>{
    const moves=planMove(paths,folder);
    if(JSON.stringify(moves)!==JSON.stringify(expected))throw new Error('搬移預覽已變更，請重新預覽');
    const record={version:2,kind:'move',state:'pending',createdAt:new Date().toISOString(),moves};saveHistory(record);
    executeRelocation(moves);const warning=syncFavoriteMoves(moves);
    try{saveHistory({...record,state:'completed'});}catch(e){return {changed:moves.length,moves,history:false,warning:warning+' 搬移成功，但復原紀錄無法儲存：'+e.message};}
    return {changed:moves.length,moves,history:true,warning};
  });
  handle('context-menu-status', () => contextMenu.status());
  handle('context-menu-set', (_, enabled) => contextMenu.setEnabled(enabled));
  handle('data-location',()=>app.getPath('userData'));
  handle('open-data-location',async()=>{
    const folder=app.getPath('userData');fs.mkdirSync(folder,{recursive:true});
    const error=await shell.openPath(folder);if(error)throw new Error(error);
  });
  handle('set-theme', (_, theme) => {
    if (!['light', 'dark'].includes(theme)) throw new Error('不支援的主題');
    nativeTheme.themeSource = theme;
    win?.setBackgroundColor(theme === 'light' ? '#f4f6fb' : '#090e1b');
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
  handle('rename', (_, paths, rules, expectedPlan) => {
    const preview = createPreview(paths, rules);
    if (preview.counts.error) throw new Error(`${preview.counts.error} 個檔案存在衝突或名稱錯誤。請先修正，再重新執行。`);
    let moves = preview.rows.filter(x => x.status === 'ready').map(x => ({ source: x.source, destination: x.destination }));
    if (expectedPlan !== undefined && JSON.stringify(expectedPlan) !== JSON.stringify(moves)) {
      throw new Error('預覽結果已變更（檔案名稱、日期或排序可能已改動），操作已取消。請檢查更新後的預覽，再重新確認。');
    }
    if (!moves.length) return { changed: 0, moves: [], history: Boolean(readHistory()) };
    moves = snapshotMoves(moves);
    const record = { version: 2, state: 'pending', createdAt: new Date().toISOString(), moves };
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
  });
  handle('undo', () => {
    const h = readHistory();
    if (!h) throw new Error('沒有可復原的上一批操作紀錄');
    const reversed = h.kind==='move'?prepareMoveUndo(h):prepareUndo(h);
    // Keep interrupted undo from being replayed against a partially restored batch.
    saveHistory({ ...h, state: 'undoing' });
    if(h.kind==='move')executeRelocation(reversed);else executeMoves(reversed);
    const favoriteWarning=syncFavoriteMoves(reversed);
    try { saveHistory(null); }
    catch (e) { return { changed: reversed.length, moves: reversed, warning: [favoriteWarning,`檔案已還原，但清除復原紀錄時發生錯誤：${e.message}`].filter(Boolean).join('\n') }; }
    return { changed: reversed.length, moves: reversed, warning:favoriteWarning };
  });
  handle('history', () => {
    const h = readHistory();
    return h ? { count: h.moves.length, createdAt: h.createdAt, state: h.state, kind:h.kind||'rename' } : null;
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
  const initiallyHidden=desktop.settings.startHidden&&!queuedFavorites.length&&desktopShell.ensureTray();
  if(desktop.settings.closeToTray)desktopShell.ensureTray();
  createWindow(initiallyHidden);
  if(queuedFavorites.length)receiveFavorites([]);
  shortcutWarning=registerShortcut();if(shortcutWarning)send(win,'desktop-settings-changed',{warning:shortcutWarning});
  if(desktop.settings.floatingStartup)showFloating();
  app.on('activate',focusMain);
});
app.on('before-quit',()=>{if(desktopShell)desktopShell.quitting=true;});
app.on('will-quit',()=>{everything?.cancel();desktopShell?.destroy();});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
} else {
  app.quit();
}
