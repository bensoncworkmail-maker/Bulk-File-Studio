'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function harness(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brs-main-test-'));
  t.after(() => {events.get('will-quit')?.();fs.rmSync(dir, { recursive:true, force:true });});
  const handlers = new Map();
  const main = path.resolve(__dirname, '../src/main.js');
  const realRequire = createRequire(main);
  const nativeTheme = {};
  const events=new Map();
  let contents;const windows=[],registered=new Map();const rawHandlers=new Map(),opened=[],shown=[];let copied='',popup;let popupClosed=0;
  const network={},messages=[];
  class Window {
    constructor(options) { this.options=options;this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};this.events=new Map();this.visible=true;this.destroyed=false;windows.push(this);this.webContents = contents = { on:(name,callback)=>network[name]=callback,setWindowOpenHandler:callback=>network.windowOpen=callback,send(...args){messages.push(args);},session:{webRequest:{onBeforeRequest:callback=>network.request=callback},setPermissionRequestHandler:callback=>network.permission=callback,setPermissionCheckHandler:callback=>network.check=callback,on:(name,callback)=>network[name]=callback} }; }
    loadFile(filepath) {this.url=require('node:url').pathToFileURL(filepath).href;}
    on(name,callback){const callbacks=this.events.get(name)||[];callbacks.push(callback);this.events.set(name,callbacks);return this;}
    emit(name,...args){for(const callback of this.events.get(name)||[])callback(...args);}
    isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}hide(){this.visible=false;}destroy(){this.destroyed=true;this.emit('closed');}
    setMinimumSize(width,height){this.minimum=[width,height];}setResizable(value){this.resizable=value;}setOpacity(value){this.opacity=value;}isFocused(){return false;}
    getNormalBounds(){return this.bounds;}isMaximized(){return Boolean(this.maximized);}maximize(){this.maximized=true;}unmaximize(){this.maximized=false;}setBounds(bounds){this.bounds=bounds;}setAlwaysOnTop(flag){this.onTop=flag;}
    flashFrame(value){this.flashing=value;}setTitle(value){this.title=value;}
    setBackgroundColor(value) { this.background = value; }
    isMinimized(){return false;}show(){this.visible=true;}showInactive(){this.visible=true;this.inactiveShown=true;}focus(){}restore(){}
  }
  const electron = {
    app: {commandLine:{appendSwitch(){}},getVersion:()=>require('../package.json').version, getPath:()=>dir, requestSingleInstanceLock:()=>true, whenReady:()=>({ then:callback=>callback() }), on:(name,callback)=>events.set(name,callback), isPackaged:false },
    Notification:overrides.Notification,utilityProcess:overrides.utilityProcess,Menu:{buildFromTemplate:template=>({popup:options=>{popup={template,options};},closePopup:()=>popupClosed++})},BrowserWindow:Window, nativeTheme,screen:{getAllDisplays:()=>[{workArea:{x:0,y:0,width:1920,height:1080}}]},globalShortcut:{unregisterAll:()=>registered.clear(),register:(key,callback)=>{registered.set(key,callback);return true;}},
    ipcMain:{ handle:(name,handler)=>{rawHandlers.set(name,handler);handlers.set(name,(_, ...args)=>handler({sender:windows[0].webContents,senderFrame:{url:require('node:url').pathToFileURL(path.join(path.dirname(main),'index.html')).href}},...args));} }, dialog:{}, clipboard:{writeText:text=>{copied=text;}},shell:{openPath:async filepath=>{opened.push(filepath);return '';},showItemInFolder:filepath=>shown.push(filepath)}
  };
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), {
    require:name=>name === 'electron' ? electron : (overrides[name] || realRequire(name)),
    __dirname:path.dirname(main), process, setTimeout, clearTimeout
  }, { filename:main });
  return {clipboard:electron.clipboard,shell:electron.shell,messages,popup:()=>popup,popupClosed:()=>popupClosed,shortcuts:electron.globalShortcut, dir, dialog:electron.dialog, handlers, windows, registered, rawHandlers, network, opened, shown, getCopied:()=>copied, events, nativeTheme, historyPath:path.join(dir, 'last-rename.json') };
}

test('productivity IPC is restricted to the main renderer and supports persistent snippets',async t=>{
 const h=harness(t),floating=new h.windows[0].constructor({width:320,height:400});floating.loadFile(path.resolve(__dirname,'../src/floating.html'));
 assert.throws(()=>h.rawHandlers.get('productivity-get')({sender:floating.webContents,senderFrame:{url:floating.url}}),/不受信任/);
 assert.throws(()=>h.rawHandlers.get('productivity-get')({sender:h.windows[0].webContents,senderFrame:{url:'file:///other.html'}}),/不受信任/);
 h.handlers.get('productivity-save')(null,'snippets',{name:'回覆',body:'你好 {{customer}}',category:'工作'});
 const state=h.handlers.get('productivity-get')(),snippet=state.data.snippets[0];assert.equal(snippet.name,'回覆');
 h.handlers.get('productivity-snippet-copy')(null,snippet.id,'陳先生');assert.equal(h.getCopied(),'你好 陳先生');
 h.handlers.get('productivity-remove')(null,'snippets',snippet.id);assert.equal(h.handlers.get('productivity-get')().data.snippets.length,0);
});
test('an unfinished profile journal blocks further renderer writes until restart recovery',t=>{const h=harness(t);fs.writeFileSync(path.join(h.dir,'profile-transaction.json'),'{}');assert.throws(()=>h.handlers.get('productivity-save')(null,'snippets',{name:'x',body:'x',category:''}),/重新啟動/);assert.throws(()=>h.handlers.get('notes-template')(),/重新啟動/);assert.equal(fs.existsSync(path.join(h.dir,'productivity.json')),false);});
test('backup export requires its own extension and cannot replace a selected profile JSON',async t=>{const h=harness(t),file=path.join(h.dir,'a.txt');fs.writeFileSync(file,'a');h.handlers.get('favorites-add')(null,[file],[]);const backup=h.handlers.get('productivity-backup-create')(null,{}),target=path.join(h.dir,'favorites.json'),before=fs.readFileSync(target,'utf8');h.dialog.showSaveDialog=async()=>({canceled:false,filePath:target});await assert.rejects(h.handlers.get('productivity-backup-export')(null,backup.name),/副檔名/);assert.equal(fs.readFileSync(target,'utf8'),before);const exported=path.join(h.dir,'export.bfsbackup');h.dialog.showSaveDialog=async()=>({canceled:false,filePath:exported});await h.handlers.get('productivity-backup-export')(null,backup.name);assert.equal(JSON.parse(fs.readFileSync(exported,'utf8')).format,'BulkFileStudio.Profile');});
test('productivity repairs only the confirmed captured rows and blocks other file jobs during confirmation',async t=>{
 const h=harness(t),old=path.join(h.dir,'old'),next=path.join(h.dir,'next');fs.mkdirSync(old);fs.mkdirSync(next);const source=path.join(old,'a.txt'),target=path.join(next,'a.txt');fs.writeFileSync(source,'a');fs.writeFileSync(target,'a');h.handlers.get('favorites-add')(null,[source],[]);const preview=h.handlers.get('productivity-repair-preview')(null,old,next);let decide;h.dialog.showMessageBox=()=>new Promise(resolve=>decide=resolve);const pending=h.handlers.get('productivity-repair-apply')(null,preview.token,preview.rows.map(row=>row.key),{});assert.throws(()=>h.handlers.get('rename')(null,[source],{prefix:'x'}),/仍在執行/);decide({response:0});const result=await pending;assert.equal(result.updated,1);assert.equal(h.handlers.get('favorites-list')().items[0].path,target);assert.equal(fs.existsSync(source),true);
});
test('full restore preview and confirmation retain original files and pause existing sharing',async t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),root=state.document.sheets[0],folder=path.join(h.dir,'share');fs.mkdirSync(folder);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});await h.handlers.get('notes-share-choose')(null,'default');h.handlers.get('notes-share-configure')(null,{enabled:true,autoPublish:true},'default');
 const backup=h.handlers.get('productivity-backup-create')(null,{rules:{prefix:'saved_'}});h.handlers.get('productivity-save')(null,'snippets',{name:'temporary',body:'temporary',category:''});const preview=await h.handlers.get('productivity-backup-preview')(null,backup.name);assert.deepEqual(preview.counts.snippets,[1,0]);h.dialog.showMessageBox=async()=>({response:0});const result=await h.handlers.get('productivity-backup-restore')(null,preview.token,{});assert.equal(result.ui.naming.activeRules.prefix,'saved_');assert.equal(h.handlers.get('notes-share-status')().enabled,false);assert.equal(h.handlers.get('productivity-get')().data.snippets.length,0);assert.ok(h.handlers.get('notes-get')().document.sheets.some(sheet=>sheet.id===root.id));assert.ok(h.handlers.get('productivity-restored-ui')());h.handlers.get('productivity-restored-ack')();assert.equal(h.handlers.get('productivity-restored-ui')(),null);
});
for(const deletion of ['single','batch'])test('workspace '+deletion+' table deletion immediately stops and persists its share profile',async t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),root=state.document.sheets[0];
 h.handlers.get('notes-share-select')(null,root.id);
 const folder=path.join(h.dir,'shared');fs.mkdirSync(folder);
 h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
 await h.handlers.get('notes-share-choose')(null,root.id);
 h.handlers.get('notes-share-configure')(null,{enabled:true,autoPublish:true},root.id);
 const filename=path.join(h.dir,'workspace-share-profiles',root.id+'.json');
 assert.equal(JSON.parse(fs.readFileSync(filename,'utf8')).enabled,true);
 if(deletion==='single')h.handlers.get('notes-trash')(null,'sheet',root.id,root.version,false);
 else h.handlers.get('notes-batch-sheets')(null,[{id:root.id,version:root.version}],state.revision);
 // No status request or restart is needed to release the removed owner's folder.
 const saved=JSON.parse(fs.readFileSync(filename,'utf8'));
 assert.equal(saved.enabled,false);assert.equal(saved.autoPublish,false);assert.equal(saved.folder,folder);
 const event=h.messages.filter(([name])=>name==='notes-share-changed').at(-1)[1];
 assert.equal(event.profileId,'default');assert.equal(event.profiles.some(profile=>profile.id===root.id),false);
});

test('IPC persists verified history, blocks edited files, and allows retry', async t => {
  const { dir, handlers, historyPath } = harness(t);handlers.get('desktop-settings-set')(null,{renameVerification:'full'});
  const source = path.join(dir, 'a.txt');
  fs.writeFileSync(source, 'AAAA');
  fs.utimesSync(source, 1700000000, 1700000000);
  const result = await handlers.get('rename')(null, [source], { prefix:'new_' });
  const renamed = result.moves[0].destination;
  const saved = JSON.parse(fs.readFileSync(historyPath));
  assert.equal(saved.version, 2);
  assert.equal(saved.state, 'completed');
  fs.writeFileSync(renamed, 'BBBB');
  await assert.rejects(handlers.get('undo')(), /修改或替換/);
  assert.equal(JSON.parse(fs.readFileSync(historyPath)).state, 'completed');
  assert.equal(fs.existsSync(source), false);
  fs.writeFileSync(renamed, 'AAAA');
  fs.utimesSync(renamed, 1700000000, 1700000000);
  assert.equal((await handlers.get('undo')()).changed, 1);
  assert.equal(fs.readFileSync(source, 'utf8'), 'AAAA');
  assert.equal(fs.existsSync(historyPath), false);
});

test('history write failure stops rename before touching source files', t => {
  const failWrites = new Proxy(fs, { get(target, key) {
    if (key === 'writeFileSync') return () => { throw new Error('history disk unavailable'); };
    return target[key];
  } });
  const { dir, handlers } = harness(t, { 'node:fs':failWrites });
  const source = path.join(dir, 'a.txt');
  fs.writeFileSync(source, 'AAAA');
  assert.throws(() => handlers.get('rename')(null, [source], {prefix:'new_'}), /history disk unavailable/);
  assert.equal(fs.readFileSync(source, 'utf8'), 'AAAA');
  assert.equal(fs.existsSync(path.join(dir, 'new_a.txt')), false);
});

test('an interrupted rename leaves a pending record and cannot replay undo', t => {
  const core = require('../src/rename-core');
  const { dir, handlers, historyPath } = harness(t, {
    './rename-core': { ...core, executeMoves:()=>{ throw new Error('injected operation failure'); } }
  });
  const source = path.join(dir, 'a.txt'); fs.writeFileSync(source, 'A');
  assert.throws(() => handlers.get('rename')(null, [source], {prefix:'new_'}), /injected/);
  assert.equal(JSON.parse(fs.readFileSync(historyPath)).state, 'pending');
  assert.throws(() => handlers.get('undo')(), /未完整完成/);
  assert.equal(fs.readFileSync(source, 'utf8'), 'A');
});

test('theme IPC accepts only light or dark', t => {
  const { handlers, nativeTheme } = harness(t);
  handlers.get('set-theme')(null, 'light'); assert.equal(nativeTheme.themeSource, 'light');
  handlers.get('set-theme')(null, 'dark'); assert.equal(nativeTheme.themeSource, 'dark');
  assert.throws(() => handlers.get('set-theme')(null, 'unknown'), /不支援/);
});

test('a stale displayed preview cancels rename before writing history or files', t => {
  const {dir,handlers,historyPath}=harness(t);
  const source=path.join(dir,'a.txt');fs.writeFileSync(source,'A');
  const rules={nameTemplate:'{n}_{name}'};
  const plan=[{source,destination:path.join(dir,'outdated.txt')}];
  assert.throws(()=>handlers.get('rename')(null,[source],rules,plan),/預覽結果已變更/);
  assert.equal(fs.readFileSync(source,'utf8'),'A');assert.equal(fs.existsSync(historyPath),false);
  const preview=handlers.get('preview')(null,[source],rules);
  const correct=preview.rows.map(({source,destination})=>({source,destination}));
  assert.equal(handlers.get('rename')(null,[source],rules,correct).changed,1);
});

test('favorites IPC keeps collections independent and updates paths on rename and undo',t=>{
  const {dir,handlers}=harness(t),source=path.join(dir,'a.txt');fs.writeFileSync(source,'A');
  handlers.get('favorites-add')(null,[source],['工作']);
  const original=handlers.get('favorites-list')().items[0];
  handlers.get('rename')(null,[source],{prefix:'new_'});
  const changed=handlers.get('favorites-list')().items[0];
  assert.equal(changed.path,path.join(dir,'new_a.txt'));assert.equal(changed.status,'ready');assert.equal(changed.id,original.id);
  handlers.get('undo')();assert.equal(handlers.get('favorites-list')().items[0].path,source);
  assert.equal(handlers.get('favorites-remove')(null,[original.id]).removed,1);assert.equal(fs.readFileSync(source,'utf8'),'A');
});
test('folder bookmarks expand contents only when added to rename, respecting recursion',t=>{
  const {dir,handlers}=harness(t),folder=path.join(dir,'folder');fs.mkdirSync(folder);fs.mkdirSync(path.join(folder,'nested'));
  fs.writeFileSync(path.join(folder,'one.txt'),'1');fs.writeFileSync(path.join(folder,'nested','two.txt'),'2');
  handlers.get('favorites-add')(null,[folder]);const items=handlers.get('favorites-list')().items;
  assert.equal(items.length,1);assert.equal(items[0].type,'folder');
  assert.equal(handlers.get('favorites-to-rename')(null,[items[0].id],false).paths.length,1);
  assert.equal(handlers.get('favorites-to-rename')(null,[items[0].id],true).paths.length,2);
});
test('second-instance Explorer requests collect files once and activate favorites',t=>{
  const {dir,handlers,events}=harness(t),source=path.join(dir,'報表 & notes.txt');fs.writeFileSync(source,'A');
  const argv=['Studio.exe','--favorite','--',source];
  events.get('second-instance')(null,argv);events.get('second-instance')(null,argv);
  const result=handlers.get('favorites-list')();assert.equal(result.items.length,1);assert.equal(result.activate,true);
  assert.equal(handlers.get('favorites-list')().activate,false);
  const second=path.join(dir,'transferred.txt');fs.writeFileSync(second,'B');
  events.get('second-instance')(null,['reordered-argv'],dir,{favoritePaths:[second,'relative.txt']});
  assert.equal(handlers.get('favorites-list')().items.length,2);
});

