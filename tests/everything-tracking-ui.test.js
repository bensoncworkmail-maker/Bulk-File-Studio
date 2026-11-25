'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom'),{FavoritesStore}=require('../src/favorites-store'),{EverythingTracking}=require('../src/everything-tracking');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
function fixture(t,initial={},ruleTags=['工作'],savedRules){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-tracking-ui-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'report.txt');fs.writeFileSync(file,'data');
 const favorites=new FavoritesStore(path.join(dir,'favorites.json')),calls=[],toasts=[],errors=[],intervals=new Map();let tickId=0,failure='',changed=()=>{},documentKey=()=>{};
 const bridge={status:()=>({supported:true,enabled:true,configured:true}),search:async input=>{calls.push(input);if(failure)throw Error(failure);return {rows:[{path:file,name:'report.txt'}],skipped:0,truncated:false};}},service=new EverythingTracking({favorites,bridge}),rule=savedRules?(favorites.write({...favorites.read(),everythingSearches:savedRules}),savedRules[0]):service.save({name:'Recent large files',text:'dm:last7days size:>200mb',type:'file',mode:'syntax',tags:ruleTags,enabled:true});
 const document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8'));document.getElementById('tracking-page').classList.remove('hidden');document.hidden=false;document.addEventListener=(name,handler)=>{if(name==='keydown')documentKey=handler;};
 const actions=[],api={trackingList:async()=>service.list(),trackingManageTag:async input=>{const result=service.manageTag(input);changed();return result;},trackingRefresh:id=>service.refresh(id),trackingSave:async input=>service.save(input),trackingRemove:async id=>{service.remove(id);return service.list();},trackingConfigure:async value=>service.configure(value),onTrackingChanged:callback=>{changed=callback;},trackingAction:async(id,token,indices,action,input)=>{const result=service.selection(id,token,indices);actions.push({action,input,...result});if(action==='favorite')return favorites.addPaths(result.paths,result.tags);return {copied:result.paths.length};}};
 let prefs=require('../src/settings-model').normalize(initial);
 const renamed=[],moved=[],window={everythingViewSettings:require('../src/everything-view-settings'),everythingResultColumns:require('../src/everything-result-columns'),everythingTrackingView:require('../src/everything-tracking-view'),everythingAPI:api,confirm:()=>true,movingUI:{start:async(paths,options)=>moved.push({paths,options})}};
 window.settingsUI={get:()=>prefs,update:patch=>{prefs=require('../src/settings-model').normalize({...prefs,...patch});window.everythingLayout?.sync();}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/everything-layout.js'),'utf8'),{window,document});
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/everything-tracking-ui.js'),'utf8'),{window,document,setInterval:fn=>{intervals.set(++tickId,fn);return tickId;},clearInterval:id=>intervals.delete(id)});
 const callbacks={showToast:value=>toasts.push(value),showFailure:(title,error)=>errors.push(error.message||error),onRename:result=>renamed.push(result),isBusy:()=>false};window.everythingTrackingUI.init(callbacks);
 return {documentKey:event=>documentKey(event),changed:()=>changed(),window,document,api,service,bridge,rule,file,favorites,calls,actions,toasts,errors,intervals,renamed,moved,callbacks,fail:value=>failure=value,$:id=>document.getElementById(id)};
}
test('both type selectors offer the supported categories and tracked edits retain the selected type',async t=>{
 const h=fixture(t),{FILE_TYPES}=require('../src/everything-query');await flush();
 const expected=['all','file','folder',...Object.keys(FILE_TYPES),'custom'];
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
 await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'F2'});await flush();assert.equal(h.renamed.length,1);assert.ok(h.$('everything-inline-rename-name'));await h.$('everything-inline-rename-name').dispatch('keydown',{key:'Escape'});
 await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'m',ctrlKey:true,shiftKey:true});await flush();assert.equal(h.moved.length,2);
 const before=h.calls.length;await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'F5'});await flush();assert.equal(h.calls.length,before+1);
 assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');assert.equal(h.$('everything-tracking-rename').disabled,false);assert.deepEqual(h.errors,[]);
});

test('blank row clicks select with Ctrl and Shift without stealing button actions or selected text',async t=>{
 const h=fixture(t);await flush();const files=[h.file,...['two.txt','three.txt'].map(name=>{const file=path.join(path.dirname(h.file),name);fs.writeFileSync(file,'data');return file;})];
 h.bridge.search=async()=>({rows:files.map(file=>({path:file,name:path.basename(file)})),skipped:0,truncated:false});h.window.everythingTrackingUI.activate(true);await flush();
 const row=i=>h.$('everything-tracking-results').querySelectorAll('tr[data-index]')[i];
 await row(0).dispatch('click');assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');assert.equal(h.$('everything-tracking-rename-item').disabled,false);
 await row(2).dispatch('click',{ctrlKey:true});assert.equal(h.$('everything-tracking-selected').textContent,'已選 2 項');assert.equal(h.$('everything-tracking-rename-item').disabled,true);
 h.window.getSelection=()=>({toString:()=> 'browser shift-selection'});await row(0).dispatch('click',{shiftKey:true});assert.equal(h.$('everything-tracking-selected').textContent,'已選 3 項');h.window.getSelection=()=>null;
 await row(1).dispatch('click',{ctrlKey:true});assert.equal(h.$('everything-tracking-selected').textContent,'已選 2 項');
 const before=row(1);await row(1).dispatch('click',{target:row(1).querySelector('input')});assert.equal(row(1),before,'selection keeps cells alive for dblclick');
 await row(1).dispatch('click',{target:row(1).querySelector('input')});assert.equal(h.$('everything-tracking-selected').textContent,'已選 2 項');
 h.window.getSelection=()=>({toString:()=> 'copied text'});await row(1).dispatch('click');assert.equal(h.$('everything-tracking-selected').textContent,'已選 2 項');
 h.window.getSelection=()=>null;await row(1).dispatch('click');assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');assert.equal(h.actions.length,0);
});

test('F2 opens a single-item rename dialog, confirms the captured token and retains errors for correction',async t=>{
 const h=fixture(t,{everythingRenameMode:'dialog'});await flush();h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-results').querySelector('tr[data-index]').dispatch('click');
 const captured=h.service.list().queries[0].snapshot.token,requests=[];let failure=true;
 h.api.trackingAction=async(id,token,indices,action,input)=>{requests.push({id,token,indices,action,input});if(failure)throw Error('目標已存在');return {changed:1};};
 await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'F2'});
 assert.equal(h.$('everything-item-rename-dialog').open,true);assert.equal(h.$('everything-item-rename-name').value,'report.txt');assert.equal(requests.length,0);assert.equal(h.renamed.length,0);
 h.$('everything-item-rename-name').value='new report.txt';await h.$('everything-item-rename-form').dispatch('submit');await flush();
 assert.equal(h.$('everything-item-rename-dialog').open,true);assert.match(h.$('everything-item-rename-error').textContent,/目標已存在/);assert.equal(h.$('everything-item-rename-save').disabled,false);
 failure=false;await h.$('everything-item-rename-form').dispatch('submit');await flush();assert.equal(h.$('everything-item-rename-dialog').open,false);
 assert.equal(requests[1].token,captured);assert.equal(requests[1].action,'rename-item');assert.deepEqual(Array.from(requests[1].indices),[0]);assert.equal(requests[1].input.name,'new report.txt');
 assert.ok(h.toasts.includes('已重新命名'));assert.equal(h.$('everything-tracking-selected').textContent,'已選 0 項');
});

test('bulk open buttons and Enter shortcuts forward the selection; Enter on a button keeps native activation',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-select-all').dispatch('click');
 h.api.trackingAction=async(id,token,indices,action)=>{h.actions.push({action});return {opened:1,failures:[],canceled:false};};
 for(const kind of ['bulk-open','bulk-locations']){await h.$('everything-tracking-'+kind).dispatch('click');await flush();assert.equal(h.actions.at(-1).action,kind);}
 const panel=h.$('everything-tracking-panel'),target=h.$('everything-tracking-results');
 await panel.dispatch('keydown',{target,key:'Enter'});await flush();assert.equal(h.actions.at(-1).action,'bulk-open');
 await panel.dispatch('keydown',{target,key:'Enter',ctrlKey:true});await flush();assert.equal(h.actions.at(-1).action,'bulk-locations');
 const before=h.actions.length;await panel.dispatch('keydown',{target:h.$('everything-tracking-rename-item'),key:'Enter'});await flush();assert.equal(h.actions.length,before);
});

test('table cells single-click select without replacement and double-click uses the clicked column',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();
 const row=h.$('everything-tracking-body').querySelector('tr[data-index]'),name=row.children[1],location=row.children[2];
 await row.dispatch('click',{target:name,detail:1});assert.equal(h.actions.length,0);assert.equal(h.$('everything-tracking-body').querySelector('tr[data-index]'),row);
 assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');
 await row.dispatch('click',{target:name,detail:2});await name.dispatch('dblclick');await flush();assert.equal(h.actions.at(-1).action,'open');
 const next=h.$('everything-tracking-body').querySelector('tr[data-index]');await next.dispatch('click',{target:next.children[2],detail:1});assert.equal(h.actions.length,1);
 await next.children[2].dispatch('dblclick');await flush();assert.equal(h.actions.at(-1).action,'show');assert.deepEqual(h.actions.at(-1).paths,[h.file]);
});

