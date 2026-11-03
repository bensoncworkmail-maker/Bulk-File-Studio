'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom'),Layout=require('../src/layout-editor');
test('action menus close on outside pointer/focus, Escape and action selection, without closing disclosures',async()=>{
 const document=documentFromHTML('<html><body><details class="notes-overflow"><summary>Menu</summary><button><span>Action</span></button></details><details class="toolbar-more"><summary>More</summary></details><details id="filter"><summary>Filter</summary></details><input></body></html>'),events={};document.addEventListener=(name,fn)=>events[name]=fn;
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/menu-dismiss'),'utf8'),{document});const [one,two,filter]=document.querySelectorAll('details');one.open=filter.open=true;
 events.pointerdown({target:one.querySelector('span')});assert.equal(one.open,true);events.focusin({target:document.querySelector('input')});assert.equal(one.open,false);assert.equal(filter.open,true);
 one.open=true;events.click({target:one.querySelector('span')});assert.equal(one.open,false);two.open=true;let prevented=false;events.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){}});assert.equal(two.open,false);assert.equal(document.activeElement,two.querySelector('summary'));assert.equal(prevented,true);
});
test('layout drag accepts only enabled internal parts and rejects file drags or unknown origin',async()=>{
 const document=documentFromHTML('<html><body><header></header></body></html>'),head=document.querySelector('header'),calls=[];let enabled=false;
 Layout.bind(head,'tools',{enabled:()=>enabled,drop:(...args)=>calls.push(args)});const values={},dataTransfer={types:['application/x-bfs-layout'],setData:(k,v)=>values[k]=v,getData:k=>values[k]};
 await head.dispatch('dragstart',{dataTransfer});assert.equal(values['application/x-bfs-layout'],undefined);enabled=true;await head.dispatch('dragstart',{dataTransfer});assert.equal(values['application/x-bfs-layout'],'tools');values['application/x-bfs-layout']='search';await head.dispatch('drop',{dataTransfer});assert.deepEqual(calls,[['search','tools']]);await head.dispatch('drop',{dataTransfer:{types:['Files']}});assert.equal(calls.length,1);
});

test('floating control order is applied and saved through a limited callback without moving content or header',async()=>{
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/floating.html'),'utf8')),context={document};vm.runInNewContext(fs.readFileSync(require.resolve('../src/layout-editor'),'utf8'),context);let prefs={floatingLayoutEditing:true,floatingControlOrder:['search','tools','tags'],floatingQuickPlacement:'bottom'},saved;
 const editor=context.studioLayoutEditor.floating({get:()=>prefs,save:async patch=>{saved=patch;prefs={...prefs,...patch};},onError:error=>{throw error;}});editor.apply();const tools=document.getElementById('mini-tools-bar');await tools.dispatch('drop',{dataTransfer:{types:['application/x-bfs-layout'],getData:()=> 'tags'}});assert.deepEqual([...saved.floatingControlOrder],['search','tags','tools']);editor.apply();assert.ok(Number(document.getElementById('mini-tags').style.order)<Number(tools.style.order));assert.equal(document.getElementById('mini-header').style.order,'-100');assert.equal(document.getElementById('mini-list').style.order,'0');assert.equal(document.getElementById('mini-quick-actions').style.order,'40');
});