test('IPC rejects other windows, frames and missing sender identity',t=>{
 const {rawHandlers}=harness(t);for(const event of [null,{}, {sender:{},senderFrame:{url:'https://example.com'}}])assert.throws(()=>rawHandlers.get('history')(event),/不受信任/);
});
test('window session blocks network, permissions, navigation and external windows',t=>{
 const {network}=harness(t);let canceled;network.request({url:'https://example.com'},result=>canceled=result.cancel);assert.equal(canceled,true);
 let permission;network.permission(null,'camera',result=>permission=result);assert.equal(permission,false);assert.equal(network.check(),false);assert.equal(network.windowOpen({url:'https://example.com'}).action,'deny');let prevented=false;network['will-navigate']({preventDefault:()=>prevented=true});assert.ok(prevented);
});
test('move IPC persists verified journal and synchronizes favorites through undo',t=>{
 const {dir,handlers,historyPath}=harness(t);const source=path.join(dir,'a.txt'),folder=path.join(dir,'out');fs.writeFileSync(source,'A');fs.mkdirSync(folder);handlers.get('favorites-add')(null,[source],['saved']);
 const preview=handlers.get('move-preview')(null,[source],folder);assert.throws(()=>handlers.get('move-files')(null,[source],folder,[]),/預覽已變更/);assert.equal(fs.existsSync(historyPath),false);
 const result=handlers.get('move-files')(null,[source],folder,preview);assert.equal(result.changed,1);assert.equal(handlers.get('history')().kind,'move');assert.equal(handlers.get('favorites-list')().items[0].path,path.join(folder,'a.txt'));
 handlers.get('undo')();assert.equal(fs.readFileSync(source,'utf8'),'A');assert.equal(handlers.get('favorites-list')().items[0].path,source);
});
test('bulk open validates the entire selection, limits volume, and copies paths',async t=>{
 const {dir,handlers,opened,getCopied}=harness(t);const paths=Array.from({length:21},(_,i)=>path.join(dir,`item-${i}.txt`));paths.forEach(p=>fs.writeFileSync(p,'A'));handlers.get('favorites-add')(null,paths);const ids=handlers.get('favorites-list')().items.map(item=>item.id);
 await assert.rejects(()=>handlers.get('favorites-bulk-open')(null,ids),/最多開啟 20/);assert.equal(opened.length,0);
 assert.equal((await handlers.get('favorites-bulk-open')(null,ids.slice(0,2))).opened,2);handlers.get('favorites-copy-many')(null,ids.slice(0,2));assert.equal(getCopied(),paths.slice(0,2).join('\r\n'));
 const executable=path.join(dir,'danger.exe');fs.writeFileSync(executable,'data');handlers.get('favorites-add')(null,[executable]);const executableId=handlers.get('favorites-list')().items.find(item=>item.path===executable).id;await assert.rejects(()=>handlers.get('favorites-bulk-open')(null,[ids[0],executableId]),/自行開啟/);assert.equal(opened.length,2);
});

test('floating window has offline policy, limited IPC and can focus a tag in the main window',t=>{
 const {handlers,rawHandlers,windows,registered,dir}=harness(t);assert.ok(registered.has('CommandOrControl+Alt+B'));handlers.get('floating-show')();assert.equal(windows.length,2);const mini=windows[1];assert.equal(mini.options.alwaysOnTop,true);assert.equal(mini.options.webPreferences.sandbox,true);const event={sender:mini.webContents,senderFrame:{url:mini.url}};
 assert.ok(rawHandlers.get('favorites-list')(event).items);for(const channel of ['rename','move-files','undo','favorites-add','favorites-update','favorites-add-tags','favorites-manage-tag','everything-status','everything-configure','everything-choose','everything-search','everything-cancel','everything-favorite','everything-to-rename','favorites-remove','context-menu-set','export-csv'])assert.throws(()=>rawHandlers.get(channel)(event),/不受信任/);assert.throws(()=>rawHandlers.get('desktop-settings-set')(event,{floatingOnTop:false}),/不受信任/);
 rawHandlers.get('floating-main')(event,'work');assert.equal(handlers.get('favorites-list')().filterTag.tag,'work');assert.equal(handlers.get('favorites-list')().filterTag,null);
 registered.get('CommandOrControl+Alt+B')();assert.equal(mini.visible,false);registered.get('CommandOrControl+Alt+B')();assert.equal(mini.visible,true);
 handlers.get('desktop-settings-set')(null,{floatingOnTop:false,floatingShortcut:''});assert.equal(mini.onTop,false);assert.equal(registered.size,1);assert.ok(fs.existsSync(path.join(dir,'desktop-state.json')));
});
test('Explorer quick-tag requests survive reads by the floating tool and acknowledge only handled IDs',t=>{
 const {dir,events,handlers,rawHandlers,windows}=harness(t);const paths=['a.txt','b.txt'].map(name=>path.join(dir,name));paths.forEach(p=>fs.writeFileSync(p,'A'));events.get('second-instance')(null,['Studio.exe','--favorite','--',paths[0]]);events.get('second-instance')(null,['Studio.exe','--favorite','--',paths[1]]);
 handlers.get('floating-show')();const mini=windows[1];rawHandlers.get('favorites-list')({sender:mini.webContents,senderFrame:{url:mini.url}});const result=handlers.get('favorites-list')();assert.equal(result.promptIds.length,2);handlers.get('favorites-tags-ack')(null,[result.promptIds[0]]);assert.equal(handlers.get('favorites-list')().promptIds.length,1);handlers.get('desktop-settings-set')(null,{explorerTagPrompt:false});assert.equal(handlers.get('favorites-list')().promptIds.length,0);
});

test('main-window close flushes the latest normal geometry and maximize state',t=>{
 const {dir,windows}=harness(t),main=windows[0];main.bounds={x:140,y:90,width:1180,height:740};main.maximized=true;main.emit('close');const saved=JSON.parse(fs.readFileSync(path.join(dir,'desktop-state.json'),'utf8'));assert.deepEqual(saved.windows.main.bounds,{x:140,y:90,width:1180,height:740});assert.equal(saved.windows.main.maximized,true);
});

test('path-list import IPC requires a current preview and merges tags through the catalog',t=>{
 const {dir,handlers}=harness(t),a=path.join(dir,'a.txt'),b=path.join(dir,'b.txt');fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');handlers.get('favorites-add')(null,[a],['old']);const text=`"${a}"\n${b}\n${b}\nrelative.txt`,preview=handlers.get('favorites-import-preview')(null,text,['new']);assert.equal(preview.counts.duplicate,1);assert.throws(()=>handlers.get('favorites-import-paths')(null,text,['changed'],preview.token),/預覽已變更/);const result=handlers.get('favorites-import-paths')(null,text,['new'],preview.token);assert.equal(result.added,1);assert.equal(result.existing,1);assert.deepEqual(handlers.get('favorites-list')().items.find(i=>i.path===a).tags,['old','new']);
});
test('floating quick actions pin, collect with an existing tag and route path import to main',t=>{
 const {dir,handlers,rawHandlers,windows}=harness(t),a=path.join(dir,'a.txt'),b=path.join(dir,'b.txt');fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');handlers.get('favorites-add')(null,[a],['Work']);handlers.get('floating-show')();const mini=windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};
 const toggled=rawHandlers.get('floating-pin')(event);assert.equal(toggled.settings.floatingOnTop,false);assert.equal(mini.onTop,false);
 const result=rawHandlers.get('floating-collect')(event,[b],'work');assert.equal(result.added,1);assert.deepEqual(handlers.get('favorites-list')().items.find(i=>i.path===b).tags,['Work']);assert.throws(()=>rawHandlers.get('floating-collect')(event,[b],'deleted-tag'),/不存在/);
 handlers.get('desktop-settings-set')(null,{floatingQuickMode:'main',floatingKeepAfterQuick:false});rawHandlers.get('floating-import')(event,'work');assert.equal(mini.visible,false);rawHandlers.get('favorites-list')(event);assert.deepEqual(Array.from(handlers.get('favorites-list')().importRequest.tags),['Work']);assert.equal(handlers.get('favorites-list')().importRequest,null);
 assert.throws(()=>rawHandlers.get('favorites-import-preview')(event,b,[]),/不受信任/);assert.throws(()=>rawHandlers.get('desktop-settings-set')(event,{theme:'light'}),/不受信任/);
});

test('floating list/icon mode is validated, persisted and cannot export settings',t=>{const {handlers,rawHandlers,windows,dir}=harness(t);handlers.get('floating-show')();const mini=windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};assert.equal(rawHandlers.get('floating-view')(event,'icons').settings.floatingView,'icons');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'desktop-state.json'),'utf8')).settings.floatingView,'icons');assert.throws(()=>rawHandlers.get('floating-view')(event,'other'),/不支援/);assert.throws(()=>rawHandlers.get('export-settings')(event,{}),/不受信任/);assert.equal(handlers.get('desktop-settings-get')().floatingView,'icons');});
test('settings export IPC supports cancel and writes only a normalized configuration snapshot',async t=>{const {dir,handlers,dialog}=harness(t);dialog.showSaveDialog=async()=>({canceled:true});assert.equal((await handlers.get('export-settings')(null,{})).canceled,true);const filename=path.join(dir,'chosen.json');dialog.showSaveDialog=async()=>({canceled:false,filePath:filename});const result=await handlers.get('export-settings')(null,{settings:{rulesWidth:'630'},rules:{prefix:'new_'},favorites:['/private/file']});assert.equal(result.path,filename);const saved=JSON.parse(fs.readFileSync(filename,'utf8'));assert.equal(saved.settings.rulesWidth,'630');assert.equal(saved.naming.activeRules.prefix,'new_');assert.equal(saved.application.version,require('../package.json').version);assert.equal(JSON.stringify(saved).includes('/private/file'),false);});

test('custom global shortcuts reject duplicates and restore previous binding after registration failure',t=>{const h=harness(t),before=h.handlers.get('desktop-settings-get')();assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{mainShortcut:before.floatingShortcut}),/相同/);assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{mainShortcut:'A'}),/格式/);const original=h.shortcuts.register;h.shortcuts.register=(key,callback)=>key==='CommandOrControl+Shift+Q'?false:original(key,callback);assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{mainShortcut:'Ctrl+Shift+Q'}),/保留原設定/);assert.equal(h.handlers.get('desktop-settings-get')().mainShortcut,before.mainShortcut);assert.ok(h.registered.has(before.mainShortcut));h.handlers.get('desktop-settings-set')(null,{mainShortcut:'Ctrl+Alt+9'});assert.ok(h.registered.has('CommandOrControl+Alt+9'));assert.equal(h.handlers.get('desktop-settings-get')().mainShortcut,'CommandOrControl+Alt+9');});

test('tag rename/delete IPC updates catalog without deleting bookmarks or files',t=>{const {dir,handlers}=harness(t),file=path.join(dir,'tagged.txt');fs.writeFileSync(file,'bytes');handlers.get('favorites-add')(null,[file],['Old']);assert.equal(handlers.get('favorites-manage-tag')(null,'Old','New',1).updated,1);assert.deepEqual(handlers.get('favorites-list')().items[0].tags,['New']);handlers.get('favorites-manage-tag')(null,'New',null,1);assert.equal(handlers.get('favorites-list')().items.length,1);assert.equal(fs.readFileSync(file,'utf8'),'bytes');});

test('Everything IPC gates selected result actions and preserves actual file contents',async t=>{let chosen,enabled=true;class Bridge{status(){return {supported:true,enabled,configured:true};}selection(token,indices){if(!enabled||token!=='valid'||JSON.stringify(indices)!=='[0]')throw Error('搜尋結果已過期');return [chosen];}configure(value){enabled=value;return this.status();}cancel(){}}const h=harness(t,{'./everything-bridge':{EverythingBridge:Bridge}});chosen=path.join(h.dir,'everything-result.txt');fs.writeFileSync(chosen,'original');assert.throws(()=>h.handlers.get('everything-favorite')(null,'fake',[0],[]),/過期/);assert.equal(h.handlers.get('everything-favorite')(null,'valid',[0],['工作']).added,1);assert.deepEqual(h.handlers.get('favorites-list')().items[0].tags,['工作']);assert.deepEqual(Array.from(h.handlers.get('everything-to-rename')(null,'valid',[0]).paths),[chosen]);assert.equal(fs.readFileSync(chosen,'utf8'),'original');h.handlers.get('everything-configure')(null,false,'');assert.throws(()=>h.handlers.get('everything-to-rename')(null,'valid',[0]),/過期/);});

test('floating opacity, collapse geometry and filtered path clipboard use dedicated trusted IPC',t=>{const h=harness(t),a=path.join(h.dir,'one.txt'),b=path.join(h.dir,'folder');fs.writeFileSync(a,'content');fs.mkdirSync(b);h.handlers.get('favorites-add')(null,[a,b],['Work']);const ids=h.handlers.get('favorites-list')().items.map(item=>item.id);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};assert.equal(mini.options.minWidth,220);assert.equal(mini.options.minHeight,120);h.handlers.get('desktop-settings-set')(null,{floatingOpacity:65});assert.equal(mini.opacity,.65);const oldHeight=mini.bounds.height;h.rawHandlers.get('floating-collapse')(event,true);assert.equal(mini.bounds.height,40);h.rawHandlers.get('floating-collapse')(event,false);assert.equal(mini.bounds.height,oldHeight);assert.equal(h.rawHandlers.get('floating-copy-paths')(event,ids).count,2);assert.equal(h.getCopied(),[a,b].join('\r\n'));assert.throws(()=>h.rawHandlers.get('floating-copy-paths')(event,['unknown']));assert.throws(()=>h.rawHandlers.get('floating-collapse')(event,'yes'),/無效/);assert.throws(()=>h.rawHandlers.get('floating-copy-paths')({sender:{},senderFrame:{url:mini.url}},ids),/不受信任/);assert.equal(fs.readFileSync(a,'utf8'),'content');});

test('global collapse toggles an existing floating tool without focusing the main window',t=>{const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1];h.windows[0].hide();h.handlers.get('floating-view')(null,'tags');assert.equal(h.handlers.get('desktop-settings-get')().floatingView,'tags');h.handlers.get('desktop-settings-set')(null,{collapseShortcut:'Ctrl+Alt+Space'});h.registered.get('CommandOrControl+Alt+Space')();assert.equal(mini.bounds.width,92);assert.equal(mini.bounds.height,40);h.registered.get('CommandOrControl+Alt+Space')();assert.equal(mini.bounds.width,320);mini.hide();h.registered.get('CommandOrControl+Alt+Space')();assert.equal(mini.inactiveShown,true);assert.equal(mini.visible,true);assert.equal(h.windows[0].visible,false);assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{collapseShortcut:'Ctrl+Alt+B'}),/相同/);});