test('table sorting retains selected snapshot IDs for copy, double-click and F2; Shift follows visible order',async t=>{
 const h=fixture(t);await flush();const names=['z10.txt','a2.txt','b3.txt'],files=names.map(name=>{const file=path.join(path.dirname(h.file),name);fs.writeFileSync(file,name);return file;});
 h.bridge.search=async()=>({rows:files.map((file,i)=>({path:file,name:names[i]})),truncated:false,skipped:0});h.window.everythingTrackingUI.activate(true);await flush();
 const rows=()=>h.$('everything-tracking-body').querySelectorAll('tr[data-index]'),ids=()=>rows().map(row=>row.getAttribute('data-index'));
 assert.deepEqual(ids(),['1','2','0']);await rows()[0].dispatch('click');
 const sort=h.$('everything-tracking-sort-name');sort.focus();await sort.dispatch('click');assert.deepEqual(ids(),['0','2','1']);assert.equal(h.document.activeElement,sort);assert.equal(sort.parentElement.getAttribute('aria-sort'),'descending');
 await h.$('everything-tracking-copy').dispatch('click');await flush();assert.deepEqual(h.actions.at(-1).paths,[files[1]]);
 await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'F2'});assert.equal(h.$('everything-inline-rename-name').value,names[1]);await h.$('everything-inline-rename-name').dispatch('keydown',{key:'Escape'});
 await rows()[0].children[2].dispatch('dblclick');await flush();assert.deepEqual(h.actions.at(-1).paths,[files[0]]);
 await rows()[0].dispatch('click');await rows()[2].dispatch('click',{shiftKey:true});assert.equal(h.$('everything-tracking-selected').textContent,'已選 3 項');
 for(const key of ['location','size','modified']){await h.$('everything-tracking-sort-'+key).dispatch('click');assert.equal(h.$('everything-tracking-selected').textContent,'已選 3 項');assert.equal(h.$('everything-tracking-sort-'+key).parentElement.getAttribute('aria-sort'),'ascending');}
});
test('tracked searches refresh on entry, filter tags and provide validated file actions and manual favorites',async t=>{
 const h=fixture(t);await flush();assert.equal(h.calls.length,0);h.window.everythingTrackingUI.activate(true);await flush();assert.equal(h.calls.length,1);assert.equal(h.$('everything-tracking-results').querySelectorAll('tr[data-index]').length,1);assert.match(h.$('everything-tracking-command').textContent,/dm:last7days/);
 const check=h.$('everything-tracking-results').querySelector('input');assert.equal(check.disabled,false);check.checked=true;await check.dispatch('change');assert.equal(h.$('everything-tracking-copy').disabled,false);await h.$('everything-tracking-copy').dispatch('click');await flush();assert.equal(h.actions[0].action,'copy');
 await h.$('everything-tracking-favorite').dispatch('click');await flush();assert.equal(h.favorites.read().items.length,1);assert.deepEqual(h.favorites.read().items[0].tags,['工作']);
 await h.$('everything-tracking-tags').children.find(item=>item.textContent.startsWith('未加標籤')).dispatch('click');await flush();assert.equal(h.$('everything-tracking-results').querySelectorAll('tr[data-index]').length,0);
 await h.$('everything-tracking-tags').children[0].dispatch('click');await flush();assert.equal(h.$('everything-tracking-results').querySelectorAll('tr[data-index]').length,1);assert.deepEqual(h.errors,[]);
});
test('periodic tracking runs only for the active visible view and skips open dialogs',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();const first=h.calls.length;
 h.$('tracking-page').classList.add('hidden');[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,first);
 h.$('tracking-page').classList.remove('hidden');h.$('everything-tracking-dialog').showModal();[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,first);h.$('everything-tracking-dialog').close();[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,first+1);
 h.window.everythingTrackingUI.activate(false);assert.equal(h.intervals.size,0);
});
test('failed updates visibly retain old results and editing can pause, tag, and remove a rule',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();h.fail('offline');await h.$('everything-tracking-refresh').dispatch('click');await flush();assert.equal(h.$('everything-tracking-results').querySelectorAll('tr[data-index]').length,1);assert.match(h.$('everything-tracking-status').textContent,/更新失敗.*offline.*上次結果/);
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
 assert.equal(h.intervals.size,0);assert.equal(h.$('everything-tracking-results').querySelectorAll('tr[data-index]').length,0);
 release();await flush();
 assert.equal(h.calls.length,1);assert.equal(h.$('everything-tracking-refresh').disabled,false);
 if(failure)assert.match(h.$('everything-tracking-status').textContent,/更新失敗.*offline/);
 else {assert.equal(h.$('everything-tracking-results').querySelectorAll('tr[data-index]').length,1);assert.match(h.$('everything-tracking-status').textContent,/已更新/);}
 assert.deepEqual(h.errors,[]);
});

test('quick copy and row context actions follow the clicked snapshot row after sorting and preserve multi-selection',async t=>{
 const h=fixture(t);await flush();const menus=[];h.window.favoritesUI={showMenu:(_,actions)=>menus.push(actions)};h.api.copyQuery=async id=>h.actions.push({action:'copy-query',id});
 const other=path.join(path.dirname(h.file),'a.pdf');fs.writeFileSync(other,'other');h.bridge.search=async()=>({rows:[{name:'report.txt',path:h.file},{name:'a.pdf',path:other}],truncated:false});
 h.window.everythingTrackingUI.activate(true);await flush();let rows=h.$('everything-tracking-body').querySelectorAll('tr[data-index]');assert.equal(rows[0].getAttribute('data-index'),'1');
 await rows[0].children.at(-1).querySelector('button').dispatch('click');await flush();assert.equal(h.actions.at(-1).action,'copy');assert.deepEqual(h.actions.at(-1).paths,[other]);assert.equal(h.$('everything-tracking-selected').textContent,'已選 0 項');
 await h.$('everything-tracking-copy-query').dispatch('click');await flush();assert.equal(h.actions.at(-1).id,h.rule.id);
 rows=h.$('everything-tracking-body').querySelectorAll('tr[data-index]');await rows[0].dispatch('contextmenu');assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');await menus.at(-1).find(item=>item.label.startsWith('複製完整路徑')).run();assert.deepEqual(h.actions.at(-1).paths,[other]);
 await h.$('everything-tracking-select-all').dispatch('click');rows=h.$('everything-tracking-body').querySelectorAll('tr[data-index]');await rows[0].dispatch('contextmenu');assert.equal(h.$('everything-tracking-selected').textContent,'已選 2 項');assert.equal(menus.at(-1).find(item=>item.label.startsWith('重新命名')).disabled,true);
 await h.$('everything-tracking-select-none').dispatch('click');rows=h.$('everything-tracking-body').querySelectorAll('tr[data-index]');await rows[1].dispatch('contextmenu');await menus.at(-1).find(item=>item.label.startsWith('複製檔名')).run();assert.deepEqual(h.actions.at(-1).paths,[h.file]);
 await h.$('everything-tracking-sort-size').parentElement.dispatch('contextmenu');await menus.at(-1).find(item=>item.label==='依此欄遞減排序').run();assert.equal(h.$('everything-tracking-sort-size').parentElement.getAttribute('aria-sort'),'descending');assert.deepEqual(h.errors,[]);
});
test('startup query preference selects the requested rule, with a first-rule fallback for deleted targets',async t=>{
 const h=fixture(t);await flush();const next=h.service.save({...h.rule,id:undefined,name:'另一個搜尋',text:'dm:today'});h.window.settingsUI={get:()=>({everythingStartQuery:next.id})};h.window.everythingTrackingUI.select(null);h.window.everythingTrackingUI.activate(true);await flush();assert.equal(h.$('everything-tracking-title').textContent,'另一個搜尋');assert.equal(h.$('settings-everything-start-query').value,next.id);
 h.service.remove(next.id);h.window.everythingTrackingUI.select(null);h.window.everythingTrackingUI.activate(true);await flush();assert.equal(h.$('everything-tracking-title').textContent,h.rule.name);assert.match(h.$('settings-everything-start-query').children.at(-1).textContent,/已移除/);
});

