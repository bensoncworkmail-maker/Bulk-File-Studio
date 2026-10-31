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
    setBackgroundColor(value) { this.background = value; }
    isMinimized(){return false;}show(){this.visible=true;}showInactive(){this.visible=true;this.inactiveShown=true;}focus(){}restore(){}
  }
  const electron = {
    app: {commandLine:{appendSwitch(){}},getVersion:()=>require('../package.json').version, getPath:()=>dir, requestSingleInstanceLock:()=>true, whenReady:()=>({ then:callback=>callback() }), on:(name,callback)=>events.set(name,callback), isPackaged:false },
    utilityProcess:overrides.utilityProcess,Menu:{buildFromTemplate:template=>({popup:options=>{popup={template,options};},closePopup:()=>popupClosed++})},BrowserWindow:Window, nativeTheme,screen:{getAllDisplays:()=>[{workArea:{x:0,y:0,width:1920,height:1080}}]},globalShortcut:{unregisterAll:()=>registered.clear(),register:(key,callback)=>{registered.set(key,callback);return true;}},
    ipcMain:{ handle:(name,handler)=>{rawHandlers.set(name,handler);handlers.set(name,(_, ...args)=>handler({sender:windows[0].webContents,senderFrame:{url:require('node:url').pathToFileURL(path.join(path.dirname(main),'index.html')).href}},...args));} }, dialog:{}, clipboard:{writeText:text=>{copied=text;}},shell:{openPath:async filepath=>{opened.push(filepath);return '';},showItemInFolder:filepath=>shown.push(filepath)}
  };
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), {
    require:name=>name === 'electron' ? electron : (overrides[name] || realRequire(name)),
    __dirname:path.dirname(main), process
  }, { filename:main });
  return {messages,popup:()=>popup,popupClosed:()=>popupClosed,shortcuts:electron.globalShortcut, dir, dialog:electron.dialog, handlers, windows, registered, rawHandlers, network, opened, shown, getCopied:()=>copied, events, nativeTheme, historyPath:path.join(dir, 'last-rename.json') };
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

test('native floating item menu uses bookmark IDs, rejects untrusted sources and rechecks action safety',async t=>{const h=harness(t),a=path.join(h.dir,'one.txt'),blocked=path.join(h.dir,'tool.exe');fs.writeFileSync(a,'original');fs.writeFileSync(blocked,'MZ');const result=h.handlers.get('favorites-add')(null,[a,blocked],['Work']);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}},invoke=id=>h.rawHandlers.get('floating-item-menu')(event,id);assert.throws(()=>h.rawHandlers.get('floating-item-menu')({sender:{},senderFrame:{url:mini.url}},result.ids[0]),/不受信任/);assert.throws(()=>invoke(a));invoke(result.ids[0]);assert.equal(h.popup().options.window,mini);const template=h.popup().template;await template.find(item=>item.label==='開啟').click();assert.deepEqual(h.opened,[a]);await template.find(item=>item.label==='在檔案總管定位').click();assert.deepEqual(h.shown,[a]);await template.find(item=>item.label==='複製完整路徑').click();assert.equal(h.getCopied(),a);invoke(result.ids[1]);await h.popup().template.find(item=>item.label==='開啟').click();assert.deepEqual(h.opened,[a]);fs.unlinkSync(a);await template.find(item=>item.label==='開啟').click();assert.deepEqual(h.opened,[a]);invoke(result.ids[0]);assert.equal(h.popup().template.find(item=>item.label==='開啟').enabled,false);assert.equal(h.popup().template.find(item=>item.label==='在檔案總管定位').enabled,false);await h.popup().template.find(item=>item.label==='複製完整路徑').click();assert.equal(h.getCopied(),a);h.handlers.get('floating-collapse')(null,true);assert.throws(()=>invoke(result.ids[0]),/展開/);});
test('header action and drag IPC follow stored preferences and accept only trusted bookmark-window sources',t=>{const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}},invoke=()=>h.rawHandlers.get('floating-header-double-click')(event);invoke();assert.equal(mini.bounds.width,92);invoke();assert.equal(mini.bounds.width,320);h.handlers.get('desktop-settings-set')(null,{floatingHeaderDoubleClick:false});invoke();assert.equal(mini.bounds.width,320);h.handlers.get('desktop-settings-set')(null,{floatingHeaderDoubleClick:true,floatingHeaderAction:'tools'});invoke();assert.equal(h.handlers.get('desktop-settings-get')().floatingCompact,true);h.handlers.get('desktop-settings-set')(null,{floatingHeaderAction:'pin'});invoke();assert.equal(mini.onTop,false);h.windows[0].hide();h.handlers.get('desktop-settings-set')(null,{floatingHeaderAction:'main'});invoke();assert.equal(h.windows[0].visible,true);h.handlers.get('desktop-settings-set')(null,{floatingMinWidth:160,floatingMinHeight:80});assert.deepEqual(mini.minimum,[160,80]);const {token}=h.rawHandlers.get('floating-drag-start')(event);h.rawHandlers.get('floating-drag-move')(event,token,100,50);h.rawHandlers.get('floating-drag-end')(event,token);assert.throws(()=>h.rawHandlers.get('floating-drag-move')(event,token,0,0),/結束/);for(const channel of ['floating-header-double-click','floating-drag-start','floating-drag-move','floating-drag-end'])assert.throws(()=>h.rawHandlers.get(channel)({sender:{},senderFrame:{url:mini.url}}),/不受信任/);});

