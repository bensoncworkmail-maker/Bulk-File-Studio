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
test('legacy tools remain available inside the unified toolbox without duplicate primary entries',async()=>{const h=harness();await h.load();for(const name of ['repair','backup','rules','preview','worksets','snippets']){h.window.productivityUI.openSection(name);await tick();assert.equal(h.$('productivity-'+name).hidden,false);const parent=require('../src/toolbox-model').parent(name),tab=h.$('productivity-nav').querySelector('[data-productivity='+parent+']');assert.equal(tab.getAttribute('aria-pressed'),'true');}assert.equal(h.$('workflow-open'),null);assert.equal(h.failure(),null);assert.equal(h.$('workset-records').querySelectorAll('script').length,0);assert.match(h.$('workset-records').textContent,/<script>客戶 A<\/script>/);});
test('repair UI sends only checked valid rows and invalidates preview when roots change',async()=>{const h=harness();await h.load();h.$('repair-from').value='/old';h.$('repair-to').value='/new';await h.submit('repair-form');const checks=h.$('repair-list').querySelectorAll('input');assert.equal(checks[0].checked,true);assert.equal(checks[1].disabled,true);await h.click('repair-apply');assert.deepEqual(Array.from(h.calls.find(value=>value[0]==='repair')[2]),['a']);await h.submit('repair-form');h.$('repair-to').value='/other';await h.$('repair-to').dispatch('input');assert.equal(h.$('repair-apply').disabled,true);});
test('backup UI shows restore counts and restores persisted interface settings before reload',async()=>{const h=harness();await h.load();await h.click('backup-create');assert.match(h.$('backup-list').textContent,/new.bfsbackup/);await h.click('backup-import');assert.equal(h.$('backup-preview').hidden,false);assert.match(h.$('backup-counts').textContent,/1 → 3/);h.setRestore({settings:{theme:'light'},shortcuts:{x:'F1'},naming:{presets:[],activeRules:{prefix:'R_'}}});await h.click('backup-restore');assert.equal(JSON.parse(h.storage.get('brs-settings-v1')).theme,'light');assert.equal(JSON.parse(h.storage.get('brs-rules-v1')).prefix,'R_');assert.equal(h.reloaded(),1);assert.equal(h.failure(),null);});
test('rule editor uses its own prefix field and forwards move target and rename prefix',async()=>{const h=harness();await h.load();h.$('rule-name').value='文件';h.$('rule-extensions').value='txt';h.$('organize-prefix').value='P_';h.$('rule-tags').value='文件';await h.submit('rule-form');assert.equal(h.state.data.rules[0].prefix,'P_');assert.equal(h.$('rule-prefix').value,'');h.$('rule-select').value=h.state.data.rules[0].id;await h.click('rule-preview');await h.click('rule-move');const move=h.calls.find(value=>value[0]==='move-ui');assert.equal(move[2].targetFolder,'/new');await h.click('rule-rename');assert.equal(h.calls.find(value=>value[0]==='rename-ui')[2],'P_');assert.equal(h.failure(),null);});
test('snippets preserve literal markup and copy the selected customer substitution',async()=>{const h=harness();await h.load();h.$('snippet-name').value='問候';h.$('snippet-body').value='  {{customer}} <script>hello</script>\n';h.$('snippet-category').value='工作';await h.submit('snippet-form');h.$('snippet-customer').value='客戶 B';await h.$('snippet-customer').dispatch('input');assert.match(h.$('snippet-list').textContent,/客戶 B <script>hello<\/script>/);assert.equal(h.$('snippet-list').querySelectorAll('script').length,0);const copy=h.$('snippet-detail').querySelectorAll('button').find(value=>value.textContent==='複製已儲存內容');await copy.dispatch('click');await tick();assert.equal(h.calls.find(value=>value[0]==='copy')[2],'客戶 B');});
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
 h.window.favoritesUI.show=page=>{if(!h.window.productivityUI.canLeave())return false;h.calls.push(['page',page]);h.$('productivity-page').classList.toggle('hidden',page!=='productivity');if(page==='productivity')void h.window.productivityUI.activate();return true;};
 beforeMount(h);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/workflow-hub.js'),'utf8'),h.context);
 return h.$('workflow-content');
}
test('unified toolbox has seven primary destinations and preserves a selected source through first asynchronous activation',async()=>{
 const h=harness(),root=attachWorkflow(h),nav=h.$('productivity-nav');
 assert.deepEqual(nav.children.filter(el=>el.tagName==='BUTTON').map(el=>el.dataset.productivity),['inbox','contexts','parameters','tracking','ocr','automations','backup']);assert.equal(h.$('toolbox-advanced').open,false);
 let release;const get=h.api.get;h.api.get=()=>new Promise(resolve=>release=async()=>resolve(await get()));
 const source={kind:'tracking',id:'query',token:'snapshot',indices:[1]};assert.equal(h.window.workflowHub.open('inbox',source),true);assert.equal(h.calls.some(row=>row[0]==='source'),false);
 await release();await tick();assert.equal(root.parentElement.id,'productivity-inbox');assert.deepEqual(h.calls.filter(row=>row[0]==='source'),[['source',source]]);assert.match(root.textContent,/selected.pdf/);
 assert.equal(h.window.productivityUI.openSection('backup'),true);await tick();assert.equal(h.$('productivity-backup').hidden,false);assert.equal(root.parentElement.hidden,true);assert.equal(h.failure(),null);
});
test('real toolbox navigation keeps unsaved workflow inputs on repeat selection and respects canceled transitions',async()=>{
 const h=harness(),root=attachWorkflow(h);h.window.workflowHub.open('contexts');await tick();const name=root.querySelectorAll('label').find(el=>el.children[0].textContent==='情境包名稱').children[1];name.value='未儲存專案';await root.querySelector('.workflow-body').dispatch('input',{target:name});h.window.confirm=()=>false;
 assert.equal(h.window.productivityUI.openSection('contexts'),true);assert.equal(root.querySelectorAll('input').includes(name),true);assert.equal(name.value,'未儲存專案');assert.equal(h.window.productivityUI.openSection('backup'),false);assert.equal(h.window.productivityUI.currentSection(),'contexts');assert.equal(h.window.favoritesUI.show('home'),false);
 h.window.confirm=()=>true;assert.equal(h.window.productivityUI.openSection('parameters'),true);await tick();assert.match(root.textContent,/建立第一個文字範本/);const manage=root.querySelectorAll('button').find(el=>el.textContent==='建立第一個文字範本');await manage.dispatch('click');await tick();assert.equal(h.$('productivity-snippets').hidden,false);assert.equal(h.$('productivity-nav').querySelector('[data-productivity=parameters]').getAttribute('aria-current'),'page');assert.equal(h.window.productivityUI.currentSection(),'snippets');assert.equal(h.failure(),null);
});

