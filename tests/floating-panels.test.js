'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {documentFromHTML}=require('./helpers/dom');
const model=require('../src/floating-panels-model');

test('floating panel order is normalized and unknown components are rejected on save',()=>{
 const old=require('../src/desktop-state').normalize({floatingHiddenButtons:['planning']});
 assert.deepEqual(old.floatingPanels.enabled,[]);
 const value=model.normalize({order:['snippets','snippets','unknown'],enabled:['snippets']});
 assert.deepEqual(value.order,['snippets','planning']);
 assert.equal(value.planningDayMarker,'dot');
 assert.equal(model.normalize({...value,planningDayMarker:'count'},true).planningDayMarker,'count');
 assert.throws(()=>model.normalize({...value,planningDayMarker:'invalid'},true),/設定無效/);
 assert.deepEqual(model.enabledPanels(value),['snippets']);
 assert.throws(()=>model.normalize({...value,enabled:['external-script']},true),/設定無效/);
});

test('component host preserves each mounted view across switching and collapse',()=>{
 const document=documentFromHTML('<html><body><nav id="tabs"></nav><div id="content"></div></body></html>');
 const window={floatingPanelsModel:model};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/floating-panels.js'),'utf8'),{window,document});
 const tabs=document.getElementById('tabs'),root=document.getElementById('content'),calls=[];
 const components=Object.fromEntries(['planning','snippets'].map(id=>[id,{
  mount(area){
   calls.push(['mount',id]);
   area.remove=()=>root.replaceChildren(...root.children.filter(child=>child!==area));
   return {refresh:()=>calls.push(['refresh',id]),dispose:()=>calls.push(['dispose',id])};
  }
 }]));
 const host=window.floatingPanels.create({tabs,root,components,onSelect(){}});
 const prefs=model.normalize({order:['snippets','planning']});
 host.sync({floatingPanels:prefs});
 assert.deepEqual(tabs.children.map(button=>button.dataset.panel),['files','snippets','planning']);
 host.select('planning');
 host.select('snippets');
 host.select('planning');
 assert.deepEqual(calls,[['mount','planning'],['mount','snippets'],['refresh','planning']]);
 host.sync({floatingPanels:prefs,floatingCollapsed:true});
 assert.equal(root.hidden,true);
 host.sync({floatingPanels:prefs,floatingCollapsed:false});
 assert.equal(root.hidden,false);
 host.sync({floatingPanels:{...prefs,enabled:['snippets']}});
 assert.deepEqual(calls.at(-1),['dispose','planning']);
 assert.equal(root.hidden,true);
});

test('embedded month marks dates and opens the external agenda without keeping an inline list',async()=>{
 const document=documentFromHTML('<html><body><section id="view"></section></body></html>');
 const window={},calls=[],day='2026-11-23';
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/tool-views-ui.js'),'utf8'),{window,document});
 const root=document.getElementById('view');
 window.toolViewsUI.mount(root,{
  data:async()=>({month:'2026-11',day,counts:{[day]:102},rows:[{id:'r',title:'行程'}],page:0,last:0}),
  action:async(...args)=>calls.push(args)
 },{kind:'planning',embedded:true},{mode:'calendar',query:'跟進',page:0});
 await new Promise(setImmediate);
 const cell=root.querySelectorAll('button').find(node=>node.dataset.hasEvents==='true');
 assert.ok(cell);
 assert.equal(cell.getAttribute('aria-haspopup'),'menu');
 assert.match(cell.getAttribute('aria-label'),/102 項行程/);
 assert.equal(cell.title,cell.getAttribute('aria-label'));
 assert.equal(cell.querySelector('.tool-view-day-number').textContent,'23');
 assert.equal(cell.querySelector('.tool-view-day-count').textContent,'99+');
 assert.equal(root.querySelector('.tool-view-results').hidden,true);
 cell.getBoundingClientRect=()=>({left:20,bottom:40});
 await cell.dispatch('click');
 assert.equal(calls[0][0],'day-menu');
 assert.equal(calls[0][1].day,day);
 assert.equal(calls[0][1].query,'跟進');
 assert.equal(cell.getAttribute('aria-pressed'),'true');
});