test('optional column selection keeps the original four defaults, saves choices, preserves row IDs and restores after restart',async t=>{
 const h=fixture(t);await flush();h.bridge.search=async()=>({rows:[{name:'report.txt',path:h.file,createdMs:1234,runCount:3,attributes:'A'}],truncated:false});h.window.everythingTrackingUI.activate(true);await flush();
 const row=()=>h.$('everything-tracking-body').querySelector('tr[data-index]'),shown=()=>row().querySelectorAll('td[data-column]').filter(cell=>!cell.hidden).map(cell=>cell.getAttribute('data-column'));
 assert.deepEqual(shown(),['name','location','size','modified']);await row().dispatch('click');
 await h.$('everything-tracking-columns').dispatch('click');const choices=h.$('everything-column-choices').querySelectorAll('input');assert.equal(choices.find(check=>check.value==='name').disabled,true);choices.find(check=>check.value==='extension').checked=true;choices.find(check=>check.value==='created').checked=true;choices.find(check=>check.value==='runCount').checked=true;
 await h.$('everything-columns-cancel').dispatch('click');assert.deepEqual(shown(),['name','location','size','modified']);
 await h.$('everything-tracking-columns').dispatch('click');for(const check of h.$('everything-column-choices').querySelectorAll('input'))if(['extension','created','runCount'].includes(check.value))check.checked=true;await h.$('everything-columns-save').dispatch('click');
 assert.deepEqual(shown(),['name','location','size','modified','extension','created','runCount']);assert.equal(h.$('everything-tracking-sort-created').parentElement.hidden,false);assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');assert.equal(row().querySelector('[data-column="extension"]').textContent,'txt');assert.equal(row().querySelector('[data-column="runCount"]').textContent,'3');
 await h.$('everything-tracking-sort-created').dispatch('click');await h.$('everything-tracking-copy').dispatch('click');await flush();assert.deepEqual(h.actions.at(-1).paths,[h.file]);
 const saved=JSON.parse(JSON.stringify(h.window.settingsUI.get())),next=fixture(t,saved);await flush();next.window.everythingTrackingUI.activate(true);await flush();assert.equal(next.$('everything-tracking-sort-created').parentElement.hidden,false);assert.equal(next.window.settingsUI.get().everythingColumns.includes('extension'),true);
 await next.$('everything-tracking-columns').dispatch('click');await next.$('everything-columns-default').dispatch('click');await next.$('everything-columns-save').dispatch('click');assert.deepEqual(next.window.settingsUI.get().everythingColumns,['name','location','size','modified']);assert.equal(next.$('everything-tracking-sort-created').parentElement.hidden,true);
});
test('header context menu can toggle columns and auto-size without changing selection',async t=>{
 const h=fixture(t),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-select-all').dispatch('click');
 await h.$('everything-tracking-sort-name').parentElement.dispatch('contextmenu');assert.equal(menus.at(-1).find(item=>item.label==='✓ 檔案名稱').disabled,true);await menus.at(-1).find(item=>item.label.endsWith('副檔名')).run();assert.equal(h.window.settingsUI.get().everythingColumns.includes('extension'),true);
 await h.$('everything-tracking-sort-name').parentElement.dispatch('contextmenu');await menus.at(-1).find(item=>item.label==='調整適合欄位大小').run();assert.ok(h.window.settingsUI.get().everythingColumnWidths.name>=80);assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');
 await h.$('everything-tracking-autosize').dispatch('click');assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');assert.deepEqual(h.errors,[]);
});

test('each tracking query remembers its active sort and each column direction across switching and restart',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();
 await h.$('everything-tracking-sort-modified').dispatch('click');await h.$('everything-tracking-sort-modified').dispatch('click');assert.equal(h.$('everything-tracking-sort-modified').parentElement.getAttribute('aria-sort'),'descending');
 await h.$('everything-tracking-sort-size').dispatch('click');assert.equal(h.$('everything-tracking-sort-size').parentElement.getAttribute('aria-sort'),'ascending');await h.$('everything-tracking-sort-modified').dispatch('click');assert.equal(h.$('everything-tracking-sort-modified').parentElement.getAttribute('aria-sort'),'descending');
 const other=h.service.save({...h.rule,id:undefined,name:'Other query',text:'dm:today'});h.window.everythingTrackingUI.select(other.id);h.window.everythingTrackingUI.activate(true);await flush();assert.equal(h.$('everything-tracking-sort-name').parentElement.getAttribute('aria-sort'),'ascending');
 await h.$('everything-tracking-sort-size').dispatch('click');await h.$('everything-tracking-sort-size').dispatch('click');h.window.everythingTrackingUI.select(h.rule.id);h.window.everythingTrackingUI.activate(true);await flush();assert.equal(h.$('everything-tracking-sort-modified').parentElement.getAttribute('aria-sort'),'descending');
 const prefs=JSON.parse(JSON.stringify(h.window.settingsUI.get())),next=fixture(t,prefs);await flush();const saved=next.favorites.read();saved.everythingSearches=h.service.read().queries;next.favorites.write(saved);next.window.everythingTrackingUI.select(h.rule.id);next.window.everythingTrackingUI.activate(true);await flush();assert.equal(next.$('everything-tracking-sort-modified').parentElement.getAttribute('aria-sort'),'descending');next.window.everythingTrackingUI.select(other.id);next.window.everythingTrackingUI.activate(true);await flush();assert.equal(next.$('everything-tracking-sort-size').parentElement.getAttribute('aria-sort'),'descending');
});
test('hiding a sorted column uses a temporary fallback and restores its sort when shown again',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-select-all').dispatch('click');await h.$('everything-tracking-sort-modified').dispatch('click');await h.$('everything-tracking-sort-modified').dispatch('click');
 for(const checked of [false,true]){await h.$('everything-tracking-columns').dispatch('click');h.$('everything-column-choices').querySelectorAll('input').find(input=>input.value==='modified').checked=checked;await h.$('everything-columns-save').dispatch('click');assert.equal(h.window.settingsUI.get().everythingSortStates[h.rule.id].key,'modified');assert.equal(h.$('everything-tracking-sort-'+(checked?'modified':'name')).parentElement.getAttribute('aria-sort'),checked?'descending':'ascending');}
 await h.$('everything-tracking-copy').dispatch('click');await flush();assert.deepEqual(h.actions.at(-1).paths,[h.file]);assert.deepEqual(h.errors,[]);
 h.window.settingsUI.update({everythingColumns:['name','size']});h.window.everythingTrackingUI.settingsChanged();await h.$('everything-tracking-sort-name').dispatch('click');assert.equal(h.$('everything-tracking-sort-name').parentElement.getAttribute('aria-sort'),'descending');assert.equal(h.window.settingsUI.get().everythingSortStates[h.rule.id].key,'name');
});
test('collapsed tools preserve count, selection, keyboard and menu actions and remember their state after restart',async t=>{
 const h=fixture(t),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-select-all').dispatch('click');h.$('everything-tracking-copy').focus();const calls=h.calls.length;
 await h.$('everything-tracking-toggle-tools').dispatch('click');assert.equal(h.$('everything-tracking-tools').hidden,true);assert.equal(h.$('everything-tracking-toggle-tools').getAttribute('aria-expanded'),'false');assert.equal(h.document.activeElement,h.$('everything-tracking-toggle-tools'));assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');assert.equal(h.calls.length,calls);
 await h.$('everything-tracking-selected-menu').dispatch('click');await menus.at(-1).find(item=>item.label.startsWith('複製完整路徑')).run();await flush();assert.deepEqual(h.actions.at(-1).paths,[h.file]);assert.equal(h.$('everything-tracking-tools').hidden,true);
 await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'c',ctrlKey:true});await flush();assert.equal(h.actions.at(-1).action,'copy');
 const Settings=require('../src/settings-model'),serialized=JSON.stringify(h.window.settingsUI.get()),next=fixture(t,Settings.load({getItem:key=>key===Settings.KEY?serialized:null}));assert.equal(next.$('everything-tracking-tools').hidden,true);assert.equal(next.$('everything-tracking-tools').contains(next.$('everything-tracking-interval')),true);await flush();assert.equal(next.$('everything-tracking-tools').hidden,true);await next.$('everything-tracking-toggle-tools').dispatch('click');assert.equal(next.$('everything-tracking-tools').hidden,false);assert.equal(next.$('everything-tracking-toggle-tools').getAttribute('aria-expanded'),'true');
});
test('the default results render only visible columns and external preference restore updates the view',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();const row=()=>h.$('everything-tracking-body').querySelector('tr[data-index]');assert.equal(row().querySelectorAll('td[data-column]').length,4);assert.equal(row().querySelector('[data-column="created"]'),null);
 h.window.settingsUI.update({everythingColumns:['name','created'],everythingToolsExpanded:false});h.window.everythingTrackingUI.settingsChanged();assert.equal(row().querySelectorAll('td[data-column]').length,2);assert.equal(h.$('everything-tracking-tools').hidden,true);assert.equal(h.$('everything-tracking-sort-created').parentElement.hidden,false);
});

test('collapsed refresh controls retain the interval, show selection pauses and keep the timer working',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();
 h.$('everything-tracking-interval').value='300';await h.$('everything-tracking-interval').dispatch('change');await flush();
 await h.$('everything-tracking-toggle-tools').dispatch('click');assert.equal(h.$('everything-tracking-tools').contains(h.$('everything-tracking-interval')),true);assert.equal(h.$('everything-tracking-tools').hidden,true);assert.match(h.$('everything-tracking-update-summary').textContent,/每 5 分鐘/);
 const calls=h.calls.length;[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,calls+1);
 await h.$('everything-tracking-select-all').dispatch('click');assert.match(h.$('everything-tracking-update-summary').textContent,/暫停.*已選取/);[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,calls+1);
 await h.$('everything-tracking-toggle-tools').dispatch('click');assert.equal(h.$('everything-tracking-interval').value,'300');assert.equal(h.$('everything-tracking-update-summary').hidden,true);
});
test('pause and resume preserve custom query settings and persist without re-querying paused rules',async t=>{
 const h=fixture(t);await flush();h.service.save({...h.rule,type:'custom',extensions:'pdf;txt'});h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-toggle-tools').dispatch('click');const calls=h.calls.length;
 await h.$('everything-tracking-pause').dispatch('click');await flush();let query=h.service.query(h.rule.id);assert.equal(query.enabled,false);assert.equal(query.type,'custom');assert.equal(query.extensions,'pdf;txt');assert.equal(query.text,h.rule.text);assert.equal(h.calls.length,calls);assert.equal(h.$('everything-tracking-pause').textContent,'恢復追蹤');assert.match(h.$('everything-tracking-update-summary').textContent,/已暫停/);
 h.window.everythingTrackingUI.activate(false);h.window.everythingTrackingUI.activate(true);await flush();[...h.intervals.values()][0]();await flush();assert.equal(h.calls.length,calls);assert.equal(new EverythingTracking({favorites:h.favorites,bridge:h.bridge}).query(h.rule.id).enabled,false);
 await h.$('everything-tracking-pause').dispatch('click');await flush();assert.equal(h.service.query(h.rule.id).enabled,true);assert.equal(h.calls.length,calls+1);assert.equal(h.$('everything-tracking-tools').hidden,true);assert.equal(h.$('everything-tracking-pause').textContent,'暫停追蹤');assert.deepEqual(h.errors,[]);
 h.callbacks.isBusy=()=>true;await h.$('everything-tracking-pause').dispatch('click');assert.equal(h.service.query(h.rule.id).enabled,true);
});
test('copy selected table follows displayed sorting and visible columns through the collapsed menu',async t=>{
 const h=fixture(t),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();const other=path.join(path.dirname(h.file),'a.pdf');fs.writeFileSync(other,'other');h.bridge.search=async()=>({rows:[{name:'report.txt',path:h.file},{name:'a.pdf',path:other}]});h.window.everythingTrackingUI.activate(true);await flush();h.window.settingsUI.update({everythingColumns:['name','extension']});
 await h.$('everything-tracking-select-all').dispatch('click');await h.$('everything-tracking-toggle-tools').dispatch('click');await h.$('everything-tracking-selected-menu').dispatch('click');await menus.at(-1).find(item=>item.label.startsWith('複製所選表格')).run();await flush();assert.deepEqual(h.actions.at(-1).paths,[other,h.file]);assert.deepEqual(Array.from(h.actions.at(-1).input.columns),['name','extension']);assert.match(h.toasts.at(-1),/2 項表格/);assert.equal(h.$('everything-tracking-selected').textContent,'已選 2 項');assert.deepEqual(h.errors,[]);
});