test('floating native tag menu checks sender, revalidates stale records and shares safe open policy',async t=>{const h=harness(t),a=path.join(h.dir,'one.txt'),blocked=path.join(h.dir,'tool.exe');fs.writeFileSync(a,'content');fs.writeFileSync(blocked,'MZ');h.handlers.get('favorites-add')(null,[a,blocked],['Work']);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}},invoke=(tag='work',query='')=>h.rawHandlers.get('floating-tag-menu')(event,tag,query);assert.throws(()=>h.rawHandlers.get('floating-tag-menu')({sender:{},senderFrame:{url:mini.url}},'work',''),/不受信任/);assert.throws(()=>invoke('unknown'),/不存在/);assert.throws(()=>invoke('work','x'.repeat(257)),/過長/);assert.equal(invoke().count,2);assert.equal(h.popup().options.window,mini);let entries=h.popup().template;await entries.find(item=>item.label?.includes('one.txt')).click();assert.deepEqual(h.opened,[a]);await entries.find(item=>item.label?.includes('tool.exe')).click();assert.deepEqual(h.opened,[a]);entries.find(item=>item.label==='複製此篩選結果全部路徑').click();assert.equal(h.getCopied(),[a,blocked].join('\r\n'));fs.unlinkSync(a);await entries.find(item=>item.label?.includes('one.txt')).click();assert.deepEqual(h.opened,[a]);invoke('work','tool');assert.equal(h.popup().template.filter(item=>item.label?.includes('tool.exe')).length,1);h.handlers.get('floating-collapse')(null,true);assert.ok(h.popupClosed()>0);assert.throws(()=>invoke(),/展開/);});
test('settings tag choices read does not consume main activation or queued filters',t=>{const h=harness(t),a=path.join(h.dir,'a');fs.writeFileSync(a,'a');h.handlers.get('favorites-add')(null,[a],['Work']);h.handlers.get('floating-main')(null,'work');assert.equal(h.handlers.get('floating-tag-options')()[0].name,'Work');assert.equal(h.handlers.get('favorites-list')().filterTag.tag,'work');});

test('native floating item menu uses bookmark IDs, rejects untrusted sources and rechecks action safety',async t=>{const h=harness(t),a=path.join(h.dir,'one.txt'),blocked=path.join(h.dir,'tool.exe');fs.writeFileSync(a,'original');fs.writeFileSync(blocked,'MZ');const result=h.handlers.get('favorites-add')(null,[a,blocked],['Work']);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}},invoke=id=>h.rawHandlers.get('floating-item-menu')(event,id);assert.throws(()=>h.rawHandlers.get('floating-item-menu')({sender:{},senderFrame:{url:mini.url}},result.ids[0]),/不受信任/);assert.throws(()=>invoke(a));invoke(result.ids[0]);assert.equal(h.popup().options.window,mini);const template=h.popup().template;await template.find(item=>item.label==='開啟').click();assert.deepEqual(h.opened,[a]);await template.find(item=>item.label==='在檔案總管定位').click();assert.deepEqual(h.shown,[a]);await template.find(item=>item.label==='複製完整路徑').click();assert.equal(h.getCopied(),a);invoke(result.ids[1]);await h.popup().template.find(item=>item.label==='開啟').click();assert.deepEqual(h.opened,[a]);fs.unlinkSync(a);await template.find(item=>item.label==='開啟').click();assert.deepEqual(h.opened,[a]);invoke(result.ids[0]);assert.equal(h.popup().template.find(item=>item.label==='開啟').enabled,false);assert.equal(h.popup().template.find(item=>item.label==='在檔案總管定位').enabled,false);await h.popup().template.find(item=>item.label==='複製完整路徑').click();assert.equal(h.getCopied(),a);h.handlers.get('floating-collapse')(null,true);assert.throws(()=>invoke(result.ids[0]),/展開/);});
test('header action and drag IPC follow stored preferences and accept only trusted bookmark-window sources',t=>{const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}},invoke=()=>h.rawHandlers.get('floating-header-double-click')(event);invoke();assert.equal(mini.bounds.width,92);invoke();assert.equal(mini.bounds.width,320);h.handlers.get('desktop-settings-set')(null,{floatingHeaderDoubleClick:false});invoke();assert.equal(mini.bounds.width,320);h.handlers.get('desktop-settings-set')(null,{floatingHeaderDoubleClick:true,floatingHeaderAction:'tools'});invoke();assert.equal(h.handlers.get('desktop-settings-get')().floatingCompact,true);h.handlers.get('desktop-settings-set')(null,{floatingHeaderAction:'pin'});invoke();assert.equal(mini.onTop,false);h.windows[0].hide();h.handlers.get('desktop-settings-set')(null,{floatingHeaderAction:'main'});invoke();assert.equal(h.windows[0].visible,true);h.handlers.get('desktop-settings-set')(null,{floatingMinWidth:160,floatingMinHeight:80});assert.deepEqual(mini.minimum,[160,80]);const {token}=h.rawHandlers.get('floating-drag-start')(event);h.rawHandlers.get('floating-drag-move')(event,token,100,50);h.rawHandlers.get('floating-drag-end')(event,token);assert.throws(()=>h.rawHandlers.get('floating-drag-move')(event,token,0,0),/結束/);for(const channel of ['floating-header-double-click','floating-drag-start','floating-drag-move','floating-drag-end'])assert.throws(()=>h.rawHandlers.get(channel)({sender:{},senderFrame:{url:mini.url}}),/不受信任/);});

test('tag batch menu confirms once, opens folders and deduplicates locations; cancel has no effects',async t=>{const h=harness(t),a=path.join(h.dir,'a.txt'),folder=path.join(h.dir,'folder');fs.writeFileSync(a,'content');fs.mkdirSync(folder);h.handlers.get('favorites-add')(null,[a,folder],['Work']);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};let confirmed=0;h.dialog.showMessageBox=async(parent,options)=>{assert.equal(parent,mini);assert.equal(options.defaultId,1);confirmed++;return {response:0};};h.rawHandlers.get('floating-tag-menu')(event,'work','');await h.popup().template.find(item=>item.label?.startsWith('批次開啟檔案')).click();assert.deepEqual(h.opened,[a,folder]);assert.equal(confirmed,1);h.opened.length=0;h.rawHandlers.get('floating-tag-menu')(event,'work','');await h.popup().template.find(item=>item.label?.startsWith('批次開啟所在')).click();assert.deepEqual(h.opened,[h.dir]);h.opened.length=0;h.dialog.showMessageBox=async()=>({response:1});h.rawHandlers.get('floating-tag-menu')(event,'work','');await h.popup().template.find(item=>item.label?.startsWith('批次開啟檔案')).click();assert.deepEqual(h.opened,[]);assert.throws(()=>h.rawHandlers.get('favorites-open-locations')(event,[]),/不受信任/);});
test('header native menu remains available while collapsed and saves, restores and resets default size',async t=>{const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}},menu=()=>h.rawHandlers.get('floating-header-menu')(event);mini.bounds.width=430;mini.bounds.height=510;h.handlers.get('floating-collapse')(null,true);menu();assert.equal(h.popup().options.window,mini);await h.popup().template.find(item=>item.label?.startsWith('將目前展開大小')).click();assert.equal(h.handlers.get('desktop-settings-get')().floatingDefaultWidth,430);assert.equal(mini.bounds.width,430);mini.bounds.width=300;menu();await h.popup().template.find(item=>item.label?.startsWith('展開並套用預設')).click();assert.equal(mini.bounds.width,430);menu();await h.popup().template.find(item=>item.label==='保持置頂').click();assert.equal(mini.onTop,false);menu();await h.popup().template.find(item=>item.label?.startsWith('重設預設大小')).click();assert.equal(mini.bounds.width,320);assert.equal(mini.bounds.height,400);menu();await h.popup().template.find(item=>item.label==='關閉浮動工具（隱藏）').click();assert.equal(mini.visible,false);assert.equal(h.windows[0].visible,true);assert.throws(()=>h.rawHandlers.get('floating-header-menu')({sender:{},senderFrame:{url:mini.url}}),/不受信任/);});
test('collapsed resize IPC publishes independent width while preserving expanded geometry',t=>{const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};mini.bounds.width=450;mini.bounds.height=520;h.handlers.get('desktop-settings-set')(null,{floatingCollapsedWidth:170});h.handlers.get('floating-collapse')(null,true);assert.equal(mini.bounds.width,170);const gesture=h.rawHandlers.get('floating-drag-start')(event,'resize-right');h.rawHandlers.get('floating-drag-move')(event,gesture.token,40,0);const result=h.rawHandlers.get('floating-drag-end')(event,gesture.token);assert.equal(result.settings.floatingCollapsedWidth,210);assert.equal(h.handlers.get('desktop-settings-get')().floatingCollapsedWidth,210);h.handlers.get('floating-collapse')(null,false);assert.equal(mini.bounds.width,450);assert.equal(mini.bounds.height,520);});
test('workspace IPC exports directly openable paths and keeps notes routes off the floating bridge',async t=>{const h=harness(t);const state=h.handlers.get('notes-template')(),sheet=state.document.sheets[0],file=path.join(h.dir,'source.txt');fs.writeFileSync(file,'content');const saved=h.handlers.get('favorites-add')(null,[file],[]),input={sheetId:sheet.id,title:'CLIENT_1',notes:'<script>not executed</script>',tags:[],values:{},favoriteIds:saved.ids,keepUnlinked:[]};const result=h.handlers.get('notes-record-save')(null,input),record=result.document.records[0];await h.handlers.get('notes-open-link')(null,record.id,0,'open');assert.deepEqual(h.opened,[file]);assert.throws(()=>h.handlers.get('notes-record-save')(null,{...input,favoriteIds:['not-a-favorite']}));h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};for(const channel of ['notes-share-status','notes-share-choose','notes-share-configure','notes-share-check','notes-share-publish','notes-share-load','notes-context-menu','notes-add-paths','notes-choose-paths','notes-client-details','notes-batch-trash','notes-area-save','notes-area-remove','notes-record-duplicate','notes-copy','notes-get','notes-template','notes-sheet-save','notes-record-save','notes-trash','notes-history','notes-history-restore','notes-favorites','notes-open-link','notes-inspect-links','notes-export-preview','notes-export-save','notes-import-choose','notes-import-preview','notes-import-commit','notes-backup-choose','notes-backup-restore'])assert.throws(()=>h.rawHandlers.get(channel)(event),/不受信任/);const preview=h.handlers.get('notes-export-preview')(null,{scope:'all'}),out=path.join(h.dir,'share.json');h.dialog.showSaveDialog=async()=>({canceled:false,filePath:out});await h.handlers.get('notes-export-save')(null,preview.token);const packageData=JSON.parse(fs.readFileSync(out,'utf8'));assert.equal(packageData.document.records[0].fileLinks[0].favoriteId,null);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[out]});await h.handlers.get('notes-import-choose')();const incoming=h.handlers.get('notes-import-preview')(null,'copy');const imported=h.handlers.get('notes-import-commit')(null,incoming.token),copy=imported.document.records.find(item=>item.id!==record.id);await h.handlers.get('notes-open-link')(null,copy.id,0,'open');assert.deepEqual(h.opened,[file,file]);assert.equal(fs.readFileSync(file,'utf8'),'content');});
test('workspace group and quick-action IPC copies sanitized tables and duplicates local records',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(null,'projects'),sheet=state.document.sheets[0],area=state.document.areas[0];assert.equal(area.name,'專案管理');const created=h.handlers.get('notes-record-save')(null,{sheetId:sheet.id,title:'=1+1',notes:'Notes',tags:[],values:{},favoriteIds:[],keepUnlinked:[]}),record=created.document.records[0];h.handlers.get('notes-copy')(null,{kind:'table',ids:[record.id],sheetId:sheet.id});assert.match(h.getCopied(),/'=1\+1/);const copied=h.handlers.get('notes-record-duplicate')(null,record.id,record.version);assert.equal(copied.document.records.length,2);const renamed=h.handlers.get('notes-area-save')(null,{...area,name:'New group',baseRevision:copied.revision});assert.equal(renamed.document.areas[0].name,'New group');const removed=h.handlers.get('notes-area-remove')(null,area.id,renamed.revision);assert.equal(removed.document.records.length,2);assert.equal(removed.document.sheets[0].areaId,null);
});
test('workspace batch trash is main-only, checks revisions and keeps source files intact',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),root=state.document.sheets[0],contacts=state.document.sheets[1],source=path.join(h.dir,'keep.txt');fs.writeFileSync(source,'keep');const favorite=h.handlers.get('favorites-add')(null,[source],[]),client=h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'Client',notes:'',tags:[],values:{},favoriteIds:[],keepUnlinked:[]}),id=client.result.id;h.handlers.get('notes-record-save')(null,{sheetId:contacts.id,title:'Name only',notes:'',tags:[],values:{[contacts.fields[0].id]:[id]},favoriteIds:favorite.ids,keepUnlinked:[]});const next=h.handlers.get('notes-get')(),record=next.document.records.find(record=>record.id===id);assert.throws(()=>h.handlers.get('notes-batch-trash')(null,[{id,version:record.version}],true,next.revision-1),/已變更/);const result=h.handlers.get('notes-batch-trash')(null,[{id,version:record.version}],true,next.revision);assert.equal(result.result.count,2);assert.equal(fs.readFileSync(source,'utf8'),'keep');
});
test('workspace direct paths and explicit tag links are locally authorized and cannot be forged on import',async t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),sheet=state.document.sheets[0],source=path.join(h.dir,'doc.txt');fs.writeFileSync(source,'keep');const files=h.handlers.get('notes-add-paths')(null,[source]);h.handlers.get('favorites-add-tags')(null,files.ids,['Docs']);const input={sheetId:sheet.id,title:'Client',notes:'',tags:[],values:{},favoriteIds:files.ids,keepUnlinked:[],favoriteTags:['Docs'],keepPendingTags:[]},result=h.handlers.get('notes-record-save')(null,input);assert.equal(result.document.records[0].favoriteTagLinks[0].authorized,true);assert.throws(()=>h.handlers.get('notes-record-save')(null,{...input,favoriteTags:['Unknown']}),/標籤已變更/);const forged=h.handlers.get('notes-record-save')(null,{...input,title:'Forged',favoriteTags:undefined,keepPendingTags:undefined,favoriteTagLinks:[{tag:'Unknown',authorized:true}]});assert.deepEqual(forged.document.records[1].favoriteTagLinks,[]);assert.throws(()=>h.handlers.get('notes-record-save')(null,{...input,favoriteTags:[],keepPendingTags:['Unknown']}),/分享標籤/);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});const chosen=await h.handlers.get('notes-choose-paths')(null,'file');assert.ok(chosen.ids.length);h.dialog.showOpenDialog=async()=>({canceled:true});assert.equal((await h.handlers.get('notes-choose-paths')(null,'folder')).canceled,true);assert.equal(fs.readFileSync(source,'utf8'),'keep');
});
test('workspace native menus offer master and table actions without group management',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),area=state.document.areas[0],sheet=state.document.sheets[1];h.handlers.get('notes-context-menu')(null,'area',area.id);const entries=h.popup().template;assert.ok(!entries.some(item=>item.label?.includes('群組')));entries.find(item=>item.label==='匯出主表及明細').click();const message=h.messages.find(item=>item[0]==='notes-context-action');assert.equal(message[1].id,area.id);assert.equal(message[1].command,'export-area');h.handlers.get('notes-context-menu')(null,'sheet',sheet.id);assert.ok(!h.popup().template.some(item=>item.label?.includes('群組')));assert.throws(()=>h.handlers.get('notes-context-menu')(null,'sheet','unknown'),/表格已變更/);
});
test('shared workspace snapshots require opt-in and import through the existing preview workflow',async t=>{
 const {fork}=require('node:child_process'),h=harness(t,{utilityProcess:{fork(modulePath){const child=fork(modulePath,{silent:true});child.postMessage=value=>child.send(value);return child;}}}),folder=path.join(h.dir,'share');fs.mkdirSync(folder);const initial=h.handlers.get('notes-share-status')();assert.equal(initial.enabled,false);assert.equal(h.handlers.get('app-info')().offline,true);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});await h.handlers.get('notes-share-choose')();assert.equal(fs.readdirSync(folder).length,0);h.handlers.get('notes-template')();h.handlers.get('notes-share-configure')(null,{enabled:true});assert.equal(h.handlers.get('app-info')().offline,false);const published=await h.handlers.get('notes-share-publish')();assert.ok(published.name);const checked=await h.handlers.get('notes-share-check')();assert.equal(checked.total,1);await h.handlers.get('notes-share-load')(null,checked.files[0].name);const preview=h.handlers.get('notes-import-preview')(null,'copy');assert.ok(preview.token);h.handlers.get('notes-share-configure')(null,{enabled:false});assert.equal(h.handlers.get('app-info')().offline,true);assert.equal(fs.readdirSync(folder).length,1);
});