test('clicking a snippet row copies the snippet with the entered customer name',async()=>{
 const document=documentFromHTML('<html><body><section id="view"></section></body></html>');
 const window={},calls=[];
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/tool-views-ui.js'),'utf8'),{window,document});
 const root=document.getElementById('view');
 window.toolViewsUI.mount(root,{
  data:async()=>({rows:[{id:'reply',title:'回覆',summary:'你好'}],categories:[],total:1,page:0,last:0}),
  action:async(...args)=>calls.push(args)
 },{kind:'snippets',embedded:true});
 await new Promise(setImmediate);
 root.querySelector('[aria-label="客戶／稱呼"]').value='陳小姐';
 await root.querySelector('.tool-view-snippet-copy').dispatch('click');
 assert.deepEqual(calls,[['copy','reply','陳小姐']]);
 assert.match(root.querySelector('[role=status]').textContent,/已複製/);
});


test('floating log pins can be collapsed, expanded on demand, and shown without the search results',async()=>{
 const document=documentFromHTML('<html><body><section id="view"></section></body></html>');
 const window={},calls=[],saved=[],root=document.getElementById('view');
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/tool-views-ui.js'),'utf8'),{window,document,clearTimeout,setTimeout});
 let pinned=false;
 const row={id:'row',title:'New Fingerprint',date:'2026-11-09',summary:'已開啟紀錄',sheet:'紀錄',markers:[{label:'狀態',value:'跟進中'}]};
 const view=window.toolViewsUI.mount(root,{
  close(){},action(){},saveFilters:async value=>saved.push({...value}),
  data:async()=>({rows:pinned?[]:[row],pinned:pinned?[row]:[],page:0,last:0,total:pinned?0:1,layout:'list',sort:'recent',
   presentation:{previewLines:2,showCount:true,showEmptyPins:false,showWindowPin:false},
   tables:[{id:'logs',name:'紀錄'}],sheetId:'logs',masters:[],dateFields:[],stateFields:[],states:[]}),
  logRecord:async(action,id,next)=>{
   calls.push([action,id,next]);
   if(action==='pin'){pinned=next;return;}
   if(action==='detail')return {updatedAt:'2026-11-09',fields:row.markers,notes:'完整的跟進內容',tags:[]};
  }
 },{kind:'logs'});
 await new Promise(setImmediate);
 const byText=text=>root.querySelectorAll('button').find(button=>button.textContent===text);
 assert.equal(root.querySelector('.tool-view-pins').hidden,true);
 assert.equal(root.querySelector('time').textContent,'2026-11-09');
 assert.match(root.querySelector('.tool-view-log-preview').textContent,/已開啟紀錄/);

 await root.querySelector('.tool-view-pin-star').dispatch('click');
 const pins=root.querySelector('.tool-view-pins');
 assert.equal(pins.open,true);
 assert.match(pins.textContent,/釘選紀錄 · 1 筆/);
 assert.match(pins.textContent,/跟進中/);
 assert.deepEqual(calls,[['pin','row',true]]);
 await byText('New Fingerprint').dispatch('click');
 await new Promise(setImmediate);
 assert.equal(byText('New Fingerprint').getAttribute('aria-expanded'),'true');
 assert.match(pins.textContent,/完整的跟進內容/);
 await byText('編輯').dispatch('click');
 assert.deepEqual(calls.at(-1),['edit','row',undefined]);
 await byText('只看釘選').dispatch('click');
 await new Promise(setImmediate);
 assert.equal(root.querySelector('.tool-view-results').hidden,true);
 assert.equal(saved.at(-1).pinnedOnly,true);
 await byText('New Fingerprint').dispatch('click');
 assert.equal(byText('New Fingerprint').getAttribute('aria-expanded'),'false');
 assert.doesNotMatch(pins.textContent,/完整的跟進內容/);
 await root.querySelector('.tool-view-pin-star').dispatch('click');
 assert.match(pins.textContent,/釘選紀錄 · 0 筆/);
 view.dispose();
});

