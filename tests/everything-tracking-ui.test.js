'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom'),{FavoritesStore}=require('../src/favorites-store'),{EverythingTracking}=require('../src/everything-tracking');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-tracking-ui-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'report.txt');fs.writeFileSync(file,'data');
 const favorites=new FavoritesStore(path.join(dir,'favorites.json')),calls=[],toasts=[],errors=[],intervals=new Map();let tickId=0,failure='';
 const bridge={status:()=>({supported:true,enabled:true,configured:true}),search:async input=>{calls.push(input);if(failure)throw Error(failure);return {rows:[{path:file,name:'report.txt'}],skipped:0,truncated:false};}},service=new EverythingTracking({favorites,bridge}),rule=service.save({name:'Recent large files',text:'dm:last7days size:>200mb',type:'file',mode:'syntax',tags:['工作'],enabled:true});
 const document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8'));document.getElementById('favorites-page').classList.remove('hidden');document.hidden=false;
 const actions=[],api={trackingList:async()=>service.list(),trackingRefresh:id=>service.refresh(id),trackingSave:async input=>service.save(input),trackingRemove:async id=>{service.remove(id);return service.list();},trackingConfigure:async value=>service.configure(value),onTrackingChanged(){},trackingAction:async(id,token,indices,action)=>{const result=service.selection(id,token,indices);actions.push({action,...result});if(action==='favorite')return favorites.addPaths(result.paths,result.tags);return {copied:result.paths.length};}};
 const renamed=[],moved=[],window={everythingAPI:api,confirm:()=>true,movingUI:{start:async(paths,options)=>moved.push({paths,options})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/everything-tracking-ui.js'),'utf8'),{window,document,setInterval:fn=>{intervals.set(++tickId,fn);return tickId;},clearInterval:id=>intervals.delete(id)});
 const callbacks={showToast:value=>toasts.push(value),showFailure:(title,error)=>errors.push(error.message||error),onRename:result=>renamed.push(result),isBusy:()=>false};window.everythingTrackingUI.init(callbacks);
 return {window,document,api,service,rule,file,favorites,calls,actions,toasts,errors,intervals,renamed,moved,callbacks,fail:value=>failure=value,$:id=>document.getElementById(id)};
}
test('both type selectors offer the supported categories and tracked edits retain the selected type',async t=>{
 const h=fixture(t),{FILE_TYPES}=require('../src/everything-query');await flush();
 const expected=['all','file','folder',...Object.keys(FILE_TYPES)];
 for(const id of ['everything-type','everything-rule-type'])assert.deepEqual(h.$(id).querySelectorAll('option').map(option=>option.value),expected);
 h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-edit').dispatch('click');
 h.$('everything-rule-type').value='video';await h.$('everything-rule-form').dispatch('submit');await flush();
 assert.equal(h.service.list().queries[0].type,'video');assert.equal(h.calls.at(-1).type,'video');
 await h.$('everything-tracking-edit').dispatch('click');assert.equal(h.$('everything-rule-type').value,'video');
});

test('tracking shortcuts select, invert, copy and clear only inside an active non-editing results view',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();
 const panel=h.$('everything-tracking-panel'),results=h.$('everything-tracking-results');let prevented=0;
 const key=(key,extra={})=>panel.dispatch('keydown',{key,target:results,preventDefault(){prevented++;},...extra});
 await key('a',{ctrlKey:true});assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');assert.equal(h.document.activeElement,results);
 await key('c',{ctrlKey:true});await flush();assert.equal(h.actions.at(-1).action,'copy');
 await key('C',{ctrlKey:true,shiftKey:true});await flush();assert.equal(h.actions.at(-1).action,'copy-names');
 await key('a',{ctrlKey:true,shiftKey:true});assert.equal(h.$('everything-tracking-selected').textContent,'已選 0 項');
 const check=results.querySelector('input');await key('a',{ctrlKey:true,target:check});assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');
 await key('Escape');assert.equal(h.$('everything-tracking-selected').textContent,'已選 0 項');
 const before=prevented;
 await key('a',{ctrlKey:true,target:h.$('everything-rule-name')});
 h.$('everything-tracking-dialog').showModal();await key('a',{ctrlKey:true});h.$('everything-tracking-dialog').close();
 h.callbacks.isBusy=()=>true;await key('a',{ctrlKey:true});h.callbacks.isBusy=()=>false;
 await key('a',{ctrlKey:true,isComposing:true});await key('a',{ctrlKey:true,altKey:true});await key('a',{ctrlKey:true,repeat:true});await key('a',{ctrlKey:true,defaultPrevented:true});
 h.window.everythingTrackingUI.activate(false);await key('a',{ctrlKey:true});assert.equal(prevented,before);
});