test('floating workspace can read curated master summaries and open quick add, but cannot mutate tables or run imports',async t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),[root,contacts]=state.document.sheets,record=h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'Acme',notes:'secret',tags:[],values:{},favoriteIds:[],keepUnlinked:[]}).document.records[0];h.handlers.get('notes-record-save')(null,{sheetId:contacts.id,title:'Alice',notes:'',tags:[],values:{[contacts.fields[0].id]:[record.id],[contacts.fields.find(field=>field.type==='phone').id]:'87654321'},favoriteIds:[],keepUnlinked:[]});h.handlers.get('notes-pin')(null,record.id);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};const list=h.rawHandlers.get('floating-workspace-list')(event,'87654321');assert.equal(list.items[0].id,record.id);assert.equal(list.items[0].pinned,true);assert.equal(list.items[0].notes,undefined);for(const channel of ['notes-tools-get','notes-view-save','notes-tool-remove','notes-template-save','notes-template-apply','notes-pin','notes-grid-save','notes-batch-sheets','notes-batch-areas','notes-navigation'])assert.throws(()=>h.rawHandlers.get(channel)(event),/不受信任/);h.rawHandlers.get('floating-workspace-open')(event,record.id,'menu');const add=h.popup().template.find(item=>item.label==='＋ 新增聯絡人');add.click();const navigation=h.handlers.get('notes-navigation')();assert.equal(navigation.recordId,record.id);assert.equal(navigation.sheetId,contacts.id);assert.equal(h.handlers.get('notes-navigation')(),null);assert.throws(()=>h.rawHandlers.get('floating-workspace-open')(event,'bad','open'),/已移除/);h.rawHandlers.get('floating-workspace-open')(event,null,'home');assert.equal(h.handlers.get('notes-navigation')().home,true);
});

test('release history and all visible version surfaces use the app version; floating quick create/copy remain curated',async t=>{
 const h=harness(t),info=h.handlers.get('app-info')();assert.equal(info.version,require('../package.json').version);assert.equal(info.history[0].version,info.version);for(const version of ['1.26.0','1.27.0','1.28.0'])assert.ok(info.history.some(item=>item.version===version));const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');assert.match(html,/id="app-version"/);assert.match(html,/id="info-history"/);assert.doesNotMatch(html,/class="version">v1\.25/);
 const state=h.handlers.get('notes-template')(),root=state.document.sheets[0],id=h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'Acme',notes:'Not copied',tags:[],values:{},favoriteIds:[],keepUnlinked:[]}).result.id;h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};h.rawHandlers.get('floating-workspace-open')(event,id,'copy');assert.equal(h.getCopied(),'Acme');h.rawHandlers.get('floating-workspace-new')(event);h.popup().template[0].click();assert.equal(h.handlers.get('notes-navigation')().newMasterSheetId,root.id);for(const channel of ['notes-tabular-file','notes-tabular-preview','notes-tabular-commit'])assert.throws(()=>h.rawHandlers.get(channel)(event),/不受信任/);assert.equal(h.rawHandlers.get('floating-view')(event,'mixed').settings.floatingView,'mixed');
});

test('native Excel choose, mapping preview and confirmed commit create details with no changes before confirmation',async t=>{
 const h=harness(t),JSZip=require('jszip'),zip=new JSZip();zip.file('xl/workbook.xml','<workbook xmlns:r="urn:r"><sheets><sheet name="Contacts" r:id="r1"/></sheets></workbook>');zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>');zip.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Phone</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Alice</t></is></c><c r="B2" t="inlineStr"><is><t>00123</t></is></c></row></sheetData></worksheet>');const file=path.join(h.dir,'contacts.xlsx');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});const source=await h.handlers.get('notes-tabular-file')();assert.equal(source.name,'contacts.xlsx');const template=h.handlers.get('notes-template')(),[root,contacts]=template.document.sheets,id=h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},favoriteIds:[],keepUnlinked:[]}).result.id,current=h.handlers.get('notes-get')(),M=require('../src/notes-model'),preview=h.handlers.get('notes-tabular-preview')(null,{sheetId:contacts.id,masterId:id,revision:current.revision,rows:source.sheets[0].rows,header:true,dateFormat:'ymd',mapping:M.suggestMapping(contacts,source.sheets[0].rows,true)});assert.equal(preview.count,1);assert.equal(h.handlers.get('notes-get')().document.records.length,1);const result=h.handlers.get('notes-tabular-commit')(null,preview.token),record=result.document.records.find(record=>record.title==='Alice');assert.equal(record.values[contacts.fields.find(field=>field.type==='phone').id],'00123');assert.deepEqual(record.values[contacts.fields[0].id],[id]);assert.ok(fs.existsSync(result.result.backup));
});

test('app-wide search uses stored metadata and clipboard only, and rejects floating-window IPC',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),root=state.document.sheets[0];h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'SearchClient',notes:'Search note',tags:[],values:{},favoriteIds:[],keepUnlinked:[]});const r=h.handlers.get('studio-search')(null,'SearchClient',{sources:['records']},{});assert.equal(r.sections[0].items[0].title,'SearchClient');assert.equal(h.opened.length,0);h.handlers.get('studio-search-copy')(null,'C:\\Pending\\path.txt');assert.equal(h.getCopied(),'C:\\Pending\\path.txt');h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};for(const channel of ['studio-search','studio-search-copy'])assert.throws(()=>h.rawHandlers.get(channel)(event,'SearchClient'),/不受信任/);assert.throws(()=>h.handlers.get('studio-search')(null,'x'.repeat(257)),/搜尋文字/);
});

test('native preference defaults are complete, detached and restricted to the main window',t=>{const h=harness(t),defaults=h.handlers.get('desktop-settings-defaults')();assert.deepEqual(JSON.parse(JSON.stringify(defaults)),JSON.parse(JSON.stringify(require('../src/desktop-state').DEFAULTS)));defaults.floatingHiddenButtons.push('main');assert.equal(h.handlers.get('desktop-settings-defaults')().floatingHiddenButtons.length,0);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};assert.throws(()=>h.rawHandlers.get('desktop-settings-defaults')(event),/不受信任/);});

test('home returns local overview metadata and only the main window can request the snapshot',t=>{const h=harness(t),state=h.handlers.get('notes-template')(),root=state.document.sheets[0];h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'DashboardClient',notes:'Hidden note',tags:[],values:{},favoriteIds:[],keepUnlinked:[]});const snapshot=h.handlers.get('studio-home')();assert.equal(snapshot.counts.groups,1);assert.equal(snapshot.counts.masters,1);assert.equal(snapshot.recentRecords[0].title,'DashboardClient');assert.doesNotMatch(JSON.stringify(snapshot),/Hidden note/);assert.equal(h.opened.length,0);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};assert.throws(()=>h.rawHandlers.get('studio-home')(event),/不受信任/);});

test('floating header context menu can restore hidden collapse and close controls',async t=>{const h=harness(t);h.handlers.get('floating-show')();h.handlers.get('desktop-settings-set')(null,{floatingHiddenButtons:['collapse','close']});const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};h.rawHandlers.get('floating-header-menu')(event);const controls=h.popup().template.find(item=>item.label==='標題列按鈕').submenu;assert.equal(controls[0].checked,false);assert.equal(controls[1].checked,false);await controls[0].click();assert.deepEqual(Array.from(h.handlers.get('desktop-settings-get')().floatingHiddenButtons),['close']);});

test('folder move IPC journals destination identities and keeps folder and child bookmarks ready through undo',t=>{
 const {dir,handlers,historyPath}=harness(t),root=path.join(dir,'Client'),child=path.join(root,'a.txt'),target=path.join(dir,'out');fs.mkdirSync(root);fs.mkdirSync(path.join(root,'Empty'));fs.mkdirSync(target);fs.writeFileSync(child,'content');handlers.get('favorites-add')(null,[root,child],['Work']);const preview=handlers.get('move-preview')(null,[root],target);const result=handlers.get('move-files')(null,[root],target,preview);assert.equal(result.changed,3);const journal=JSON.parse(fs.readFileSync(historyPath));assert.equal(journal.version,3);assert.equal(journal.state,'completed');assert.ok(journal.moves.every(move=>move.destinationFingerprint));assert.ok(handlers.get('favorites-list')().items.every(item=>item.status==='ready'&&item.path.startsWith(target+path.sep)));handlers.get('undo')();assert.equal(fs.readFileSync(child,'utf8'),'content');assert.ok(handlers.get('favorites-list')().items.every(item=>item.status==='ready'&&[root,child].includes(item.path)));
});
test('copy fallback IPC synchronizes new bookmark identities in movement, undo and failure recovery',t=>{
 const coreFile=path.resolve(__dirname,'../src/move-core.js'),module={exports:{}},actual=createRequire(coreFile);let failUnlink=null;const mockedFs=new Proxy(fs,{get:(target,key)=>key==='linkSync'?()=>{throw Object.assign(new Error('cross device'),{code:'EXDEV'});}:key==='unlinkSync'?filepath=>{if(filepath===failUnlink){failUnlink=null;throw new Error('locked source');}return fs.unlinkSync(filepath);}:target[key]});vm.runInNewContext(fs.readFileSync(coreFile,'utf8'),{module,require:name=>name==='node:fs'?mockedFs:actual(name)},{filename:coreFile});const {dir,handlers}=harness(t,{'./move-core':module.exports}),a=path.join(dir,'a.txt'),b=path.join(dir,'b.txt'),target=path.join(dir,'out');fs.writeFileSync(a,'alpha');fs.writeFileSync(b,'beta');fs.mkdirSync(target);handlers.get('favorites-add')(null,[a,b],['Work']);const first=handlers.get('move-preview')(null,[a,b],target);handlers.get('move-files')(null,[a,b],target,first);assert.ok(handlers.get('favorites-list')().items.every(item=>item.status==='ready'));handlers.get('undo')();assert.ok(handlers.get('favorites-list')().items.every(item=>item.status==='ready'));failUnlink=b;const second=handlers.get('move-preview')(null,[a,b],target);assert.throws(()=>handlers.get('move-files')(null,[a,b],target,second),/已還原來源/);assert.ok(handlers.get('favorites-list')().items.every(item=>item.status==='ready'&&[a,b].includes(item.path)));assert.equal(fs.readFileSync(a,'utf8'),'alpha');assert.equal(fs.readFileSync(b,'utf8'),'beta');
});
test('tag delete IPC optionally removes bookmark links while keeping the actual file and unrelated bookmarks',t=>{
 const {dir,handlers}=harness(t),a=path.join(dir,'a.txt'),b=path.join(dir,'b.txt');fs.writeFileSync(a,'a');fs.writeFileSync(b,'b');const saved=handlers.get('favorites-add')(null,[a],['Work','Other']);handlers.get('favorites-add')(null,[b],['Other']);assert.throws(()=>handlers.get('favorites-manage-tag')(null,'Work',null,1,{removeFavorites:true,expectedIds:['wrong']}),/項目已變更/);assert.equal(handlers.get('favorites-list')().items.length,2);const result=handlers.get('favorites-manage-tag')(null,'work',null,1,{removeFavorites:true,expectedIds:saved.ids});assert.equal(result.removed,1);assert.equal(handlers.get('favorites-list')().items.length,1);assert.equal(fs.readFileSync(a,'utf8'),'a');assert.equal(fs.readFileSync(b,'utf8'),'b');
});

test('physical removal requires a cancel-default native second confirmation',async t=>{
 const {dir,handlers,dialog,shell,messages}=harness(t),source=path.join(dir,'trash.txt');fs.writeFileSync(source,'keep');const ids=handlers.get('favorites-add')(null,[source],['Work']).ids;let confirmations=0,called=0;
 dialog.showMessageBox=async(_,options)=>{confirmations++;assert.equal(options.defaultId,1);assert.equal(options.cancelId,1);assert.match(options.detail,/trash\.txt/);assert.match(options.title,/第二次確認/);return {response:1};};shell.trashItem=async()=>called++;
 const canceled=await handlers.get('favorites-remove')(null,ids,{trashFiles:true});assert.equal(canceled.canceled,true);assert.equal(confirmations,1);assert.equal(called,0);assert.ok(fs.existsSync(source));assert.equal(handlers.get('favorites-list')().items.length,1);
 dialog.showMessageBox=async()=>({response:0});shell.trashItem=async p=>{called++;fs.unlinkSync(p);};const result=await handlers.get('favorites-remove')(null,ids,{trashFiles:true});assert.equal(result.trashed,1);assert.equal(called,1);assert.equal(handlers.get('favorites-list')().items.length,0);assert.ok(messages.some(([channel,payload])=>channel==='favorites-changed'&&payload.trashedPaths?.includes(source)));
});
test('tag recycling catches membership changes during second confirmation and keeps every file',async t=>{
 const {dir,handlers,dialog,shell}=harness(t),a=path.join(dir,'a.txt'),b=path.join(dir,'b.txt');fs.writeFileSync(a,'a');fs.writeFileSync(b,'b');const ids=handlers.get('favorites-add')(null,[a],['Work']).ids;
 dialog.showMessageBox=async()=>{handlers.get('favorites-add')(null,[b],['Work']);return {response:0};};shell.trashItem=async()=>assert.fail('must not trash');await assert.rejects(handlers.get('favorites-manage-tag')(null,'Work',null,1,{removeFavorites:true,expectedIds:ids,trashFiles:true}),/已變更/);assert.equal(fs.readFileSync(a,'utf8'),'a');assert.equal(handlers.get('favorites-list')().items.length,2);
});
test('numbering move IPC rejects a stale target without silently allocating a new name',t=>{
 const {dir,handlers,historyPath}=harness(t),source=path.join(dir,'a.txt'),target=path.join(dir,'target');fs.writeFileSync(source,'source');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'a.txt'),'existing');const options={conflict:'number'},plan=handlers.get('move-preview')(null,[source],target,options);assert.match(plan[0].destination,/a\(1\)\.txt$/);fs.writeFileSync(plan[0].destination,'racing');assert.throws(()=>handlers.get('move-files')(null,[source],target,plan,options),/預覽已變更/);assert.equal(fs.readFileSync(source,'utf8'),'source');assert.equal(fs.existsSync(historyPath),false);
});
test('move scope IPC resolves sources without pickers and rejects a changed complete-folder preview',t=>{
 const {dir,handlers,historyPath}=harness(t),root=path.join(dir,'Client'),target=path.join(dir,'target');fs.mkdirSync(root);fs.mkdirSync(target);const a=path.join(root,'a.txt');fs.writeFileSync(a,'a');const resolved=handlers.get('move-sources')(null,[a],'folders');assert.deepEqual(resolved,[root]);const options={scope:'folders'},plan=handlers.get('move-preview')(null,[a],target,options);assert.equal(plan[0].kind,'folder');fs.writeFileSync(path.join(root,'new.txt'),'new');assert.throws(()=>handlers.get('move-files')(null,[a],target,plan,options),/預覽已變更/);assert.equal(fs.existsSync(historyPath),false);assert.equal(fs.readFileSync(a,'utf8'),'a');assert.deepEqual(fs.readdirSync(target),[]);
});