test('compact logs can hide previews and toolbar extras while expanding and creating a reminder for a row',async()=>{
 const document=documentFromHTML('<html><body><section id="view"></section></body></html>'),window={},actions=[];
 const root=document.getElementById('view');
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/tool-views-ui.js'),'utf8'),{window,document,clearTimeout,setTimeout});
 const row={id:'record',title:'Report',context:'Client',date:'2026-11-10',summary:'Preview note'};
 const view=window.toolViewsUI.mount(root,{
  close(){},pinWindow(){},saveFilters:async()=>{},
  data:async()=>({rows:[row],pinned:[],page:0,last:0,total:1,layout:'list',sort:'recent',
   presentation:{previewLines:0,showCount:false,showEmptyPins:false,showWindowPin:false},
   tables:[{id:'logs',name:'紀錄'}],sheetId:'logs',masters:[],dateFields:[],stateFields:[],states:[]}),
  action:async(action,id)=>actions.push([action,id]),
  logRecord:async()=>({updatedAt:'2026-11-10',fields:[],notes:'Full note',tags:[]})
 },{kind:'logs'});
 await new Promise(setImmediate);
 assert.equal(root.querySelector('.tool-view-log-preview'),null);
 const master=root.querySelector('.tool-view-log-master');
 assert.equal(master.textContent,'Client');
 assert.equal(master.closest('.tool-view-log-top'),root.querySelector('time').closest('.tool-view-log-top'));
 const toggle=root.querySelectorAll('button').find(button=>button.textContent==='只看釘選');
 assert.equal(toggle.parentElement,root.querySelector('.tool-view-log-filter-footer'));
 assert.equal(root.querySelector('.tool-view-heading'),null);
 assert.equal(root.querySelector('.tool-view-pins').hidden,true);
 assert.equal(root.querySelectorAll('button').find(button=>button.textContent==='釘住視窗').hidden,true);
 assert.equal(root.querySelector('.tool-view-status').textContent,'');
 assert.equal(root.querySelector('[aria-label="新增提醒 Report"]'),null);
 await root.querySelector('.tool-view-log-link').dispatch('click');await new Promise(setImmediate);
 assert.match(root.querySelector('.tool-view-pin-detail').textContent,/Full note/);
 const reminder=root.querySelector('[aria-label="新增提醒 Report"]');assert.ok(reminder.closest('.tool-view-pin-detail'));
 await reminder.dispatch('click');assert.deepEqual(actions,[['reminder','record']]);
 const visit=root.querySelectorAll('button').find(button=>button.textContent==='前往工作區');assert.ok(visit.closest('.tool-view-pin-detail'));await visit.dispatch('click');assert.deepEqual(actions.at(-1),['visit','record']);
 view.dispose();
});

for(const floating of [false,true])test('log blank-space expansion preserves controls and text selection in '+(floating?'floating':'main')+' view',async()=>{
 const document=documentFromHTML('<html><body><section id="view"></section></body></html>');let selection='';const window={getSelection:()=>({toString:()=>selection})},actions=[],reads=[],root=document.getElementById('view');
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/tool-views-ui.js'),'utf8'),{window,document,clearTimeout,setTimeout});
 const row={id:'record',title:'Report',summary:'Preview',date:'2026-11-16',markers:[]},detail=async id=>{reads.push(id);return {updatedAt:'2026-11-16',fields:[],notes:'Full note',tags:[]};};
 const api={data:async()=>({rows:[row],pinned:[],page:0,last:0,total:1,layout:'list',sort:'recent',tables:[{id:'logs',name:'紀錄'}],sheetId:'logs',masters:[],dateFields:[],stateFields:[],states:[]}),action:async(...args)=>actions.push(args),saveFilters:async()=>{}};
 if(floating){api.close=()=>{};api.logRecord=async(action,id)=>action==='detail'?detail(id):undefined;}else api.logDetail=detail;
 const view=window.toolViewsUI.mount(root,api,{kind:'logs'});await new Promise(setImmediate);const item=()=>root.querySelector('.tool-view-log-row');
 assert.equal(reads.length,0);const title=root.querySelector('.tool-view-log-link');assert.equal(title.getAttribute('aria-expanded'),'false');
 for(const props of [{target:title},{ctrlKey:true},{shiftKey:true},{detail:2},{button:2},{defaultPrevented:true}]){await item().dispatch('click',props);assert.equal(item().dataset.expanded,'false');}
 selection='Preview';await item().dispatch('click');assert.equal(reads.length,0);selection='';
 await item().dispatch('click');await new Promise(setImmediate);assert.equal(item().dataset.expanded,'true');assert.equal(reads.length,1);assert.match(root.querySelector('.tool-view-pin-detail').textContent,/Full note/);
 await item().dispatch('click',{target:root.querySelector('.tool-view-pin-detail')});assert.equal(item().dataset.expanded,'true');await item().dispatch('click');assert.equal(item().dataset.expanded,'false');assert.equal(reads.length,1);
 await root.querySelector('.tool-view-log-link').dispatch('click');await new Promise(setImmediate);assert.equal(item().dataset.expanded,'true');assert.equal(reads.length,2);assert.deepEqual(actions,[]);const reminder=root.querySelector('[aria-label="新增提醒 Report"]');assert.ok(reminder.closest('.tool-view-pin-detail'));await reminder.dispatch('click');await root.querySelectorAll('button').find(button=>button.textContent==='前往工作區').dispatch('click');assert.deepEqual(actions.map(args=>args.slice(0,2)),[['reminder','record'],['visit','record']]);view.dispose();
});

