'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom');

test('sticker title toggles repeatedly at the same point, drags from the header and routes attachment cells',async()=>{
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/log-sticker.html'),'utf8'));
 let collapsed=false,updates;
 const menuPoints=[];
 const data={heading:'客戶 · 案件',title:'案件',links:[{kind:'file',label:'圖片.png',location:'C:/測試'},{kind:'url',label:'相關網址'}],version:12,fields:[],notes:'內容',visit:'在工作區開啟',background:'#ffffff',foreground:'#171717'};
 const actions=[],window={logSticker:{
  menu:async point=>menuPoints.push([point.x,point.y]),get:async()=>({...data,collapsed}),toggle:async()=>({...data,collapsed:collapsed=!collapsed}),drag:async(...input)=>actions.push(input),
  onChanged:callback=>updates=callback,onError:()=>{},visit:async()=>actions.push(['visit']),locate:async()=>{},close:async()=>{},
  openLink:async(...input)=>actions.push(input)
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/log-sticker-ui'),'utf8'),{window,document,setTimeout,clearTimeout});
 await Promise.resolve();
 const heading=document.getElementById('heading'),body=document.getElementById('record');
 assert.equal(heading.textContent,'客戶 · 案件');
 assert.equal(document.getElementById('draft-editor').hidden,true);
 assert.equal(document.getElementById('toggle'),null);
 await heading.dispatch('click');assert.equal(body.hidden,false);
 const header=document.getElementById('sticker-header'),grip=document.getElementById('sticker-grip');
 assert.equal(grip.hidden,true);
 await header.dispatch('contextmenu',{clientX:14,clientY:16});
 heading.getBoundingClientRect=()=>({left:8,bottom:32});
 await heading.dispatch('keydown',{key:'F10',shiftKey:true});
 assert.deepEqual(menuPoints,[[14,16],[8,32]]);
 assert.equal(body.hidden,false);
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
 updates({...data,collapsed:false,showGrip:true});
 assert.equal(grip.hidden,false);
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
 const {settings}=require('../src/desktop-sticker-model'),preferences=settings();
 assert.equal(preferences.showGrip,false);
 assert.equal(preferences.showAttachmentHint,false);
 assert.equal(preferences.openClick,'single');assert.equal(preferences.locationClick,'single');
 assert.equal(settings({showGrip:true}).showGrip,true);
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
 $('color').value='#fafafa';$('tracking').checked=false;$('grip').checked=false;$('attachment-hint').checked=true;
 $('width').value='420';$('height').value='350';$('collapsedWidth').value='220';$('collapsedHeight').value='44';
 await $('form').dispatch('submit');
 assert.equal(JSON.stringify(saved.headers.logs),JSON.stringify({master:'code',item:'date'}));
 assert.equal(saved.headerBackground,'#20304a');assert.equal(saved.opacity,70);
 assert.equal(saved.openClick,'single');assert.equal(saved.locationClick,'double');
 assert.equal(saved.showAttachmentHint,true);
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
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/log-sticker-ui'),'utf8'),{window,document,setTimeout,clearTimeout});
 await Promise.resolve();
 const [name,location]=$('attachment-rows').querySelectorAll('td');
 await name.dispatch('click',{detail:1});await name.dispatch('click',{detail:2});await name.dispatch('dblclick');
 await location.dispatch('click',{detail:1});await location.dispatch('dblclick');
 await name.querySelector('button').dispatch('click',{detail:0});
 assert.deepEqual(actions.map(([, ,action])=>action),['open','show','open']);
 assert.match($('attachment-hint').textContent,/單擊名稱開啟，雙擊位置/);
});


test('draft sticker saves inline after typing, flushes on blur, and preserves text when another window made changes',async()=>{
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/log-sticker.html'),'utf8'));
 const $=id=>document.getElementById(id),full='完整正文'.repeat(3500),calls=[];
 const idle=()=>new Promise(setImmediate);
 let update,runTimer,version=3;
 let latest={kind:'draft',heading:'草稿',title:'草稿',notes:'清單項目',fields:[],links:[],draft:{body:full,version,maxLength:null}};
 const window={confirm:()=>true,logSticker:{
  get:async()=>latest,readDraft:async()=>latest.draft,onChanged:callback=>update=callback,onError(){},
  saveDraft:async(expected,body)=>{
   calls.push({expected,body});
   if(expected!==version)throw Error('草稿已變更，請重新開啟');
   return latest={...latest,draft:{...latest.draft,body,version:++version}};
  }
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/log-sticker-ui'),'utf8'),{
  window,document,setTimeout:task=>{runTimer=task;return 1;},clearTimeout:()=>{runTimer=null;}
 });
 await idle();
 assert.equal($('edit-draft'),null);
 assert.equal($('draft-editor').hidden,false);
 assert.equal($('save-draft'),null);
 const body=$('draft-body');
 assert.equal(body.value,full);
 body.value='尚未儲存';
 await body.dispatch('input');
 assert.deepEqual(calls,[]);
 version++;
 latest={...latest,draft:{...latest.draft,body:'其他視窗更新',version}};
 update(latest);
 assert.equal(body.value,'尚未儲存');
 runTimer();await idle();
 assert.equal(body.value,'尚未儲存');
 assert.match($('draft-status').textContent,/另一個視窗更新/);
 await $('recover-draft').dispatch('click');
 assert.equal(body.value,'其他視窗更新');
 await body.dispatch('compositionstart');
 body.value='新內容';
 await body.dispatch('input');
 assert.equal(runTimer,null);
 await body.dispatch('compositionend');
 assert.equal(typeof runTimer,'function');
 await body.dispatch('blur');await idle();
 assert.deepEqual(calls,[{expected:3,body:'尚未儲存'},{expected:4,body:'新內容'}]);
 assert.equal(runTimer,null);
 assert.equal(body.value,'新內容');
 assert.equal($('draft-status').textContent,'已自動儲存');
 assert.equal($('notes').textContent,'清單項目');
});

test('images load above the attachment list and clicking a thumbnail enlarges the image inside the app',async()=>{
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/log-sticker.html'),'utf8'));
 const $=id=>document.getElementById(id),calls=[];
 const data={heading:'圖片',title:'圖片',fields:[],notes:'',
  links:[{kind:'file',label:'圖.png',location:'C:/圖',image:true}],version:1,openClick:'single',locationClick:'single'};
 let update;
 const window={logSticker:{get:async()=>data,onChanged:callback=>update=callback,onError(){},
  openLink:async(...args)=>{calls.push(args);return 'data:image/png;base64,AA==';}
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/log-sticker-ui'),'utf8'),{window,document,setTimeout,clearTimeout});
 await new Promise(setImmediate);
 const preview=$('image-previews'),sections=$('record').children;
 assert.equal($('attachment-hint').hidden,true);
 assert.ok(sections.indexOf(preview)<sections.indexOf($('attachments')));
 assert.equal(preview.hidden,false);
 assert.equal(preview.querySelector('img').src,'data:image/png;base64,AA==');
 assert.deepEqual(calls,[[0,1,'preview','C:/圖']]);
 const thumbnail=preview.querySelector('button');
 update({...data,version:2,showAttachmentHint:true});
 assert.equal($('attachment-hint').hidden,false);
 assert.equal(preview.querySelector('button'),thumbnail);
 await thumbnail.dispatch('click');
 assert.deepEqual(calls,[[0,1,'preview','C:/圖'],[0,2,'enlarge','C:/圖']]);
 update({...data,collapsed:true});
 assert.equal(preview.hidden,true);
});
