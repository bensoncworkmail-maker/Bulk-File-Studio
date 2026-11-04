'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {documentFromHTML}=require('./helpers/dom');
const model=require('../src/floating-panels-model');

test('floating panel order is normalized and unknown components are rejected on save',()=>{
 const old=require('../src/desktop-state').normalize({floatingHiddenButtons:['planning']});
 assert.deepEqual(old.floatingPanels.enabled,[]);
 const value=model.normalize({order:['snippets','snippets','unknown'],enabled:['snippets']});
 assert.deepEqual(value.order,['snippets','planning']);
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
 const window={},calls=[],day='2026-11-03';
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/tool-views-ui.js'),'utf8'),{window,document});
 const root=document.getElementById('view');
 window.toolViewsUI.mount(root,{
  data:async()=>({month:'2026-11',day,counts:{[day]:2},rows:[{id:'r',title:'行程'}],page:0,last:0}),
  action:async(...args)=>calls.push(args)
 },{kind:'planning',embedded:true},{mode:'calendar',query:'跟進',page:0});
 await new Promise(setImmediate);
 const cell=root.querySelectorAll('button').find(node=>node.dataset.hasEvents==='true');
 assert.ok(cell);
 assert.equal(cell.getAttribute('aria-haspopup'),'menu');
 assert.match(cell.getAttribute('aria-label'),/2 項行程/);
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
