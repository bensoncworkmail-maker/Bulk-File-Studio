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