test('Delete and recycle menu use tracked selection while editing, repeated keys and modifier combinations stay protected',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();let calls=0;
 h.api.trackingAction=async(id,token,indices,action)=>{h.service.selection(id,token,indices);assert.equal(action,'trash');calls++;return {canceled:true,trashed:0,failures:[]};};
 const panel=h.$('everything-tracking-panel'),results=h.$('everything-tracking-results'),key=extra=>panel.dispatch('keydown',{key:'Delete',target:results,...extra});
 assert.equal(h.$('everything-tracking-trash').disabled,true);await key();assert.equal(calls,0);await h.$('everything-tracking-select-all').dispatch('click');assert.equal(h.$('everything-tracking-trash').disabled,false);
 for(const extra of [{shiftKey:true},{ctrlKey:true},{metaKey:true},{altKey:true},{repeat:true},{isComposing:true},{target:h.$('everything-rule-name')}])await key(extra);
 h.$('everything-tracking-dialog').showModal();await key();h.$('everything-tracking-dialog').close();assert.equal(calls,0);
 await key();await flush();assert.equal(calls,1);assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');
 let menu;h.window.favoritesUI={showMenu:(_,items)=>menu=items};await h.$('everything-tracking-body').querySelector('tr').dispatch('contextmenu');await menu.find(item=>/資源回收筒/.test(item.label)).run();await flush();assert.equal(calls,2);
 await h.$('everything-tracking-trash').dispatch('click');await flush();assert.equal(calls,3);
});

test('tracking icons populate beside names, preserve selection and reuse loaded icons across sorting',async t=>{
 const h=fixture(t);let calls=0;h.api.trackingIcons=async(id,token,indices)=>{h.service.selection(id,token,indices);calls++;return indices.map(index=>({index,dataURL:'data:image/png;base64,aWNvbg=='}));};await flush();h.window.everythingTrackingUI.activate(true);await flush();
 const name=h.$('everything-tracking-body').querySelector('.everything-tracking-name'),image=name.querySelector('img');assert.equal(name.querySelector('.everything-tracking-file-text').textContent,'report.txt');assert.equal(image.getAttribute('src'),'data:image/png;base64,aWNvbg==');assert.equal(image.alt,'');
 await image.dispatch('load');assert.equal(image.hidden,false);assert.equal(name.querySelector('.everything-tracking-file-icon').hidden,true);
 await name.closest('tr').dispatch('click',{target:image});assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');const before=calls;await h.$('everything-tracking-sort-name').dispatch('click');await flush();assert.equal(calls,before);assert.ok(h.$('everything-tracking-body').querySelector('img').getAttribute('src'));
});


test('late native icons cannot paint a refreshed snapshot and failures keep file fallback',async t=>{
 const h=fixture(t),pending=[];h.api.trackingIcons=(id,token)=>new Promise(resolve=>pending.push({token,resolve}));await flush();h.window.everythingTrackingUI.activate(true);await flush();assert.equal(pending.length,1);
 await h.$('everything-tracking-refresh').dispatch('click');await flush();assert.equal(pending.length,2);assert.notEqual(pending[0].token,pending[1].token);
 pending[0].resolve([{index:0,dataURL:'data:image/png;base64,b2xk'}]);await flush();assert.equal(h.$('everything-tracking-body').querySelector('img').getAttribute('src'),null);
 pending[1].resolve([{index:0,dataURL:''}]);await flush();assert.equal(h.$('everything-tracking-body').querySelector('.everything-tracking-file-icon').hidden,false);
});


test('folder rows show the bundled yellow folder icon and skip native file icon requests',async t=>{
 const h=fixture(t),folder=path.join(path.dirname(h.file),'folder');fs.mkdirSync(folder);h.bridge.search=async()=>({rows:[{path:folder,name:'folder'}],truncated:false});let calls=0;h.api.trackingIcons=async()=>{calls++;return [];};await flush();h.window.everythingTrackingUI.activate(true);await flush();
 const row=h.$('everything-tracking-body').querySelector('tr'),image=row.querySelector('img');assert.equal(image.getAttribute('src'),'folder-icon.svg');assert.equal(image.getAttribute('data-result-index'),null);assert.equal(calls,0);await image.dispatch('load');assert.equal(image.hidden,false);assert.equal(row.querySelector('.everything-tracking-file-icon').hidden,true);
});

test('local result filtering keeps query commands unchanged, selects visible original indices and remains outside collapsed tools',async t=>{
 const h=fixture(t,{everythingToolsExpanded:false}),other=path.join(path.dirname(h.file),'Other.txt');fs.writeFileSync(other,'other');let searches=0;h.bridge.search=async()=>{searches++;return {rows:[{path:h.file,name:'report.txt'},{path:other,name:'Other.txt'}],truncated:false};};await flush();h.window.everythingTrackingUI.activate(true);await flush();
 const filter=h.$('everything-tracking-filter'),before=h.service.query(h.rule.id),calls=searches;assert.equal(h.$('everything-tracking-tools').contains(filter),false);filter.focus();filter.value='other';await filter.dispatch('input');assert.equal(h.document.activeElement,filter);assert.equal(h.$('everything-tracking-filter-count').textContent,'顯示 1 / 2 項');assert.equal(h.$('everything-tracking-body').querySelector('tr').getAttribute('data-index'),'1');assert.deepEqual(h.service.query(h.rule.id),before);assert.equal(searches,calls);
 await h.$('everything-tracking-panel').dispatch('keydown',{key:'a',ctrlKey:true,target:filter});await h.$('everything-tracking-panel').dispatch('keydown',{key:'Delete',target:filter});assert.equal(h.$('everything-tracking-selected').textContent,'已選 0 項');assert.equal(h.actions.length,0);
 await h.$('everything-tracking-panel').dispatch('keydown',{key:'a',ctrlKey:true,target:h.$('everything-tracking-results')});assert.equal(h.$('everything-tracking-selected').textContent,'已選 1 項');await h.$('everything-tracking-copy').dispatch('click');await flush();assert.deepEqual(h.actions.at(-1).paths,[other]);
 filter.value='nothing';await filter.dispatch('input');assert.equal(h.$('everything-tracking-selected').textContent,'已選 0 項');assert.match(h.$('everything-tracking-body').textContent,/沒有符合篩選/);assert.equal(h.$('everything-tracking-select-all').disabled,true);
 await h.$('everything-tracking-filter-clear').dispatch('click');assert.equal(filter.value,'');assert.equal(h.$('everything-tracking-filter-count').textContent,'共 2 項');assert.equal(h.$('everything-tracking-body').querySelectorAll('tr').length,2);
});

test('successful recycling preserves surviving results during a change event and failed ES requery',async t=>{
 const h=fixture(t),other=path.join(path.dirname(h.file),'survivor.txt');fs.writeFileSync(other,'other');h.bridge.search=async()=>({rows:[{path:h.file,name:'report.txt'},{path:other,name:'survivor.txt'}],truncated:false});await flush();h.window.everythingTrackingUI.activate(true);await flush();
 h.api.trackingAction=async(id,token,indices,kind)=>{assert.equal(kind,'trash');const {paths}=h.service.selection(id,token,indices);fs.unlinkSync(paths[0]);h.service.removePaths(paths);h.changed();h.bridge.search=async()=>{throw Error('ES unavailable');};return {trashed:1,failures:[]};};
 const row=h.$('everything-tracking-body').querySelectorAll('tr').find(row=>row.querySelector('.everything-tracking-file-text').textContent==='report.txt');await row.dispatch('click');await h.$('everything-tracking-trash').dispatch('click');await flush();const rows=h.$('everything-tracking-body').querySelectorAll('tr');assert.equal(rows.length,1);assert.equal(rows[0].querySelector('.everything-tracking-file-text').textContent,'survivor.txt');assert.match(h.$('everything-tracking-status').textContent,/ES unavailable/);assert.equal(h.$('everything-tracking-selected').textContent,'已選 0 項');
});


