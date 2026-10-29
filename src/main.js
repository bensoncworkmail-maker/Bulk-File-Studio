'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createPreview, executeMoves, listPaths, snapshotMoves, prepareUndo } = require('./rename-core');
const { FavoritesStore } = require('./favorites-store');
const { WindowsContextMenu, favoriteArguments, validFavoritePaths } = require('./windows-context-menu');

let win;
let favorites;
let contextMenu;
let queuedFavorites = favoriteArguments(process.argv);
let favoriteActivation = queuedFavorites.length > 0;
let favoriteNotice = null;
function notifyFavorites(payload = {}) { win?.webContents.send('favorites-changed', payload); }
function receiveFavorites(argv, transferredPaths) {
  queuedFavorites.push(...(transferredPaths===undefined?favoriteArguments(argv):validFavoritePaths(transferredPaths)));
  if (queuedFavorites.length && favorites) {
    favoriteActivation = true;
    try {
      const result = favorites.addPaths(queuedFavorites);
      queuedFavorites = [];
      favoriteNotice = {message:`已收藏 ${result.added} 項，${result.existing} 項已在收藏中。`,issues:result.issues};
    } catch (e) { favoriteNotice = {message:'右鍵收藏未完成',issues:[e.message]}; }
    notifyFavorites({activate:true});
  }
  if (win) { if(win.isMinimized())win.restore();win.show();win.focus(); }
}
function syncFavoriteMoves(moves) {
  try { favorites.applyMoves(moves);notifyFavorites();return ''; }
  catch(e) { return `檔名已更改，但收藏位置未能同步；請在「我的收藏」重新連結：${e.message}`; }
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

function createWindow() {
  win = new BrowserWindow({
    width: 1520, height: 930, minWidth: 920, minHeight: 650,
    backgroundColor: '#0b1020',
    title: 'Bulk Rename Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

if (app.requestSingleInstanceLock({favoritePaths:queuedFavorites})) {
app.on('second-instance', (_, argv, workingDirectory, additionalData) => receiveFavorites(argv,additionalData?.favoritePaths));
app.whenReady().then(() => {
  favorites = new FavoritesStore(path.join(app.getPath('userData'), 'favorites.json'));
  contextMenu = new WindowsContextMenu({packaged:app.isPackaged,portable:Boolean(process.env.PORTABLE_EXECUTABLE_FILE)});
  ipcMain.handle('favorites-list', () => {
    const result={items:favorites.list(),activate:favoriteActivation,notice:favoriteNotice};
    favoriteActivation=false;favoriteNotice=null;return result;
  });
  ipcMain.handle('favorites-add', (_, paths, tags) => {
    const result=favorites.addPaths(paths,tags);notifyFavorites();return result;
  });
  ipcMain.handle('favorites-choose', async (_, kind) => {
    if(!['file','folder'].includes(kind))throw new Error('不支援的收藏類型');
    const result=await dialog.showOpenDialog(win,{title:kind==='folder'?'收藏資料夾位置':'收藏檔案',properties:[kind==='folder'?'openDirectory':'openFile','multiSelections']});
    if(result.canceled)return {canceled:true,added:0,existing:0,issues:[]};
    const added=favorites.addPaths(result.filePaths);notifyFavorites();return added;
  });
  ipcMain.handle('favorites-update', (_, ids, changes) => {const result=favorites.update(ids,changes);notifyFavorites();return result;});
  ipcMain.handle('favorites-remove', (_, ids) => {const result=favorites.remove(ids);notifyFavorites();return result;});
  ipcMain.handle('favorites-open', async (_, id) => {
    const item=favorites.get(id,true),error=await shell.openPath(item.path);
    if(error)throw new Error(error);
  });
  ipcMain.handle('favorites-show', (_, id) => shell.showItemInFolder(favorites.get(id,true).path));
  ipcMain.handle('favorites-copy', (_, id) => clipboard.writeText(favorites.get(id).path));
  ipcMain.handle('favorites-choose-link', async (_, id) => {
    const item=favorites.get(id);
    const result=await dialog.showOpenDialog(win,{title:'重新連結收藏（儲存後生效）',defaultPath:item.path,properties:[item.type==='folder'?'openDirectory':'openFile']});
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('favorites-to-rename', (_, ids, recursive) => listPaths(favorites.readyPaths(ids),Boolean(recursive)));
  ipcMain.handle('context-menu-status', () => contextMenu.status());
  ipcMain.handle('context-menu-set', (_, enabled) => contextMenu.setEnabled(enabled));
  ipcMain.handle('data-location',()=>app.getPath('userData'));
  ipcMain.handle('open-data-location',async()=>{
    const folder=app.getPath('userData');fs.mkdirSync(folder,{recursive:true});
    const error=await shell.openPath(folder);if(error)throw new Error(error);
  });
  ipcMain.handle('set-theme', (_, theme) => {
    if (!['light', 'dark'].includes(theme)) throw new Error('不支援的主題');
    nativeTheme.themeSource = theme;
    win?.setBackgroundColor(theme === 'light' ? '#f4f6fb' : '#090e1b');
  });
  ipcMain.handle('choose-files', async () => {
    const d = await dialog.showOpenDialog(win, { title: '選擇檔案（可多選）', properties: ['openFile', 'multiSelections'] });
    return d.canceled ? { paths: [], ignored: 0 } : listPaths(d.filePaths);
  });
  ipcMain.handle('choose-folder', async (_, recursive) => {
    const d = await dialog.showOpenDialog(win, { title: '選擇要重新命名的資料夾', properties: ['openDirectory'] });
    return d.canceled ? { paths: [], ignored: 0 } : listPaths(d.filePaths, Boolean(recursive));
  });
  ipcMain.handle('add-paths', (_, paths, recursive) => listPaths(paths, Boolean(recursive)));
  ipcMain.handle('preview', (_, paths, rules) => createPreview(paths, rules));
  ipcMain.handle('rename', (_, paths, rules, expectedPlan) => {
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
  ipcMain.handle('undo', () => {
    const h = readHistory();
    if (!h) throw new Error('沒有可復原的上一批操作紀錄');
    const reversed = prepareUndo(h);
    // Keep interrupted undo from being replayed against a partially restored batch.
    saveHistory({ ...h, state: 'undoing' });
    executeMoves(reversed);
    const favoriteWarning=syncFavoriteMoves(reversed);
    try { saveHistory(null); }
    catch (e) { return { changed: reversed.length, moves: reversed, warning: [favoriteWarning,`檔案已還原，但清除復原紀錄時發生錯誤：${e.message}`].filter(Boolean).join('\n') }; }
    return { changed: reversed.length, moves: reversed, warning:favoriteWarning };
  });
  ipcMain.handle('history', () => {
    const h = readHistory();
    return h ? { count: h.moves.length, createdAt: h.createdAt, state: h.state } : null;
  });
  ipcMain.handle('export-csv', async (_, paths, rules) => {
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
    fs.writeFileSync(d.filePath, '\ufeff' + rows.map(r => r.map(quote).join(',')).join('\r\n'), 'utf8');
    return { canceled: false, path: d.filePath, count: preview.rows.length };
  });
  ipcMain.handle('show-in-folder', (_, filePath) => {
    if (typeof filePath !== 'string') return;
    shell.showItemInFolder(filePath);
  });
  createWindow();
  receiveFavorites([]);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
} else {
  app.quit();
}