test('floating quick capture validates stored targets, queues forms without saving, and prevents pending request replacement',t=>{
 const h=harness(t);h.handlers.get('desktop-settings-set')(null,{floatingQuickMode:'main'});const state=h.handlers.get('notes-template')(),[root,detail]=state.document.sheets;
 const created=h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},favoriteIds:[],keepUnlinked:[]}),master=created.result.id;
 const action={id:require('node:crypto').randomUUID(),type:'new-record',label:'新增聯絡人',sheetId:detail.id,masterId:master,enabled:true};h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[action]});
 const options=h.handlers.get('quick-action-options')();assert.equal(options.sheets.find(s=>s.id===detail.id).parentSheetId,root.id);assert.equal(options.masters[0].id,master);
 h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};
 for(const channel of ['quick-action-options','desktop-settings-set'])assert.throws(()=>h.rawHandlers.get(channel)(event),/不受信任/);
 assert.equal(h.rawHandlers.get('floating-quick-action')(event,action.id).opened,true);assert.equal(h.handlers.get('notes-get')().document.records.length,1);assert.throws(()=>h.rawHandlers.get('floating-quick-action')(event,action.id),/仍待開啟/);
 const target=h.handlers.get('notes-navigation')();assert.equal(target.newRecordSheetId,detail.id);assert.equal(target.masterId,master);assert.equal(h.handlers.get('notes-navigation')(),null);
 h.handlers.get('notes-trash')(null,'record',master,created.document.records[0].version,false);assert.throws(()=>h.rawHandlers.get('floating-quick-action')(event,action.id),/主紀錄/);
 h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[{...action,type:'open-sheet',masterId:undefined}]});h.rawHandlers.get('floating-quick-action')(event,action.id);assert.equal(h.handlers.get('notes-navigation')().openSheetId,detail.id);
 h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[{...action,enabled:false}]});assert.throws(()=>h.rawHandlers.get('floating-quick-action')(event,action.id),/停用/);
 assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[{...action,type:'command'}]}),/無效/);
 h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[{...action,sheetId:require('node:crypto').randomUUID(),masterId:undefined}]});assert.throws(()=>h.rawHandlers.get('floating-quick-action')(event,action.id),/表格已移除/);
});
test('tagged clipboard shortcut queues a review without importing files and respects clipboard opt-in and size bounds',t=>{
 const h=harness(t);h.handlers.get('desktop-settings-set')(null,{floatingQuickMode:'main'});const file=path.join(h.dir,'original.txt');fs.writeFileSync(file,'original');let reads=0;h.clipboard.readText=()=>{reads++;return file;};
 const action={id:require('node:crypto').randomUUID(),type:'import-paths',label:'匯入合約',enabled:true,tags:['合約'],useClipboard:true};h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[action]});h.handlers.get('floating-quick-action')(null,action.id);assert.throws(()=>h.handlers.get('floating-quick-action')(null,action.id),/仍待開啟/);
 const result=h.handlers.get('favorites-list')();assert.equal(result.items.length,0);assert.deepEqual(Array.from(result.importRequest.tags),['合約']);assert.equal(result.importRequest.text,file);assert.equal(fs.readFileSync(file,'utf8'),'original');assert.equal(reads,1);assert.equal(h.handlers.get('favorites-list')().importRequest,null);
 h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[{...action,useClipboard:false}]});h.handlers.get('floating-quick-action')(null,action.id);assert.equal(h.handlers.get('favorites-list')().importRequest.text,'');assert.equal(reads,1);
 h.clipboard.readText=()=> 'x'.repeat(2*1024*1024+1);h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[action]});assert.throws(()=>h.handlers.get('floating-quick-action')(null,action.id),/2 MB/);assert.equal(h.handlers.get('favorites-list')().items.length,0);
});

test('quick popup imports remain beside pinned floating tools, keep main hidden and allow only their own IPC',t=>{
 const h=harness(t),file=path.join(h.dir,'contract.txt');fs.writeFileSync(file,'content');const action={id:require('node:crypto').randomUUID(),type:'import-paths',label:'合約',tags:['合約'],useClipboard:true,enabled:true};h.clipboard.readText=()=>file;h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[action]});h.handlers.get('floating-show')();const main=h.windows[0],mini=h.windows[1];main.hide();const event={sender:mini.webContents,senderFrame:{url:mini.url}};assert.equal(h.rawHandlers.get('floating-quick-action')(event,action.id).popup,true);const popup=h.windows[2],popupEvent={sender:popup.webContents,senderFrame:{url:popup.url}};assert.equal(main.visible,false);assert.equal(mini.visible,true);assert.equal(popup.options.parent,mini);assert.equal(popup.options.alwaysOnTop,true);assert.equal(h.rawHandlers.get('floating-capture-get')(popupEvent).text,file);
 for(const source of [event,{sender:mini.webContents,senderFrame:{url:popup.url}},{sender:{},senderFrame:{url:popup.url}}])assert.throws(()=>h.rawHandlers.get('floating-capture-get')(source),/不受信任/);
 for(const channel of ['notes-get','notes-record-save','favorites-list','desktop-settings-set','floating-quick-action'])assert.throws(()=>h.rawHandlers.get(channel)(popupEvent),/不受信任/);
 const preview=h.rawHandlers.get('floating-capture-preview')(popupEvent,{text:file,tags:['合約']});assert.equal(h.handlers.get('favorites-list')().items.length,0);h.rawHandlers.get('floating-capture-commit')(popupEvent,preview.token);assert.equal(h.handlers.get('favorites-list')().items.length,1);assert.equal(main.visible,false);assert.equal(mini.visible,true);h.rawHandlers.get('floating-capture-close')(popupEvent);assert.equal(popup.destroyed,true);
 h.handlers.get('desktop-settings-set')(null,{floatingQuickMode:'main'});h.rawHandlers.get('floating-quick-action')(event,action.id);assert.equal(main.visible,true);assert.equal(mini.visible,true);assert.equal(h.handlers.get('favorites-list')().importRequest.text,file);
});
test('configured file drops route to record previews or an outside native choice menu without opening main',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),sheet=state.document.sheets[0],file=path.join(h.dir,'item.txt');fs.writeFileSync(file,'unchanged');const action={id:require('node:crypto').randomUUID(),type:'new-record',label:'建立檔案紀錄',sheetId:sheet.id,enabled:true};h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[action],floatingDropMode:'records',floatingDropActionId:action.id});h.handlers.get('floating-show')();const main=h.windows[0],mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};main.hide();assert.equal(h.rawHandlers.get('floating-drop')(event,[file],null).popup,true);let popup=h.windows[2],pe={sender:popup.webContents,senderFrame:{url:popup.url}};const data=h.rawHandlers.get('floating-capture-get')(pe);assert.equal(data.kind,'drop-records');const p=h.rawHandlers.get('floating-capture-preview')(pe,{title:'',notes:'',tags:[],values:{}});assert.equal(h.handlers.get('notes-get')().document.records.length,0);h.rawHandlers.get('floating-capture-commit')(pe,p.token);assert.equal(h.handlers.get('notes-get')().document.records.length,1);assert.equal(main.visible,false);h.rawHandlers.get('floating-capture-close')(pe);
 h.handlers.get('desktop-settings-set')(null,{floatingDropMode:'ask'});assert.equal(h.rawHandlers.get('floating-drop')(event,[file],null).menu,true);assert.equal(h.popup().options.window,mini);assert.match(h.popup().template[2].label,/建立表格紀錄/);h.popup().template[2].click();popup=h.windows[3];assert.ok(popup);assert.equal(main.visible,false);assert.equal(mini.visible,true);assert.equal(fs.readFileSync(file,'utf8'),'unchanged');
});

test('custom floating titles persist, update native windows immediately, restore blank defaults and reject invalid input',t=>{
 const h=harness(t);h.handlers.get('desktop-settings-set')(null,{floatingTitle:'  我的資料 <工作>  '});assert.equal(h.handlers.get('desktop-settings-get')().floatingTitle,'我的資料 <工作>');h.handlers.get('floating-show')();let mini=h.windows[1];assert.equal(mini.options.title,'Bulk File Studio · 我的資料 <工作>');h.handlers.get('desktop-settings-set')(null,{floatingTitle:'快捷工作台'});assert.equal(mini.title,'Bulk File Studio · 快捷工作台');assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'desktop-state.json'),'utf8')).settings.floatingTitle,'快捷工作台');
 for(const value of [null,42,'x'.repeat(41),'line\nfeed','bad\x00title'])assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{floatingTitle:value}),/標題最多 40/);assert.equal(h.handlers.get('desktop-settings-get')().floatingTitle,'快捷工作台');h.handlers.get('desktop-settings-set')(null,{floatingTitle:''});assert.equal(mini.title,'Bulk File Studio · 浮動工具');mini.destroy();h.handlers.get('floating-show')();mini=h.windows[2];assert.equal(mini.options.title,'Bulk File Studio · 浮動工具');
 const desktop=require('../src/desktop-state');assert.equal(desktop.normalize({floatingTitle:'bad\nvalue'}).floatingTitle,'浮動工具');const exported=require('../src/settings-export').createSettingsExport({settings:{},rules:{}},{floatingTitle:'我的資料'},'1.39.2');assert.equal(exported.desktop.floatingTitle,'我的資料');
});

test('fast mode is the default and history retains it after settings change; mismatched confirmation never renames',t=>{
 const h=harness(t),source=path.join(h.dir,'a.txt');fs.writeFileSync(source,'A');assert.equal(h.handlers.get('desktop-settings-get')().renameVerification,'fast');assert.throws(()=>h.handlers.get('rename')(null,[source],{prefix:'x_'},undefined,'full'),/模式已變更/);assert.equal(fs.existsSync(source),true);const result=h.handlers.get('rename')(null,[source],{prefix:'x_'}),saved=JSON.parse(fs.readFileSync(h.historyPath));assert.equal(saved.version,4);assert.equal(saved.verification,'fast');assert.equal(saved.moves[0].expectedFingerprint.sha256,undefined);h.handlers.get('desktop-settings-set')(null,{renameVerification:'full'});assert.equal(h.handlers.get('history')().verification,'fast');assert.equal(h.handlers.get('undo')().changed,1);assert.equal(fs.readFileSync(source,'utf8'),'A');assert.equal(result.changed,1);
});
test('full-mode IPC reports progress, blocks simultaneous file mutations and shutdown, and releases the lock on completion',async t=>{
 const h=harness(t),source=path.join(h.dir,'a.bin');fs.writeFileSync(source,Buffer.alloc(1024*1024,65));h.handlers.get('desktop-settings-set')(null,{renameVerification:'full'});const pending=h.handlers.get('rename')(null,[source],{prefix:'x_'},undefined,'full',{operationId:71});assert.throws(()=>h.handlers.get('rename')(null,[source],{prefix:'y_'}),/仍在執行/);assert.throws(()=>h.handlers.get('move-files')(),/仍在執行/);let prevented=false;h.events.get('before-quit')({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal((await pending).changed,1);assert.ok(h.messages.some(([channel,value])=>channel==='rename-progress'&&value.id===71&&value.detail.includes('MB')));h.handlers.get('desktop-settings-set')(null,{renameVerification:'fast'});assert.equal(h.handlers.get('history')().verification,'full');await h.handlers.get('undo')();assert.equal(fs.existsSync(source),true);assert.equal(h.handlers.get('rename')(null,[source],{prefix:'z_'}).changed,1);
});

test('diagnostic IPC records sync and async failures without saving arguments or altering errors',async t=>{
 const h=harness(t);assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{renameVerification:'secret-input'}),/模式無效/);
 h.shell.openPath=async()=> 'open failure';await assert.rejects(h.handlers.get('diagnostics-open')(),/open failure/);
 const status=h.handlers.get('diagnostics-status')(null,true);assert.ok(status.recent.some(row=>row.action==='desktop-settings-set'));assert.ok(status.recent.some(row=>row.action==='diagnostics-open'));assert.ok(!JSON.stringify(status.recent).includes('secret-input'));
 h.handlers.get('desktop-settings-set')(null,{diagnosticsEnabled:false});const count=h.handlers.get('diagnostics-status')(null,true).recent.length;assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{renameVerification:'another-invalid'}));assert.equal(h.handlers.get('diagnostics-status')(null,true).recent.length,count);
});
test('diagnostic renderer reports are bounded and management operations require main frame',async t=>{
 const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};
 assert.equal(h.rawHandlers.get('diagnostics-report')(event,{context:'test',message:'problem '+ 'x'.repeat(10000),clipboard:'PRIVATE-FORM',path:'PRIVATE-PATH'}).recorded,true);
 assert.throws(()=>h.rawHandlers.get('diagnostics-status')(event,true),/不受信任/);assert.throws(()=>h.rawHandlers.get('diagnostics-clear')(event),/不受信任/);
 const recent=h.handlers.get('diagnostics-status')(null,true).recent;assert.ok(recent.some(row=>row.source==='floating'&&row.message.length===6000));assert.ok(!JSON.stringify(recent).includes('PRIVATE-'));
 assert.throws(()=>h.rawHandlers.get('diagnostics-report')({sender:mini.webContents,senderFrame:{url:'https://evil.example'}},{message:'injected'}),/不受信任/);assert.ok(!JSON.stringify(h.handlers.get('diagnostics-status')(null,true)).includes('injected'));
});
test('diagnostic export and clearing are explicit and cancellation preserves logs',async t=>{
 const h=harness(t);h.handlers.get('diagnostics-report')(null,{message:'example'});const file=path.join(h.dir,'report.json');h.dialog.showSaveDialog=async()=>({canceled:true});assert.equal((await h.handlers.get('diagnostics-export')()).canceled,true);assert.equal(fs.existsSync(file),false);
 h.dialog.showSaveDialog=async()=>({canceled:false,filePath:file});const exported=await h.handlers.get('diagnostics-export')();assert.equal(exported.count,1);const data=JSON.parse(fs.readFileSync(file));assert.equal(data.format,'BulkFileStudio.Diagnostics');assert.equal(data.entries[0].message,'example');assert.equal(data.environment.version,require('../package.json').version);
 h.dialog.showMessageBox=async(_,options)=>{assert.equal(options.defaultId,1);return {response:1};};assert.equal((await h.handlers.get('diagnostics-clear')()).canceled,true);assert.equal(h.handlers.get('diagnostics-status')(null,true).recent.length,1);
 h.dialog.showMessageBox=async()=>({response:0});assert.equal((await h.handlers.get('diagnostics-clear')()).removed,1);assert.equal(h.handlers.get('diagnostics-status')(null,true).recent.length,0);assert.equal(fs.existsSync(file),true);
});