test('result filters stay with each tracked search during this session and survive refresh',async t=>{
 const h=fixture(t);await flush();const second=h.service.save({name:'Second',text:'other',type:'file',mode:'syntax',tags:[],enabled:true});h.window.everythingTrackingUI.activate(true);await flush();
 const filter=h.$('everything-tracking-filter');filter.value='report';await filter.dispatch('input');await h.$('everything-tracking-refresh').dispatch('click');await flush();assert.equal(filter.value,'report');
 const choose=name=>h.$('everything-tracking-rules').querySelectorAll('button').find(button=>button.textContent.includes(name)).dispatch('click');await choose('Second');await flush();assert.equal(filter.value,'');filter.value='no-match';await filter.dispatch('input');await choose('Recent large files');await flush();assert.equal(filter.value,'report');await choose('Second');await flush();assert.equal(filter.value,'no-match');assert.equal(h.service.query(second.id).text,'other');
});


test('a delayed list response cannot overwrite freshly queried result rows',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();const old=h.service.list();let resolve;h.api.trackingList=()=>new Promise(done=>resolve=done);h.changed();h.bridge.search=async()=>({rows:[],truncated:false});await h.$('everything-tracking-refresh').dispatch('click');await flush();resolve(old);await flush();assert.equal(h.$('everything-tracking-body').querySelector('.everything-tracking-file-text'),null);assert.match(h.$('everything-tracking-body').textContent,/目前沒有符合條件/);
});

test('filter help stays out of the row height and opens with hover, focus or click and closes with Escape',async t=>{
 const h=fixture(t);await flush();const help=h.$('everything-tracking-filter-help'),hint=h.$('everything-tracking-filter-hint');assert.equal(hint.hidden,true);assert.equal(hint.parentElement,help.parentElement);assert.match(hint.textContent,/最多 500 項/);assert.equal(help.getAttribute('aria-describedby'),hint.id);assert.equal(h.$('everything-tracking-filter').getAttribute('aria-describedby'),hint.id);
 await help.parentElement.dispatch('mouseenter');assert.equal(hint.hidden,false);await help.parentElement.dispatch('mouseleave');assert.equal(hint.hidden,true);
 help.focus();await help.dispatch('focus');assert.equal(hint.hidden,false);await help.dispatch('keydown',{key:'Escape'});assert.equal(hint.hidden,true);assert.equal(help.getAttribute('aria-expanded'),'false');await help.dispatch('click');assert.equal(hint.hidden,false);await help.dispatch('blur');assert.equal(hint.hidden,true);
});

test('copy action column toggles from headers and column chooser, persists and never becomes a sortable data column',async t=>{
 const h=fixture(t),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();h.window.everythingTrackingUI.activate(true);await flush();
 const root=h.$('everything-tracking-panel'),row=()=>h.$('everything-tracking-body').querySelector('tr'),table=root.querySelector('table'),width=Number.parseInt(table.style.width);assert.equal(row().querySelectorAll('td').length,6);
 await h.$('everything-tracking-copy-header').dispatch('contextmenu');assert.equal(menus.at(-1).some(item=>item.label.includes('遞增')),false);await menus.at(-1).find(item=>item.label.endsWith('複製（操作欄）')).run();assert.equal(h.window.settingsUI.get().everythingShowCopy,false);assert.equal(h.$('everything-tracking-copy-header').hidden,true);assert.equal(root.querySelector('.tracking-copy-col').hidden,true);assert.equal(row().querySelectorAll('td').length,5);assert.equal(Number.parseInt(table.style.width),width-78);
 const next=fixture(t,JSON.parse(JSON.stringify(h.window.settingsUI.get())));await flush();next.window.everythingTrackingUI.activate(true);await flush();assert.equal(next.$('everything-tracking-copy-header').hidden,true);
 await h.$('everything-tracking-columns').dispatch('click');let copy=h.$('everything-column-choices').querySelectorAll('input').find(input=>input.value==='copy-action');assert.equal(copy.checked,false);copy.checked=true;await h.$('everything-columns-save').dispatch('click');assert.equal(h.$('everything-tracking-copy-header').hidden,false);assert.equal(row().querySelectorAll('td').length,6);assert.equal(h.window.settingsUI.get().everythingColumns.includes('copy-action'),false);
 await h.$('everything-tracking-sort-name').parentElement.dispatch('contextmenu');await menus.at(-1).find(item=>item.label.endsWith('複製（操作欄）')).run();assert.equal(row().querySelectorAll('td').length,5);await menus.at(-1).find(item=>item.label==='還原預設四欄').run();assert.equal(h.window.settingsUI.get().everythingShowCopy,true);
});

test('empty result rows span only the data and action columns currently displayed',async t=>{
 const h=fixture(t,{everythingShowCopy:false});h.bridge.search=async()=>({rows:[],truncated:false});await flush();h.window.everythingTrackingUI.activate(true);await flush();assert.equal(h.$('everything-tracking-body').querySelector('td').getAttribute('colspan'),'5');
});

test('Ctrl+F focuses and selects the filter only in the active tracking page with no dialog or busy operation',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();const filter=h.$('everything-tracking-filter');let selected=0,prevented=0;filter.select=()=>selected++;const event=extra=>({key:'f',ctrlKey:true,target:h.$('tab-tracking'),preventDefault(){prevented++;},stopPropagation(){},...extra});
 h.documentKey(event());assert.equal(h.document.activeElement,filter);assert.equal(selected,1);h.$('everything-tracking-filter-clear').focus();h.documentKey(event({target:filter}));assert.equal(selected,2);
 const before=prevented;for(const extra of [{shiftKey:true},{altKey:true},{isComposing:true},{repeat:true},{defaultPrevented:true}])h.documentKey(event(extra));h.$('everything-tracking-dialog').showModal();h.documentKey(event());h.$('everything-tracking-dialog').close();h.callbacks.isBusy=()=>true;h.documentKey(event());h.callbacks.isBusy=()=>false;h.window.everythingTrackingUI.activate(false);h.documentKey(event());assert.equal(prevented,before);
});

test('chosen size units persist, render and copy consistently while native file icons can be disabled',async t=>{
 const h=fixture(t);let icons=0;h.api.trackingIcons=async()=>{icons++;return [];};await flush();h.window.everythingTrackingUI.activate(true);await flush();const unit=h.$('everything-tracking-size-unit');unit.value='KB';await unit.dispatch('change');assert.equal(h.window.settingsUI.get().everythingSizeUnit,'KB');assert.match(h.$('everything-tracking-body').querySelector('[data-column="size"]').textContent,/KB/);
 await h.$('everything-tracking-select-all').dispatch('click');await h.$('everything-tracking-copy-table').dispatch('click');await flush();assert.equal(h.actions.at(-1).input.sizeUnit,'KB');const next=fixture(t,h.window.settingsUI.get());await flush();next.window.everythingTrackingUI.activate(true);await flush();assert.equal(next.$('everything-tracking-size-unit').value,'KB');
 const disabled=fixture(t,{everythingFileIcons:false});disabled.api.trackingIcons=async()=>assert.fail('native icons disabled');await flush();disabled.window.everythingTrackingUI.activate(true);await flush();assert.equal(disabled.$('everything-tracking-body').querySelector('.everything-tracking-file-icon').getAttribute('data-kind'),'file');assert.ok(icons>0);
});

test('shortcut file labels retain a visible shortcut marker beside the loaded target icon',async t=>{
 const h=fixture(t),shortcut=h.file+'.lnk';fs.writeFileSync(shortcut,'link');h.bridge.search=async()=>({rows:[{path:shortcut,name:'Example.lnk'}],truncated:false});h.api.trackingIcons=async()=>[{index:0,dataURL:'data:image/png;base64,aWNvbg=='}];await flush();h.window.everythingTrackingUI.activate(true);await flush();const label=h.$('everything-tracking-body').querySelector('.everything-tracking-file-label');assert.equal(label.getAttribute('data-shortcut'),'true');assert.equal(label.querySelector('img').getAttribute('src'),'data:image/png;base64,aWNvbg==');
});


test('turning off native icons suppresses delayed replies and turning them back on reuses the completed icon',async t=>{
 const h=fixture(t);let resolve;h.api.trackingIcons=()=>new Promise(done=>resolve=done);await flush();h.window.everythingTrackingUI.activate(true);await flush();h.window.settingsUI.update({everythingFileIcons:false});h.window.everythingTrackingUI.settingsChanged();resolve([{index:0,dataURL:'data:image/png;base64,aWNvbg=='}]);await flush();assert.equal(h.$('everything-tracking-body').querySelector('img').getAttribute('src'),null);h.window.settingsUI.update({everythingFileIcons:true});h.window.everythingTrackingUI.settingsChanged();assert.equal(h.$('everything-tracking-body').querySelector('img').getAttribute('src'),'data:image/png;base64,aWNvbg==');
});

test('update status, collapsed controls, timer summary and selection share the same compact heading',async t=>{
 const h=fixture(t,{everythingToolsExpanded:false});await flush();h.window.everythingTrackingUI.activate(true);await flush();
 const heading=h.$('everything-tracking-toggle-tools').parentElement;
 for(const id of ['everything-tracking-status','everything-tracking-update-summary','everything-tracking-selected','everything-tracking-selected-menu'])assert.equal(h.$(id).parentElement,heading);
 assert.match(h.$('everything-tracking-status').textContent,/已更新.*1 項/);assert.equal(h.$('everything-tracking-tools').hidden,true);assert.equal(h.$('everything-tracking-update-summary').hidden,false);
 await h.$('everything-tracking-toggle-tools').dispatch('click');assert.equal(h.$('everything-tracking-status').parentElement,heading);assert.equal(h.$('everything-tracking-tools').hidden,false);
});