test('tag batch menu confirms once, opens folders and deduplicates locations; cancel has no effects',async t=>{const h=harness(t),a=path.join(h.dir,'a.txt'),folder=path.join(h.dir,'folder');fs.writeFileSync(a,'content');fs.mkdirSync(folder);h.handlers.get('favorites-add')(null,[a,folder],['Work']);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};let confirmed=0;h.dialog.showMessageBox=async(parent,options)=>{assert.equal(parent,mini);assert.equal(options.defaultId,1);confirmed++;return {response:0};};h.rawHandlers.get('floating-tag-menu')(event,'work','');await h.popup().template.find(item=>item.label?.startsWith('批次開啟檔案')).click();assert.deepEqual(h.opened,[a,folder]);assert.equal(confirmed,1);h.opened.length=0;h.rawHandlers.get('floating-tag-menu')(event,'work','');await h.popup().template.find(item=>item.label?.startsWith('批次開啟所在')).click();assert.deepEqual(h.opened,[h.dir]);h.opened.length=0;h.dialog.showMessageBox=async()=>({response:1});h.rawHandlers.get('floating-tag-menu')(event,'work','');await h.popup().template.find(item=>item.label?.startsWith('批次開啟檔案')).click();assert.deepEqual(h.opened,[]);assert.throws(()=>h.rawHandlers.get('favorites-open-locations')(event,[]),/不受信任/);});
test('header native menu remains available while collapsed and saves, restores and resets default size',async t=>{const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}},menu=()=>h.rawHandlers.get('floating-header-menu')(event);mini.bounds.width=430;mini.bounds.height=510;h.handlers.get('floating-collapse')(null,true);menu();assert.equal(h.popup().options.window,mini);await h.popup().template.find(item=>item.label?.startsWith('將目前展開大小')).click();assert.equal(h.handlers.get('desktop-settings-get')().floatingDefaultWidth,430);assert.equal(mini.bounds.width,430);mini.bounds.width=300;menu();await h.popup().template.find(item=>item.label?.startsWith('展開並套用預設')).click();assert.equal(mini.bounds.width,430);menu();await h.popup().template.find(item=>item.label==='保持置頂').click();assert.equal(mini.onTop,false);menu();await h.popup().template.find(item=>item.label?.startsWith('重設預設大小')).click();assert.equal(mini.bounds.width,320);assert.equal(mini.bounds.height,400);menu();await h.popup().template.find(item=>item.label==='關閉浮動工具（隱藏）').click();assert.equal(mini.visible,false);assert.equal(h.windows[0].visible,true);assert.throws(()=>h.rawHandlers.get('floating-header-menu')({sender:{},senderFrame:{url:mini.url}}),/不受信任/);});
test('collapsed resize IPC publishes independent width while preserving expanded geometry',t=>{const h=harness(t);h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};mini.bounds.width=450;mini.bounds.height=520;h.handlers.get('desktop-settings-set')(null,{floatingCollapsedWidth:170});h.handlers.get('floating-collapse')(null,true);assert.equal(mini.bounds.width,170);const gesture=h.rawHandlers.get('floating-drag-start')(event,'resize-right');h.rawHandlers.get('floating-drag-move')(event,gesture.token,40,0);const result=h.rawHandlers.get('floating-drag-end')(event,gesture.token);assert.equal(result.settings.floatingCollapsedWidth,210);assert.equal(h.handlers.get('desktop-settings-get')().floatingCollapsedWidth,210);h.handlers.get('floating-collapse')(null,false);assert.equal(mini.bounds.width,450);assert.equal(mini.bounds.height,520);});
test('workspace IPC uses SQLite, links only chosen favorites and keeps notes routes off the floating bridge',async t=>{const h=harness(t);const state=h.handlers.get('notes-template')(),sheet=state.document.sheets[0],file=path.join(h.dir,'source.txt');fs.writeFileSync(file,'content');const saved=h.handlers.get('favorites-add')(null,[file],[]),input={sheetId:sheet.id,title:'CLIENT_1',notes:'<script>not executed</script>',tags:[],values:{},favoriteIds:saved.ids,keepUnlinked:[]};const result=h.handlers.get('notes-record-save')(null,input),record=result.document.records[0];await h.handlers.get('notes-open-link')(null,record.id,0,'open');assert.deepEqual(h.opened,[file]);assert.throws(()=>h.handlers.get('notes-record-save')(null,{...input,favoriteIds:['not-a-favorite']}));h.handlers.get('floating-show')();const mini=h.windows[1],event={sender:mini.webContents,senderFrame:{url:mini.url}};for(const channel of ['notes-share-status','notes-share-choose','notes-share-configure','notes-share-check','notes-share-publish','notes-share-load','notes-context-menu','notes-add-paths','notes-choose-paths','notes-client-details','notes-batch-trash','notes-area-save','notes-area-remove','notes-record-duplicate','notes-copy','notes-get','notes-template','notes-sheet-save','notes-record-save','notes-trash','notes-history','notes-history-restore','notes-favorites','notes-open-link','notes-export-preview','notes-export-save','notes-import-choose','notes-import-preview','notes-import-commit','notes-backup-choose','notes-backup-restore'])assert.throws(()=>h.rawHandlers.get(channel)(event),/不受信任/);const preview=h.handlers.get('notes-export-preview')(null,{scope:'all'}),out=path.join(h.dir,'share.json');h.dialog.showSaveDialog=async()=>({canceled:false,filePath:out});await h.handlers.get('notes-export-save')(null,preview.token);const packageData=JSON.parse(fs.readFileSync(out,'utf8'));assert.equal(packageData.document.records[0].fileLinks[0].favoriteId,null);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[out]});await h.handlers.get('notes-import-choose')();const incoming=h.handlers.get('notes-import-preview')(null,'copy');const imported=h.handlers.get('notes-import-commit')(null,incoming.token),copy=imported.document.records.find(item=>item.id!==record.id);await assert.rejects(h.handlers.get('notes-open-link')(null,copy.id,0,'open'),/重新連/);assert.equal(fs.readFileSync(file,'utf8'),'content');});
test('workspace group and quick-action IPC copies sanitized tables and duplicates local records',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(null,'projects'),sheet=state.document.sheets[0],area=state.document.areas[0];assert.equal(area.name,'專案管理');const created=h.handlers.get('notes-record-save')(null,{sheetId:sheet.id,title:'=1+1',notes:'Notes',tags:[],values:{},favoriteIds:[],keepUnlinked:[]}),record=created.document.records[0];h.handlers.get('notes-copy')(null,{kind:'table',ids:[record.id],sheetId:sheet.id});assert.match(h.getCopied(),/'=1\+1/);const copied=h.handlers.get('notes-record-duplicate')(null,record.id,record.version);assert.equal(copied.document.records.length,2);const renamed=h.handlers.get('notes-area-save')(null,{...area,name:'New group',baseRevision:copied.revision});assert.equal(renamed.document.areas[0].name,'New group');const removed=h.handlers.get('notes-area-remove')(null,area.id,renamed.revision);assert.equal(removed.document.records.length,2);assert.equal(removed.document.sheets[0].areaId,null);
});
test('workspace batch trash is main-only, checks revisions and keeps source files intact',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),root=state.document.sheets[0],contacts=state.document.sheets[1],source=path.join(h.dir,'keep.txt');fs.writeFileSync(source,'keep');const favorite=h.handlers.get('favorites-add')(null,[source],[]),client=h.handlers.get('notes-record-save')(null,{sheetId:root.id,title:'Client',notes:'',tags:[],values:{},favoriteIds:[],keepUnlinked:[]}),id=client.result.id;h.handlers.get('notes-record-save')(null,{sheetId:contacts.id,title:'Name only',notes:'',tags:[],values:{[contacts.fields[0].id]:[id]},favoriteIds:favorite.ids,keepUnlinked:[]});const next=h.handlers.get('notes-get')(),record=next.document.records.find(record=>record.id===id);assert.throws(()=>h.handlers.get('notes-batch-trash')(null,[{id,version:record.version}],true,next.revision-1),/已變更/);const result=h.handlers.get('notes-batch-trash')(null,[{id,version:record.version}],true,next.revision);assert.equal(result.result.count,2);assert.equal(fs.readFileSync(source,'utf8'),'keep');
});
test('workspace direct paths and explicit tag links are locally authorized and cannot be forged on import',async t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),sheet=state.document.sheets[0],source=path.join(h.dir,'doc.txt');fs.writeFileSync(source,'keep');const files=h.handlers.get('notes-add-paths')(null,[source]);h.handlers.get('favorites-add-tags')(null,files.ids,['Docs']);const input={sheetId:sheet.id,title:'Client',notes:'',tags:[],values:{},favoriteIds:files.ids,keepUnlinked:[],favoriteTags:['Docs'],keepPendingTags:[]},result=h.handlers.get('notes-record-save')(null,input);assert.equal(result.document.records[0].favoriteTagLinks[0].authorized,true);assert.throws(()=>h.handlers.get('notes-record-save')(null,{...input,favoriteTags:['Unknown']}),/標籤已變更/);const forged=h.handlers.get('notes-record-save')(null,{...input,title:'Forged',favoriteTags:undefined,keepPendingTags:undefined,favoriteTagLinks:[{tag:'Unknown',authorized:true}]});assert.deepEqual(forged.document.records[1].favoriteTagLinks,[]);assert.throws(()=>h.handlers.get('notes-record-save')(null,{...input,favoriteTags:[],keepPendingTags:['Unknown']}),/分享標籤/);h.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});const chosen=await h.handlers.get('notes-choose-paths')(null,'file');assert.ok(chosen.ids.length);h.dialog.showOpenDialog=async()=>({canceled:true});assert.equal((await h.handlers.get('notes-choose-paths')(null,'folder')).canceled,true);assert.equal(fs.readFileSync(source,'utf8'),'keep');
});
test('workspace native menus offer group and table actions and only dispatch the selected local target',t=>{
 const h=harness(t),state=h.handlers.get('notes-template')(),area=state.document.areas[0],sheet=state.document.sheets[1];h.handlers.get('notes-context-menu')(null,'area',area.id);const entries=h.popup().template;assert.ok(entries.some(item=>item.label==='群組名稱與主表設定'));entries.find(item=>item.label==='匯出此群組').click();const message=h.messages.find(item=>item[0]==='notes-context-action');assert.equal(message[1].id,area.id);assert.equal(message[1].command,'export-area');h.handlers.get('notes-context-menu')(null,'sheet',sheet.id);assert.ok(h.popup().template.some(item=>item.label==='設為此群組主表'&&item.enabled));assert.throws(()=>h.handlers.get('notes-context-menu')(null,'sheet','unknown'),/表格已變更/);
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