test('shared updates establish baseline only after confirmed update import, require renderer idle and back up before auto apply',async t=>{
 const {fork}=require('node:child_process'),crypto=require('node:crypto'),M=require('../src/notes-model'),{perform,packageIdentity}=require('../src/notes-share-worker');
 const h=harness(t,{utilityProcess:{fork(modulePath){const child=fork(modulePath,{silent:true});child.postMessage=value=>child.send(value);return child;}}}),folder=path.join(h.dir,'shared');fs.mkdirSync(folder);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});await h.handlers.get('notes-share-choose')();
 const source=crypto.randomUUID(),document=M.template(()=>crypto.randomUUID(),'2026-11-02T00:00:00Z');let remoteRevision=0,publicationTime=Date.now();const publish=()=>{const result=perform({action:'publish',folder,deviceId:source,revision:++remoteRevision,data:M.exportPackage(document,{scope:'all'})});const name=result.name.replace('-'+packageIdentity(result.name).published+'-','-'+(publicationTime++)+'-');if(name!==result.name)fs.renameSync(path.join(folder,result.name),path.join(folder,name));return name;};
 h.handlers.get('notes-share-configure')(null,{enabled:true,followSource:source,receiveMode:'auto'});const first=publish();await h.handlers.get('notes-share-check')();assert.equal(h.handlers.get('notes-share-status')().lastAccepted,null);await h.handlers.get('notes-share-load')(null,first);const preview=h.handlers.get('notes-import-preview')(null,'update');h.handlers.get('notes-import-commit')(null,preview.token);assert.equal(h.handlers.get('notes-share-status')().lastAccepted.name,first);
 let idle=false;h.windows[0].webContents.send=(channel,id)=>{if(channel==='notes-share-idle-query')h.handlers.get('notes-share-idle')(null,id,idle);};document.areas[0].name='Changed remotely';const next=publish();await h.handlers.get('notes-share-check')();assert.equal(h.handlers.get('notes-share-status')().lastAccepted.name,first);idle=true;await h.handlers.get('notes-share-check')();const received=h.handlers.get('notes-share-status')();assert.equal(received.lastAccepted.name,next);assert.ok(fs.existsSync(received.lastAutoBackup));assert.equal(h.handlers.get('notes-get')().document.areas[0].name,'Changed remotely');
 h.handlers.get('notes-template')();document.areas[0].name='Second remote update';publish();await h.handlers.get('notes-share-check')();assert.equal(h.handlers.get('notes-share-status')().notice,null);const merged=h.handlers.get('notes-get')().document;assert.equal(merged.areas[0].name,'Second remote update');assert.equal(merged.areas.length,2);
});

test('shared reminders show one local desktop notification, open the app on click, and honour ignore and notification switches',async t=>{
 const {fork}=require('node:child_process'),crypto=require('node:crypto'),M=require('../src/notes-model'),{perform}=require('../src/notes-share-worker'),notices=[];
 class Notification{static isSupported(){return true;}constructor(options){this.options=options;this.events={};notices.push(this);}on(event,callback){this.events[event]=callback;}show(){this.shown=true;}close(){this.closed=true;}}
 const h=harness(t,{Notification,utilityProcess:{fork(modulePath){const child=fork(modulePath,{silent:true});child.postMessage=value=>child.send(value);return child;}}}),folder=path.join(h.dir,'share');fs.mkdirSync(folder);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});await h.handlers.get('notes-share-choose')();h.handlers.get('notes-share-configure')(null,{enabled:true});
 const source=crypto.randomUUID(),doc=M.template(()=>crypto.randomUUID(),'2026-11-02T00:00:00Z');perform({action:'publish',folder,deviceId:source,revision:1,data:M.exportPackage(doc,{scope:'all'})});await h.handlers.get('notes-share-check')();assert.equal(notices.length,1);assert.equal(notices[0].shown,true);assert.ok(!notices[0].options.body.includes(source));notices[0].events.click();assert.ok(h.messages.some(message=>message[0]==='notes-share-open-request'));await h.handlers.get('notes-share-check')();assert.equal(notices.length,1);
 h.handlers.get('notes-share-configure')(null,{desktopNotifications:false});await h.handlers.get('notes-share-check')();assert.equal(notices.length,1);h.handlers.get('notes-share-configure')(null,{receiveMode:'ignore',desktopNotifications:true});await h.handlers.get('notes-share-check')();assert.equal(notices.length,1);
});
test('import differences and audit sources stay main-only and preview cancellation does not write data',async t=>{
 const {fork}=require('node:child_process'),h=harness(t,{utilityProcess:{fork(modulePath){const child=fork(modulePath,{silent:true});child.postMessage=value=>child.send(value);return child;}}}),state=h.handlers.get('notes-template')(),folder=path.join(h.dir,'share');fs.mkdirSync(folder);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});const {perform}=require('../src/notes-share-worker'),M=require('../src/notes-model'),source=require('node:crypto').randomUUID();perform({action:'publish',folder,deviceId:source,revision:5,data:M.exportPackage(state.document,{scope:'all'})});await h.handlers.get('notes-share-choose')();h.handlers.get('notes-share-configure')(null,{enabled:true});const checked=await h.handlers.get('notes-share-check')();await h.handlers.get('notes-share-load')(null,checked.files[0].name);const preview=h.handlers.get('notes-import-preview')(null,'update');assert.equal(preview.context.sourceRevision,5);assert.equal(preview.context.source,source);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};assert.throws(()=>h.rawHandlers.get('notes-import-details')(event,preview.token,'id'),/不受信任/);h.handlers.get('notes-preview-cancel')(null,preview.token);assert.equal(h.handlers.get('notes-get')().revision,state.revision);assert.throws(()=>h.handlers.get('notes-import-commit')(null,preview.token),/失效/);
});

test('new page shortcuts stay within the app and reminder IPC schedules data without changing workspace revision',async t=>{const h=harness(t),id=require('node:crypto').randomUUID(),action={id,type:'open-page',label:'首頁',page:'home'};h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[action]});h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};h.rawHandlers.get('floating-quick-action')(event,id);assert.ok(h.messages.some(message=>message[0]==='open-app-page'&&message[1]==='home'));const sheet=h.handlers.get('notes-sheet-save')(null,{name:'Tasks',fields:[]}).document.sheets[0],state=h.handlers.get('notes-record-save')(null,{sheetId:sheet.id,title:'Call',values:{},notes:'',tags:[],favoriteIds:[],keepUnlinked:[]}),record=state.document.records[0];const result=h.handlers.get('reminders-save')(null,{recordId:record.id,at:new Date(Date.now()+3600000).toISOString(),repeat:'none',delivery:'overlay'});assert.equal(result.items.length,1);assert.equal(h.handlers.get('notes-get')().revision,state.revision);assert.throws(()=>h.rawHandlers.get('reminders-list')(event),/不受信任/);h.handlers.get('desktop-settings-set')(null,{remindersEnabled:false});assert.equal(h.handlers.get('reminders-ready')(null,true),false);});
test('package compatibility inspection is read-only and does not consume the workspace import preview',async t=>{const h=harness(t),before=h.handlers.get('notes-get')(),packet=require('../src/notes-model').exportPackage(before.document,{scope:'all'}),file=path.join(h.dir,'check.json');fs.writeFileSync(file,JSON.stringify(packet));h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});const result=await h.handlers.get('notes-check-package')();assert.equal(result.packageVersion,3);assert.equal(h.handlers.get('notes-get')().revision,before.revision);assert.equal(fs.existsSync(path.join(h.dir,'workspace-backups')),false);});

test('favorite and workspace changes refresh the open quick form catalog and stop after it closes',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),sheet=state.document.sheets[0],file=path.join(h.dir,'linked.txt');fs.writeFileSync(file,'Keep');const action={id:require('node:crypto').randomUUID(),type:'new-record',label:'Quick',sheetId:sheet.id,enabled:true};h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[action]});h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};h.rawHandlers.get('floating-quick-action')(event,action.id);const popup=h.windows[2],pe={sender:popup.webContents,senderFrame:{url:popup.url}},count=()=>h.messages.filter(([channel])=>channel==='floating-capture-choices-changed').length;
 let before=count();h.handlers.get('notes-add-paths')(null,[file]);assert.equal(count(),before+1);const items=h.handlers.get('favorites-list')().items;h.handlers.get('favorites-add-tags')(null,[items[0].id],['RemoveMe']);assert.ok(h.rawHandlers.get('floating-capture-get')(pe).tagOptions.includes('RemoveMe'));before=count();h.handlers.get('favorites-manage-tag')(null,'RemoveMe',null,1,{});assert.equal(count(),before+1);assert.ok(!h.rawHandlers.get('floating-capture-get')(pe).tagOptions.includes('RemoveMe'));
 before=count();h.handlers.get('notes-record-save')(null,{sheetId:sheet.id,title:'New',notes:'',tags:['Current'],values:{},favoriteIds:[],keepUnlinked:[]});assert.equal(count(),before+1);assert.ok(h.rawHandlers.get('floating-capture-get')(pe).tagOptions.includes('Current'));h.rawHandlers.get('floating-capture-close')(pe);before=count();h.handlers.get('notes-add-paths')(null,[file]);assert.equal(count(),before);assert.equal(fs.readFileSync(file,'utf8'),'Keep');
});

test('strong reminder IPC isolates its window, persists snooze and leaves workspace revision unchanged',t=>{
 const Actual=require('../src/record-reminders').RecordReminders;let store,clock=Date.now();const h=harness(t,{'./record-reminders':{RecordReminders:class extends Actual{constructor(file,options){super(file,{...options,now:()=>clock});store=this;}}}});let beeps=0;h.shell.beep=()=>beeps++;const sheet=h.handlers.get('notes-sheet-save')(null,{name:'Tasks',fields:[]}).document.sheets[0],state=h.handlers.get('notes-record-save')(null,{sheetId:sheet.id,title:'Strong',values:{},notes:'',tags:[],favoriteIds:[],keepUnlinked:[]}),record=state.document.records[0];h.handlers.get('reminders-save')(null,{recordId:record.id,at:new Date(clock+60000).toISOString(),repeat:'none',delivery:'attention'});clock+=61000;store.tick();const popup=h.windows.find(win=>win.url.endsWith('/reminder-attention.html'));assert.ok(popup);popup.emit('ready-to-show');assert.equal(beeps,1);const pe={sender:popup.webContents,senderFrame:{url:popup.url}},main={sender:h.windows[0].webContents,senderFrame:{url:h.windows[0].url}};assert.equal(h.rawHandlers.get('reminder-attention-get')(pe).items[0].title,'Strong');assert.throws(()=>h.rawHandlers.get('reminder-attention-get')(main),/不受信任/);assert.throws(()=>h.rawHandlers.get('notes-get')(pe),/不受信任/);const id=store.list().items[0].id;h.rawHandlers.get('reminder-attention-snooze')(pe,id);assert.equal(store.list().items[0].status,'pending');assert.equal(popup.destroyed,true);assert.equal(h.handlers.get('notes-get')().revision,state.revision);assert.throws(()=>h.rawHandlers.get('reminder-attention-ack')(pe,id),/不受信任/);
});

test('floating global search uses an outside owned panel, guards tokens and preserves the hidden main window until requested',async t=>{
 const h=harness(t),file=path.join(h.dir,'Readable.txt');fs.writeFileSync(file,'unchanged');h.handlers.get('notes-add-paths')(null,[file]);h.handlers.get('floating-show')();const main=h.windows[0],mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};main.hide();h.rawHandlers.get('floating-search-open')(event,'Readable');const panel=h.windows[2],pe={sender:panel.webContents,senderFrame:{url:panel.url}};assert.equal(main.visible,false);assert.equal(mini.visible,true);assert.equal(panel.options.parent,mini);assert.equal(panel.options.modal,false);assert.throws(()=>h.rawHandlers.get('floating-search-get')(event),/不受信任/);assert.throws(()=>h.rawHandlers.get('notes-record-save')(pe,{}),/不受信任/);let result=h.rawHandlers.get('floating-search-run')(pe,'Readable',{kind:'favorites'});assert.equal(result.total,1);await h.rawHandlers.get('floating-search-action')(pe,result.token,'favorites',0,'copy');assert.equal(h.getCopied(),file);await h.rawHandlers.get('floating-search-action')(pe,result.token,'favorites',0,'open');assert.equal(h.opened.at(-1),file);assert.equal(main.visible,false);
 h.handlers.get('favorites-update')(null,[result.sections[0].items[0].id],{label:'Changed'});await assert.rejects(h.rawHandlers.get('floating-search-action')(pe,result.token,'favorites',0,'open'),/已更新/);result=h.rawHandlers.get('floating-search-run')(pe,'Changed',{kind:'favorites'});await h.rawHandlers.get('floating-search-action')(pe,result.token,'favorites',0,'visit');assert.equal(main.visible,true);assert.ok(h.messages.some(([channel,item])=>channel==='studio-search-target'&&item.kind==='favorite'));mini.emit('hide');assert.equal(panel.destroyed,true);h.rawHandlers.get('floating-search-open')(event,'Changed');const nextPanel=h.windows.at(-1);h.handlers.get('desktop-settings-set')(null,{floatingGlobalSearch:false});assert.equal(nextPanel.destroyed,true);assert.throws(()=>h.rawHandlers.get('floating-search-open')(event,''),/停用/);assert.equal(fs.readFileSync(file,'utf8'),'unchanged');
});

test('passive live-search IPC keeps focus in the floating tool and ignores hidden, stale or cancelled requests',async t=>{const h=harness(t),file=path.join(h.dir,'Readable.txt');fs.writeFileSync(file,'unchanged');h.handlers.get('notes-add-paths')(null,[file]);h.handlers.get('desktop-settings-set')(null,{floatingSearchMode:'live'});h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};h.windows[0].hide();h.rawHandlers.get('floating-search-prepare')(event,'Readable',1);assert.equal(h.rawHandlers.get('floating-search-preview')(event,'Readable',1,false).opened,false);assert.equal(h.windows.length,2);mini.isFocused=()=>true;h.rawHandlers.get('floating-search-preview')(event,'Readable',1,false);const panel=h.windows[2],pe={sender:panel.webContents,senderFrame:{url:panel.url}};let focused=0,shown=0;panel.focus=()=>focused++;panel.show=()=>shown++;assert.equal(panel.options.show,false);panel.emit('ready-to-show');assert.equal(panel.inactiveShown,true);assert.equal(focused,0);assert.equal(shown,0);assert.equal(h.windows[0].visible,false);const data=h.rawHandlers.get('floating-search-get')(pe);assert.equal(data.automatic,true);const result=h.rawHandlers.get('floating-search-run')(pe,'Readable',{kind:'favorites',version:data.version});assert.equal(result.total,1);assert.throws(()=>h.rawHandlers.get('floating-search-prepare')(pe,'Other',2),/不受信任/);h.rawHandlers.get('floating-search-prepare')(event,'Changed',2);await assert.rejects(h.rawHandlers.get('floating-search-action')(pe,result.token,'favorites',0,'open'),/已更新/);assert.equal(h.rawHandlers.get('floating-search-preview')(event,'Readable',1,false).opened,false);h.rawHandlers.get('floating-search-cancel')(event,3);assert.equal(panel.destroyed,true);assert.equal(h.rawHandlers.get('floating-search-preview')(event,'Changed',2,false).opened,false);assert.equal(h.windows.length,3);assert.equal(fs.readFileSync(file,'utf8'),'unchanged');});

test('floating layout IPC permits only an enabled control order, and search trigger positions are bounded',t=>{
 const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}},order=['tags','search','tools'];assert.throws(()=>h.rawHandlers.get('floating-layout-order')(event,order),/啟用/);h.handlers.get('desktop-settings-set')(null,{floatingLayoutEditing:true,theme:'graphite'});h.handlers.get('set-theme')(null,'graphite');assert.equal(h.nativeTheme.themeSource,'dark');assert.throws(()=>h.rawHandlers.get('floating-layout-order')(event,['tags','tags','tools']),/順序/);h.rawHandlers.get('floating-layout-order')(event,order);assert.deepEqual([...h.handlers.get('desktop-settings-get')().floatingControlOrder],order);assert.throws(()=>h.rawHandlers.get('desktop-settings-set')(event,{theme:'light'}),/不受信任/);assert.throws(()=>h.rawHandlers.get('floating-search-toggle')(event,'',{x:99999,y:40,width:26,height:26}),/位置/);h.rawHandlers.get('floating-search-toggle')(event,'',{x:30,y:40,width:26,height:26});const panel=h.windows[2];assert.equal(panel.bounds.x,mini.bounds.x+30);assert.equal(panel.bounds.y,mini.bounds.y+40);h.rawHandlers.get('floating-search-toggle')(event,'',{x:30,y:40,width:26,height:26});assert.equal(panel.destroyed,true);
});