test('existing external snippet shortcut opens its management subpage during first toolbox activation',async()=>{
 const h=harness();attachWorkflow(h);h.listeners.toolOpen({kind:'snippets'});await tick();assert.equal(h.window.productivityUI.currentSection(),'snippets');assert.equal(h.$('productivity-snippets').hidden,false);assert.equal(h.$('productivity-nav').querySelector('[data-productivity=parameters]').getAttribute('aria-current'),'page');assert.equal(h.failure(),null);
});
test('toolbox refresh reloads the embedded workflow after confirming unsaved changes',async()=>{
 const h=harness(),root=attachWorkflow(h);h.window.workflowHub.open('inbox');await tick();let reads=0;const state=h.window.workflowAPI.state;h.window.workflowAPI.state=async()=>{reads++;const value=await state();value.drafts=[{id:'draft',title:'新收到的草稿',summary:'內容',updatedAt:new Date().toISOString()}];return value;};await root.querySelector('.workflow-body').dispatch('input',{target:root.querySelector('input')});h.window.confirm=()=>false;await h.click('productivity-refresh');assert.equal(reads,0);h.window.confirm=()=>true;await h.click('productivity-refresh');assert.equal(reads,1);assert.match(root.textContent,/新收到的草稿/);assert.equal(h.failure(),null);
});