test('shared rows retain folder/file fallbacks without disrupting native icon requests for local files',async t=>{
 const h=fixture(t),folder=String.raw`\\10.0.0.1\team\folder`,shared=String.raw`\\10.0.0.1\team\a.txt`,requests=[];
 h.service.inspectShared=async value=>({type:value===folder?'folder':'file',identity:{dev:'1',ino:value,birthtimeNs:'1'}});h.bridge.search=async()=>({rows:[{path:folder,name:'folder'},{path:shared,name:'a.txt'},{path:h.file,name:'report.txt'}]});
 h.api.trackingIcons=async(id,token,indices)=>{requests.push(indices);return [];};await flush();h.window.everythingTrackingUI.activate(true);await flush();
 assert.deepEqual(requests.map(value=>Array.from(value)),[[2]]);assert.equal(h.$('everything-tracking-body').querySelectorAll('tr[data-index]').length,3);assert.deepEqual(h.errors,[]);
});

test('unreachable share diagnostics remain visible in the compact update status',async t=>{
 const h=fixture(t);h.bridge.search=async()=>({rows:[],skipped:199,skippedReasons:['沒有位置的存取權']});await flush();h.window.everythingTrackingUI.activate(true);await flush();assert.match(h.$('everything-tracking-status').textContent,/略過 199 項.*沒有位置的存取權/);
});

test('Shift primary mousedown prevents browser text selection while ordinary text dragging and control clicks remain native',async t=>{
 const h=fixture(t);await flush();const other=path.join(path.dirname(h.file),'second.txt');fs.writeFileSync(other,'data');h.bridge.search=async()=>({rows:[{path:h.file,name:'report.txt'},{path:other,name:'second.txt'}]});h.window.everythingTrackingUI.activate(true);await flush();
 const rows=h.$('everything-tracking-body').querySelectorAll('tr[data-index]'),text=rows[1].querySelector('.everything-tracking-file-text');let prevented=0,nativeText='';
 const down=async(extra={})=>{let canceled=false;await rows[1].dispatch('mousedown',{button:0,target:text,shiftKey:true,...extra,preventDefault(){canceled=true;prevented++;}});return canceled;};
 await rows[0].dispatch('click');assert.equal(await down(),true);await rows[1].dispatch('click',{target:text,button:0,shiftKey:true});assert.equal(h.$('everything-tracking-selected').textContent,'已選 2 項');assert.equal(h.document.activeElement,h.$('everything-tracking-results'));
 for(const extra of [{shiftKey:false},{button:1},{button:2},{target:rows[1].querySelector('input')},{target:rows[1].querySelector('button')}])assert.equal(await down(extra),false);
 const anchor=h.document.createElement('a');rows[1].append(anchor);assert.equal(await down({target:anchor}),false);const editing=h.document.createElement('span');editing.setAttribute('contenteditable','true');rows[1].append(editing);assert.equal(await down({target:editing}),false);
 h.$('everything-tracking-dialog').showModal();assert.equal(await down(),false);h.$('everything-tracking-dialog').close();h.callbacks.isBusy=()=>true;assert.equal(await down(),false);h.callbacks.isBusy=()=>false;
 if(!await down({shiftKey:false}))nativeText='report.txt copied with mouse';h.window.getSelection=()=>({toString:()=>nativeText});await rows[1].dispatch('click',{target:text,button:0});assert.equal(h.$('everything-tracking-selected').textContent,'已選 2 項');assert.equal(nativeText,'report.txt copied with mouse');assert.equal(prevented,1);assert.deepEqual(h.errors,[]);
});

test('inline F2 edits the name cell, selects the stem and preserves the captured row while refresh and shortcuts are paused',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();const create=h.document.createElement.bind(h.document),ranges=[];h.document.createElement=tag=>{const node=create(tag);if(tag==='input')node.setSelectionRange=(a,b)=>ranges.push([a,b]);return node;};
 const row=h.$('everything-tracking-body').querySelector('tr[data-index]');await row.dispatch('click');const token=h.service.list().queries[0].snapshot.token,calls=[];let fail=true;
 h.api.trackingAction=async(id,currentToken,indices,action,input)=>{calls.push({id,token:currentToken,indices:Array.from(indices),action,input});if(fail)throw Error('目標已存在');return {changed:1};};
 await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'F2'});const input=h.$('everything-inline-rename-name');assert.ok(input);assert.equal(input.closest('td').getAttribute('data-column'),'name');assert.equal(input.value,'report.txt');assert.deepEqual(ranges,[[0,6]]);assert.equal(h.$('everything-item-rename-dialog').open,false);assert.equal(h.document.activeElement,input);assert.equal(h.$('everything-tracking-filter').disabled,true);
 const before=h.calls.length;[...h.intervals.values()][0]();h.changed();await flush();h.window.everythingTrackingUI.render();assert.equal(h.calls.length,before);assert.equal(h.$('everything-inline-rename-name'),input);assert.equal(h.$('everything-tracking-body').querySelector('tr[data-index]'),row);
 input.value='new report.txt';await input.dispatch('keydown',{key:'Enter',isComposing:true});await input.dispatch('keydown',{key:'Enter',repeat:true});assert.equal(calls.length,0);await input.dispatch('keydown',{key:'Enter'});await flush();assert.match(h.$('everything-inline-rename-error').textContent,/目標已存在/);assert.equal(input.value,'new report.txt');assert.equal(input.disabled,false);assert.equal(h.document.activeElement,input);assert.equal(input.getAttribute('aria-invalid'),'true');
 await input.dispatch('input');assert.equal(h.$('everything-inline-rename-error').textContent,'');fail=false;await input.dispatch('keydown',{key:'Enter'});await flush();assert.equal(h.$('everything-inline-rename-name'),null);assert.equal(calls[1].token,token);assert.deepEqual(calls[1].indices,[0]);assert.equal(calls[1].input.name,'new report.txt');assert.equal(calls[1].action,'rename-item');assert.equal(h.$('everything-tracking-filter').disabled,false);assert.deepEqual(h.errors,[]);
});

test('Escape or leaving an inline name cancels without sending a rename and ordinary text selection is restored',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();const row=h.$('everything-tracking-body').querySelector('tr[data-index]');await row.dispatch('click');
 for(const event of ['escape','blur']){await h.$('everything-tracking-rename-item').dispatch('click');const input=h.$('everything-inline-rename-name');input.value='cancel.txt';await input.dispatch(event==='escape'?'keydown':'blur',event==='escape'?{key:'Escape'}:{});assert.equal(h.$('everything-inline-rename-name'),null);assert.equal(row.querySelector('.everything-tracking-file-text').hidden,false);assert.equal(row.querySelector('.everything-tracking-file-text').textContent,'report.txt');assert.equal(h.$('everything-tracking-rename-item').disabled,false);}
 assert.equal(h.actions.length,0);assert.equal(fs.existsSync(h.file),true);
 await h.$('everything-tracking-rename-item').dispatch('click');h.window.everythingTrackingUI.activate(false);assert.equal(h.$('everything-inline-rename-name'),null);
});

test('inline rename rejects duplicate submits and defers changed results until cancellation without losing typed input',async t=>{
 const h=fixture(t);await flush();h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-body').querySelector('tr[data-index]').dispatch('click');await h.$('everything-tracking-rename-item').dispatch('click');const input=h.$('everything-inline-rename-name');let reject,calls=0;h.api.trackingAction=()=>{calls++;return new Promise((_,failed)=>reject=failed);};
 input.value='typed.txt';await input.dispatch('keydown',{key:'Enter'});await input.dispatch('keydown',{key:'Enter'});assert.equal(calls,1);assert.equal(input.disabled,true);await input.dispatch('blur');assert.equal(h.$('everything-inline-rename-name'),input);reject(Error('追蹤結果已更新，請重新選取'));await flush();assert.equal(input.value,'typed.txt');assert.match(h.$('everything-inline-rename-error').textContent,/已更新/);assert.equal(input.disabled,false);
 let lists=0;const list=h.api.trackingList;h.api.trackingList=async()=>{lists++;return list();};h.changed();await flush();assert.equal(lists,0);await input.dispatch('keydown',{key:'Escape'});await flush();assert.equal(lists,1);assert.equal(h.$('everything-inline-rename-name'),null);
});

test('inline rename uses the actual sorted source and rejects conflicts before executing an existing relocation plan',async t=>{
 const h=fixture(t),{planRename,executeRelocation}=require('../src/move-core'),{trackingAction}=require('../src/everything-tracking-actions'),other=path.join(path.dirname(h.file),'a.txt');fs.writeFileSync(other,'keep');h.bridge.search=async()=>({rows:[{path:h.file,name:'report.txt'},{path:other,name:'a.txt'}]});await flush();h.window.everythingTrackingUI.activate(true);await flush();
 h.api.trackingAction=async(id,token,indices,action,input)=>trackingAction({tracking:h.service,id,token,indices,action,input,renameItem:(source,name)=>{const moves=planRename(source,name);executeRelocation(moves);return {changed:moves.length,moves};}});
 const rows=h.$('everything-tracking-body').querySelectorAll('tr[data-index]');assert.equal(rows[0].getAttribute('data-index'),'1');await rows[0].dispatch('click');await h.$('everything-tracking-rename-item').dispatch('click');const input=h.$('everything-inline-rename-name');assert.equal(input.value,'a.txt');input.value='report.txt';await input.dispatch('keydown',{key:'Enter'});await flush();assert.ok(h.$('everything-inline-rename-error').textContent.length>0);assert.equal(fs.readFileSync(other,'utf8'),'keep');input.value='renamed.txt';await input.dispatch('keydown',{key:'Enter'});await flush();assert.equal(fs.existsSync(other),false);assert.equal(fs.readFileSync(path.join(path.dirname(other),'renamed.txt'),'utf8'),'keep');assert.equal(fs.readFileSync(h.file,'utf8'),'data');
});