test('main search omits retired workspace group actions even if the caller requests them',t=>{const h=harness(t);h.handlers.get('notes-template')();const result=h.handlers.get('studio-search')(null,'客戶',{sources:['structure'],includeAreas:true});assert.ok(result.sections.some(section=>section.items.length));assert.ok(result.sections.flatMap(section=>section.items).every(item=>item.kind!=='area'));});

test('new floating quick actions open catalog-backed menus, copy paths and route search/reminders without editing data',t=>{
 const h=harness(t),crypto=require('node:crypto'),file=path.join(h.dir,'contract.txt');fs.writeFileSync(file,'intact');const added=h.handlers.get('favorites-add')(null,[file]),favorite=h.handlers.get('favorites-list')().items[0];h.handlers.get('favorites-add-tags')(null,[favorite.id],['Legal']);const types=['open-tag-menu','copy-tag-paths','open-search','open-reminders'],actions=types.map(type=>({id:crypto.randomUUID(),type,label:type,tag:'Legal',query:''}));h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:actions});h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};h.windows[0].hide();assert.equal(h.rawHandlers.get('floating-quick-action')(event,actions[0].id).menu,true);assert.ok(h.popup().template.some(item=>item.toolTip===file));assert.equal(h.windows[0].visible,false);assert.equal(h.rawHandlers.get('floating-quick-action')(event,actions[1].id).copied,1);assert.equal(h.getCopied(),file);h.rawHandlers.get('floating-quick-action')(event,actions[2].id);assert.ok(h.windows.at(-1).url.endsWith('/floating-search.html'));assert.equal(h.windows[0].visible,false);h.rawHandlers.get('floating-quick-action')(event,actions[3].id);assert.ok(h.messages.some(([channel])=>channel==='record-reminders-open'));assert.equal(fs.readFileSync(file,'utf8'),'intact');h.handlers.get('favorites-manage-tag')(null,'Legal',null,1);assert.throws(()=>h.rawHandlers.get('floating-quick-action')(event,actions[0].id),/不存在/);
});
test('shared search criteria apply on the main and floating search and revoke old result actions on change',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),[root,contacts]=state.document.sheets;const a=h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'ScopeMatch',values:{},notes:'',tags:[],favoriteIds:[],keepUnlinked:[]}).result.id;h.handlers.get('notes-record-save')(null,{sheetId:contacts.id,title:'Person',values:{[contacts.fields[0].id]:[a]},notes:'',tags:[],favoriteIds:[],keepUnlinked:[]});h.handlers.get('desktop-settings-set')(null,{globalSearchCriteria:{tableMode:'selected',sheetIds:[contacts.id],sources:['records']}});let r=h.handlers.get('studio-search')(null,'ScopeMatch',{includeRelated:true});assert.equal(r.sections.length,1);assert.ok(r.sections[0].items.every(item=>item.title==='Person'));h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};h.rawHandlers.get('floating-search-open')(event,'ScopeMatch');const panel=h.windows[2],pe={sender:panel.webContents,senderFrame:{url:panel.url}};r=h.rawHandlers.get('floating-search-run')(pe,'ScopeMatch',{});assert.ok(r.sections[0].items.every(item=>item.title==='Person'));h.handlers.get('desktop-settings-set')(null,{globalSearchCriteria:{sources:[]}});assert.equal(h.handlers.get('studio-search')(null,'ScopeMatch',{}).total,0);assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{globalSearchCriteria:{modifiedFrom:'2026-11-03',modifiedTo:'2026-11-01'}}),/起日/);
});

test('Windows reminders include only explicitly configured message contents, resolved at delivery time',t=>{
 const Actual=require('../src/record-reminders').RecordReminders;let store,clock=Date.now(),notices=[];class Notification{static isSupported(){return true;}constructor(value){notices.push(value);}on(){}show(){}close(){}}
 const h=harness(t,{Notification,'./record-reminders':{RecordReminders:class extends Actual{constructor(file,options){super(file,{...options,now:()=>clock});store=this;}}}}),field=require('node:crypto').randomUUID(),sheet=h.handlers.get('notes-sheet-save')(null,{name:'Tasks',fields:[{id:field,label:'備註',type:'text'}]}).document.sheets[0];for(const [title,custom] of [['Custom',true],['PrivateDefault',false]]){const record=h.handlers.get('notes-record-save')(null,{sheetId:sheet.id,title,values:{[field]:'備註內容'},notes:'私人筆記',tags:[],favoriteIds:[],keepUnlinked:[]}).result;h.handlers.get('reminders-save')(null,{recordId:record.id,at:new Date(clock+60000).toISOString(),repeat:'none',delivery:'notification',...(custom?{message:'請跟進',fieldIds:[field]}:{})});}clock+=61000;store.tick();assert.equal(notices.length,1);assert.match(notices[0].body,/請跟進\n備註：備註內容/);assert.doesNotMatch(notices[0].body,/PrivateDefault|私人筆記/);
});
test('floating header offers direct control-row editing and size presets without opening Settings',async t=>{const h=harness(t);h.handlers.get('floating-show')();h.handlers.get('floating-header-menu')();await h.popup().template.find(item=>item.label==='編輯控制列版面').click();assert.equal(h.handlers.get('desktop-settings-get')().floatingLayoutEditing,true);h.handlers.get('floating-header-menu')();await h.popup().template.find(item=>item.label==='快速尺寸（設為預設並展開）').submenu[1].click();assert.equal(h.handlers.get('desktop-settings-get')().floatingDefaultWidth,420);assert.equal(h.windows[1].bounds.width,420);});

test('shared profile IPC scopes source cloning to A, preserves B and revokes previews on profile switch',async t=>{
 const {fork}=require('node:child_process'),M=require('../src/notes-model'),{perform}=require('../src/notes-share-worker'),crypto=require('node:crypto');const h=harness(t,{utilityProcess:{fork(modulePath){const child=fork(modulePath,{silent:true});child.postMessage=value=>child.send(value);return child;}}});h.handlers.get('notes-template')();const state=h.handlers.get('notes-template')(null,'projects'),roots=M.masterTableTree(state.document).map(branch=>branch.master);for(const root of roots)h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:root.name,notes:'local',tags:[],values:{},favoriteIds:[],keepUnlinked:[]});
 const folder=path.join(h.dir,'shared-a');fs.mkdirSync(folder);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});h.handlers.get('notes-share-select')(null,roots[0].id);await h.handlers.get('notes-share-choose')();h.handlers.get('notes-share-configure')(null,{enabled:true});const current=h.handlers.get('notes-get')(),remote=M.clone(current.document),b=current.document.records.find(record=>record.sheetId===roots[1].id);remote.records.find(record=>record.sheetId===roots[0].id).title='Remote A';remote.records.find(record=>record.id===b.id).title='Must not write B';const name=perform({action:'publish',folder,deviceId:crypto.randomUUID(),revision:1,data:M.exportPackage(remote,{scope:'all'})}).name;
 await h.handlers.get('notes-share-check')();await h.handlers.get('notes-share-load')(null,name);let preview=h.handlers.get('notes-import-preview')(null,'clone');h.handlers.get('notes-share-select')(null,roots[1].id);assert.throws(()=>h.handlers.get('notes-import-commit')(null,preview.token,{confirmClone:true}),/失效/);assert.equal(h.handlers.get('notes-get')().revision,current.revision);
 h.handlers.get('notes-share-select')(null,roots[0].id);await h.handlers.get('notes-share-load')(null,name);preview=h.handlers.get('notes-import-preview')(null,'clone');h.handlers.get('notes-import-commit')(null,preview.token,{confirmClone:true});const result=h.handlers.get('notes-get')();assert.equal(result.document.records.find(record=>record.sheetId===roots[0].id).title,'Remote A');assert.deepEqual(result.document.records.find(record=>record.id===b.id),b);h.handlers.get('notes-share-select')(null,roots[1].id);assert.equal(h.handlers.get('notes-share-status')().receivedNames.length,0);assert.equal(h.handlers.get('app-info')().offline,false);
});

test('floating panel sends temporary table filters through real IPC without rewriting saved defaults',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),root=state.document.sheets[0];h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'Filtered record',notes:'',tags:[],values:{},favoriteIds:[],keepUnlinked:[]});h.handlers.get('desktop-settings-set')(null,{globalSearchCriteria:{sources:[]}});h.handlers.get('floating-show')();h.handlers.get('floating-search-open')(null,'Filtered');const panel=h.windows[2],event={sender:panel.webContents,senderFrame:{url:panel.url}};const data=h.rawHandlers.get('floating-search-get')(event);assert.ok(data.tables.some(table=>table.id===root.id));assert.deepEqual(data.criteria.sources,[]);const result=h.rawHandlers.get('floating-search-run')(event,'',{kind:'records',criteria:{sources:['records'],tableMode:'selected',sheetIds:[root.id]}});assert.equal(result.total,1);assert.deepEqual(h.handlers.get('desktop-settings-get')().globalSearchCriteria.sources,[]);
});

test('floating date preferences reject invalid writes, reach the panel and preserve global date defaults',t=>{
 const h=harness(t),presets=[{id:'fortnight',label:'最近 14 天',type:'last-days',days:14,enabled:true}],initial=h.handlers.get('desktop-settings-get')();assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{floatingSearchDatePresets:[{...presets[0],days:0}]}),/1–3650/);assert.deepEqual(h.handlers.get('desktop-settings-get')().floatingSearchDatePresets,initial.floatingSearchDatePresets);h.handlers.get('desktop-settings-set')(null,{floatingSearchDatePresets:presets,floatingSearchFiltersExpanded:true});h.handlers.get('floating-show')();h.handlers.get('floating-search-open')(null,'');const panel=h.windows[2],event={sender:panel.webContents,senderFrame:{url:panel.url}},data=h.rawHandlers.get('floating-search-get')(event);assert.equal(data.filtersExpanded,true);assert.deepEqual(data.datePresets,presets);assert.equal(data.criteria.modifiedFrom,'');h.handlers.get('desktop-settings-set')(null,{floatingSearchDatePresets:[]});assert.deepEqual(h.handlers.get('desktop-settings-get')().globalSearchCriteria,initial.globalSearchCriteria);
});

test('search panel saves only filter memory through owned IPC and custom global shortcut opens it without expanding the tool',async t=>{
 const h=harness(t),id=require('node:crypto').randomUUID();h.handlers.get('desktop-settings-set')(null,{searchShortcut:'CommandOrControl+Alt+F',floatingCollapsed:true,floatingSearchTablePresets:[{id:'clients',label:'Clients',tableMode:'selected',sheetIds:[id],enabled:true}]});assert.ok(h.registered.has('CommandOrControl+Alt+F'));assert.throws(()=>h.handlers.get('desktop-settings-set')(null,{searchShortcut:'CommandOrControl+Alt+B'}),/相同/);await h.registered.get('CommandOrControl+Alt+F')();const panel=h.windows.at(-1),event={sender:panel.webContents,senderFrame:{url:panel.url}};assert.match(panel.url,/floating-search.html$/);assert.equal(h.handlers.get('desktop-settings-get')().floatingCollapsed,true);const criteria={tableMode:'selected',sheetIds:[id],modifiedFrom:'2026-11-01'};h.rawHandlers.get('floating-search-state-save')(event,{criteria,query:'secret',searchShortcut:'bad',kind:'records',includeRelated:true});const prefs=h.handlers.get('desktop-settings-get')();assert.deepEqual(prefs.globalSearchCriteria.sheetIds,[]);assert.deepEqual(prefs.floatingSearchLastState.criteria.sheetIds,[id]);assert.doesNotMatch(JSON.stringify(prefs.floatingSearchLastState),/secret|searchShortcut/);assert.equal(prefs.searchShortcut,'CommandOrControl+Alt+F');assert.throws(()=>h.rawHandlers.get('floating-search-state-save')({sender:h.windows[0].webContents,senderFrame:{url:h.windows[0].url}},{criteria}),/不受信任/);h.rawHandlers.get('floating-search-state-save')(event,null);assert.equal(h.handlers.get('desktop-settings-get')().floatingSearchLastState,null);h.handlers.get('desktop-settings-set')(null,{floatingSearchRememberConditions:false});assert.equal(h.rawHandlers.get('floating-search-state-save')(event,{criteria}).saved,false);
});

test('direct path IPC stores locations without favorites, reopens after export, and rejects invalid additions atomically',async t=>{
 const h=harness(t),sheet=h.handlers.get('notes-template')().document.sheets[0],file=path.join(h.dir,'direct.pdf');fs.writeFileSync(file,'content');const input={sheetId:sheet.id,title:'Shared link',notes:'',tags:[],values:{},favoriteIds:[],keepUnlinked:[],directPaths:[file]};
 const inspected=h.handlers.get('notes-inspect-links')(null,[file,file]);assert.equal(inspected.length,1);const result=h.handlers.get('notes-record-save')(null,input),record=result.document.records[0];assert.equal(record.fileLinks[0].favoriteId,null);assert.equal(h.handlers.get('favorites-list')().items.length,0);await h.handlers.get('notes-open-link')(null,record.id,0,'open');assert.deepEqual(h.opened,[file]);
 const selected=h.handlers.get('favorites-add')(null,[file],[]),updated=h.handlers.get('notes-record-save')(null,{...input,id:record.id,expectedVersion:record.version,favoriteIds:selected.ids,keepUnlinked:[file]});assert.equal(updated.document.records[0].fileLinks.length,1);assert.equal(updated.document.records[0].fileLinks[0].favoriteId,selected.ids[0]);
 assert.throws(()=>h.handlers.get('notes-record-save')(null,{...input,title:'Invalid',directPaths:[file,path.join(h.dir,'missing')]}),/位置不存在/);assert.equal(h.handlers.get('notes-get')().document.records.length,1);assert.throws(()=>h.handlers.get('notes-record-save')(null,{...input,directPaths:'bad'}));assert.equal(fs.readFileSync(file,'utf8'),'content');
});
test('only the owned capture popup can attach a path to its draft, with no write before saving',t=>{
 const h=harness(t),sheet=h.handlers.get('notes-template')().document.sheets[0],file=path.join(h.dir,'attachment.pdf');fs.writeFileSync(file,'content');const action={id:require('node:crypto').randomUUID(),type:'new-record',label:'Quick entry',sheetId:sheet.id,enabled:true};h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[action]});h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};h.rawHandlers.get('floating-quick-action')(event,action.id);const popup=h.windows[2],pe={sender:popup.webContents,senderFrame:{url:popup.url}};
 assert.throws(()=>h.rawHandlers.get('floating-capture-attach')(event,[file]),/不受信任/);assert.equal(h.rawHandlers.get('floating-capture-attach')(pe,[file]).attachments[0].path,file);assert.equal(h.handlers.get('notes-get')().document.records.length,0);h.rawHandlers.get('floating-capture-save')(pe,{title:'Attached',notes:'',tags:[],values:{}});assert.equal(h.handlers.get('notes-get')().document.records[0].fileLinks[0].favoriteId,null);assert.equal(h.handlers.get('favorites-list')().items.length,0);
});

