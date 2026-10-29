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
  let contents;const rawHandlers=new Map(),opened=[],shown=[];let copied='';
  const network={};
  class Window {
    constructor() { this.webContents = contents = { on:(name,callback)=>network[name]=callback,setWindowOpenHandler:callback=>network.windowOpen=callback,send() {},session:{webRequest:{onBeforeRequest:callback=>network.request=callback},setPermissionRequestHandler:callback=>network.permission=callback,setPermissionCheckHandler:callback=>network.check=callback,on:(name,callback)=>network[name]=callback} }; }
    loadFile() {}
    setBackgroundColor(value) { this.background = value; }
    isMinimized(){return false;}show(){}focus(){}restore(){}
  }
  const electron = {
    app: {commandLine:{appendSwitch(){}},getVersion:()=>require('../package.json').version, getPath:()=>dir, requestSingleInstanceLock:()=>true, whenReady:()=>({ then:callback=>callback() }), on:(name,callback)=>events.set(name,callback), isPackaged:false },
    BrowserWindow:Window, nativeTheme,
    ipcMain:{ handle:(name,handler)=>{rawHandlers.set(name,handler);handlers.set(name,(_, ...args)=>handler({sender:contents,senderFrame:{url:require('node:url').pathToFileURL(path.join(path.dirname(main),'index.html')).href}},...args));} }, dialog:{}, clipboard:{writeText:text=>{copied=text;}},shell:{openPath:async filepath=>{opened.push(filepath);return '';},showItemInFolder:filepath=>shown.push(filepath)}
  };
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), {
    require:name=>name === 'electron' ? electron : (overrides[name] || realRequire(name)),
    __dirname:path.dirname(main), process
  }, { filename:main });
  return { dir, handlers, rawHandlers, network, opened, shown, getCopied:()=>copied, events, nativeTheme, historyPath:path.join(dir, 'last-rename.json') };
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