test('record browser separates primary search, advanced filters and view options and clears grouped filter chips',async()=>{
 const document=documentFromHTML('<html><body><section id="view"></section></body></html>'),window={},saved=[],requests=[],root=document.getElementById('view');
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/tool-views-ui.js'),'utf8'),{window,document,clearTimeout,setTimeout});
 const view=window.toolViewsUI.mount(root,{saveFilters:async value=>saved.push({...value}),data:async filters=>{requests.push({...filters});return {rows:[],pinned:[],page:0,last:0,total:0,layout:filters.layout||'list',sort:filters.sort||'recent',tables:[{id:'logs',name:'跟進紀錄'}],sheetId:'logs',masters:[{id:'m',title:'示範客戶'}],dateFields:[{id:'date',label:'跟進日期'}],stateFields:[{id:'state',label:'狀態'}],states:['待辦','完成'],presentation:{showCount:true}};},action(){}},{kind:'logs'},{query:'合約',masterId:'m',stateField:'state',value:'待辦',from:'2026-11-01',to:'2026-11-30',page:0});
 await new Promise(setImmediate);
 assert.ok(root.querySelector('[aria-label="所屬主紀錄"]').closest('.tool-view-filter-panel'));assert.ok(root.querySelector('[aria-label="排序"]').closest('.tool-view-display-options'));assert.ok(root.querySelector('[aria-label="日期由"]').closest('.tool-view-advanced'));assert.equal(root.querySelector('.log-filter-chips').children.length,4);
 await root.querySelector('.log-filter-chips').children.find(button=>button.textContent.startsWith('欄位：')).dispatch('click');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(requests.at(-1).stateField,undefined);assert.equal(requests.at(-1).value,undefined);assert.equal(requests.at(-1).masterId,'m');
 await root.querySelectorAll('button').find(button=>button.textContent==='最近 7 天').dispatch('click');await new Promise(resolve=>setTimeout(resolve,10));const recent=requests.at(-1);const days=(new Date(recent.to+'T12:00:00Z')-new Date(recent.from+'T12:00:00Z'))/86400000;assert.equal(days,6);assert.equal(recent.masterId,'m');
 await root.querySelectorAll('button').find(button=>button.textContent==='本月').dispatch('click');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(requests.at(-1).from.slice(-2),'01');assert.ok(Number(requests.at(-1).to.slice(-2))>=28);
 await root.querySelector('.log-filter-chips').children.find(button=>button.textContent.startsWith('日期：')).dispatch('click');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(requests.at(-1).from,undefined);assert.equal(requests.at(-1).to,undefined);assert.equal(requests.at(-1).query,'合約');assert.ok(saved.length>0);view.dispose();
});
