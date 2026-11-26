'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom');

test('sticker title toggles repeatedly at the same point, drags from the header and routes attachment cells',async()=>{
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/log-sticker.html'),'utf8'));
 let collapsed=false,updates;
 const data={heading:'客戶 · 案件',title:'案件',links:[{kind:'file',label:'圖片.png',location:'C:/測試'},{kind:'url',label:'相關網址'}],version:12,fields:[],notes:'內容',visit:'在工作區開啟',background:'#ffffff',foreground:'#171717'};
 const actions=[],window={logSticker:{
  get:async()=>({...data,collapsed}),toggle:async()=>({...data,collapsed:collapsed=!collapsed}),drag:async(...input)=>actions.push(input),
  onChanged:callback=>updates=callback,onError:()=>{},visit:async()=>actions.push(['visit']),locate:async()=>{},close:async()=>{},
  openLink:async(...input)=>actions.push(input)
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/log-sticker-ui'),'utf8'),{window,document});
 await Promise.resolve();
 const heading=document.getElementById('heading'),body=document.getElementById('record');
 assert.equal(heading.textContent,'客戶 · 案件');
 assert.equal(document.getElementById('toggle'),null);
 await heading.dispatch('click');assert.equal(body.hidden,false);
 const header=document.getElementById('sticker-header'),grip=document.getElementById('sticker-grip');
 const click={target:grip,button:0,pointerId:3,screenX:125,screenY:210};
 for(const [time,expected] of [[10,true],[450,false],[1300,true],[1710,false]]){
  await header.dispatch('pointerdown',{...click,timeStamp:time});
  await header.dispatch('pointerup',{...click,type:'pointerup',timeStamp:time+10});
  await header.dispatch('pointerdown',{...click,target:heading,timeStamp:time+120});
  await header.dispatch('pointerup',{...click,target:heading,type:'pointerup',timeStamp:time+130});
  assert.equal(body.hidden,expected);
  await header.dispatch('dblclick',{...click,timeStamp:time+131});
  assert.equal(body.hidden,expected);
 }
 await header.dispatch('dblclick',{target:document.getElementById('close')});assert.equal(body.hidden,false);
 await heading.dispatch('keydown',{key:'Enter'});assert.equal(body.hidden,true);
 await heading.dispatch('keydown',{key:' '});assert.equal(body.hidden,false);
 const [name,location]=document.getElementById('attachment-rows').querySelectorAll('td');
 await name.querySelector('button').dispatch('click',{detail:1});
 await name.dispatch('dblclick');await location.dispatch('dblclick');
 await location.querySelector('button').dispatch('click',{detail:0});
 await document.getElementById('links').querySelector('button').dispatch('click');
 await document.getElementById('title').querySelector('button').dispatch('click');
 assert.deepEqual(actions,[[0,12,'open','C:/測試'],[0,12,'show','C:/測試'],[0,12,'show','C:/測試'],[1,12],['visit']]);
 updates({...data,heading:'更新內容',collapsed:false,showGrip:false,headerAtBottom:true});
 assert.equal(heading.textContent,'更新內容');assert.equal(grip.hidden,true);
 assert.equal(document.body.classList.contains('header-at-bottom'),true);
 const start={target:heading,button:0,pointerId:3,screenX:200,screenY:100};
 await header.dispatch('pointerdown',start);
 await header.dispatch('pointermove',{...start,screenX:202});
 assert.equal(actions.length,5);
 await header.dispatch('pointermove',{...start,screenX:240,screenY:120});
 await header.dispatch('pointerup',{...start,type:'pointerup',screenX:250,screenY:120,timeStamp:2500});
 await header.dispatch('dblclick',{...click,timeStamp:2501});
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(actions.slice(5),[['start'],['move',50,20],['end']]);
 assert.equal(body.hidden,false);
});

test('sticker settings save both sizes and grip while retaining header fields across tables',async()=>{
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
 $('header-color').value='#20304a';$('opacity').value='70';$('open-click').value='single';$('location-click').value='double';
 $('color').value='#fafafa';$('tracking').checked=false;$('grip').checked=false;
 $('width').value='420';$('height').value='350';$('collapsedWidth').value='220';$('collapsedHeight').value='44';
 await $('form').dispatch('submit');
 assert.equal(JSON.stringify(saved.headers.logs),JSON.stringify({master:'code',item:'date'}));
 assert.equal(saved.headerBackground,'#20304a');assert.equal(saved.opacity,70);
 assert.equal(saved.openClick,'single');assert.equal(saved.locationClick,'double');
 assert.equal(saved.background,'#fafafa');assert.equal(saved.showGrip,false);
 assert.deepEqual({...saved.size},{width:420,height:350,collapsedWidth:220,collapsedHeight:44});
 assert.equal(window.stickerSettingsUI.enabled('tracking'),false);
});


test('sticker attachment gestures are independent and a double click does not open twice in single mode',async()=>{
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/log-sticker.html'),'utf8'));
 const $=id=>document.getElementById(id),actions=[];
 const data={heading:'草稿',title:'草稿',links:[{kind:'file',label:'圖.png',location:'資料夾'}],
  version:1,fields:[],notes:'',openClick:'single',locationClick:'double'};
 const window={logSticker:{get:async()=>data,onChanged(){},onError(){},openLink:async(...args)=>actions.push(args)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/log-sticker-ui'),'utf8'),{window,document});
 await Promise.resolve();
 const [name,location]=$('attachment-rows').querySelectorAll('td');
 await name.dispatch('click',{detail:1});await name.dispatch('click',{detail:2});await name.dispatch('dblclick');
 await location.dispatch('click',{detail:1});await location.dispatch('dblclick');
 await name.querySelector('button').dispatch('click',{detail:0});
 assert.deepEqual(actions.map(([, ,action])=>action),['open','show','open']);
 assert.match($('attachment-hint').textContent,/單擊名稱開啟，雙擊位置/);
});
