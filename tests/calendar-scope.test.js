'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const S=require('../src/calendar-scope'),D=require('../src/desktop-state'),{createSettingsExport}=require('../src/settings-export'),{documentFromHTML}=require('./helpers/dom');
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
test('calendar scope persists table identities, never widens an empty selection, and exports with settings',()=>{
 const id=crypto.randomUUID(),scope={scope:'selected',sheetIds:[id,id],includeStandalone:false};
 assert.deepEqual(D.normalize({calendarScope:scope}).calendarScope,{...scope,sheetIds:[id]});assert.equal(S.allows(scope,id),true);assert.equal(S.allows(scope,crypto.randomUUID()),false);assert.equal(S.allows(scope,null,true),false);
 assert.equal(S.allows({scope:'selected',sheetIds:[]},id),false);assert.equal(S.allows(undefined,id),true);
 assert.throws(()=>S.normalize({...scope,sheetIds:['invalid']},true),/設定無效/);
 const exported=createSettingsExport({settings:{},shortcuts:{},rules:{},presets:[]},{calendarScope:scope},'1.98.0');assert.deepEqual(exported.desktop.calendarScope,{...scope,sheetIds:[id]});
});
test('calendar scope form saves chosen tables and retains edits after a settings update',async()=>{
 const document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8')),$=id=>document.getElementById(id),id=crypto.randomUUID();let changed,patch;
 const window={calendarScope:S,workspaceAPI:{onChanged(){}},desktopAPI:{get:async()=>({calendarScope:S.normalize()}),quickActionOptions:async()=>({sheets:[{id,name:'Logs'}]}),onChanged:fn=>changed=fn,configure:async value=>{patch=value;return {settings:value};}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/calendar-scope-settings.js'),'utf8'),{window,document});window.calendarScopeSettingsUI.init();await tick();
 $('calendar-scope-mode').value='selected';await $('calendar-scope-form').dispatch('change',{target:$('calendar-scope-mode')});const check=$('calendar-scope-tables').querySelector('input');check.checked=true;await $('calendar-scope-form').dispatch('change',{target:check});$('calendar-scope-standalone').checked=false;
 changed({settings:{calendarScope:S.normalize()}});assert.equal($('calendar-scope-mode').value,'selected');
 await $('calendar-scope-form').dispatch('submit');assert.deepEqual(JSON.parse(JSON.stringify(patch)),{calendarScope:{scope:'selected',sheetIds:[id],includeStandalone:false}});assert.match($('calendar-scope-status').textContent,/已儲存/);
});
