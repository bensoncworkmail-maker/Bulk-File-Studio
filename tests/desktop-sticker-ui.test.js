'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom');

test('sticker title double-click and keyboard toggle its body while links use versioned actions',async()=>{
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/log-sticker.html'),'utf8'));
 let collapsed=false,updates;
 const data={heading:'客戶 · 案件',title:'案件',links:[{label:'附件'}],version:12,fields:[],notes:'內容',visit:'在工作區開啟',background:'#ffffff',foreground:'#171717'};
 const actions=[],window={logSticker:{
  get:async()=>({...data,collapsed}),toggle:async()=>({...data,collapsed:collapsed=!collapsed}),
  onChanged:callback=>updates=callback,onError:()=>{},visit:async()=>{},locate:async()=>{},close:async()=>{},
  openLink:async(...input)=>actions.push(input)
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/log-sticker-ui'),'utf8'),{window,document});
 await Promise.resolve();
 const heading=document.getElementById('heading'),body=document.getElementById('record');
 assert.equal(heading.textContent,'客戶 · 案件');
 assert.equal(document.getElementById('toggle'),null);
 await heading.dispatch('click');assert.equal(body.hidden,false);
 await heading.dispatch('dblclick');assert.equal(body.hidden,true);
 await heading.dispatch('keydown',{key:'Enter'});assert.equal(body.hidden,false);
 await document.getElementById('links').querySelector('button').dispatch('click');
 assert.deepEqual(actions,[[0,12]]);
 updates({...data,heading:'更新內容',collapsed:true});
 assert.equal(heading.textContent,'更新內容');assert.equal(body.hidden,true);
});

test('sticker settings retain distinct header fields across table changes',async()=>{
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/index.html'),'utf8'));
 const $=id=>document.getElementById('sticker-settings-'+id);
 const preferences=require('../src/desktop-sticker-model').settings();
 const options=[
  {id:'logs',name:'紀錄',group:'客戶',itemFields:[{id:'title',label:'紀錄標題'},{id:'date',label:'日期'}],masterFields:[{id:'title',label:'紀錄標題'},{id:'code',label:'客戶代號'}]},
  {id:'projects',name:'專案',group:'',itemFields:[{id:'title',label:'紀錄標題'}],masterFields:[]}
 ];
 let saved;
 const window={
  stickersAPI:{get:async()=>({preferences,tables:options,counts:{records:0,files:0,visible:0}}),onChanged:()=>{}},
  workspaceAPI:{onChanged:()=>{}},
  desktopAPI:{configure:async patch=>{saved=patch.desktopStickers;return {settings:patch};},onChanged:()=>{}}
 };
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/sticker-settings.js'),'utf8'),{window,document,structuredClone});
 window.stickerSettingsUI.init();await new Promise(resolve=>setImmediate(resolve));
 assert.equal($('table').value,'logs');
 $('master').value='code';await $('master').dispatch('change');
 $('item').value='date';await $('item').dispatch('change');
 $('table').value='projects';await $('table').dispatch('change');
 assert.equal($('master').disabled,true);
 $('table').value='logs';await $('table').dispatch('change');
 assert.equal($('item').value,'date');assert.equal($('master').value,'code');
 $('color').value='#fafafa';$('tracking').checked=false;
 await $('form').dispatch('submit');
 assert.equal(JSON.stringify(saved.headers.logs),JSON.stringify({master:'code',item:'date'}));
 assert.equal(saved.background,'#fafafa');
 assert.equal(window.stickerSettingsUI.enabled('tracking'),false);
});