function contextWorkflow(h){
 let active='a',revision=0;const other={...structuredClone(h.record),id:crypto.randomUUID(),title:'客戶 B'};h.state.workspace.document.records.push(other);
 const general=P.entry('snippets',{id:crypto.randomUUID(),name:'通用',body:'一般文字'}),a=P.entry('snippets',{id:crypto.randomUUID(),name:'A 回覆',body:'{{record.title}} {{subject}}'}),b=P.entry('snippets',{id:crypto.randomUUID(),name:'B 回覆',body:'{{record.title}} {{subject}}'});h.state.data.snippets=[general,a,b];
 const queries=[{id:'qa',name:'A 文件'},{id:'qb',name:'B 文件'}],contexts=[{id:'a',name:'客戶 A',masterId:h.record.id,trackingIds:['qa'],snippetIds:[a.id],viewIds:[],worksetId:null},{id:'b',name:'客戶 B',masterId:other.id,trackingIds:['qb'],snippetIds:[b.id],viewIds:[],worksetId:null}];
 const root=attachWorkflow(h,()=>{const api=h.window.workflowAPI,get=api.state;h.window.contextModel=require('../src/context-model');api.state=async()=>{const data=await get();return {...data,data:{...data.data,contexts,activeContextId:active,revision},tracking:{queries}};};api.contextState=async()=>{const data=await api.state();return h.window.contextModel.snapshot(data.data,data.workspace.document,data.productivity,data.tracking,data.tools);};api.context=async(id,expected)=>{assert.equal(expected,revision);h.calls.push(['context',id]);active=id;revision++;return api.contextState();};vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/context-ui.js'),'utf8'),h.context);});
 const control=label=>root.querySelectorAll('label').find(row=>row.children[0]?.textContent===label)?.children[1];
 return {root,control,other,a,b,start:async()=>{h.window.contextUI.init();await tick();}};
}
test('real header switching refreshes parameter defaults while leaving search and calendar controls untouched',async()=>{
 const h=harness(),c=contextWorkflow(h);await c.start();h.$('planning-query').value='原日曆篩選';h.$('app-search-query').value='原搜尋';h.window.workflowHub.open('snippets');await tick();assert.equal(c.control('文字範本').value,c.a.id);assert.equal(c.control('帶入紀錄（必填）').value,h.record.id);
 assert.equal(await h.window.contextUI.switchTo('b'),true);await tick();assert.equal(c.control('文字範本').value,c.b.id);assert.equal(c.control('帶入紀錄（必填）').value,c.other.id);assert.equal(h.$('planning-query').value,'原日曆篩選');assert.equal(h.$('app-search-query').value,'原搜尋');
 const subject=c.control('subject');subject.value='未儲存主旨';await subject.dispatch('input');await c.root.querySelector('.workflow-body').dispatch('input',{target:subject});h.window.confirm=()=>false;assert.equal(await h.window.contextUI.switchTo('a'),false);assert.equal(c.control('subject'),subject);assert.equal(subject.value,'未儲存主旨');assert.equal(h.$('context-select').value,'b');assert.equal(h.calls.filter(row=>row[0]==='context').length,1);
 h.window.confirm=()=>true;assert.equal(await h.window.contextUI.switchTo('a'),true);await tick();assert.equal(c.control('文字範本').value,c.a.id);assert.equal(c.control('帶入紀錄（必填）').value,h.record.id);assert.equal(h.failure(),null);
});
test('hidden workflow views adopt the new context when reopened and related snippets can be selected on the same page',async()=>{
 const h=harness(),c=contextWorkflow(h);await c.start();h.window.workflowHub.open('tracking');await tick();assert.equal(c.control('追蹤搜尋').value,'qa');h.window.productivityUI.openSection('backup');await tick();await h.window.contextUI.switchTo('b');h.window.workflowHub.open('tracking');await tick();assert.equal(c.control('追蹤搜尋').value,'qb');h.window.workflowHub.open('snippets');await tick();assert.equal(c.control('文字範本').value,c.b.id);c.control('文字範本').value=c.a.id;await c.control('文字範本').dispatch('change');await h.window.contextUI.openResource('snippet',c.b.id);await tick();assert.equal(c.control('文字範本').value,c.b.id);assert.equal(c.control('帶入紀錄（必填）').value,c.other.id);assert.equal(h.failure(),null);
});
test('changing a read-only tracking selection does not ask to discard a form during context switching',async()=>{
 const h=harness(),c=contextWorkflow(h);await c.start();h.window.workflowHub.open('tracking');await tick();let prompts=0;h.window.confirm=()=>{prompts++;return false;};const picker=c.control('追蹤搜尋');picker.value='qb';await picker.dispatch('change');await c.root.querySelector('.workflow-body').dispatch('change',{target:picker});assert.equal(await h.window.contextUI.switchTo('b'),true);assert.equal(prompts,0);assert.equal(c.control('追蹤搜尋').value,'qb');
});
test('failed context writes retain dirty input and successful confirmed switches discard the old inbox text',async()=>{
 const h=harness(),c=contextWorkflow(h);await c.start();h.window.workflowHub.open('inbox');await tick();const title=c.control('標題');title.value='客戶 A 的未儲存內容';await title.dispatch('input');await c.root.querySelector('.workflow-body').dispatch('input',{target:title});h.window.confirm=()=>true;const activate=h.window.workflowAPI.context;let reject;h.window.workflowAPI.context=()=>new Promise((resolve,fail)=>reject=fail);const switching=h.window.contextUI.switchTo('b');assert.equal(c.root.inert,true);reject(Error('無法寫入'));assert.equal(await switching,false);assert.equal(c.root.inert,false);assert.equal(c.control('標題'),title);assert.equal(title.value,'客戶 A 的未儲存內容');h.window.confirm=()=>false;assert.equal(h.window.productivityUI.canLeave(),false);h.window.confirm=()=>true;h.window.workflowAPI.context=activate;assert.equal(await h.window.contextUI.switchTo('b'),true);assert.equal(c.control('標題').value,'');assert.equal(h.$('context-select').value,'b');
});
