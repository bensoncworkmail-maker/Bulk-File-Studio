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
  t.after(() => fs.rmSync(dir, { recursive:true, force:true }));
  const handlers = new Map();
  const main = path.resolve(__dirname, '../src/main.js');
  const realRequire = createRequire(main);
  const nativeTheme = {};
  const events=new Map();
  let contents;const windows=[],registered=new Map();const rawHandlers=new Map(),opened=[],shown=[];let copied='',popup;let popupClosed=0;
  const network={};
  class Window {
    constructor(options) { this.options=options;this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};this.events=new Map();this.visible=true;this.destroyed=false;windows.push(this);this.webContents = contents = { on:(name,callback)=>network[name]=callback,setWindowOpenHandler:callback=>network.windowOpen=callback,send() {},session:{webRequest:{onBeforeRequest:callback=>network.request=callback},setPermissionRequestHandler:callback=>network.permission=callback,setPermissionCheckHandler:callback=>network.check=callback,on:(name,callback)=>network[name]=callback} }; }
    loadFile(filepath) {this.url=require('node:url').pathToFileURL(filepath).href;}
    on(name,callback){const callbacks=this.events.get(name)||[];callbacks.push(callback);this.events.set(name,callbacks);return this;}
    emit(name,...args){for(const callback of this.events.get(name)||[])callback(...args);}
    isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}hide(){this.visible=false;}destroy(){this.destroyed=true;this.emit('closed');}
    setMinimumSize(width,height){this.minimum=[width,height];}setResizable(value){this.resizable=value;}setOpacity(value){this.opacity=value;}isFocused(){return false;}
    getNormalBounds(){return this.bounds;}isMaximized(){return Boolean(this.maximized);}maximize(){this.maximized=true;}unmaximize(){this.maximized=false;}setBounds(bounds){this.bounds=bounds;}setAlwaysOnTop(flag){this.onTop=flag;}
    setBackgroundColor(value) { this.background = value; }
    isMinimized(){return false;}show(){this.visible=true;}showInactive(){this.visible=true;this.inactiveShown=true;}focus(){}restore(){}
  }
  const electron = {
    app: {commandLine:{appendSwitch(){}},getVersion:()=>require('../package.json').version, getPath:()=>dir, requestSingleInstanceLock:()=>true, whenReady:()=>({ then:callback=>callback() }), on:(name,callback)=>events.set(name,callback), isPackaged:false },
    Menu:{buildFromTemplate:template=>({popup:options=>{popup={template,options};},closePopup:()=>popupClosed++})},BrowserWindow:Window, nativeTheme,screen:{getAllDisplays:()=>[{workArea:{x:0,y:0,width:1920,height:1080}}]},globalShortcut:{unregisterAll:()=>registered.clear(),register:(key,callback)=>{registered.set(key,callback);return true;}},
    ipcMain:{ handle:(name,handler)=>{rawHandlers.set(name,handler);handlers.set(name,(_, ...args)=>handler({sender:windows[0].webContents,senderFrame:{url:require('node:url').pathToFileURL(path.join(path.dirname(main),'index.html')).href}},...args));} }, dialog:{}, clipboard:{writeText:text=>{copied=text;}},shell:{openPath:async filepath=>{opened.push(filepath);return '';},showItemInFolder:filepath=>shown.push(filepath)}
  };
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), {
    require:name=>name === 'electron' ? electron : (overrides[name] || realRequire(name)),
    __dirname:path.dirname(main), process
  }, { filename:main });
  return { popup:()=>popup,popupClosed:()=>popupClosed,shortcuts:electron.globalShortcut, dir, dialog:electron.dialog, handlers, windows, registered, rawHandlers, network, opened, shown, getCopied:()=>copied, events, nativeTheme, historyPath:path.join(dir, 'last-rename.json') };
}

test('IPC persists verified history, blocks edited files, and allows retry', t => {
  const { dir, handlers, historyPath } = harness(t);
  const source = path.join(dir, 'a.txt');
  fs.writeFileSync(source, 'AAAA');
  fs.utimesSync(source, 1700000000, 1700000000);
  const result = handlers.get('rename')(null, [source], { prefix:'new_' });
  const renamed = result.moves[0].destination;
  const saved = JSON.parse(fs.readFileSync(historyPath));
  assert.equal(saved.version, 2);
  assert.equal(saved.state, 'completed');
  fs.writeFileSync(renamed, 'BBBB');
  assert.throws(() => handlers.get('undo')(), /修改或替換/);
  assert.equal(JSON.parse(fs.readFileSync(historyPath)).state, 'completed');
  assert.equal(fs.existsSync(source), false);
  fs.writeFileSync(renamed, 'AAAA');
  fs.utimesSync(renamed, 1700000000, 1700000000);
  assert.equal(handlers.get('undo')().changed, 1);
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
 rawHandlers.get('floating-import')(event,'work');assert.equal(mini.visible,false);rawHandlers.get('favorites-list')(event);assert.deepEqual(Array.from(handlers.get('favorites-list')().importRequest.tags),['Work']);assert.equal(handlers.get('favorites-list')().importRequest,null);
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
