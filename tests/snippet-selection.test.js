'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
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
});

test('parameter templates and snippet management are top-level toolbox destinations',()=>{
 const toolbox=require('../src/toolbox-model');
 assert.equal(toolbox.fromWorkflow('snippets'),'parameters');
 assert.equal(toolbox.get('parameters').workflow,'snippets');
 assert.equal(toolbox.parent('snippets'),'snippets');
 assert.ok(toolbox.primary.some(route=>route.id==='snippets'&&route.panel==='snippets'));
});