test('new bulk buttons and shortcuts use the validated selection and stage rename or move',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();
 h.api.trackingAction=async(id,token,indices,action)=>{const value=h.service.selection(id,token,indices);h.actions.push({action,...value});return action==='move'||action==='rename'?{paths:value.paths}:{copied:1};};
 await h.$('everything-tracking-select-all').dispatch('click');
 for(const kind of ['copy-names','copy-folders','rename','move']){await h.$('everything-tracking-'+kind).dispatch('click');await flush();assert.equal(h.actions.at(-1).action,kind);}
 assert.equal(h.renamed.length,1);assert.deepEqual(h.moved[0].paths,[h.file]);
 await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'F2'});await flush();assert.equal(h.renamed.length,2);
 await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'m',ctrlKey:true,shiftKey:true});await flush();assert.equal(h.moved.length,2);
 const before=h.calls.length;await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'F5'});await flush();assert.equal(h.calls.length,before+1);
 assert.equal(h.$('everything-tracking-selected').textContent,'已選 0 項');assert.equal(h.$('everything-tracking-rename').disabled,true);assert.deepEqual(h.errors,[]);
});
test('tracked searches refresh on entry, filter tags and provide validated file actions and manual favorites',async t=>{
 const h=fixture(t);await flush();assert.equal(h.calls.length,0);h.window.everythingTrackingUI.activate(true);await flush();assert.equal(h.calls.length,1);assert.equal(h.$('everything-tracking-results').querySelectorAll('article').length,1);assert.match(h.$('everything-tracking-command').textContent,/dm:last7days/);
 const check=h.$('everything-tracking-results').querySelector('input');assert.equal(check.disabled,false);check.checked=true;await check.dispatch('change');assert.equal(h.$('everything-tracking-copy').disabled,false);await h.$('everything-tracking-copy').dispatch('click');await flush();assert.equal(h.actions[0].action,'copy');
 await h.$('everything-tracking-favorite').dispatch('click');await flush();assert.equal(h.favorites.read().items.length,1);assert.deepEqual(h.favorites.read().items[0].tags,['工作']);
 await h.$('everything-tracking-tags').children.find(item=>item.textContent.startsWith('未加標籤')).dispatch('click');await flush();assert.equal(h.$('everything-tracking-results').querySelectorAll('article').length,0);
 await h.$('everything-tracking-tags').children[0].dispatch('click');await flush();assert.equal(h.$('everything-tracking-results').querySelectorAll('article').length,1);assert.deepEqual(h.errors,[]);
});
test('periodic tracking runs only for the active visible view and skips open dialogs',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();const first=h.calls.length;
 h.$('favorites-page').classList.add('hidden');[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,first);
 h.$('favorites-page').classList.remove('hidden');h.$('everything-tracking-dialog').showModal();[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,first);h.$('everything-tracking-dialog').close();[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,first+1);
 h.window.everythingTrackingUI.activate(false);assert.equal(h.intervals.size,0);
});
test('failed updates visibly retain old results and editing can pause, tag, and remove a rule',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();h.fail('offline');await h.$('everything-tracking-refresh').dispatch('click');await flush();assert.equal(h.$('everything-tracking-results').querySelectorAll('article').length,1);assert.match(h.$('everything-tracking-status').textContent,/更新失敗.*offline.*上次結果/);
 await h.$('everything-tracking-edit').dispatch('click');h.$('everything-rule-tags').value='追蹤, 大檔案';h.$('everything-rule-enabled').checked=false;await h.$('everything-rule-form').dispatch('submit');await flush();assert.equal(h.service.list().queries[0].enabled,false);assert.deepEqual(h.service.list().queries[0].tags,['追蹤','大檔案']);assert.equal(h.$('everything-tracking-refresh').disabled,true);
 await h.$('everything-tracking-delete').dispatch('click');await flush();assert.equal(h.service.list().queries.length,0);assert.ok(fs.existsSync(h.file));assert.deepEqual(h.errors,[]);
});
test('a rejected edit keeps the dialog and saved rule unchanged, and interval settings are shared',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-edit').dispatch('click');h.$('everything-rule-text').value='';await h.$('everything-rule-form').dispatch('submit');await flush();assert.equal(h.$('everything-tracking-dialog').open,true);assert.match(h.$('everything-rule-error').textContent,/搜尋條件/);assert.equal(h.service.list().queries[0].text,h.rule.text);assert.equal(h.$('everything-rule-save').disabled,false);
 await h.$('everything-rule-cancel').dispatch('click');h.$('settings-everything-tracking-refresh').value='300';await h.$('settings-everything-tracking-refresh').dispatch('change');assert.equal(h.$('everything-tracking-interval').value,'300');assert.equal(h.service.list().refreshSeconds,300);
});

test('automatic refresh preserves an active result selection until it is cleared',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();const first=h.calls.length,check=h.$('everything-tracking-results').querySelector('input');check.checked=true;await check.dispatch('change');[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,first);assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');
 await h.$('everything-tracking-select-none').dispatch('click');[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,first+1);
});

for(const failure of ['', 'offline'])test('re-entering during an outstanding query reloads its '+(failure?'error':'results')+' with automatic updates disabled',async t=>{
 const h=fixture(t);await flush();h.service.configure(0);h.fail(failure);
 let release;const pending=new Promise(resolve=>{release=resolve;}),refresh=h.api.trackingRefresh;
 h.api.trackingRefresh=async id=>{await pending;return refresh(id);};
 h.window.everythingTrackingUI.activate(true);await flush();assert.equal(h.$('everything-tracking-refresh').disabled,true);
 h.window.everythingTrackingUI.activate(false);h.window.everythingTrackingUI.activate(true);await flush();
 assert.equal(h.intervals.size,0);assert.equal(h.$('everything-tracking-results').querySelectorAll('article').length,0);
 release();await flush();
 assert.equal(h.calls.length,1);assert.equal(h.$('everything-tracking-refresh').disabled,false);
 if(failure)assert.match(h.$('everything-tracking-status').textContent,/更新失敗.*offline/);
 else {assert.equal(h.$('everything-tracking-results').querySelectorAll('article').length,1);assert.match(h.$('everything-tracking-status').textContent,/已更新/);}
 assert.deepEqual(h.errors,[]);
});