test('manual import and compatibility checks accept a selected network package without writing workspace data before confirmation',async t=>{
 const M=require('../src/notes-model'),packet=M.exportPackage(M.template(()=>require('node:crypto').randomUUID(),'2026-11-03T00:00:00Z'),{scope:'all'}),selected='\\\\Server\\Share\\source.json',reads=[];
 const h=harness(t,{'./notes-import-files':{readImportPackageFile:async filename=>{reads.push(filename);return packet;},packageImportName:require('../src/notes-import-files').packageImportName}});h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[selected]});const revision=h.handlers.get('notes-get')().revision,result=await h.handlers.get('notes-import-choose')();assert.equal(result.name,'source.json');const preview=h.handlers.get('notes-import-preview')(null,'copy');assert.ok(preview.token);assert.equal(h.handlers.get('notes-get')().revision,revision);assert.equal((await h.handlers.get('notes-check-package')()).packageVersion,3);assert.deepEqual(reads,[selected,selected]);assert.equal(h.handlers.get('notes-get')().revision,revision);
});
test('a late asynchronous package read cannot overwrite the latest selected source',async t=>{
 const M=require('../src/notes-model'),base=M.template(()=>require('node:crypto').randomUUID(),'2026-11-03T00:00:00Z'),old=M.exportPackage(base,{scope:'all'}),latest=structuredClone(old);latest.document.sheets[0].name='Latest selected';let resolveOld;
 const h=harness(t,{'./notes-import-files':{readImportPackageFile:filename=>filename==='old.json'?new Promise(resolve=>resolveOld=resolve):Promise.resolve(latest),packageImportName:filename=>filename}});let name='old.json';h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[name]});const first=h.handlers.get('notes-import-choose')();await new Promise(setImmediate);name='latest.json';await h.handlers.get('notes-import-choose')();resolveOld(old);await assert.rejects(first,/最新選擇/);const preview=h.handlers.get('notes-import-preview')(null,'copy');assert.ok(preview.sheets.some(sheet=>sheet.name.includes('Latest selected')));
});

async function sharedPreviewFixture(t){
 const {fork}=require('node:child_process'),M=require('../src/notes-model'),crypto=require('node:crypto'),{perform}=require('../src/notes-share-worker');
 const h=harness(t,{utilityProcess:{fork(modulePath){const child=fork(modulePath,{silent:true});child.postMessage=value=>child.send(value);return child;}}});
 h.handlers.get('notes-template')();const state=h.handlers.get('notes-template')(null,'projects'),roots=M.masterTableTree(state.document).map(branch=>branch.master);
 const folders=roots.map((_,i)=>{const folder=path.join(h.dir,'shared-'+i);fs.mkdirSync(folder);return folder;});
 for(let i=0;i<2;i++){h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folders[i]]});await h.handlers.get('notes-share-choose')(null,roots[i].id);h.handlers.get('notes-share-configure')(null,{enabled:true},roots[i].id);}
 h.handlers.get('notes-share-select')(null,roots[0].id);
 const packet=M.exportPackage(state.document,{scope:'masters',masterIds:[roots[0].id]});
 packet.document.sheets.find(sheet=>sheet.id===roots[0].id).name='Remote change';
 const name=perform({action:'publish',folder:folders[0],deviceId:crypto.randomUUID(),revision:1,data:packet,scope:{mode:'masters',masterIds:[roots[0].id]}}).name;
 await h.handlers.get('notes-share-check')(null,roots[0].id);await h.handlers.get('notes-share-load')(null,name,roots[0].id);
 return {...h,roots,folders,preview:h.handlers.get('notes-import-preview')(null,'update'),revision:state.revision};
}

for(const change of ['folder','disable'])test('shared '+change+' change revokes the old loaded package and confirmation',async t=>{
 const h=await sharedPreviewFixture(t);
 if(change==='folder'){h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[h.folders[1]]});await h.handlers.get('notes-share-choose')(null,h.roots[0].id);}
 else h.handlers.get('notes-share-configure')(null,{enabled:false},h.roots[0].id);
 assert.throws(()=>h.handlers.get('notes-import-commit')(null,h.preview.token),/失效|變更|停用/);
 assert.throws(()=>h.handlers.get('notes-import-preview')(null,'update'),/選取|變更|停用/);
 assert.equal(h.handlers.get('notes-get')().revision,h.revision);
});

test('changing another master share configuration preserves the current master import preview',async t=>{
 const h=await sharedPreviewFixture(t);
 h.handlers.get('notes-share-configure')(null,{followSource:require('node:crypto').randomUUID()},h.roots[1].id);
 h.handlers.get('notes-import-commit')(null,h.preview.token);
 assert.equal(h.handlers.get('notes-get')().document.sheets.find(sheet=>sheet.id===h.roots[0].id).name,'Remote change');
 assert.equal(h.handlers.get('notes-share-status')().receivedNames.length,1);
});

test('an older backup chooser cannot replace a newer import preview',async t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),packet=require('../src/notes-model').exportPackage(state.document,{scope:'all'});
 const backup=path.join(h.dir,'irrelevant.sqlite'),file=path.join(h.dir,'source.json');fs.writeFileSync(file,JSON.stringify(packet));
 let finishBackup;h.dialog.showOpenDialog=()=>new Promise(resolve=>finishBackup=resolve);
 const choosing=h.handlers.get('notes-backup-choose')();
 h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});await h.handlers.get('notes-import-choose')();
 const preview=h.handlers.get('notes-import-preview')(null,'copy');finishBackup({canceled:false,filePaths:[backup]});
 await assert.rejects(choosing,/最新|變更/);h.handlers.get('notes-import-commit')(null,preview.token);
});

test('floating publication confirms and publishes the captured profile even if the management selection changes',async t=>{
 const h=await sharedPreviewFixture(t),id=require('node:crypto').randomUUID();
 h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[{id,type:'share-publish',label:'Publish',enabled:true}]});h.handlers.get('floating-show')();
 const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};let finish;
 h.dialog.showMessageBox=(_,options)=>{assert.match(options.detail,new RegExp('shared-0'));return new Promise(resolve=>finish=resolve);};
 const countA=fs.readdirSync(h.folders[0]).length,pending=h.rawHandlers.get('floating-quick-action')(event,id);
 h.handlers.get('notes-share-select')(null,h.roots[1].id);finish({response:1});await pending;
 assert.equal(fs.readdirSync(h.folders[0]).length,countA+1);assert.deepEqual(fs.readdirSync(h.folders[1]),[]);
});

test('changing a confirmed publication folder requires a new confirmation before writing a package',async t=>{
 const h=await sharedPreviewFixture(t),id=require('node:crypto').randomUUID();
 h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[{id,type:'share-publish',label:'Publish',enabled:true}]});h.handlers.get('floating-show')();
 const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};let finish;
 h.dialog.showMessageBox=()=>new Promise(resolve=>finish=resolve);const pending=h.rawHandlers.get('floating-quick-action')(event,id);
 const folder=path.join(h.dir,'new-share');fs.mkdirSync(folder);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
 await h.handlers.get('notes-share-choose')(null,h.roots[0].id);h.handlers.get('notes-share-configure')(null,{enabled:true},h.roots[0].id);
 finish({response:1});await assert.rejects(pending,/設定已變更/);assert.deepEqual(fs.readdirSync(folder),[]);
});

test('closing or quitting during an in-flight OS recycle operation is deferred until bookmark cleanup finishes',async t=>{
 const h=harness(t),file=path.join(h.dir,'recycle.txt');fs.writeFileSync(file,'keep');const added=h.handlers.get('favorites-add')(null,[file],[]);
 let finish;h.shell.trashItem=()=>new Promise(resolve=>finish=resolve);h.dialog.showMessageBox=async()=>({response:0});
 const pending=h.handlers.get('favorites-remove')(null,added.ids,{trashFiles:true});await new Promise(setImmediate);
 let closeBlocked=false,quitBlocked=false;
 h.windows[0].emit('close',{preventDefault(){closeBlocked=true;}});h.events.get('before-quit')({preventDefault(){quitBlocked=true;}});
 assert.equal(closeBlocked,true);assert.equal(quitBlocked,true);finish();await pending;
 quitBlocked=false;h.events.get('before-quit')({preventDefault(){quitBlocked=true;}});assert.equal(quitBlocked,false);
 assert.equal(h.handlers.get('favorites-list')().items.length,0);
});

test('floating calendar and snippets share one window and its size with restricted IPC',async t=>{
 const h=harness(t);
 h.handlers.get('productivity-save')(null,'snippets',{name:'回覆',body:'您好 {{customer}}',category:'工作'});
 const id=h.handlers.get('productivity-snippet-list')()[0].id;
 h.handlers.get('tool-view-open')(null,{kind:'snippets'});
 const overlay=h.windows.at(-1);
 const event={sender:overlay.webContents,senderFrame:{url:overlay.url}};
 assert.equal(h.rawHandlers.get('tool-overlay-data')(event,'snippets',{}).rows[0].title,'回覆');
 assert.throws(()=>h.rawHandlers.get('tool-overlay-data')({...event,sender:h.windows[0].webContents},'snippets',{}),/不受信任/);
 assert.throws(()=>h.rawHandlers.get('tool-overlay-action')(event,'snippets','visit',id),/只可複製/);
 h.rawHandlers.get('tool-overlay-action')(event,'snippets','copy',id,'陳先生');
 assert.equal(h.getCopied(),'您好 陳先生');
 h.rawHandlers.get('tool-overlay-switch')(event,'planning');
 assert.equal(h.rawHandlers.get('tool-overlay-get')(event).config.kind,'planning');
 assert.throws(()=>h.rawHandlers.get('tool-overlay-action')(event,'snippets','copy',id),/已切換/);
 assert.throws(()=>h.rawHandlers.get('tool-overlay-switch')(event,'logs'),/沒有該分頁/);
 h.handlers.get('tool-view-open')(null,{kind:'snippets'});
 assert.equal(h.windows.at(-1),overlay);
 h.handlers.get('tool-view-open')(null,{kind:'logs'});
 const logs=h.windows.at(-1);
 assert.notEqual(logs,overlay);
 assert.notEqual(logs.options.x,overlay.options.x);
 overlay.setBounds({...overlay.getNormalBounds(),width:675,height:590});overlay.emit('resized');
 assert.deepEqual(h.handlers.get('desktop-settings-get')().toolWindowSizes.planning,{width:675,height:590});
 overlay.destroy();
 h.handlers.get('tool-view-open')(null,{kind:'snippets'});
 assert.equal(h.windows.at(-1).options.width,675);
});

test('log preferences persist, validate and belong to the workspace settings reset',t=>{
 const h=harness(t),sheetId=h.handlers.get('notes-template')().document.sheets[0].id;
 const logView={scope:'selected',sheetIds:[sheetId],layout:'cards',sort:'oldest'};
 const save=h.handlers.get('desktop-settings-set');
 save(null,{logView});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h.dir,'desktop-state.json'),'utf8')).settings.logView,logView);
 assert.throws(()=>save(null,{logView:{...logView,sheetIds:['wrong']}}),/設定無效/);
 assert.deepEqual(h.handlers.get('desktop-settings-get')().logView,logView);
 const {resetPatch}=require('../src/settings-catalog');
 const {DEFAULTS}=require('../src/desktop-state');
 assert.deepEqual(resetPatch('native','notes',DEFAULTS).logView,DEFAULTS.logView);
});

test('floating content uses the same native window and rejects disabled panels and unknown actions',t=>{
 const h=harness(t);
 const open=h.handlers.get('floating-panel-open');
 h.handlers.get('productivity-save')(null,'snippets',{name:'回覆',body:'你好 {{customer}}',category:''});
 const snippet=h.handlers.get('productivity-snippet-list')()[0];
 h.handlers.get('desktop-settings-set')(null,{floatingCollapsed:true});
 assert.equal(open(null,'planning').inline,true);
 const mini=h.windows.at(-1);
 assert.equal(h.handlers.get('desktop-settings-get')().floatingCollapsed,false);
 assert.match(mini.url,/floating\.html$/);
 open(null,'snippets');
 assert.equal(h.windows.at(-1),mini);
 assert.deepEqual(h.messages.filter(([name])=>name==='floating-panel-open').map(([,id])=>id),['planning','snippets']);
 const event={sender:mini.webContents,senderFrame:{url:mini.url}};
 const data=h.rawHandlers.get('floating-panel-data'),act=h.rawHandlers.get('floating-panel-action');
 assert.equal(data(event,'snippets',{}).rows[0].title,'回覆');
 assert.throws(()=>act(event,'snippets','visit',snippet.id),/只可複製/);
 act(event,'snippets','copy',snippet.id,'陳小姐');
 assert.equal(h.getCopied(),'你好 陳小姐');
 const prefs=h.handlers.get('desktop-settings-get')().floatingPanels;
 h.handlers.get('desktop-settings-set')(null,{floatingPanels:{...prefs,enabled:['planning']}});
 assert.throws(()=>data(event,'snippets',{}),/未啟用/);
 assert.throws(()=>open(null,'logs'),/未啟用/);
 assert.throws(()=>h.rawHandlers.get('floating-panel-open')(event,'planning'),/不受信任/);
});

test('floating external menus copy snippets and open only the requested calendar day',async t=>{
 const h=harness(t),{randomUUID}=require('node:crypto'),today=new Date().toLocaleDateString('sv-SE');
 const state=h.handlers.get('notes-template')(null,'clients');
 const root=state.document.sheets[0],logs=state.document.sheets.find(sheet=>sheet.name==='紀錄');
 const parent=logs.fields.find(field=>field.type==='relation'),date=logs.fields.find(field=>field.type==='date');
 const save=(sheet,title,values)=>h.handlers.get('notes-record-save')(null,{sheetId:sheet.id,title,values,notes:'',tags:[],favoriteIds:[],keepUnlinked:[]});
 const master=save(root,'甲客戶',{}).document.records[0];
 const eventRecord=save(logs,'日曆紀錄',{[parent.id]:[master.id],[date.id]:today}).document.records.at(-1);
 h.handlers.get('productivity-save')(null,'snippets',{name:'跟進回覆',body:'已收到，謝謝。',category:'工作'});
 const [snippet,planning]=['open-snippets','open-planning'].map(type=>({id:randomUUID(),type,label:type,display:'menu'}));
 h.handlers.get('desktop-settings-set')(null,{floatingQuickActions:[snippet,planning],floatingCollapsed:true});
 h.handlers.get('floating-show')();
 const mini=h.windows.at(-1),event={sender:mini.webContents,senderFrame:{url:mini.url}};
 const quick=h.rawHandlers.get('floating-quick-action'),act=h.rawHandlers.get('floating-panel-action');
 assert.equal(quick(event,snippet.id).menu,true);
 assert.equal(h.popup().options.window,mini);
 await h.popup().template.find(item=>item.label?.includes('跟進回覆')).click();
 assert.equal(h.getCopied(),'已收到，謝謝。');
 assert.equal(h.windows.length,2);
 assert.equal(quick(event,planning.id).menu,true);
 await h.popup().template.find(item=>item.label?.startsWith(today)).click();
 assert.ok(h.popup().template.some(item=>item.label?.includes('日曆紀錄')));
 assert.throws(()=>act(event,'planning','day-menu',{day:today}),/展開/);
 h.rawHandlers.get('floating-collapse')(event,false);
 assert.throws(()=>act(event,'planning','day-menu',{day:'2026-02-30'}),/日期無效/);
 assert.throws(()=>act({...event,sender:{}},'planning','day-menu',{day:today}),/不受信任/);
 assert.equal(act(event,'planning','day-menu',{day:today,query:'不相符'}).menu,true);
 assert.ok(h.popup().template.some(item=>item.label==='當天沒有符合條件的行程'));
 act(event,'planning','day-menu',{day:today,query:'甲客戶',anchor:{x:20,y:45}});
 assert.equal(h.popup().options.x,mini.bounds.x+20);
 assert.equal(h.popup().options.y,mini.bounds.y+45);
 await h.popup().template.find(item=>item.label?.includes('日曆紀錄')).click();
 assert.ok(h.messages.some(([channel,value])=>channel==='studio-search-target'&&value.id===eventRecord.id));
});