test('selected named, untagged and all tracking tags survive fresh renderer sessions and missing tags fall back to all',async t=>{
 const h=fixture(t,{},['eLearning']);await flush();h.window.everythingTrackingUI.activate(true);await flush();const active=instance=>instance.$('everything-tracking-tags').children.find(button=>button.getAttribute('aria-pressed')==='true');
 await h.$('everything-tracking-tags').children.find(button=>button.textContent.startsWith('eLearning')).dispatch('click');await flush();assert.equal(h.window.settingsUI.get().everythingSelectedTag,'elearning');const restored=fixture(t,JSON.parse(JSON.stringify(h.window.settingsUI.get())),['eLearning']);await flush();assert.match(active(restored).textContent,/eLearning/);assert.equal(restored.$('everything-tracking-rules').children.length,1);
 const missing=fixture(t,h.window.settingsUI.get(),['Other']);await flush();assert.match(active(missing).textContent,/全部追蹤/);assert.equal(missing.window.settingsUI.get().everythingSelectedTag,null);
 await restored.$('everything-tracking-tags').children.find(button=>button.textContent.startsWith('未加標籤')).dispatch('click');await flush();assert.equal(restored.window.settingsUI.get().everythingSelectedTag,'');const untagged=fixture(t,restored.window.settingsUI.get(),[]);await flush();assert.match(active(untagged).textContent,/未加標籤/);
 await untagged.$('everything-tracking-tags').children[0].dispatch('click');await flush();assert.equal(untagged.window.settingsUI.get().everythingSelectedTag,null);const all=fixture(t,untagged.window.settingsUI.get());await flush();assert.match(active(all).textContent,/全部追蹤/);
});

test('restoring tag preferences and removing a selected tag reconcile the displayed search and persist the fallback',async t=>{
 const h=fixture(t);await flush();const other=h.service.save({name:'Learning',text:'ext:txt',type:'file',mode:'syntax',tags:['eLearning'],enabled:true});h.changed();await flush();h.window.settingsUI.update({everythingSelectedTag:'elearning'});h.window.everythingTrackingUI.settingsChanged();await flush();assert.equal(h.$('everything-tracking-rules').children.length,1);assert.match(h.$('everything-tracking-rules').textContent,/Learning/);
 h.service.save({...other,tags:['Other']});h.changed();await flush();assert.equal(h.window.settingsUI.get().everythingSelectedTag,null);assert.equal(h.$('everything-tracking-rules').children.length,2);
});

test('inline folder rename selects the full dotted folder name and multi-selection keeps using the batch action',async t=>{
 const h=fixture(t),folder=path.join(path.dirname(h.file),'folder.with.dots');fs.mkdirSync(folder);h.bridge.search=async()=>({rows:[{path:folder,name:'folder.with.dots'},{path:h.file,name:'report.txt'}]});await flush();h.window.everythingTrackingUI.activate(true);await flush();const create=h.document.createElement.bind(h.document),ranges=[];h.document.createElement=tag=>{const node=create(tag);if(tag==='input')node.setSelectionRange=(a,b)=>ranges.push([a,b]);return node;};
 const rows=h.$('everything-tracking-body').querySelectorAll('tr[data-index]');await rows[0].dispatch('click');await h.$('everything-tracking-rename-item').dispatch('click');assert.deepEqual(ranges,[[0,'folder.with.dots'.length]]);await h.$('everything-inline-rename-name').dispatch('keydown',{key:'Escape'});await h.$('everything-tracking-select-all').dispatch('click');await h.$('everything-tracking-panel').dispatch('keydown',{target:h.$('everything-tracking-results'),key:'F2'});assert.equal(h.$('everything-inline-rename-name'),null);assert.match(h.toasts.at(-1),/只選取一個/);assert.equal(h.$('everything-tracking-rename-item').disabled,true);
});

test('editing a matching query keeps the remembered tag while explicitly opening a newly tracked query makes it visible',async t=>{
 const h=fixture(t,{everythingSelectedTag:'elearning'},['eLearning']);await flush();h.window.everythingTrackingUI.activate(true);await flush();await h.$('everything-tracking-edit').dispatch('click');h.$('everything-rule-name').value='Renamed learning search';await h.$('everything-rule-form').dispatch('submit');await flush();assert.equal(h.window.settingsUI.get().everythingSelectedTag,'elearning');assert.equal(h.$('everything-tracking-rules').children.length,1);
 const other=h.service.save({name:'Different',text:'ext:pdf',type:'file',mode:'syntax',tags:['Work'],enabled:true});h.window.everythingTrackingUI.select(other.id);h.changed();await flush();assert.equal(h.window.settingsUI.get().everythingSelectedTag,null);assert.match(h.$('everything-tracking-title').textContent,/Different/);assert.equal(h.$('everything-tracking-rules').children.length,2);
});

test('successful inline and dialog renames show the new name immediately without querying a stale Everything index',async t=>{
 for(const mode of ['inline','dialog']){
  const h=fixture(t,{everythingRenameMode:mode}),{planRename,executeRelocation}=require('../src/move-core'),{trackingAction}=require('../src/everything-tracking-actions');await flush();h.window.everythingTrackingUI.activate(true);await flush();
  const before=h.calls.length;
  h.api.trackingAction=async(id,token,indices,action,input)=>trackingAction({tracking:h.service,id,token,indices,action,input,renameItem:(source,name)=>{const moves=planRename(source,name);executeRelocation(moves);return {changed:moves.length,moves};}});
  for(const name of ['renamed.txt','again.txt']){
   const token=h.service.list().queries[0].snapshot.token;
   await h.$('everything-tracking-body').querySelector('tr[data-index]').dispatch('click');await h.$('everything-tracking-rename-item').dispatch('click');
   const input=h.$(mode==='inline'?'everything-inline-rename-name':'everything-item-rename-name');input.value=name;
   if(mode==='inline')await input.dispatch('keydown',{key:'Enter'});else await h.$('everything-item-rename-form').dispatch('submit');await flush();
   const row=h.$('everything-tracking-body').querySelector('tr[data-index]');assert.equal(row.querySelector('.everything-tracking-file-text').textContent,name);assert.equal(h.calls.length,before);
   const snapshot=h.service.list().queries[0].snapshot;assert.notEqual(snapshot.token,token);assert.deepEqual(h.service.selection(h.rule.id,snapshot.token,[0]).paths,[path.join(path.dirname(h.file),name)]);
  }
  h.fail('index unavailable');await h.$('everything-tracking-refresh').dispatch('click');await flush();assert.equal(h.$('everything-tracking-body').querySelector('.everything-tracking-file-text').textContent,'again.txt');assert.deepEqual(h.errors,[]);
 }
});

test('selected tracking item and tag survive restart with explicit startup, removed and filtered-out fallbacks',async t=>{
 const h=fixture(t);await flush();const other=h.service.save({...h.rule,id:undefined,name:'Second work search',text:'ext:pdf'}),learning=h.service.save({...h.rule,id:undefined,name:'Learning',text:'ext:docx',tags:['Learning']});h.changed();await flush();
 await h.$('everything-tracking-rules').children.find(button=>button.textContent.startsWith(other.name)).dispatch('click');await flush();assert.equal(h.window.settingsUI.get().everythingLastQuery,other.id);
 const restart=(prefs,rules=h.service.read().queries)=>fixture(t,JSON.parse(JSON.stringify(prefs)),[],rules);
 const restored=restart(h.window.settingsUI.get());await flush();assert.equal(restored.$('everything-tracking-title').textContent,other.name);
 const fixed=restart({...h.window.settingsUI.get(),everythingStartQuery:h.rule.id});await flush();assert.equal(fixed.$('everything-tracking-title').textContent,h.rule.name);
 const missing=restart(h.window.settingsUI.get(),h.service.read().queries.filter(rule=>rule.id!==other.id));await flush();assert.equal(missing.$('everything-tracking-title').textContent,h.rule.name);assert.equal(missing.window.settingsUI.get().everythingLastQuery,h.rule.id);
 const tagged=restart({...h.window.settingsUI.get(),everythingSelectedTag:'learning'});await flush();assert.equal(tagged.$('everything-tracking-title').textContent,learning.name);assert.equal(tagged.window.settingsUI.get().everythingLastQuery,learning.id);
 const taggedRestart=restart(tagged.window.settingsUI.get());await flush();assert.equal(taggedRestart.$('everything-tracking-title').textContent,learning.name);assert.equal(taggedRestart.window.settingsUI.get().everythingSelectedTag,'learning');
 tagged.window.everythingTrackingUI.activate(true);await flush();await tagged.$('everything-tracking-delete').dispatch('click');await flush();assert.equal(tagged.window.settingsUI.get().everythingLastQuery,h.rule.id);assert.equal(tagged.window.settingsUI.get().everythingSelectedTag,null);
});

