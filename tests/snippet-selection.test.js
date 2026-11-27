'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const os=require('node:os');
const {EventEmitter}=require('node:events');
const {Readable}=require('node:stream');
const {createHash}=require('node:crypto');
const {encodeMessage,readMessage,selectionFromMessage}=require('../src/snippet-selection-message');
const folder=path.resolve(__dirname,'../src/browser-snippet-extension');

test('native message framing preserves multiline Unicode and validates bounded captures',async()=>{
 const text='  多行 🌏\r\n選取文字  ';
 const message=encodeMessage({action:'capture-snippet',text});
 const fragments=[message.subarray(0,2),message.subarray(2,10),message.subarray(10)];
 assert.equal(selectionFromMessage(await readMessage(Readable.from(fragments))),text);
 assert.equal(selectionFromMessage({action:'capture-snippet',text:'\n  '}),null);
 assert.equal(selectionFromMessage({action:'capture-snippet',text:'x'.repeat(20001)}),null);
 assert.equal(selectionFromMessage({action:'unrelated',text}),null);
 await assert.rejects(readMessage(Readable.from([message.subarray(0,10)])),/傳送未完成/);
 await assert.rejects(readMessage(Readable.from([Buffer.from([0,0,255,0])])),/傳送未完成/);
});

test('extension forwards only clicks on its selection context menu',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 const id=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32)
  .replace(/[0-9a-f]/g,char=>String.fromCharCode(97+parseInt(char,16)));
 const {HOST,EXTENSION}=require('../src/snippet-browser-setup');
 assert.equal(id,EXTENSION);
 assert.deepEqual(manifest.permissions,['contextMenus','nativeMessaging']);
 const calls=[],tabs=[];
 let install,click,menu;
 const chrome={
  contextMenus:{create:value=>menu=value,onClicked:{addListener:callback=>click=callback}},
  runtime:{onInstalled:{addListener:callback=>install=callback},getURL:name=>name,
   sendNativeMessage:(name,value,callback)=>{calls.push([name,value]);callback({ok:true});}},
  tabs:{create:value=>tabs.push(value)}
 };
 vm.runInNewContext(fs.readFileSync(path.join(folder,manifest.background.service_worker),'utf8'),{chrome});
 install();
 assert.deepEqual(Array.from(menu.contexts),['selection']);
 click({menuItemId:'other',selectionText:'其他動作'});
 click({menuItemId:menu.id,selectionText:'  選取內容\n'});
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],HOST);
 assert.equal(calls[0][1].text,'  選取內容\n');
 assert.equal(tabs.length,0);
 chrome.runtime.sendNativeMessage=(_name,_value,callback)=>callback({ok:false,reason:'window-not-opened'});
 click({menuItemId:menu.id,selectionText:'又一個片段'});
 assert.equal(tabs[0].url,'connection.html?reason=window-not-opened');
});

test('the browser host acknowledges only a shown editor and removes the handoff files',async t=>{
 const inbox=require('../src/snippet-selection-inbox'),{deliverToApp}=require('../src/snippet-browser-host');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-snippet-handoff-'));
 t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
 const text='  瀏覽器選取的文字 🌏\r\n第二行';
 const input=()=>Readable.from([encodeMessage({action:'capture-snippet',text})]);
 let shown,launchStarted;
 const started=new Promise(resolve=>{launchStarted=resolve;});
 const fakeChild=()=>{
  const child=new EventEmitter();child.unref=()=>{};
  setImmediate(()=>child.emit('spawn'));
  return child;
 };
 const pending=deliverToApp(input(),{folder:dir,launch:(_file,[flag,id],options)=>{
  assert.equal(flag,inbox.INBOX_FLAG);assert.equal(options.stdio,'ignore');
  assert.equal(inbox.receiveSelection(dir,id),text);
  assert.throws(()=>inbox.receiveSelection(dir,id),/ENOENT/);
  shown=()=>inbox.markShown(dir,id);
  launchStarted();
  return fakeChild();
 }});
 let completed=false;
 void pending.then(()=>{completed=true;});
 await started;
 assert.equal(completed,false);
 shown();
 assert.deepEqual(await pending,{ok:true});
 assert.deepEqual(fs.readdirSync(dir),[]);
 assert.deepEqual(await deliverToApp(input(),{folder:dir,launch:fakeChild,timeout:0}),{ok:false,reason:'window-not-opened'});
 assert.deepEqual(fs.readdirSync(dir),[]);
 assert.throws(()=>inbox.receiveSelection(dir,'../invalid'),/無效/);
});

test('parameter templates stay in the toolbox and saved snippet shortcuts open the dedicated page',()=>{
 const toolbox=require('../src/toolbox-model'),quick=require('../src/quick-actions-model');
 assert.equal(toolbox.fromWorkflow('snippets'),'parameters');
 assert.equal(toolbox.get('parameters').workflow,'snippets');
 assert.equal(toolbox.get('snippets'),null);
 const id='db5c5df0-24e4-4b1c-94ea-e23595709c9f',label='管理片段';
 assert.deepEqual(quick.normalize([{id,label,type:'open-tool',tool:'snippets',enabled:false,shortcut:'F7'}],true),
  [{id,label,type:'open-page',page:'snippets',enabled:false,shortcut:'F7'}]);
});
