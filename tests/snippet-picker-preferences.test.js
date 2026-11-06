'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const M=require('../src/snippet-picker-model'),{DesktopState,normalize}=require('../src/desktop-state'),{documentFromHTML}=require('./helpers/dom');
const plain=value=>JSON.parse(JSON.stringify(value)),flush=()=>new Promise(setImmediate);
test('picker layout validates sizes and exports/resets independently of group memory',()=>{
 const prefs=M.normalize({width:500,height:700,fontSize:18,density:'comfortable',previewLines:2,groupTone:'strong',defaultExpanded:false},true);
 assert.equal(normalize({snippetPicker:prefs}).snippetPicker.width,500);
 for(const patch of [{width:0},{height:Infinity},{fontSize:'13'},{previewLines:3},{rememberGroups:'yes'},{density:'bad'},{groupTone:'bad'}])assert.throws(()=>M.normalize(patch,true),/設定無效/);
 assert.deepEqual(M.normalize({width:0,unknown:true}),M.DEFAULTS);
 const exported=require('../src/settings-export').createSettingsExport({settings:{},rules:{}},{snippetPicker:prefs},'1.83.0');
 assert.deepEqual(exported.desktop.snippetPicker,prefs);assert.equal(exported.desktop.snippetPickerGroups,undefined);
 assert.deepEqual(require('../src/settings-catalog').resetPatch('native','floating',require('../src/desktop-state').DEFAULTS).snippetPicker,M.DEFAULTS);
});
test('group states survive restart, retain filtered-out groups and prune deleted categories without touching settings',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'picker-memory-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'desktop.json');
 const store=new DesktopState(file);store.update({snippetPicker:{width:400,defaultExpanded:false}});
 store.saveSnippetPickerGroups([['Work',false],['Other',true],['',false],['__proto__',true]],['Work','Other','','__proto__']);
 const restored=new DesktopState(file);assert.deepEqual(restored.snippetPickerGroups(),store.snippetPickerGroups());
 restored.saveSnippetPickerGroups([['Work',true]],['Work','Other','','__proto__']);
 assert.equal(new Map(restored.snippetPickerGroups()).get('Other'),true);
 const grouped=M.grouped([{detail:'Work'},{detail:''},{detail:'未分類'},{detail:'new'}],restored.settings.snippetPicker,restored.snippetPickerGroups());
 assert.equal(grouped.find(group=>group.key==='Work').open,true);assert.equal(grouped.find(group=>group.key==='').open,false);assert.equal(grouped.find(group=>group.key==='未分類').open,false);assert.equal(grouped.find(group=>group.key==='new').open,false);
 restored.saveSnippetPickerGroups([['Work',false]],['Work','']);assert.deepEqual(restored.snippetPickerGroups(),[['',false],['Work',false]]);
 assert.throws(()=>restored.saveSnippetPickerGroups([['unknown',true]],['Work']),/狀態無效/);
 const before=restored.snippetPickerGroups();restored.write=()=>{throw new Error('disk full');};assert.throws(()=>restored.saveSnippetPickerGroups([['Work',true]],['Work','']),/disk full/);assert.deepEqual(restored.snippetPickerGroups(),before);
 assert.equal(M.grouped([{detail:'Work'}],M.normalize({rememberGroups:false}),[['Work',false]])[0].open,true);
 const original=new DesktopState(file);original.replaceSnippetPickerGroups([]);assert.deepEqual(new DesktopState(file).snippetPickerGroups(),[]);assert.equal(original.settings.snippetPicker.width,400);
 assert.deepEqual(M.history([['Line\nBreak',true]]),[['Line\nBreak',true]]);
 assert.equal(M.history(Array.from({length:600},(_,i)=>[String(i),false])).length,500);
});
async function renderer(prefs={},groupStates=[]){
 const document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/snippet-picker.html'),'utf8')),saved=[],selected=[];
 const window={snippetPickerModel:M,snippetPicker:{get:async()=>({theme:'light',prefs:M.normalize(prefs),groupStates,rows:[{id:'a',title:'<script>name</script>',groupKey:'Work',summary:'Hello\nSecond line'},{id:'b',title:'Other',groupKey:'Other',summary:'World'}]}),groups:async changes=>{saved.push(plain(changes));},select:async id=>{selected.push(id);},close:async()=>{}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/snippet-picker-ui.js'),'utf8'),{window,document});await flush();return {document,saved,selected,$:id=>document.getElementById(id)};
}
test('renderer restores each category without saving initial toggle events and batches expand/collapse updates',async()=>{
 const h=await renderer({previewLines:2,groupTone:'strong'},[['Work',false]]),groups=h.$('items').querySelectorAll('details'),work=groups.find(g=>g.querySelector('summary').textContent.includes('Work'));
 assert.equal(h.document.body.dataset.groupTone,'strong');assert.equal(work.open,false);assert.equal(h.$('items').querySelectorAll('.picker-row-preview').length,2);assert.equal(h.$('items').querySelectorAll('script').length,0);
 for(const group of groups)await group.dispatch('toggle');assert.deepEqual(h.saved,[]);
 await h.$('collapse-all').dispatch('click');assert.deepEqual(h.saved,[[['Other',false]]]);
 for(const group of groups)await group.dispatch('toggle');assert.equal(h.saved.length,1);
 await h.$('expand-all').dispatch('click');assert.equal(h.saved.length,2);assert.ok(groups.every(group=>group.open));
 work.open=false;await work.dispatch('toggle');assert.deepEqual(h.saved.at(-1),[['Work',false]]);
 const row=work.querySelector('.picker-row');await row.dispatch('click');await row.dispatch('click');assert.deepEqual(h.selected,['a']);
});
test('disabled group memory follows the default every time and does not persist actions',async()=>{
 const h=await renderer({rememberGroups:false,defaultExpanded:false,showCounts:false,showHint:false},[['Work',true]]);
 assert.ok(h.$('items').querySelectorAll('details').every(group=>!group.open));assert.equal(h.$('count').hidden,true);assert.equal(h.$('hint').hidden,true);assert.equal(h.$('items').querySelectorAll('.picker-row-preview').length,0);
 await h.$('expand-all').dispatch('click');assert.deepEqual(h.saved,[]);
});
test('settings form saves booleans and numbers, reports invalid values and resets only group state',async()=>{
 const document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8'));let current={snippetPicker:M.normalize()},resets=0,changed;
 const window={snippetPickerModel:M,desktopAPI:{get:async()=>current,onChanged:callback=>changed=callback,configure:async patch=>{current={...current,...plain(patch)};return {settings:current};},resetSnippetPickerGroups:async()=>resets++}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/snippet-picker-settings.js'),'utf8'),{window,document});window.snippetPickerSettings.init();await flush();const $=id=>document.getElementById(id);
 assert.equal($('snippet-picker-width').value,'360');$('snippet-picker-width').value='450';$('snippet-picker-defaultExpanded').value='false';$('snippet-picker-rememberGroups').checked=false;await $('snippet-picker-width').dispatch('input');
 changed({settings:{snippetPicker:M.normalize({width:700})}});assert.equal($('snippet-picker-width').value,'450');
 await $('snippet-picker-settings').dispatch('submit');assert.equal(current.snippetPicker.width,450);assert.equal(current.snippetPicker.defaultExpanded,false);assert.equal(current.snippetPicker.rememberGroups,false);
 $('snippet-picker-width').value='1';await $('snippet-picker-settings').dispatch('submit');assert.match($('snippet-picker-settings-status').textContent,/設定無效/);assert.equal(current.snippetPicker.width,450);
 await $('snippet-picker-reset-groups').dispatch('click');assert.equal(resets,1);assert.equal(current.snippetPicker.width,450);
});