test('tracking tags expose contextual and keyboard menus while built-in filters cannot be renamed or deleted',async t=>{
 const h=fixture(t),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();h.window.everythingTrackingUI.activate(true);await flush();
 const tags=h.$('everything-tracking-tags').children;await tags[2].dispatch('contextmenu');assert.deepEqual(Array.from(menus[0],item=>item.label),['查看此標籤的追蹤搜尋','新增追蹤搜尋…','重新命名標籤…','刪除標籤…']);assert.equal(h.window.settingsUI.get().everythingSelectedTag,null);
 await tags[2].dispatch('keydown',{key:'F10',shiftKey:true});assert.equal(menus.length,2);assert.equal(tags[2].getAttribute('aria-haspopup'),'menu');
 for(const tag of tags.slice(0,2)){await tag.dispatch('contextmenu');assert.equal(menus.at(-1).length,2);assert.ok(menus.at(-1).every(item=>!/重新命名|刪除/.test(item.label)));}
 await tags[2].dispatch('contextmenu');menus.at(-1)[1].run();assert.equal(h.$('everything-tracking-dialog').open,true);assert.equal(h.$('everything-rule-tags').value,'工作');const before=menus.length;await tags[2].dispatch('contextmenu');assert.equal(menus.length,before);h.$('everything-tracking-dialog').close();
 h.callbacks.isBusy=()=>true;await tags[2].dispatch('contextmenu');assert.equal(menus.length,before);
});

test('renaming and merging an active tracking tag retains the selected query and results despite an early change notification',async t=>{
 const h=fixture(t,{},['Work']),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();h.window.everythingTrackingUI.activate(true);await flush();const other=h.service.save({...h.rule,id:undefined,name:'Another',text:'*',tags:['Existing']});h.changed();await flush();
 const tag=name=>h.$('everything-tracking-tags').children.find(button=>button.textContent.startsWith(name));await tag('Work').dispatch('click');await flush();const calls=h.calls.length;
 await tag('Work').dispatch('contextmenu');menus.at(-1).find(item=>/重新命名/.test(item.label)).run();h.$('everything-tag-name').value='Existing';await h.$('everything-tag-name').dispatch('input');assert.equal(h.$('everything-tag-save').textContent,'合併標籤');await h.$('everything-tag-form').dispatch('submit');await flush();
 assert.equal(h.$('everything-tag-dialog').open,false);assert.equal(h.window.settingsUI.get().everythingSelectedTag,'existing');assert.equal(h.window.settingsUI.get().everythingLastQuery,h.rule.id);assert.equal(h.$('everything-tracking-title').textContent,h.rule.name);assert.equal(h.$('everything-tracking-rules').children.length,2);assert.equal(h.$('everything-tracking-body').querySelector('.everything-tracking-file-text').textContent,'report.txt');assert.equal(h.calls.length,calls);assert.equal(h.service.read().queries.find(query=>query.id===other.id).revision,other.revision);
 const restart=fixture(t,h.window.settingsUI.get(),[],h.service.read().queries);await flush();assert.equal(restart.window.settingsUI.get().everythingSelectedTag,'existing');assert.equal(restart.$('everything-tracking-title').textContent,h.rule.name);assert.deepEqual(h.errors,[]);
});

test('deleting a selected tracking tag requires confirmation, cancellation writes nothing and success retains searches and files',async t=>{
 const h=fixture(t),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();h.window.everythingTrackingUI.activate(true);await flush();const tag=()=>h.$('everything-tracking-tags').children.find(button=>button.textContent.startsWith('工作'));await tag().dispatch('click');await flush();const before=h.favorites.read();
 const open=async()=>{await tag().dispatch('contextmenu');menus.at(-1).find(item=>/刪除/.test(item.label)).run();};await open();assert.equal(h.document.activeElement,h.$('everything-tag-cancel'));assert.match(h.$('everything-tag-description').textContent,/1 個追蹤搜尋/);assert.equal(h.$('everything-tag-name').disabled,true);await h.$('everything-tag-cancel').dispatch('click');assert.deepEqual(h.favorites.read(),before);
 await open();await h.$('everything-tag-form').dispatch('submit');await flush();assert.equal(h.service.read().queries.length,1);assert.deepEqual(h.service.read().queries[0].tags,[]);assert.equal(h.window.settingsUI.get().everythingSelectedTag,null);assert.equal(h.window.settingsUI.get().everythingLastQuery,h.rule.id);assert.equal(h.$('everything-tracking-body').querySelectorAll('tr[data-index]').length,1);assert.ok(fs.existsSync(h.file));assert.deepEqual(h.errors,[]);
});

test('tag editor preserves typed input on stale data and rejects duplicate submits and dismissal during a save',async t=>{
 const h=fixture(t),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();const tag=h.$('everything-tracking-tags').children[2];await tag.dispatch('contextmenu');menus.at(-1).find(item=>/重新命名/.test(item.label)).run();h.$('everything-tag-name').value='Typed';
 let reject,calls=0;h.api.trackingManageTag=()=>{calls++;return new Promise((_,fail)=>reject=fail);};await h.$('everything-tag-form').dispatch('submit');await h.$('everything-tag-form').dispatch('submit');assert.equal(calls,1);let prevented=false;await h.$('everything-tag-dialog').dispatch('cancel',{preventDefault(){prevented=true;}});assert.equal(prevented,true);await h.$('everything-tag-cancel').dispatch('click');assert.equal(h.$('everything-tag-dialog').open,true);
 reject(Error('標籤的追蹤搜尋已變更'));await flush();assert.equal(h.$('everything-tag-name').value,'Typed');assert.match(h.$('everything-tag-error').textContent,/已變更/);assert.equal(h.$('everything-tag-save').disabled,false);assert.deepEqual(h.service.read().queries[0].tags,['工作']);
});

test('tag rename rejects comma separators without splitting tags and a corrected name survives query editing and prefilled creation',async t=>{
 const h=fixture(t,{},['Work']),menus=[];h.window.favoritesUI={showMenu:(_,items)=>menus.push(items)};await flush();h.window.everythingTrackingUI.activate(true);await flush();
 await h.$('everything-tracking-tags').children[2].dispatch('contextmenu');menus.at(-1).find(item=>/重新命名/.test(item.label)).run();const before=h.favorites.read();
 for(const value of ['Work, personal','Work，personal']){
  h.$('everything-tag-name').value=value;await h.$('everything-tag-form').dispatch('submit');await flush();assert.equal(h.$('everything-tag-dialog').open,true);assert.equal(h.$('everything-tag-name').value,value);assert.match(h.$('everything-tag-error').textContent,/逗號/);assert.deepEqual(h.favorites.read(),before);
 }
 h.$('everything-tag-name').value='Work personal';await h.$('everything-tag-form').dispatch('submit');await flush();assert.equal(h.$('everything-tag-dialog').open,false);
 await h.$('everything-tracking-edit').dispatch('click');await h.$('everything-rule-form').dispatch('submit');await flush();assert.deepEqual(h.service.read().queries[0].tags,['Work personal']);
 await h.$('everything-tracking-tags').children[2].dispatch('contextmenu');menus.at(-1).find(item=>/新增/.test(item.label)).run();assert.equal(h.$('everything-rule-tags').value,'Work personal');h.$('everything-rule-name').value='Another';h.$('everything-rule-text').value='ext:pdf';await h.$('everything-rule-form').dispatch('submit');await flush();assert.deepEqual(h.service.read().queries[1].tags,['Work personal']);assert.deepEqual(h.errors,[]);
});


test('Everything restores selected paths across refresh, reordered indices and a fresh renderer',async t=>{
 const h=fixture(t);await flush();
 const files=['alpha.txt','beta.txt','gamma.txt'].map(name=>path.join(path.dirname(h.file),name));
 for(const file of files)fs.writeFileSync(file,'data');
 const search=paths=>async()=>({rows:paths.map(file=>({path:file,name:path.basename(file)})),skipped:0,truncated:false});
 h.bridge.search=search(files);
 h.window.everythingTrackingUI.activate(true);await flush();
 const rows=()=>h.$('everything-tracking-body').querySelectorAll('tr[data-index]');
 await h.$('everything-tracking-select-all').dispatch('click');
 await rows()[1].dispatch('click');
 assert.match(h.$('everything-tracking-selected').textContent,/1 項/);
 await rows()[2].dispatch('click',{ctrlKey:true});
 const prefs=JSON.parse(JSON.stringify(h.window.settingsUI.get()));
 assert.deepEqual(prefs.everythingSelections[h.rule.id],files.slice(1));
 h.bridge.search=search([files[2],files[0],files[1]]);
 await h.$('everything-tracking-refresh').dispatch('click');await flush();
 assert.equal(rows()[0].querySelector('input').checked,false);
 assert.equal(rows()[1].querySelector('input').checked,true);
 assert.equal(rows()[2].querySelector('input').checked,true);
 await h.$('everything-tracking-copy').dispatch('click');await flush();
 assert.deepEqual(new Set(h.actions.at(-1).paths),new Set(files.slice(1)));
 const fresh=fixture(t,prefs,[],h.favorites.read().everythingSearches);await flush();
 fresh.bridge.search=search([files[1],files[0]]);
 fresh.window.everythingTrackingUI.activate(true);await flush();
 assert.equal(fresh.$('everything-tracking-selected').textContent,'已選 1 項');
 await fresh.$('everything-tracking-copy').dispatch('click');await flush();
 assert.deepEqual(fresh.actions.at(-1).paths,[files[1]]);
});
