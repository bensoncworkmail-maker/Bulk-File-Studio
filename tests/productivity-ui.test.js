'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{documentFromHTML}=require('./helpers/dom'),M=require('../src/notes-model'),P=require('../src/productivity-model');
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function harness(){
 const document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8')),proto=Object.getPrototypeOf(document.createElement('div'));
 if(!proto.productivityPatched){const value=Object.getOwnPropertyDescriptor(proto,'value');Object.defineProperty(proto,'value',{get(){if(this.tagName==='SELECT'&&this._value===undefined)return this.children.find(child=>child.attributes.selected!==undefined)?.value??this.children[0]?.value??'';return value.get.call(this);},set:value.set});const match=proto.matches;proto.matches=function(selector){return (!selector.includes(':checked')||this.checked)&&match.call(this,selector.replace(/:checked/g,''));};Object.defineProperty(proto,'options',{get(){return this.children;}});Object.defineProperty(proto,'isConnected',{get(){let el=this;while(el.parentElement)el=el.parentElement;return el.tagName==='DOCUMENT';}});Object.defineProperty(proto,'selectedIndex',{set(value){this.value=this.children[value]?.value||'';},get(){return this.children.findIndex(child=>child.value===this.value);}});proto.productivityPatched=true;}
 const doc=M.template(()=>crypto.randomUUID(),new Date().toISOString(),'projects'),sheet=doc.sheets[0],record={id:crypto.randomUUID(),sheetId:sheet.id,title:'<script>客戶 A</script>',notes:'測試',tags:[],values:{[sheet.fields.find(field=>field.type==='date').id]:new Date().toLocaleDateString('sv-SE')},fileLinks:[{favoriteId:null,path:'/data/a.txt',label:'',type:'file'}],version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),deletedAt:null};doc.records=[record];
 let state={data:{version:1,rules:[],worksets:[],snippets:[]},workspace:{revision:1,document:doc},favorites:[{id:crypto.randomUUID(),path:'/data/a.txt',type:'file',status:'ready',label:'附件',reason:''}],reminders:{items:[]},backups:[]},failure=null,reloaded=0,restoreUI=null;const calls=[],storage=new Map(),listeners={},$=id=>document.getElementById(id);
 const api={onToolOpen:fn=>listeners.toolOpen=fn,get:async()=>structuredClone(state),save:async(kind,input)=>{const entry=P.entry(kind,{...input,id:input.id||crypto.randomUUID()});state.data[kind]=[...state.data[kind].filter(value=>value.id!==entry.id),entry];return state.data;},remove:async(kind,id)=>{state.data[kind]=state.data[kind].filter(value=>value.id!==id);},folder:async()=>'/new',repairPreview:async(from,to)=>({token:'repair',rows:[{key:'a',ready:true,label:'文件',source:from+'/a.txt',destination:to+'/a.txt'},{key:'b',ready:false,label:'缺失',source:from+'/b.txt',destination:to+'/b.txt',error:'找不到位置'}]}),repairApply:async(...args)=>{calls.push(['repair',...args]);return {updated:args[1].length};},backupCreate:async()=>{state.backups.push({name:'new.bfsbackup',size:2048});},backupPreview:async()=>({token:'restore',label:'手動備份',createdAt:new Date().toISOString(),counts:{records:[1,2],favorites:[1,3]},warning:'將取代資料'}),backupRestore:async()=>({ui:restoreUI}),backupExport:async()=>({path:'/backup'}),restoredUI:async()=>null,ackRestored:async()=>calls.push(['ack']),rulesChoose:async()=>['/data/a.txt'],rulesPreview:async(id,paths)=>({token:'rule',rows:paths.map(source=>({source,name:'a.txt',matched:true,destination:'/new/P_a.txt',tags:['文件']}))}),rulesAction:async(token,paths,action)=>{calls.push([action,token,paths]);return action==='tag'?{added:1,existing:0,issues:[]}:{paths,prefix:'P_',folder:'/new'};},snippetCopy:async(id,customer)=>{calls.push(['copy',id,customer]);},worksetOpen:async()=>({opened:1,failures:[],recordId:record.id}),previewChoose:async()=>({type:'text',name:'a.txt',path:'/data/a.txt',text:'<img src=x onerror=alert(1)>'}),previewLink:async()=>({type:'image',name:'a.png',path:'/data/a.png',data:'data:image/png;base64,AA=='}),boardMove:async(id,fieldId,value,revision)=>{calls.push(['board',id,fieldId,value,revision]);record.values[fieldId]=value;state.workspace.revision++;}};
 const window={toolboxModel:require('../src/toolbox-model'),globalShortcutModel:require('../src/global-shortcuts'),productivityAPI:api,studioProductivity:P,settingsUI:{get:()=>({theme:'dark'})},studioShortcuts:{getBindings:()=>({})},favoritesUI:{show:value=>calls.push(['page',value])},notesUI:{openSearchTarget:async(...args)=>calls.push(['record',...args])},favoritesAPI:{onChanged:fn=>listeners.favorites=fn},workspaceAPI:{onChanged:fn=>listeners.notes=fn},desktopAPI:{get:async()=>({toolSplitWidths:{},calendarEventLimit:2}),configure:async patch=>({settings:patch}),onChanged:fn=>listeners.desktop=fn},remindersAPI:{onChanged:fn=>listeners.reminders=fn},movingUI:{start:async(...args)=>calls.push(['move-ui',...args])},confirm:()=>true,location:{reload:()=>reloaded++}};
 for(const el of $('productivity-nav').querySelectorAll('button'))el.dataset.productivity=el.getAttribute('data-productivity');
 const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const context=vm.createContext({window,document,localStorage,console,setTimeout,clearTimeout,setInterval:()=>({unref(){}})});
 for(const file of ['resizable-split.js','shortcut-controls.js','calendar-scope.js','planning-view.js','productivity.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);window.productivityUI.init({configuration:()=>({rules:{},presets:[]}),isBusy:()=>false,showFailure:(_,error)=>failure=error,rename:async(...args)=>calls.push(['rename-ui',...args])});
 return {context,document,$,state,api,window,calls,listeners,storage,localStorage,record,sheet,load:()=>{ $('productivity-page').classList.remove('hidden');return window.productivityUI.activate();},failure:()=>failure,reloaded:()=>reloaded,setRestore:value=>restoreUI=value,click:async id=>{$(id).dispatch('click');await tick();},submit:async id=>{$(id).dispatch('submit');await tick();}};
}
test('legacy tools remain available inside the unified toolbox without duplicate primary entries',async()=>{const h=harness();await h.load();for(const name of ['repair','backup','rules','preview','worksets']){h.window.productivityUI.openSection(name);await tick();assert.equal(h.$('productivity-'+name).hidden,false);const parent=require('../src/toolbox-model').parent(name),tab=h.$('productivity-nav').querySelector('[data-productivity='+parent+']');assert.equal(tab.getAttribute('aria-pressed'),'true');}assert.equal(h.$('workflow-open'),null);assert.equal(h.failure(),null);assert.equal(h.$('workset-records').querySelectorAll('script').length,0);assert.match(h.$('workset-records').textContent,/<script>客戶 A<\/script>/);});
test('repair UI sends only checked valid rows and invalidates preview when roots change',async()=>{const h=harness();await h.load();h.$('repair-from').value='/old';h.$('repair-to').value='/new';await h.submit('repair-form');const checks=h.$('repair-list').querySelectorAll('input');assert.equal(checks[0].checked,true);assert.equal(checks[1].disabled,true);await h.click('repair-apply');assert.deepEqual(Array.from(h.calls.find(value=>value[0]==='repair')[2]),['a']);await h.submit('repair-form');h.$('repair-to').value='/other';await h.$('repair-to').dispatch('input');assert.equal(h.$('repair-apply').disabled,true);});
test('backup UI shows restore counts and restores persisted interface settings before reload',async()=>{const h=harness();await h.load();await h.click('backup-create');assert.match(h.$('backup-list').textContent,/new.bfsbackup/);await h.click('backup-import');assert.equal(h.$('backup-preview').hidden,false);assert.match(h.$('backup-counts').textContent,/1 → 3/);h.setRestore({settings:{theme:'light'},shortcuts:{x:'F1'},naming:{presets:[],activeRules:{prefix:'R_'}}});await h.click('backup-restore');assert.equal(JSON.parse(h.storage.get('brs-settings-v1')).theme,'light');assert.equal(JSON.parse(h.storage.get('brs-rules-v1')).prefix,'R_');assert.equal(h.reloaded(),1);assert.equal(h.failure(),null);});
test('rule editor uses its own prefix field and forwards move target and rename prefix',async()=>{const h=harness();await h.load();h.$('rule-name').value='文件';h.$('rule-extensions').value='txt';h.$('organize-prefix').value='P_';h.$('rule-tags').value='文件';await h.submit('rule-form');assert.equal(h.state.data.rules[0].prefix,'P_');assert.equal(h.$('rule-prefix').value,'');h.$('rule-select').value=h.state.data.rules[0].id;await h.click('rule-preview');await h.click('rule-move');const move=h.calls.find(value=>value[0]==='move-ui');assert.equal(move[2].targetFolder,'/new');await h.click('rule-rename');assert.equal(h.calls.find(value=>value[0]==='rename-ui')[2],'P_');assert.equal(h.failure(),null);});
test('snippet search combines category and text while preview and copy expand the saved text safely',async()=>{
 const h=harness();attachWorkflow(h);
 h.state.data.snippets=[
  P.entry('snippets',{id:crypto.randomUUID(),name:'問候',body:'  {{customer}} <script>hello</script>\n',category:'工作'}),
  P.entry('snippets',{id:crypto.randomUUID(),name:'其他',body:'hello',category:''})
 ];
 await h.click('tab-snippets');
 h.$('snippet-query').value='hello';await h.$('snippet-query').dispatch('input');
 assert.equal(h.$('snippet-count').textContent,'2 個片段');
 h.$('snippet-filter-category').value='category:工作';await h.$('snippet-filter-category').dispatch('change');
 assert.match(h.$('snippet-count').textContent,/1／2/);
 const row=h.$('snippet-list').querySelector('.tool-master-item');
 await row.dispatch('click');
 h.$('snippet-customer').value='客戶 B';await h.$('snippet-customer').dispatch('input');
 assert.match(h.$('snippet-preview-text').textContent,/客戶 B <script>hello<\/script>/);
 assert.equal(h.$('snippet-preview-text').querySelectorAll('script').length,0);
 await h.click('snippet-copy');
 assert.deepEqual(h.calls.find(value=>value[0]==='copy'),['copy',h.state.data.snippets[0].id,'客戶 B']);
});
test('snippet categories fold independently, show matches and copy from the list without disturbing a draft',async()=>{
 const h=harness();attachWorkflow(h);
 h.state.data.snippets=[
  P.entry('snippets',{id:crypto.randomUUID(),name:'問候',body:'相符內容',category:'工作'}),
  P.entry('snippets',{id:crypto.randomUUID(),name:'其他',body:'另一個片段',category:''})
 ];
 await h.click('tab-snippets');
 const toggles=()=>h.$('snippet-list').querySelectorAll('.snippet-group-toggle');
 const work=()=>toggles().find(item=>item.textContent.startsWith('工作'));
 const expanded=item=>item.getAttribute('aria-expanded')==='true';
 assert.equal(work().querySelector('.snippet-group-count').textContent,'1');
 await work().dispatch('click');
 assert.equal(expanded(work()),false);
 assert.equal(toggles().filter(expanded).length,1);
 h.$('snippet-query').value='相符內容';await h.$('snippet-query').dispatch('input');
 assert.equal(toggles().length,1);assert.equal(expanded(work()),true);
 h.$('snippet-body').value='未儲存文字';await h.$('snippet-form').dispatch('input');
 await h.$('snippet-list').querySelector('.snippet-copy-item').dispatch('click');await tick();
 assert.deepEqual(h.calls.find(value=>value[0]==='copy'),['copy',h.state.data.snippets[0].id,'']);
 assert.equal(h.$('snippet-body').value,'未儲存文字');assert.match(h.$('snippet-body-count').textContent,/^5／/);
 await h.click('snippet-clear-filters');
 assert.equal(toggles().length,2);assert.equal(expanded(work()),false);
 await h.click('snippet-collapse-all');assert.ok(toggles().every(item=>!expanded(item)));
 await h.click('snippet-expand-all');assert.ok(toggles().every(expanded));
});
test('worksets persist selected resources and open the returned record after operation unlocks',async()=>{const h=harness();await h.load();h.$('workset-name').value='客戶資料';const check=h.$('workset-records').querySelector('input');check.checked=true;await check.dispatch('change');await h.submit('workset-form');assert.equal(h.state.data.worksets[0].recordIds[0],h.record.id);const open=h.$('workset-detail').querySelectorAll('button').find(value=>value.textContent==='開啟工作集');await open.dispatch('click');await tick();assert.ok(h.calls.some(value=>value[0]==='record'&&value[2]===h.record.id));});
test('calendar renders existing dates and board offers accessible status moves with revision',async()=>{const h=harness();await h.load();assert.ok(h.$('planning-content').querySelectorAll('.productivity-event').length>0);h.$('planning-sheet').value=h.sheet.id;await h.$('planning-sheet').dispatch('change');await h.click('planning-board-mode');const select=h.$('planning-content').querySelector('select');assert.ok(select.getAttribute('aria-label'));const field=h.sheet.fields.find(value=>value.type==='select');select.value=field.options[0];await select.dispatch('change');await tick();const call=h.calls.find(value=>value[0]==='board');assert.equal(call[1],h.record.id);assert.equal(call[3],field.options[0]);assert.equal(call[4],1);});
test('document preview renders plain text safely and clears document data on close',async()=>{const h=harness();await h.load();await h.click('document-choose');assert.equal(h.$('document-preview-dialog').open,true);assert.match(h.$('document-preview-content').textContent,/<img src=x/);assert.equal(h.$('document-preview-content').querySelectorAll('img').length,0);await h.click('document-preview-close');assert.equal(h.$('document-preview-content').children.length,0);});
test('tool operations lock navigation until completion and errors leave it usable',async()=>{const h=harness();await h.load();let resolve;h.api.backupCreate=()=>new Promise(done=>resolve=done);h.$('backup-create').dispatch('click');assert.equal(h.window.productivityUI.canLeave(),false);resolve({});await tick();assert.equal(h.window.productivityUI.canLeave(),true);h.api.backupCreate=async()=>{throw new Error('disk full');};await h.click('backup-create');assert.match(h.$('productivity-status').textContent,/disk full/);assert.equal(h.window.productivityUI.canLeave(),true);assert.equal(h.$('backup-create').disabled,false);});
test('interface storage failure retains pending restore settings without acknowledging or reloading',async()=>{const h=harness();await h.load();await h.click('backup-import');h.storage.set('brs-settings-v1','{"theme":"dark"}');h.setRestore({settings:{theme:'light'},shortcuts:{},naming:{presets:[],activeRules:{prefix:'R_'}}});const write=h.localStorage.setItem;let once=true;h.localStorage.setItem=(key,value)=>{if(once&&key==='brs-presets-v1'){once=false;throw new Error('quota exceeded');}return write(key,value);};await h.click('backup-restore');assert.equal(h.reloaded(),0);assert.equal(h.calls.some(value=>value[0]==='ack'),false);assert.equal(JSON.parse(h.storage.get('brs-settings-v1')).theme,'dark');assert.match(h.$('productivity-status').textContent,/quota exceeded/);});

test('calendar selection updates the day agenda and clears successful loading feedback',async()=>{
 const h=harness();
 h.$('planning-page').classList.remove('hidden');
 await h.load();
 assert.equal(h.$('planning-status').textContent,'');
 const calendar=h.$('planning-content');
 const days=calendar.querySelectorAll('.productivity-day');
 const other=days.find(day=>day.dataset.today==='false');
 assert.match(calendar.querySelector('.planning-agenda').textContent,/客戶 A/);
 await other.dispatch('click');
 assert.equal(other.getAttribute('aria-pressed'),'true');
 assert.match(calendar.querySelector('.planning-agenda').textContent,/沒有符合條件/);
 await days.find(day=>day.dataset.today==='true').dispatch('click');
 assert.match(calendar.querySelector('.planning-agenda').textContent,/客戶 A/);
});

test('calendar cells render a detail title before its long master name and keep the master in the agenda',async()=>{
 const h=harness(),doc=h.state.workspace.document,sheet=doc.sheets.find(item=>item.name==='任務');
 const parent=M.parentField(doc,sheet),date=sheet.fields.find(field=>field.type==='date');
 const today=new Date().toLocaleDateString('sv-SE'),master='很長的專案主紀錄名稱'.repeat(8);
 h.record.title=master;
 doc.records.push({...h.record,id:crypto.randomUUID(),sheetId:sheet.id,title:'確認報價',
  values:{[parent.id]:[h.record.id],[date.id]:today}});
 await h.load();
 const root=h.$('planning-content');
 const detail=root.querySelectorAll('.planning-day-preview').find(item=>item.children[0].textContent==='確認報價');
 assert.ok(detail);
 assert.equal(detail.children[0].className,'planning-day-title');
 assert.equal(detail.children[0].title,'確認報價');
 assert.equal(detail.children[1].className,'planning-day-master');
 assert.equal(detail.children[1].textContent,master);
 assert.ok(root.querySelector('.planning-agenda').textContent.includes(master));
});

test('workset resource sections collapse without losing selections and favorites default to collapsed',async()=>{
 const h=harness();await h.load();assert.equal(h.$('workset-favorites-section').open,false);assert.equal(h.$('workset-records-section').open,false);const check=h.$('workset-records').querySelector('input');check.checked=true;await check.dispatch('change');h.$('workset-records-section').open=false;assert.match(h.$('workset-records-count').textContent,/1/);h.$('workset-name').value='Collapsed resources';await h.submit('workset-form');assert.equal(h.state.data.worksets[0].recordIds[0],h.record.id);
});

test('calendar displays and searches timeline item names and opens the original record',async()=>{
 const h=harness(),sheet=h.state.workspace.document.sheets[0],today=new Date().toLocaleDateString('sv-SE');
 const field={id:crypto.randomUUID(),type:'timeline',label:'專案階段'};
 sheet.fields.push(field);
 h.record.values[field.id]=[{label:'交付文件',date:today}];
 await h.load();
 h.$('planning-query').value='交付文件';
 await h.$('planning-query').dispatch('input');
 const root=h.$('planning-content'),preview=root.querySelector('.planning-day-preview'),event=root.querySelector('.productivity-event');
 assert.equal(preview.dataset.eventKind,'timeline');
 assert.equal(preview.children[0].textContent,'交付文件');
 assert.match(event.textContent,/交付文件.*客戶 A.*專案階段/);
 await event.dispatch('click');
 assert.ok(h.calls.some(call=>call.includes(h.record.id)));
});

test('calendar table settings constrain selector, dates and reminders without widening missing selections or the board',async()=>{
 const h=harness(),id=crypto.randomUUID(),field=crypto.randomUUID(),day=new Date().toLocaleDateString('sv-SE');
 const other={...structuredClone(h.sheet),id,name:'Other',fields:[{id:field,label:'Date',type:'date'}]};
 h.state.workspace.document.sheets.push(other);h.state.workspace.document.records.push({...structuredClone(h.record),id:crypto.randomUUID(),sheetId:id,title:'Excluded event',values:{[field]:day}});
 h.state.preferences={calendarScope:{scope:'selected',sheetIds:[h.sheet.id],includeStandalone:false}};
 h.state.reminders.items=[{id:crypto.randomUUID(),recordId:null,standalone:{title:'Draft event'},at:new Date().toISOString(),status:'pending'}];
 await h.load();assert.match(h.$('planning-content').textContent,/指定表格範圍/);assert.doesNotMatch(h.$('planning-content').textContent,/Excluded event|Draft event/);
 assert.ok(!h.$('planning-sheet').children.some(option=>option.value===id));
 h.state.preferences.calendarScope.sheetIds=[crypto.randomUUID()];h.listeners.desktop({settings:h.state.preferences});await tick();assert.equal(h.$('planning-content').querySelectorAll('.planning-day-preview').length,0);
 await h.click('planning-board-mode');assert.ok(h.$('planning-sheet').children.some(option=>option.value===h.sheet.id));
});

function attachWorkflow(h,beforeMount=()=>{}){
 h.context.structuredClone=structuredClone;
 h.document.addEventListener=()=>{};
 h.window.workflowModel=require('../src/workflow-model');h.window.notesModel=M;h.window.workflowGuideModel=require('../src/workflow-guide-model');
 h.window.workflowAPI={state:async()=>({data:{revision:0,contexts:[],formulas:[],automations:[],inbox:[],runs:[],recentFolders:[]},workspace:h.state.workspace,productivity:h.state.data,tools:{views:[]},favorites:[],tracking:{queries:[]},trackingChanges:{snapshots:{},monitors:[]},operations:[],drafts:[],platform:'linux'}),onProgress:()=>{},select:async source=>{h.calls.push(['source',source]);return {token:'selection',rows:[{path:'/tmp/selected.pdf',type:'file'}]};}};
 h.window.notesUI.context=()=>({sheetId:h.sheet.id,recordId:h.record.id});
 h.window.favoritesUI.show=page=>{if(!h.window.productivityUI.canLeave())return false;h.calls.push(['page',page]);for(const view of ['productivity','snippets'])h.$(view+'-page').classList.toggle('hidden',page!==view);if(['productivity','snippets'].includes(page))void h.window.productivityUI.activate();return true;};
 beforeMount(h);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workflow-hub.js'),'utf8'),h.context);
 return h.$('workflow-content');
}
test('existing external snippet shortcut opens the independent management page on initial activation',async()=>{
 const h=harness();attachWorkflow(h);h.listeners.toolOpen({kind:'snippets'});await tick();
 assert.equal(h.$('snippets-page').classList.contains('hidden'),false);
 assert.equal(h.$('productivity-page').classList.contains('hidden'),true);
 assert.equal(h.$('productivity-nav').querySelector('[data-productivity=snippets]'),null);
 assert.deepEqual(h.calls.at(-1),['page','snippets']);
 assert.equal(h.failure(),null);
});
