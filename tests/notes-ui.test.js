'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const {NotesToolsStore}=require('../src/notes-tools-store');
const {NotesStore}=require('../src/notes-store'),M=require('../src/notes-model');
function setToolbarOpen(h,open){if(h.els.get('notes-panel-tools').hidden===open)h.els.get('notes-panel-toggle').events.click();}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function setup(t,{favoriteItems=[],settings={},ResizeObserver}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-notes-ui-')),store=new NotesStore(path.join(dir,'workspace.sqlite'));t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 class El{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.events={};this.dataset={};this.style={};this.value='';this.checked=false;this.disabled=false;this.open=false;this.hidden=false;this._text='';this.className='';this.classList={toggle:(name,on)=>{const values=new Set(this.className.split(' ').filter(Boolean));if(on===undefined)on=!values.has(name);on?values.add(name):values.delete(name);this.className=[...values].join(' ');},contains:name=>this.className.split(' ').includes(name)};}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){throw new Error('Unsafe HTML rendering: '+value);}
  append(...nodes){for(const node of nodes){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(child=>child!==node);node.parentElement=this;this.children.push(node);}}replaceChildren(...nodes){for(const node of this.children)node.parentElement=null;this.children=[];this._text='';this.append(...nodes);}setAttribute(key,value){this.attrs[key]=value;}addEventListener(event,callback){this.events[event]=callback;}focus(){testDocument.activeElement=this;}requestSubmit(){this.events.submit({preventDefault(){}});}showModal(){this.open=true;}close(){this.open=false;}
 }
 const docEvents={},testDocument={getElementById:id=>els.get(id),createElement:tag=>new El(tag),addEventListener:(key,fn)=>docEvents[key]=fn},els=new Map(),html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');for(const match of html.matchAll(/<([\w-]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new El(match[1]);if(match[0].includes(' hidden'))node.hidden=true;els.set(match[2],node);}
 for(const [id,value] of [['notes-sort','updated'],['notes-export-scope','all'],['notes-import-mode','copy']])els.get(id).value=value;
 const toolStore=new NotesToolsStore(path.join(dir,'workspace-tools.json'));
 const errors=[],toasts=[],drops=new Map(),preferences=require('../src/settings-model').normalize(settings);let changed,contextAction;
 const share={enabled:false,folder:null,autoPublish:false,intervalMinutes:5,files:[],total:0,busy:false};const api={sheetPreview:async input=>store.sheetPreview(input),sheetCommit:async(token,confirmed)=>store.sheetCommit(token,confirmed),chooseTableFile:async()=>({canceled:true}),tablePreview:async input=>store.tabularPreview(input),tableCommit:async token=>store.tabularCommit(token),tools:async()=>toolStore.get(),saveView:async(name,state)=>toolStore.saveView(name,state),removeTool:async(kind,id)=>toolStore.remove(kind,id),saveTemplate:async(name,areaId)=>toolStore.saveTemplate(name,store.get().document,areaId),applyTemplate:async(id,revision)=>store.applyCustomTemplate(toolStore.get().templates.find(item=>item.id===id).document,revision),pin:async id=>toolStore.pin(store.get().document,id),saveCells:async(entries,revision)=>store.updateCells(entries,revision),batchSheets:async(entries,revision)=>store.batchSheets(entries,revision),batchAreas:async(ids,revision)=>store.batchAreas(ids,revision),navigation:async()=>null,shareStatus:async()=>share,onShareChanged(){},contextMenu:async(kind,id)=>toasts.push('menu:'+kind+':'+id),onContextAction:callback=>contextAction=callback,get:async()=>store.get(),favorites:async()=>({items:favoriteItems}),template:async kind=>store.addTemplate(kind),saveArea:async input=>store.saveArea(input),removeArea:async(...args)=>store.removeArea(...args),duplicateRecord:async(...args)=>store.duplicateRecord(...args),copy:async input=>toasts.push(M.clipboardText(store.get().document,input)),saveSheet:async input=>store.saveSheet(input),saveRecord:async input=>store.saveRecord({...input,fileLinks:[...(input.favoriteIds||[]).map(id=>{const item=favoriteItems.find(item=>item.id===id);return {favoriteId:id,path:item.path,label:item.label||'',type:item.type};}),...(input.directPaths||[]).map(path=>({favoriteId:null,path,label:'',type:'folder'})),...(store.get().document.records.find(record=>record.id===input.id)?.fileLinks||[]).filter(link=>input.keepUnlinked?.includes(link.path))],favoriteTagLinks:[...(input.favoriteTags||[]).map(tag=>({tag,authorized:true})),...(input.keepPendingTags||[]).map(tag=>({tag,authorized:false}))]}),completeClientDetails:async(...args)=>store.completeClientDetails(...args),batchTrash:async(...args)=>store.batchTrash(...args),trash:async(...args)=>store.trash(...args),history:async id=>store.history(id),restoreHistory:async(...args)=>store.restoreHistory(...args),exportPreview:async options=>store.exportPreview(options),exportSave:async()=>({canceled:false,path:'share.json'}),onChanged:callback=>changed=callback};
 const window={webLinkModel:require('../src/web-link-model'),studioFileDrop:{bind:(id,apply)=>drops.set(id,apply),append:(input,paths)=>{input.value=[...new Set([...input.value.split('\n').filter(Boolean),...paths])].join('\n');}},notesTableState:require('../src/notes-table-state'),shareViewModel:require('../src/share-view-model'),studioSettingsModel:require('../src/settings-model'),settingsUI:{get:()=>preferences,update:patch=>{Object.assign(preferences,patch);window.notesUI.settingsChanged(Object.keys(patch));}},notesModel:M,workspaceAPI:api,favoritesAPI:{onChanged(){}},favoritesModel:require('../src/favorites-model'),favoritesUI:{show(){},showTag:tag=>toasts.push('tag:'+tag)}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/notes.js'),'utf8'),{window,document:testDocument,crypto,ResizeObserver,setTimeout,clearTimeout},{filename:'notes.js'});
 window.notesUI.init({showToast:value=>toasts.push(value),showFailure:(title,error)=>errors.push(String(error.message||error))});return {window,document:testDocument,docEvents,drops,api,preferences,contextAction:value=>contextAction(value),store,els,ui:window.notesUI,errors,toasts,changed:()=>changed({})};
}
for(const [id,key,value] of [['notes-share-enabled','checked',true],['notes-share-interval','value','15']])test('rejected '+id+' changes restore the persisted shared state',async t=>{
 const h=setup(t);h.store.addTemplate();h.ui.activate();await flush();
 const share={enabled:false,folder:'/shared',autoPublish:false,intervalMinutes:5,files:[],total:0,busy:false};
 h.api.shareStatus=async()=>share;h.api.shareConfigure=async()=>{throw new Error('Shared configuration rejected');};
 h.els.get('notes-share-open').events.click();await flush();
 h.els.get(id)[key]=value;h.els.get(id).events.change();await flush();
 assert.equal(h.els.get('notes-share-enabled').checked,false);assert.equal(Number(h.els.get('notes-share-interval').value),5);
 assert.match(h.errors.at(-1),/rejected/);
});
test('workspace UI creates a template and page, renders literal notes and shows linked client information',async t=>{
 const h=setup(t);h.ui.activate();await flush();h.els.get('notes-template').events.click();h.els.get('notes-template-list').children[0].events.click();h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(h.store.get().document.sheets.length,5);
 h.els.get('notes-new-record').events.click();assert.equal(h.ui.canLeave(),false);h.els.get('notes-record-title').value='CLIENT_1';h.els.get('notes-record-body').value='<script>alert(1)</script>';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();assert.equal(h.store.get().document.records.length,1);assert.equal(h.ui.canLeave(),true);h.els.get('notes-master-overview').events.click();assert.match(h.els.get('notes-detail-body').textContent,/<script>alert\(1\)<\/script>/);assert.equal(h.els.get('notes-detail').hidden,false);
 const state=h.store.get(),contactSheet=state.document.sheets[1],client=state.document.records[0];h.store.saveRecord({sheetId:contactSheet.id,title:'John',notes:'聯絡紀錄',tags:[],values:{[contactSheet.fields[0].id]:[client.id],[contactSheet.fields[2].id]:'01234567'},fileLinks:[]});h.changed();await flush();assert.match(h.els.get('notes-detail-body').textContent,/John/);assert.match(h.els.get('notes-detail-body').textContent,/電話：01234567/);assert.deepEqual(h.errors,[]);
});
test('workspace UI previews scoped sharing and supports cross-table searches without rendering HTML',async t=>{
 const h=setup(t);h.store.addTemplate();const sheet=h.store.get().document.sheets[0];h.store.saveRecord({sheetId:sheet.id,title:'ABC',notes:'聯絡資料',tags:['VIP'],values:{},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-export').events.click();h.els.get('notes-transfer-preview').events.click();await flush();assert.equal(h.els.get('notes-transfer-apply').disabled,false);assert.match(h.els.get('notes-transfer-summary').textContent,/1 筆/);assert.match(h.els.get('notes-transfer-preview-list').textContent,/ABC/);h.els.get('notes-transfer-cancel').events.click();h.els.get('notes-search').value='No match';h.els.get('notes-search').events.input();assert.match(h.els.get('notes-table').textContent,/尚無符合/);h.els.get('notes-search').value='VIP';h.els.get('notes-global-search').checked=true;h.els.get('notes-search').events.input();assert.match(h.els.get('notes-table').textContent,/ABC/);assert.deepEqual(h.errors,[]);
});

test('workspace groups filter linked master records and quick add preselects the relation',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[clients,contacts]=state.document.sheets,area=state.document.areas[0];
 const add=(sheet,title,values={})=>h.store.saveRecord({sheetId:sheet.id,title,values,notes:'',tags:[],fileLinks:[]}).result.id;
 const a=add(clients,'Client A'),b=add(clients,'Client B');add(contacts,'Alice',{[contacts.fields[0].id]:[a]});add(contacts,'Bob',{[contacts.fields[0].id]:[b]});h.store.addTemplate('projects');h.ui.activate();await flush();
 h.els.get('notes-area-select').value=area.id;h.els.get('notes-area-select').events.change();h.els.get('notes-master-select').value=a;h.els.get('notes-master-select').events.change();
 const buttons=h.els.get('notes-sheets').children.filter(el=>el.tagName==='BUTTON');assert.equal(buttons.length,2);assert.match(h.els.get('notes-table').textContent,/Alice/);assert.doesNotMatch(h.els.get('notes-table').textContent,/Bob/);assert.doesNotMatch(h.els.get('notes-sheets').textContent,/任務/);
 h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='New contact';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();const saved=h.store.get().document.records.find(record=>record.title==='New contact');assert.deepEqual(saved.values[contacts.fields[0].id],[a]);assert.deepEqual(h.errors,[]);
 h.els.get('notes-copy-table').events.click();await flush();assert.match(h.toasts.join(' '),/Alice/);assert.doesNotMatch(h.toasts.join(' '),/Bob/);
});
function descendants(node){return [node,...node.children.flatMap(descendants)];}
function findButton(node,text){const button=descendants(node).find(node=>node.tagName==='BUTTON'&&node.textContent===text);assert.ok(button,'Missing button '+text);return button;}
test('clicking a header opens only its child tabs and a contact can be created with its name alone',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root,contacts]=state.document.sheets;const add=(sheet,title,values={})=>h.store.saveRecord({sheetId:sheet.id,title,values,notes:'',tags:[],fileLinks:[]}).result.id,a=add(root,'Client A'),b=add(root,'Client B');add(contacts,'Bob',{[contacts.fields[0].id]:[b]});h.ui.activate();await flush();
 findButton(h.els.get('notes-table'),'Client A').events.click();assert.match(h.els.get('notes-master-heading').textContent,/Client A/);assert.match(h.els.get('notes-detail-tabs').textContent,/文件／位置/);assert.doesNotMatch(h.els.get('notes-table').textContent,/Bob/);h.els.get('notes-new-record').events.click();assert.equal(h.els.get('notes-record-title-label').textContent,'姓名（必填）');h.els.get('notes-record-title').value='Alice';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();const saved=h.store.get().document.records.find(record=>record.title==='Alice');assert.deepEqual(saved.values[contacts.fields[0].id],[a]);assert.equal(saved.values[contacts.fields[3].id],undefined);assert.match(h.els.get('notes-table').textContent,/Alice/);h.els.get('notes-master-back').events.click();assert.match(h.els.get('notes-table').textContent,/Client B/);assert.deepEqual(h.errors,[]);
});
test('batch selection works across pages, clears on filtering, previews cascades and preserves files',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.change(doc=>{for(let i=0;i<105;i++)doc.records.push({id:crypto.randomUUID(),sheetId:root.id,title:'Client '+i,notes:'',tags:[],values:{},fileLinks:[],version:1,createdAt:'2026-10-30T00:00:00Z',updatedAt:'2026-10-30T00:00:00Z',deletedAt:null});});h.ui.activate();await flush();
 let checks=descendants(h.els.get('notes-table')).filter(node=>node.tagName==='INPUT');checks[1].checked=true;checks[1].events.change();assert.equal(checks[0].indeterminate,true);h.els.get('notes-next').events.click();assert.match(h.els.get('notes-selected-count').textContent,/1 筆/);h.els.get('notes-select-filtered').events.click();assert.match(h.els.get('notes-selected-count').textContent,/105 筆/);h.els.get('notes-search').value='Client 100';h.els.get('notes-search').events.input();assert.match(h.els.get('notes-selected-count').textContent,/0 筆/);h.els.get('notes-select-filtered').events.click();h.els.get('notes-batch-delete').events.click();assert.match(h.els.get('notes-confirm-text').textContent,/共 1 筆/);assert.equal(h.els.get('notes-delete-details').checked,false);h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(h.store.get().document.records.filter(record=>record.deletedAt).length,1);assert.equal(h.store.get().document.records.length,105);assert.deepEqual(h.errors,[]);
});
test('client batch confirmation previews optional child deletion and leaves another client intact',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root,contacts]=state.document.sheets;const add=(sheet,title,values={})=>h.store.saveRecord({sheetId:sheet.id,title,notes:'',tags:[],values,fileLinks:[]}).result.id,a=add(root,'Client A'),b=add(root,'Client B');add(contacts,'Alice',{[contacts.fields[0].id]:[a]});add(contacts,'Bob',{[contacts.fields[0].id]:[b]});h.ui.activate();await flush();const check=descendants(h.els.get('notes-table')).find(node=>node.attrs['aria-label']==='選取 Client A');check.checked=true;check.events.change();h.els.get('notes-batch-delete').events.click();assert.match(h.els.get('notes-confirm-text').textContent,/共 1 筆/);h.els.get('notes-delete-details').checked=true;h.els.get('notes-delete-details').events.change();assert.match(h.els.get('notes-confirm-text').textContent,/共 2 筆/);h.els.get('notes-confirm-cancel').events.click();assert.ok(h.store.get().document.records.every(record=>!record.deletedAt));h.els.get('notes-batch-delete').events.click();assert.equal(h.els.get('notes-delete-details').checked,false);h.els.get('notes-delete-details').checked=true;h.els.get('notes-delete-details').events.change();h.els.get('notes-confirm-apply').events.click();await flush();assert.deepEqual(h.store.get().document.records.filter(record=>!record.deletedAt).map(record=>record.title),['Client B','Bob']);assert.deepEqual(h.errors,[]);
});
test('document detail keeps text-only columns as text and can show matching favorite tags',async t=>{
 const h=setup(t,{settings:{notesShowFavoriteTagLinks:true},favoriteItems:[{id:crypto.randomUUID(),path:'/local/report.pdf',label:'Report',tags:['ClientFiles'],type:'file'}]}),state=h.store.addTemplate(),root=state.document.sheets[0],documents=state.document.sheets.find(sheet=>sheet.name==='文件／位置'),client=h.store.saveRecord({sheetId:root.id,title:'Client',notes:'',tags:[],values:{},fileLinks:[]}).result.id;h.store.saveRecord({sheetId:documents.id,title:'Documents',notes:'',tags:['ClientFiles'],values:{[documents.fields[0].id]:[client],[documents.fields[2].id]:'/marked/file.txt'},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Client').events.click();const tab=h.els.get('notes-detail-tabs').children.find(node=>node.textContent.startsWith('文件／位置'));tab.events.click();findButton(h.els.get('notes-table'),'Documents').events.click();assert.match(h.els.get('notes-detail-body').textContent,/\/marked\/file.txt/);findButton(h.els.get('notes-detail-body'),'查看收藏標籤：ClientFiles').events.click();assert.ok(h.toasts.includes('tag:ClientFiles'));assert.deepEqual(h.errors,[]);
});
test('new detail stays in the list with a clear current marker and opens overview only by choice',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Client',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Client').events.click();h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='New Person';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();assert.equal(h.els.get('notes-detail').hidden,true);assert.match(h.els.get('notes-current-record').textContent,/New Person/);const row=descendants(h.els.get('notes-table')).find(node=>node.tagName==='TR'&&node.classList.contains('notes-current'));assert.ok(row);assert.equal(row.attrs['aria-selected'],'true');assert.match(h.els.get('notes-selected-count').textContent,/0 筆/);h.els.get('notes-inspect-current').events.click();assert.equal(h.els.get('notes-detail').hidden,false);assert.match(h.els.get('notes-detail-body').textContent,/New Person/);assert.deepEqual(h.errors,[]);
});
test('double-click mode preserves the clicked row until activation and page size is independent',async t=>{
 const h=setup(t,{settings:{notesOpenMode:'double',notesPageSize:25}}),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.change(doc=>{for(let i=0;i<30;i++)doc.records.push({id:crypto.randomUUID(),sheetId:root.id,title:'Client '+i,notes:'',tags:[],values:{},fileLinks:[],version:1,createdAt:'2026-10-30',updatedAt:'2026-10-30',deletedAt:null});});h.ui.activate();await flush();assert.equal(h.els.get('notes-page-info').textContent,'1 / 2');const button=findButton(h.els.get('notes-table'),'Client 0'),row=descendants(h.els.get('notes-table')).find(node=>node.tagName==='TR'&&descendants(node).includes(button));button.events.click();assert.ok(descendants(h.els.get('notes-table')).includes(row));assert.equal(h.els.get('notes-detail').hidden,true);assert.equal(row.attrs['aria-selected'],'true');row.events.dblclick();assert.match(h.els.get('notes-master-heading').textContent,/Client 0/);assert.deepEqual(h.errors,[]);
});
test('saving with the overview preference enabled keeps the new detail visible in the overview',async t=>{
 const h=setup(t,{settings:{notesOpenAfterSave:true}}),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Client',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Client').events.click();h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='Person';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();assert.equal(h.els.get('notes-detail').hidden,false);assert.match(h.els.get('notes-detail-body').textContent,/Person/);assert.deepEqual(h.errors,[]);
});
test('explicit favorite tag linking is optional and reflects new members without fixed path copies',async t=>{
 const items=[{id:crypto.randomUUID(),path:'/local/a.txt',label:'A',tags:['Docs'],type:'file'}],h=setup(t,{favoriteItems:items,settings:{notesLinkMode:'tags',notesShowFavoriteTagLinks:true}});h.store.saveSheet({name:'Notes',fields:[]});h.ui.activate();await flush();h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='Tagged';h.els.get('notes-pick-favorites').events.click();await flush();assert.equal(h.els.get('notes-tag-choice').hidden,false);const check=descendants(h.els.get('notes-favorite-tag-picker')).find(node=>node.tagName==='INPUT'&&node.type==='checkbox');check.checked=true;check.events.change();h.els.get('notes-favorites-apply').events.click();h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();const saved=h.store.get().document.records[0];assert.deepEqual(saved.favoriteTagLinks,[{tag:'Docs',authorized:true}]);assert.equal(saved.fileLinks.length,0);h.els.get('notes-inspect-current').events.click();assert.match(h.els.get('notes-detail-body').textContent,/Docs · 1 項/);items.push({id:crypto.randomUUID(),path:'/local/b.txt',label:'B',tags:['Docs'],type:'file'});h.changed();await flush();assert.match(h.els.get('notes-detail-body').textContent,/Docs · 2 項/);findButton(h.els.get('notes-detail-body'),'查看收藏分類').events.click();assert.ok(h.toasts.includes('tag:Docs'));assert.deepEqual(h.errors,[]);
});
test('sidebar context menus support right click, keyboard and group settings actions',async t=>{
 const h=setup(t),state=h.store.addTemplate(),area=state.document.areas[0],sheet=state.document.sheets[0];h.ui.activate();await flush();const node=h.els.get('notes-sheets').children.find(node=>node.tagName==='BUTTON');let prevented=false;node.events.contextmenu({preventDefault(){prevented=true;}});await flush();assert.equal(prevented,true);assert.ok(h.toasts.includes('menu:sheet:'+sheet.id));node.events.keydown({key:'F10',shiftKey:true,preventDefault(){}});await flush();h.contextAction({command:'edit-area',kind:'area',id:area.id});assert.equal(h.els.get('notes-area-dialog').open,true);assert.equal(h.els.get('notes-area-name').value,area.name);assert.deepEqual(h.errors,[]);
});
test('direct location entry selects local favorites for the record and coexists with tag linking',async t=>{
 const items=[],h=setup(t,{favoriteItems:items});h.api.addPaths=async paths=>{for(const path of paths)items.push({id:crypto.randomUUID(),path,label:'Location',type:'folder',tags:[]});return {ids:items.map(item=>item.id),issues:[]};};h.store.saveSheet({name:'Notes',fields:[]});h.ui.activate();await flush();h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='Linked';h.els.get('notes-pick-favorites').events.click();await flush();h.els.get('notes-path-input').value='/local/one\n/local/two';h.els.get('notes-add-paths').events.click();await flush();h.els.get('notes-favorites-apply').events.click();assert.match(h.els.get('notes-record-files').textContent,/Location/);h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();assert.equal(h.store.get().document.records[0].fileLinks.length,2);assert.deepEqual(h.errors,[]);
});
test('global search ignores the active client filter and can return from a matched master',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root,contacts]=state.document.sheets;const add=(sheet,title,values={})=>h.store.saveRecord({sheetId:sheet.id,title,notes:'',tags:[],values,fileLinks:[]}).result.id,a=add(root,'Acme'),b=add(root,'Beta');add(contacts,'Alice',{[contacts.fields[0].id]:[a]});add(contacts,'Bob',{[contacts.fields[0].id]:[b]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Acme').events.click();h.els.get('notes-search-scope').value='all';h.els.get('notes-search-scope').events.change();h.els.get('notes-search').value='Beta';h.els.get('notes-search').events.input();assert.match(h.els.get('notes-table').textContent,/Bob/);assert.match(h.els.get('notes-table').textContent,/客戶管理/);findButton(h.els.get('notes-table'),'Beta').events.click();assert.match(h.els.get('notes-master-heading').textContent,/Beta/);h.els.get('notes-back-search').events.click();assert.equal(h.els.get('notes-search').value,'Beta');assert.match(h.els.get('notes-table').textContent,/Bob/);assert.deepEqual(h.errors,[]);
});
test('card view supports record context, selection and persisted view switching',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Card Client',notes:'Summary',tags:['VIP'],values:{},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-view-cards').events.click();assert.equal(h.preferences.notesTableViews[root.id],'cards');assert.equal(h.els.get('notes-table').dataset.view,'cards');assert.match(h.els.get('notes-table').textContent,/Summary/);const card=descendants(h.els.get('notes-table')).find(node=>node.tagName==='ARTICLE');assert.ok(card);const check=descendants(card).find(node=>node.tagName==='INPUT');check.checked=true;check.events.change();assert.match(h.els.get('notes-selected-count').textContent,/1 筆/);h.els.get('notes-view-list').events.click();assert.equal(h.preferences.notesTableViews[root.id],'list');assert.match(h.els.get('notes-selected-count').textContent,/1 筆/);assert.deepEqual(h.errors,[]);
});
test('record form tabs preserve values and save-and-add continues within the same master',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Client',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Client').events.click();h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='Person';h.els.get('notes-form-tab-notes').events.click();assert.equal(h.els.get('notes-form-basic').hidden,true);h.els.get('notes-record-body').value='Kept note';h.els.get('notes-form-tab-basic').events.click();assert.equal(h.els.get('notes-record-title').value,'Person');h.els.get('notes-save-add').events.click();await flush();assert.equal(h.store.get().document.records.find(record=>record.title==='Person').notes,'Kept note');assert.equal(h.els.get('notes-record-dialog').open,true);assert.equal(h.els.get('notes-record-title').value,'');assert.deepEqual(h.errors,[]);
});
test('shared snapshot manager opts in explicitly and opens an import preview for a chosen package',async t=>{
 const h=setup(t);let config={enabled:false,folder:null,autoPublish:false,intervalMinutes:5,files:[],total:0,busy:false};h.api.shareStatus=async()=>config;h.api.shareChoose=async()=>config={...config,folder:'/selected/share',enabled:false};h.api.shareConfigure=async patch=>config={...config,...patch};h.api.shareCheck=async()=>config={...config,total:1,files:[{name:'Chosen package.json',modifiedAt:'2026-10-30T00:00:00Z',size:10}]};h.api.shareLoad=async name=>({name,canceled:false});h.api.importPreview=async mode=>h.store.importPreview(M.exportPackage(h.store.get().document,{scope:'all'}),mode);h.ui.activate();await flush();h.els.get('notes-share-open').events.click();await flush();assert.equal(h.els.get('notes-share-dialog').open,true);assert.equal(h.els.get('notes-share-enabled').disabled,true);h.els.get('notes-share-choose').events.click();await flush();assert.equal(h.els.get('notes-share-enabled').checked,false);h.els.get('notes-share-enabled').checked=true;h.els.get('notes-share-enabled').events.change();await flush();assert.equal(config.enabled,true);h.els.get('notes-share-check').events.click();await flush();findButton(h.els.get('notes-share-files'),'比較並匯入').events.click();await flush();assert.equal(h.els.get('notes-share-dialog').open,false);assert.equal(h.els.get('notes-transfer-dialog').open,true);assert.equal(h.els.get('notes-import-name').textContent,'Chosen package.json');assert.deepEqual(h.errors,[]);
});

test('card field choices are per table, persist through views and allow an empty field list',async t=>{
 const h=setup(t,{settings:{notesView:'cards'}}),state=h.store.addTemplate(),[root,contacts]=state.document.sheets;
 const client=h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},fileLinks:[]}).result.id;
 const phone=contacts.fields.find(field=>field.type==='phone'),email=contacts.fields.find(field=>field.type==='email');
 h.store.saveRecord({sheetId:contacts.id,title:'Alice',notes:'Private note',tags:['VIP'],values:{[contacts.fields[0].id]:[client],[phone.id]:'12345',[email.id]:'alice@example.com'},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Acme').events.click();
 h.els.get('notes-card-config').events.click();await flush();assert.equal(h.els.get('notes-card-dialog').open,true);
 const labels=h.els.get('notes-card-fields').children;for(const row of labels)row.children[1].children[0].checked=row.children[1].textContent===email.label;
 const position=h.els.get('notes-card-value-position');
 position.value='below';position.events.change();
 assert.ok(descendants(h.els.get('notes-card-preview')).some(node=>node.dataset.position==='below'));
 h.els.get('notes-card-apply').events.click();assert.deepEqual([...h.preferences.notesCardFields[contacts.id]],[email.id]);
 assert.equal(h.preferences.notesCardValuePositions[contacts.id],'below');assert.equal(h.preferences.notesCardValuePositions[root.id],undefined);h.els.get('notes-card-cancel').events.click();
 assert.match(h.els.get('notes-table').textContent,/alice@example.com/);assert.doesNotMatch(h.els.get('notes-table').textContent,/12345/);
 assert.ok(descendants(h.els.get('notes-table')).some(node=>node.dataset.position==='below'));
 h.els.get('notes-view-list').events.click();assert.match(h.els.get('notes-table').textContent,/12345/);h.els.get('notes-view-cards').events.click();assert.doesNotMatch(h.els.get('notes-table').textContent,/12345/);
 h.els.get('notes-card-config').events.click();await flush();for(const row of h.els.get('notes-card-fields').children)row.children[1].children[0].checked=false;h.els.get('notes-card-apply').events.click();h.els.get('notes-card-cancel').events.click();assert.doesNotMatch(h.els.get('notes-table').textContent,/alice@example.com/);assert.match(h.els.get('notes-table').textContent,/Alice/);
 h.els.get('notes-card-config').events.click();await flush();h.els.get('notes-card-reset').events.click();h.els.get('notes-card-cancel').events.click();assert.equal(h.preferences.notesCardFields[contacts.id],undefined);assert.equal(h.preferences.notesCardValuePositions[contacts.id],undefined);assert.match(h.els.get('notes-table').textContent,/12345/);assert.deepEqual(h.errors,[]);
});
test('card metadata visibility does not affect saved records or list columns',async t=>{
 const h=setup(t,{settings:{notesView:'cards',notesCardShowContext:false,notesCardShowNotes:false,notesCardShowTags:false,notesCardShowDate:false,notesCardShowLinks:false}}),state=h.store.addTemplate(),root=state.document.sheets[0];
 h.store.saveRecord({sheetId:root.id,title:'Visible title',notes:'Hidden note',tags:['HiddenTag'],values:{},fileLinks:[]});h.ui.activate();await flush();const text=h.els.get('notes-table').textContent;assert.match(text,/Visible title/);assert.doesNotMatch(text,/Hidden note|HiddenTag|個位置|2026-/);h.els.get('notes-view-list').events.click();assert.match(h.els.get('notes-table').textContent,/HiddenTag/);assert.equal(h.store.get().document.records[0].notes,'Hidden note');
});
test('master summary and real detail tabs keep the parent while switching with keyboard',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root,contacts]=state.document.sheets;h.store.saveRecord({sheetId:root.id,title:'Very visible Client',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Very visible Client').events.click();
 assert.equal(h.els.get('notes-master-context').dataset.selected,'true');assert.match(h.els.get('notes-master-badge').textContent,/目前主檔/);assert.match(h.els.get('notes-master-heading').textContent,/Very visible Client/);
 let tabs=h.els.get('notes-detail-tabs').children;assert.equal(tabs[0].attrs.role,'tab');assert.equal(tabs[0].attrs['aria-selected'],'true');assert.equal(h.els.get('notes-table').attrs.role,'tabpanel');tabs[0].events.keydown({key:'ArrowRight',preventDefault(){}});tabs=h.els.get('notes-detail-tabs').children;assert.equal(tabs[1].attrs['aria-selected'],'true');assert.match(h.els.get('notes-sheet-title').textContent,/文件/);assert.match(h.els.get('notes-master-heading').textContent,/Very visible Client/);
 h.els.get('notes-master-back').events.click();assert.equal(h.els.get('notes-detail-tabs').hidden,true);assert.equal(h.els.get('notes-table').attrs.role,'region');assert.deepEqual(h.errors,[]);
});
test('configured search default and category switches affect results without changing the records',async t=>{
 const h=setup(t,{settings:{notesSearchScope:'all',notesSearchNotes:false,notesSearchFields:false,notesSearchParent:false}}),state=h.store.addTemplate(),[root,contacts]=state.document.sheets;
 const client=h.store.saveRecord({sheetId:root.id,title:'Client',notes:'SecretWord',tags:[],values:{},fileLinks:[]}).result.id;h.store.saveRecord({sheetId:contacts.id,title:'Alice',notes:'SecretWord',tags:[],values:{[contacts.fields[0].id]:[client]},fileLinks:[]});h.ui.activate();await flush();assert.equal(h.els.get('notes-search-scope').value,'sheet');h.els.get('notes-search').value='SecretWord';h.els.get('notes-search').events.input();assert.equal(h.els.get('notes-search-scope').value,'all');assert.doesNotMatch(h.els.get('notes-table').textContent,/Alice/);h.preferences.notesSearchNotes=true;h.ui.settingsChanged(['notesSearchNotes']);assert.match(h.els.get('notes-table').textContent,/Alice/);assert.equal(h.store.get().document.records.length,2);assert.deepEqual(h.errors,[]);
});

test('card display dialog applies compact height and visibility together and refuses invalid heights',async t=>{
 const h=setup(t,{settings:{notesView:'cards'}}),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'Notes',tags:['VIP'],values:{},fileLinks:[]});h.ui.activate();await flush();
 h.els.get('notes-card-config').events.click();await flush();h.els.get('notes-card-compact').events.click();assert.equal(h.preferences.notesCardHeight,0);h.els.get('notes-card-height').value='80';h.els.get('notes-card-apply').events.click();assert.match(h.els.get('notes-card-status').textContent,/120–600/);assert.equal(h.preferences.notesCardHeight,0);
 h.els.get('notes-card-compact').events.click();h.els.get('notes-card-apply').events.click();h.els.get('notes-card-cancel').events.click();assert.equal(h.preferences.notesCardHeight,140);assert.equal(h.preferences.notesCardShowDate,false);assert.equal(h.preferences.notesCardShowParent,false);assert.equal(h.preferences.notesCardShowType,false);assert.equal(h.preferences.notesCardShowRelations,false);const text=h.els.get('notes-table').textContent;assert.match(text,/Acme/);assert.match(text,/VIP/);assert.doesNotMatch(text,/個位置|主檔|Notes|2026-/);
 h.els.get('notes-card-config').events.click();await flush();h.els.get('notes-card-auto').events.click();h.els.get('notes-card-apply').events.click();h.els.get('notes-card-cancel').events.click();assert.equal(h.preferences.notesCardHeight,0);assert.equal(h.store.get().document.records[0].notes,'Notes');assert.deepEqual(h.errors,[]);
});
test('sparse cards omit empty bodies and zero link counts, and custom relation fields can be hidden separately',async t=>{
 const h=setup(t,{settings:{notesView:'cards',notesCardShowContext:false,notesCardShowParent:false,notesCardShowDate:false}}),state=h.store.addTemplate(),[root,contacts]=state.document.sheets;
 const parent=h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},fileLinks:[]}).result.id;h.store.saveRecord({sheetId:contacts.id,title:'Alice',notes:'',tags:[],values:{[contacts.fields[0].id]:[parent]},fileLinks:[]});h.preferences.notesCardFields={...h.preferences.notesCardFields,[contacts.id]:[contacts.fields[0].id]};h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Acme').events.click();assert.match(h.els.get('notes-table').textContent,/Acme/);h.preferences.notesCardShowRelations=false;h.ui.settingsChanged(['notesCardShowRelations']);assert.doesNotMatch(h.els.get('notes-table').textContent,/Acme|0 個位置/);assert.equal(descendants(h.els.get('notes-table')).some(node=>node.className==='notes-card-body'),false);h.preferences.notesCardShowEmptyLinks=true;h.ui.settingsChanged(['notesCardShowEmptyLinks']);assert.match(h.els.get('notes-table').textContent,/0 個位置/);assert.deepEqual(h.errors,[]);
});
test('external detail tabs hide when no master context is available, in trash or in global search',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Acme').events.click();assert.equal(h.els.get('notes-detail-tabs').hidden,false);h.els.get('notes-search-scope').value='all';h.els.get('notes-search-scope').events.change();assert.equal(h.els.get('notes-detail-tabs').hidden,true);assert.equal(h.els.get('notes-table').attrs.role,'region');h.els.get('notes-search-scope').value='sheet';h.els.get('notes-search-scope').events.change();assert.equal(h.els.get('notes-detail-tabs').hidden,false);h.els.get('notes-trash-view').events.click();assert.equal(h.els.get('notes-detail-tabs').hidden,true);h.els.get('notes-area-select').value='ungrouped';h.els.get('notes-area-select').events.change();assert.equal(h.els.get('notes-detail-tabs').hidden,true);assert.deepEqual(h.errors,[]);
});

test('workspace master-only scope, rolling saved views and custom templates work through the UI',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root,contacts]=state.document.sheets,area=state.document.areas[0],client=h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:['VIP'],values:{},fileLinks:[]}).result.id;h.store.saveRecord({sheetId:contacts.id,title:'Alice',notes:'',tags:[],values:{[contacts.fields[0].id]:[client]},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-search-scope').value='masters';h.els.get('notes-search-scope').events.change();assert.match(h.els.get('notes-table').textContent,/Acme/);assert.doesNotMatch(h.els.get('notes-table').textContent,/Alice/);h.els.get('notes-manage-tools').events.click();h.els.get('notes-tool-name').value='VIP masters';h.els.get('notes-tool-save-view').events.click();await flush();h.els.get('notes-tools-close').events.click();h.els.get('notes-search').value='No match';h.els.get('notes-search').events.input();const saved=await h.api.tools();h.els.get('notes-saved-views').value=saved.views[0].id;h.els.get('notes-saved-views').events.change();assert.equal(h.els.get('notes-search-scope').value,'masters');assert.match(h.els.get('notes-table').textContent,/Acme/);h.els.get('notes-date-field').value='updatedAt';h.els.get('notes-due').value='30';h.els.get('notes-due').events.change();findButton(h.els.get('notes-table'),'Acme').events.click();h.els.get('notes-back-search').events.click();assert.equal(h.els.get('notes-search-scope').value,'masters');assert.equal(h.els.get('notes-due').value,'30');assert.equal(h.els.get('notes-date-field').value,'updatedAt');
 h.els.get('notes-area-select').value=area.id;h.els.get('notes-area-select').events.change();h.els.get('notes-manage-tools').events.click();h.els.get('notes-tool-name').value='My CRM';h.els.get('notes-tool-save-template').events.click();await flush();h.els.get('notes-tools-close').events.click();h.els.get('notes-template').events.click();const custom=findButton(h.els.get('notes-template-list'),'My CRM自訂範本 · 5 張表格');custom.events.click();h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(h.store.get().document.areas.length,2);assert.equal(h.store.get().document.records.length,2);assert.deepEqual(h.errors,[]);
});
test('batch organization previews and soft deletes selected tables without losing records',async t=>{
 const h=setup(t),state=h.store.addTemplate();h.store.saveRecord({sheetId:state.document.sheets[0].id,title:'Keep',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-organize').events.click();const labels=descendants(h.els.get('notes-organize-items')).filter(node=>node.tagName==='LABEL');assert.equal(labels.length,5);labels[1].children[0].checked=true;labels[1].children[0].events.change();assert.match(h.els.get('notes-organize-count').textContent,/1 張明細表/);h.els.get('notes-organize-sheets').events.click();assert.match(h.els.get('notes-confirm-title').textContent,/1 張表格/);h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(h.store.get().document.sheets.filter(sheet=>sheet.deletedAt).length,1);assert.equal(h.store.get().document.records.length,1);assert.deepEqual(h.errors,[]);
});
test('grid cell edit and TSV paste preview save atomically, cancel safely and preserve title rendering',async t=>{
 const h=setup(t,{settings:{notesView:'grid'}}),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Before',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-grid-paste-mode').value='update';let cells=descendants(h.els.get('notes-table')).filter(node=>node.attrs.role==='gridcell');assert.ok(cells.length);cells[0].events.dblclick();const input=cells[0].children[0];input.value='After';input.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});await flush();assert.equal(h.store.get().document.records[0].title,'After');cells=descendants(h.els.get('notes-table')).filter(node=>node.attrs.role==='gridcell');cells[0].events.paste({preventDefault(){},clipboardData:{getData:()=>'<script>literal</script>\tCODE'}});assert.equal(h.els.get('notes-confirm-dialog').open,true);assert.equal(h.store.get().document.records[0].title,'After');h.els.get('notes-confirm-cancel').events.click();assert.equal(h.store.get().document.records[0].title,'After');cells[0].events.paste({preventDefault(){},clipboardData:{getData:()=>'<script>literal</script>\tCODE'}});h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(h.store.get().document.records[0].title,'<script>literal</script>');assert.match(h.els.get('notes-table').textContent,/<script>literal<\/script>/);assert.equal(h.store.history(h.store.get().document.records[0].id).length,2);assert.deepEqual(h.errors,[]);
});
test('pinning master and navigating from floating quick add preselect the right master and detail sheet',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root]=state.document.sheets,log=state.document.sheets.find(sheet=>sheet.name==='紀錄'),id=h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},fileLinks:[]}).result.id;h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Acme').events.click();h.els.get('notes-pin-master').events.click();await flush();assert.deepEqual((await h.api.tools()).pins,[id]);let pending={recordId:id,sheetId:log.id};h.api.navigation=async()=>{const value=pending;pending=null;return value;};h.ui.activate();await flush();assert.equal(h.els.get('notes-record-dialog').open,true);assert.match(h.els.get('notes-record-dialog-title').textContent,/紀錄/);h.els.get('notes-record-title').value='Follow up';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();const saved=h.store.get().document.records.find(record=>record.title==='Follow up');assert.deepEqual(saved.values[log.fields[0].id],[id]);assert.deepEqual(h.errors,[]);
});

test('empty grid paste can map Name/Phone/Email and create new detail rows only after preview confirmation',async t=>{
 const h=setup(t,{settings:{notesView:'grid'}}),state=h.store.addTemplate(),[root,contacts]=state.document.sheets,id=h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},fileLinks:[]}).result.id;h.ui.activate();await flush();h.els.get('notes-master-select').value=id;h.els.get('notes-area-select').value=state.document.areas[0].id;h.els.get('notes-area-select').events.change();h.els.get('notes-master-select').value=id;h.els.get('notes-master-select').events.change();assert.equal(h.els.get('notes-table').children.some(node=>node.tagName==='TABLE'),true);h.els.get('notes-table').events.paste({preventDefault(){},clipboardData:{getData:()=> 'Name\tPhone\tEmail\r\nA\t00123\ta@example.com\r\nB\t234\tb@example.com'}});assert.equal(h.els.get('notes-table-dialog').open,true);assert.match(h.els.get('notes-table-context').textContent,/聯絡人.*Acme/);const selects=h.els.get('notes-table-mapping').children.map(label=>label.children[1]);assert.equal(selects[0].value,'title');assert.equal(selects[1].value,contacts.fields.find(field=>field.type==='phone').id);h.els.get('notes-table-preview-button').events.click();await flush();assert.equal(h.els.get('notes-table-apply').disabled,false);assert.match(h.els.get('notes-table-status').textContent,/可新增 2 筆/);assert.equal(h.store.get().document.records.length,1);h.els.get('notes-table-apply').events.click();await flush();assert.equal(h.els.get('notes-table-dialog').open,false);const created=h.store.get().document.records.filter(record=>record.sheetId===contacts.id);assert.equal(created.length,2);assert.equal(created[0].values[contacts.fields.find(field=>field.type==='phone').id],'00123');assert.ok(created.every(record=>record.values[contacts.fields[0].id][0]===id));assert.deepEqual(h.errors,[]);
});
test('Excel source worksheet can be chosen and edited text invalidates earlier preview and mapping',async t=>{
 const h=setup(t),state=h.store.addTemplate();h.ui.activate();await flush();h.api.chooseTableFile=async()=>({name:'Clients.xlsx',sheets:[{name:'First',rows:[['Name'],['A']]},{name:'Second',rows:[['Name'],['B']]}],warnings:['Only stored values']});h.els.get('notes-tabular-open').events.click();h.els.get('notes-table-file').events.click();await flush();assert.equal(h.els.get('notes-table-sheet').hidden,false);h.els.get('notes-table-sheet').value='1';h.els.get('notes-table-sheet').events.change();h.els.get('notes-table-preview-button').events.click();await flush();assert.match(h.els.get('notes-table-preview').textContent,/B/);assert.equal(h.els.get('notes-table-apply').disabled,false);h.els.get('notes-table-text').value='Name\nC';h.els.get('notes-table-text').events.input();assert.equal(h.els.get('notes-table-apply').disabled,true);assert.equal(h.els.get('notes-table-mapping').children.length,0);h.els.get('notes-table-read').events.click();h.els.get('notes-table-preview-button').events.click();await flush();assert.match(h.els.get('notes-table-preview').textContent,/C/);h.els.get('notes-table-cancel').events.click();assert.equal(h.store.get().document.records.length,0);assert.deepEqual(h.errors,[]);
});

test('cards open by single click regardless of old preferences, with no per-card View or mode toggle',async t=>{
 const h=setup(t,{settings:{notesView:'cards',notesOpenMode:'double',notesCardSelection:true}}),state=h.store.addTemplate(),[root,contacts]=state.document.sheets;
 const parent=h.store.saveRecord({sheetId:root.id,title:'Acme',values:{},notes:'',tags:[],fileLinks:[]}).result.id;h.store.saveRecord({sheetId:contacts.id,title:'Alice',values:{[contacts.fields[0].id]:[parent]},notes:'',tags:[],fileLinks:[]});h.ui.activate();await flush();
 let card=descendants(h.els.get('notes-table')).find(n=>n.tagName==='ARTICLE');assert.equal(descendants(card).some(n=>n.tagName==='BUTTON'&&n.textContent==='查看'),false);assert.equal(h.els.has('notes-card-mode'),false);assert.equal(h.els.has('settings-notes-card-selection'),false);
 findButton(card,'Acme').events.click();assert.equal(h.els.get('notes-detail-tabs').hidden,false);assert.match(h.els.get('notes-master-heading').textContent,/Acme/);assert.match(h.els.get('notes-selected-count').textContent,/0 筆/);
 card=descendants(h.els.get('notes-table')).find(n=>n.tagName==='ARTICLE');card.events.click({detail:1});assert.equal(h.els.get('notes-detail').hidden,false);assert.match(h.els.get('notes-detail-body').textContent,/Alice/);assert.match(h.els.get('notes-selected-count').textContent,/0 筆/);assert.deepEqual(h.errors,[]);
});
test('card checkboxes and Shift/Ctrl select without opening, with checkbox anchor and range across pages',async t=>{
 const h=setup(t,{settings:{notesView:'cards',notesPageSize:25}}),state=h.store.addTemplate(),root=state.document.sheets[0];for(let i=1;i<=30;i++)h.store.saveRecord({sheetId:root.id,title:'Client '+i,values:{},notes:'',tags:[],fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-sort').value='title';h.els.get('notes-sort').events.change();
 const cards=()=>descendants(h.els.get('notes-table')).filter(n=>n.tagName==='ARTICLE'),checkClick=(card,shiftKey=false)=>{const check=card.children[0].children[0];check.checked=!check.checked;check.events.click({stopPropagation(){},shiftKey});check.events.change();return check;};
 checkClick(cards()[0]);assert.match(h.els.get('notes-selected-count').textContent,/1 筆/);assert.equal(h.els.get('notes-detail-tabs').hidden,true);checkClick(cards()[2],true);assert.match(h.els.get('notes-selected-count').textContent,/3 筆/);assert.ok(cards().slice(0,3).every(c=>c.children[0].children[0].checked));
 cards()[1].events.click({ctrlKey:true,detail:1});assert.match(h.els.get('notes-selected-count').textContent,/2 筆/);assert.equal(cards()[1].children[0].children[0].checked,false);findButton(cards()[1],'Client 2').events.click({metaKey:true,stopPropagation(){}});assert.match(h.els.get('notes-selected-count').textContent,/3 筆/);
 cards()[4].events.click({shiftKey:true,detail:1});assert.match(h.els.get('notes-selected-count').textContent,/5 筆/);h.els.get('notes-next').events.click();cards()[0].events.click({shiftKey:true,detail:1});assert.match(h.els.get('notes-selected-count').textContent,/26 筆/);assert.equal(cards()[0].children[0].children[0].checked,true);assert.equal(h.els.get('notes-detail').hidden,true);assert.equal(h.els.get('notes-detail-tabs').hidden,true);
 checkClick(cards()[0]);assert.match(h.els.get('notes-selected-count').textContent,/25 筆/);assert.equal(cards()[0].children[0].children[0].checked,false);assert.deepEqual(h.errors,[]);
});
test('selected grid supports typing, IME-safe Enter, cancellation and F2 editing existing values',async t=>{
 const h=setup(t,{settings:{notesView:'grid'}}),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Before',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();const cell=()=>descendants(h.els.get('notes-table')).find(n=>n.attrs.role==='gridcell'),key=(key,extra={})=>({key,preventDefault(){},stopPropagation(){},...extra});cell().events.keydown(key('X'));let input=cell().children[0];assert.equal(input.value,'X');assert.equal(h.store.get().document.records[0].title,'Before');input.events.keydown(key('Enter',{isComposing:true}));await flush();assert.equal(h.store.get().document.records[0].title,'Before');input.events.keydown(key('Enter'));await flush();assert.equal(h.store.get().document.records[0].title,'X');cell().events.keydown(key('F2'));assert.equal(cell().children[0].value,'X');cell().children[0].events.keydown(key('Escape'));await flush();cell().events.keydown(key('Process',{keyCode:229}));input=cell().children[0];assert.equal(input.value,'');input.value='中文';input.events.keydown(key('Enter'));await flush();assert.equal(h.store.get().document.records[0].title,'中文');cell().events.keydown(key('Delete'));cell().children[0].events.keydown(key('Escape'));await flush();assert.equal(h.store.get().document.records[0].title,'中文');assert.deepEqual(h.errors,[]);
});
test('column headers sort all records before pagination, retain checks and share order with grid',async t=>{
 const h=setup(t,{settings:{notesPageSize:25}}),state=h.store.addTemplate(),root=state.document.sheets[0];for(let i=30;i>=1;i--)h.store.saveRecord({sheetId:root.id,title:'Client '+i,notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();const titleHeader=()=>descendants(h.els.get('notes-table')).find(n=>n.className==='notes-sort-heading'&&n.textContent.includes('標題'));titleHeader().events.click();let rows=descendants(h.els.get('notes-table')).filter(n=>n.tagName==='TBODY')[0].children;assert.equal(findButton(rows[0],'Client 1').textContent,'Client 1');const check=rows[0].children[0].children[0];check.checked=true;check.events.change();h.els.get('notes-next').events.click();rows=descendants(h.els.get('notes-table')).find(n=>n.tagName==='TBODY').children;assert.equal(findButton(rows[0],'Client 26').textContent,'Client 26');titleHeader().events.click();assert.equal(descendants(h.els.get('notes-table')).find(n=>n.attrs['aria-sort']==='descending').tagName,'TH');rows=descendants(h.els.get('notes-table')).find(n=>n.tagName==='TBODY').children;assert.equal(findButton(rows[0],'Client 30').textContent,'Client 30');assert.match(h.els.get('notes-selected-count').textContent,/1 筆/);h.els.get('notes-view-grid').events.click();const cells=descendants(h.els.get('notes-table')).filter(n=>n.attrs.role==='gridcell');assert.equal(cells[0].textContent,'Client 30');assert.match(h.els.get('notes-sort-column').textContent,/名稱.*▼/);assert.deepEqual(h.errors,[]);
});
test('compact left back button restores query, sort, page and table scroll after inspecting master',async t=>{
 const h=setup(t,{settings:{notesPageSize:25}}),state=h.store.addTemplate(),root=state.document.sheets[0];for(let i=0;i<30;i++)h.store.saveRecord({sheetId:root.id,title:'Acme '+i,notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-search').value='Acme';h.els.get('notes-search').events.input();descendants(h.els.get('notes-table')).find(n=>n.className==='notes-sort-heading'&&n.textContent.includes('標題')).events.click();h.els.get('notes-next').events.click();h.els.get('notes-table').scrollTop=123;h.els.get('notes-table').scrollLeft=45;findButton(h.els.get('notes-table'),'Acme 25').events.click();assert.equal(h.els.get('notes-master-edit').textContent,'編輯');assert.equal(h.els.get('notes-master-overview').textContent,'詳情');h.els.get('notes-master-back').events.click();assert.equal(h.els.get('notes-search').value,'Acme');assert.equal(h.els.get('notes-page-info').textContent,'2 / 2');assert.equal(h.els.get('notes-table').scrollTop,123);assert.equal(h.els.get('notes-table').scrollLeft,45);assert.equal(descendants(h.els.get('notes-table')).find(n=>n.attrs['aria-sort']==='ascending').tagName,'TH');assert.deepEqual(h.errors,[]);
});

test('sorting a grid header cannot discard a pending typed edit',async t=>{const h=setup(t,{settings:{notesView:'grid'}}),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Before',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();const cell=descendants(h.els.get('notes-table')).find(n=>n.attrs.role==='gridcell');cell.events.keydown({key:'X',preventDefault(){}});const input=cell.children[0];descendants(h.els.get('notes-table')).find(n=>n.className==='notes-sort-heading').events.click();assert.equal(cell.children[0],input);assert.equal(input.value,'X');assert.equal(h.store.get().document.records[0].title,'Before');assert.match(h.els.get('notes-status').textContent,/先按 Enter/);assert.deepEqual(h.errors,[]);});

test('advanced view filters retain their disclosure preference and advertise active dates when collapsed',async t=>{const h=setup(t),state=h.store.addTemplate();h.ui.activate();await flush();assert.equal(h.els.get('notes-view-tools').open,false);h.els.get('notes-view-tools').open=true;h.els.get('notes-view-tools').events.toggle();assert.equal(h.preferences.notesExpandFilters,true);h.els.get('notes-due').value='30';h.els.get('notes-due').events.change();assert.match(h.els.get('notes-view-tools-summary').textContent,/已啟用/);h.els.get('notes-view-tools').open=false;h.els.get('notes-view-tools').events.toggle();assert.equal(h.preferences.notesExpandFilters,false);assert.match(h.els.get('notes-view-tools-summary').textContent,/已啟用/);assert.equal(h.store.get().document.records.length,0);assert.deepEqual(h.errors,[]);});

test('sidebar search and collapse controls cannot discard a pending grid draft',async t=>{const h=setup(t,{settings:{notesView:'grid'}}),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.addTemplate('projects');h.store.saveRecord({sheetId:root.id,title:'Before',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();const cell=descendants(h.els.get('notes-table')).find(n=>n.attrs.role==='gridcell');cell.events.keydown({key:'X',preventDefault(){}});const input=cell.children[0];h.els.get('notes-nav-search').value='專案';h.els.get('notes-nav-search').events.input();const target=h.els.get('notes-sheets').children.find(n=>n.className.startsWith('notes-sheet-button'));target.events.click();assert.equal(cell.children[0],input);assert.equal(input.value,'X');assert.equal(h.store.get().document.records[0].title,'Before');assert.match(h.els.get('notes-status').textContent,/先儲存或取消/);assert.deepEqual(h.errors,[]);});

test('configured quick-add opens the chosen detail form and master relation, retaining pending requests during editing',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root,detail]=state.document.sheets,master=h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},fileLinks:[]}).result.id;let target={newRecordSheetId:detail.id,masterId:master},reads=0;h.api.navigation=async()=>{reads++;const value=target;target=null;return value;};h.ui.activate();await flush();assert.equal(h.els.get('notes-record-dialog').open,true);assert.equal(h.store.get().document.records.length,1);
 target={openSheetId:root.id};const before=reads;h.ui.activate();await flush();assert.equal(reads,before);assert.equal(target.openSheetId,root.id);
 h.els.get('notes-record-title').value='John';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();const contact=h.store.get().document.records.find(r=>r.title==='John');assert.equal(contact.sheetId,detail.id);assert.deepEqual(contact.values[detail.fields[0].id],[master]);assert.equal(target,null);assert.deepEqual(h.errors,[]);
});

test('record history renders version transitions, timestamps and field-level before/after values',async t=>{
 const h=setup(t),sheet=h.store.saveSheet({name:'Contacts',fields:[{id:crypto.randomUUID(),label:'電話',type:'phone',options:[],targetSheetId:null}]}).document.sheets[0],created=h.store.saveRecord({sheetId:sheet.id,title:'Alice',notes:'Before note',tags:[],values:{[sheet.fields[0].id]:'111'},fileLinks:[]}).document.records[0];h.store.saveRecord({...created,notes:'After note',values:{[sheet.fields[0].id]:'222'},expectedVersion:1});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Alice').events.click();findButton(h.els.get('notes-detail-body'),'修改歷史').events.click();await flush();const text=h.els.get('notes-history-list').textContent;assert.match(text,/v1 → v2/);assert.match(text,/保存時間/);assert.match(text,/電話/);assert.match(text,/111/);assert.match(text,/222/);assert.match(text,/Before note/);assert.match(text,/After note/);assert.deepEqual(h.errors,[]);
});
test('import preview uses configured default and expands actual differences without saving',async t=>{
 const h=setup(t,{settings:{notesImportMode:'update'}}),sheet=h.store.saveSheet({name:'Table',fields:[]}).document.sheets[0],created=h.store.saveRecord({sheetId:sheet.id,title:'Original',notes:'',tags:[],values:{},fileLinks:[]}).document.records[0],input=M.exportPackage(h.store.get().document,{scope:'all'});input.document.records[0].title='Changed';h.api.chooseImport=async()=>({canceled:false,name:'data.json'});h.api.importPreview=async mode=>h.store.importPreview(input,mode);h.api.importDetails=async(token,key)=>h.store.importDetails(token,key);h.ui.activate();await flush();h.els.get('notes-import').events.click();assert.equal(h.els.get('notes-import-mode').value,'update');h.els.get('notes-import-choose').events.click();await flush();h.els.get('notes-transfer-preview').events.click();await flush();assert.match(h.els.get('notes-transfer-summary').textContent,/更新內容 1 筆/);const entry=h.els.get('notes-transfer-preview-list').children.find(node=>node.className==='notes-import-entry');assert.ok(entry);entry.open=true;await entry.events.toggle();assert.match(entry.textContent,/Original/);assert.match(entry.textContent,/Changed/);assert.equal(h.store.get().document.records[0].title,'Original');h.els.get('notes-transfer-filter').value='added';h.els.get('notes-transfer-filter').events.change();assert.match(h.els.get('notes-transfer-preview-list').textContent,/沒有符合/);assert.deepEqual(h.errors,[]);
});

test('simplified sidebar lists all masters and legacy standalone tables regardless of old group preferences',async t=>{
 const h=setup(t,{settings:{notesSidebarMode:'groups',notesSidebarShowDetails:true}}),first=h.store.addTemplate(),second=h.store.addTemplate('projects'),legacy=h.store.saveSheet({name:'Legacy',fields:[]}).document.sheets.find(sheet=>sheet.name==='Legacy');h.ui.activate();await flush();const rows=()=>h.els.get('notes-sheets').children.filter(node=>node.tagName==='BUTTON');assert.equal(rows().length,3);assert.ok(rows().every(node=>node.dataset.role==='master'));assert.ok(!rows().some(node=>node.id==='notes-nav-sheet-'+first.document.sheets[1].id));assert.equal(h.els.get('notes-legacy-group-controls').hidden,true);rows().find(node=>node.id==='notes-nav-sheet-'+legacy.id).events.click();assert.equal(h.els.get('notes-sheet-title').textContent,'Legacy');assert.equal(rows().length,3);assert.deepEqual(h.errors,[]);
});
test('master-only sidebar keeps child tabs, counts and context menu available without a grouping interface',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Client',notes:'',tags:[],values:{},fileLinks:[]});h.ui.activate();await flush();assert.equal(h.els.get('notes-sheets').children.filter(node=>node.tagName==='BUTTON').length,1);findButton(h.els.get('notes-table'),'Client').events.click();assert.equal(h.els.get('notes-detail-tabs').hidden,false);assert.ok(h.els.get('notes-detail-tabs').textContent.includes('聯絡人'));h.els.get('notes-panel-view').events.click();const button=h.els.get('notes-sheets').children.find(node=>node.tagName==='BUTTON');assert.match(button.textContent,/主檔清單.*欄位/);button.events.contextmenu({preventDefault(){}});await flush();assert.ok(h.toasts.includes('menu:sheet:'+root.id));assert.deepEqual(h.errors,[]);
});
test('empty simplified workspace creates a master and detail directly and offers templates or source import',async t=>{
 const h=setup(t);h.ui.activate();await flush();findButton(h.els.get('notes-sheets'),'＋ 主表').events.click();h.els.get('notes-sheet-name').value='My master';h.els.get('notes-sheet-form').events.submit({preventDefault(){}});await flush();const root=h.store.get().document.sheets[0];assert.equal(root.name,'My master');assert.ok(h.store.get().document.areas.some(area=>area.masterSheetId===root.id));h.els.get('notes-add-detail-sheet').events.click();h.els.get('notes-sheet-name').value='My details';h.els.get('notes-sheet-form').events.submit({preventDefault(){}});await flush();assert.equal(M.masterTableTree(h.store.get().document)[0].children[0].name,'My details');assert.equal(h.els.get('notes-sheets').children.filter(node=>node.tagName==='BUTTON').length,1);assert.deepEqual(h.errors,[]);
});
test('batch master selection includes every child, while selecting one child leaves the master and siblings intact',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];h.ui.activate();await flush();h.els.get('notes-organize').events.click();let checks=descendants(h.els.get('notes-organize-items')).filter(node=>node.tagName==='INPUT');assert.equal(checks.length,5);checks[0].checked=true;checks[0].events.change();assert.ok(checks.every(check=>check.checked));checks[2].checked=false;checks[2].events.change();assert.equal(checks[0].checked,false);assert.equal(checks[0].indeterminate,true);h.els.get('notes-organize-none').events.click();assert.ok(checks.every(check=>!check.checked));checks[1].checked=true;checks[1].events.change();h.els.get('notes-organize-sheets').events.click();assert.match(h.els.get('notes-confirm-title').textContent,/1 張表格/);h.els.get('notes-confirm-apply').events.click();await flush();let doc=h.store.get().document;assert.equal(doc.sheets.filter(sheet=>sheet.deletedAt).length,1);assert.equal(doc.sheets.find(sheet=>sheet.id===root.id).deletedAt,null);assert.deepEqual(h.errors,[]);
});
test('source clone is preselected from its shared action and applies only after a second confirmation',async t=>{
 const h=setup(t);const sheet=h.store.saveSheet({name:'Local',fields:[]}).document.sheets[0];h.store.saveRecord({sheetId:sheet.id,title:'Old local',notes:'',tags:[],values:{},fileLinks:[]});const source=M.template(()=>crypto.randomUUID(),'2026-11-02T00:00:00Z'),input=M.exportPackage(source,{scope:'all'});let commits=0;h.api.shareStatus=async()=>({enabled:true,folder:'/share',files:[{name:'source.json',modifiedAt:'2026-11-02T00:00:00Z'}],total:1});h.api.shareLoad=async name=>({name});h.api.importPreview=async mode=>h.store.importPreview(input,mode);h.api.importCommit=async(token,options)=>{commits++;return h.store.importCommit(token,options);};h.ui.activate();await flush();h.els.get('notes-share-open').events.click();await flush();findButton(h.els.get('notes-share-files'),'複製到本機').events.click();await flush();assert.equal(h.els.get('notes-import-mode').value,'clone');h.els.get('notes-transfer-preview').events.click();await flush();assert.match(h.els.get('notes-transfer-summary').textContent,/將移除 1 筆/);h.els.get('notes-transfer-apply').events.click();assert.equal(commits,0);assert.equal(h.els.get('notes-confirm-dialog').open,true);h.els.get('notes-confirm-cancel').events.click();assert.equal(h.store.get().document.records[0].title,'Old local');h.els.get('notes-transfer-apply').events.click();h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(commits,1);assert.equal(h.store.get().document.sheets.length,source.sheets.length);assert.equal(h.store.get().document.records.length,0);assert.deepEqual(h.errors,[]);
});

test('table batch confirmation refuses a stale selection after another change without deleting any table',async t=>{const h=setup(t),initial=h.store.addTemplate();h.ui.activate();await flush();h.els.get('notes-organize').events.click();const check=descendants(h.els.get('notes-organize-items')).find(node=>node.tagName==='INPUT');check.checked=true;check.events.change();h.store.addTemplate('projects');h.els.get('notes-organize-sheets').events.click();h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(h.store.get().document.sheets.filter(sheet=>sheet.deletedAt).length,0);assert.ok(h.errors.some(message=>message.includes('已變更')));});

test('legacy standalone table inside an old group creates details under itself rather than the previous master',async t=>{const h=setup(t),state=h.store.addTemplate(),other=h.store.saveSheet({name:'Other master',areaId:state.document.areas[0].id,fields:[]}).document.sheets.at(-1);h.ui.activate();await flush();h.els.get('notes-sheets').children.find(node=>node.id==='notes-nav-sheet-'+other.id).events.click();h.els.get('notes-add-detail-sheet').events.click();h.els.get('notes-sheet-name').value='Other details';h.els.get('notes-sheet-form').events.submit({preventDefault(){}});await flush();const branch=M.masterTableTree(h.store.get().document).find(branch=>branch.master.id===other.id);assert.equal(branch.children.length,1);assert.equal(branch.children[0].name,'Other details');assert.deepEqual(h.errors,[]);});

test('shared comparison opens with differences, retains unchanged rows under All and labels skip values accurately',async t=>{const h=setup(t,{settings:{notesSharedImportMode:'skip'}}),root=h.store.addTemplate().document.sheets[0];for(const title of ['Same','Local'])h.store.saveRecord({sheetId:root.id,title,notes:'',tags:[],values:{},fileLinks:[]});const input=M.exportPackage(h.store.get().document,{scope:'all'});input.document.records[1].title='Remote';h.api.shareStatus=async()=>({enabled:true,files:[{name:'source.json'}],notice:{name:'source.json',reason:'New data'},total:1,profiles:[{id:root.id,enabled:true,folder:'/shared/clients',notice:{name:'source.json',reason:'New data'}}]});h.api.shareLoad=async name=>({name});h.api.importPreview=async mode=>h.store.importPreview(input,mode);h.api.importDetails=async(token,key)=>h.store.importDetails(token,key);h.ui.activate();await flush();h.els.get('notes-share-open').events.click();await flush();h.els.get('notes-share-quick-preview').events.click();await flush();assert.equal(h.els.get('notes-transfer-dialog').open,true);assert.equal(h.els.get('notes-transfer-filter').value,'changes');assert.equal(h.els.get('notes-transfer-apply').disabled,false);let entries=h.els.get('notes-transfer-preview-list').children.filter(node=>node.className==='notes-import-entry');assert.equal(entries.length,1);entries[0].open=true;await entries[0].events.toggle();assert.match(entries[0].textContent,/來源值（略過，不套用）/);assert.match(entries[0].textContent,/Remote/);findButton(h.els.get('notes-transfer-counts'),'內容相同 0').events.click();assert.match(h.els.get('notes-transfer-preview-list').textContent,/沒有符合/);h.els.get('notes-transfer-filter').value='all';h.els.get('notes-transfer-filter').events.change();assert.equal(h.els.get('notes-transfer-preview-list').children.filter(node=>node.className==='notes-import-entry').length,2);assert.equal(h.store.get().document.records[1].title,'Local');assert.deepEqual(h.errors,[]);});
test('same source contents show a clear no-difference state and can still be acknowledged',async t=>{const h=setup(t,{settings:{notesImportMode:'update'}}),root=h.store.addTemplate().document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Same',values:{},notes:'',tags:[],fileLinks:[]});const data=M.exportPackage(h.store.get().document,{scope:'all'});h.api.chooseImport=async()=>({name:'test.json'});h.api.importPreview=async mode=>h.store.importPreview(data,mode);h.ui.activate();await flush();h.els.get('notes-import').events.click();h.els.get('notes-import-choose').events.click();await flush();h.els.get('notes-transfer-preview').events.click();await flush();assert.match(h.els.get('notes-transfer-preview-list').textContent,/沒有內容差異/);assert.equal(h.els.get('notes-transfer-apply').disabled,false);findButton(h.els.get('notes-transfer-counts'),'內容相同 1').events.click();assert.match(h.els.get('notes-transfer-preview-list').textContent,/Same/);assert.deepEqual(h.errors,[]);});
test('quick share publishing requires confirmation, respects editing and checks preserve draft input',async t=>{const h=setup(t);let checks=0,published=0;const value={enabled:true,files:[],total:0};h.api.shareStatus=async()=>value;h.api.shareCheck=async()=>{checks++;return value;};h.api.sharePublish=async()=>{published++;return value;};const root=h.store.addTemplate().document.sheets[0];value.profiles=[{id:root.id,enabled:true,folder:'/shared/clients'}];h.ui.activate();await flush();h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='Unsaved';h.els.get('notes-share-quick-check').events.click();await flush();assert.equal(checks,1);assert.equal(h.els.get('notes-record-title').value,'Unsaved');h.els.get('notes-share-quick-publish').events.click();assert.equal(h.els.get('notes-confirm-dialog').open,false);assert.equal(published,0);h.els.get('notes-record-cancel').events.click();h.els.get('notes-share-quick-publish').events.click();assert.equal(published,0);assert.equal(h.els.get('notes-confirm-dialog').open,true);h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(published,1);h.preferences.notesShareQuickActions=false;h.ui.settingsChanged(['notesShareQuickActions']);assert.equal(h.els.get('notes-share-quick').hidden,true);assert.deepEqual(h.errors,[]);});
test('shared package list can hide own publications, retain full source information and filter followed source',async t=>{const h=setup(t),a='12345678-1234-1234-1234-123456789abc',b='12345678-5678-1234-1234-123456789abc',file=id=>({name:'BFS-Workspace-'+id+'-1793614500000-12345678-1234-1234-1234-123456789abc.json'});h.api.shareStatus=async()=>({enabled:true,deviceId:a,followSource:b,files:[file(a),file(b)],total:2});h.ui.activate();await flush();h.els.get('notes-share-open').events.click();await flush();assert.equal(h.els.get('notes-share-files').children.length,1);assert.match(h.els.get('notes-share-files').textContent,/跟隨來源/);assert.match(h.els.get('notes-share-files').textContent,new RegExp(b));h.els.get('notes-share-file-scope').value='all';h.els.get('notes-share-file-scope').events.change();assert.equal(h.els.get('notes-share-files').children.length,2);assert.match(h.els.get('notes-share-files').textContent,/本機發布/);assert.deepEqual(h.errors,[]);});
test('selected master information obeys the context help preference',async t=>{const h=setup(t,{settings:{notesShowContextHelp:false}}),root=h.store.addTemplate().document.sheets[0];h.store.saveRecord({sheetId:root.id,title:'Client',values:{[root.fields[0].id]:'CODE'},notes:'',tags:[],fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Client').events.click();assert.equal(h.els.get('notes-master-info').hidden,true);assert.match(h.els.get('notes-master-info').textContent,/CODE/);assert.deepEqual(h.errors,[]);});

test('sharing scopes save selected roots with children and version inspection opens a safe comparison entry',async t=>{const h=setup(t),first=h.store.addTemplate(),second=h.store.addTemplate('projects');let config={enabled:true,total:1,files:[{name:'source.json'}],publishScope:{mode:'all',masterIds:[]},receiveScope:{mode:'all',masterIds:[]}},patch;h.api.shareStatus=async()=>config;h.api.shareConfigure=async input=>{patch=input;return config={...config,...input};};h.api.shareInspect=async name=>({name,source:'Publisher',version:4,revision:12,scope:{mode:'masters',masterIds:[first.document.sheets[0].id]},records:10,masters:[{name:'客戶',children:4}]});h.ui.activate();await flush();h.els.get('notes-share-open').events.click();await flush();h.els.get('notes-share-publish-scope').value='masters';h.els.get('notes-share-publish-scope').events.change();const checks=descendants(h.els.get('notes-share-publish-masters')).filter(node=>node.tagName==='INPUT');assert.equal(checks.length,2);checks[0].checked=true;checks[0].events.change();h.els.get('notes-share-save-scope').events.click();await flush();assert.equal(patch.publishScope.masterIds[0],first.document.sheets[0].id);assert.equal(patch.receiveScope.mode,'all');findButton(h.els.get('notes-share-files'),'版本資訊').events.click();await flush();assert.equal(h.els.get('notes-share-version').hidden,false);assert.match(h.els.get('notes-share-version-info').textContent,/發布版本：#4/);assert.match(h.els.get('notes-share-version-info').textContent,/資料修訂：r12/);assert.deepEqual(h.errors,[]);});
test('failed second import preview disables the old apply token rather than applying the previous comparison',async t=>{const h=setup(t),root=h.store.addTemplate().document.sheets[0];const input=M.exportPackage(h.store.get().document,{scope:'all'});h.api.chooseImport=async()=>({name:'test.json'});let fail=false;h.api.importPreview=async mode=>{if(fail)throw new Error('範圍已變更');return h.store.importPreview(input,mode);};h.ui.activate();await flush();h.els.get('notes-import').events.click();h.els.get('notes-import-choose').events.click();await flush();h.els.get('notes-transfer-preview').events.click();await flush();assert.equal(h.els.get('notes-transfer-apply').disabled,false);fail=true;h.els.get('notes-transfer-preview').events.click();await flush();assert.equal(h.els.get('notes-transfer-apply').disabled,true);assert.ok(h.errors.some(message=>message.includes('範圍已變更')));});

test('detail tab badges count only live records of the selected master and obey the count preference',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root,contacts]=state.document.sheets,add=(sheet,title,values={})=>h.store.saveRecord({sheetId:sheet.id,title,notes:'',tags:[],values,fileLinks:[]}).result.id,a=add(root,'A'),b=add(root,'B');add(contacts,'Contact A',{[contacts.fields[0].id]:[a]});add(contacts,'Contact B',{[contacts.fields[0].id]:[b]});const removed=add(contacts,'Recycled contact',{[contacts.fields[0].id]:[a]});h.store.trash('record',removed,1,false);h.ui.activate();await flush();findButton(h.els.get('notes-table'),'A').events.click();
 let tabs=h.els.get('notes-detail-tabs').children;assert.equal(tabs[0].children[0].textContent,'聯絡人');assert.equal(tabs[0].children[1].className,'notes-tab-count');assert.equal(tabs[0].children[1].textContent,'1');assert.equal(tabs[0].attrs['aria-label'],'聯絡人，1 筆紀錄');assert.equal(tabs[1].children[1].textContent,'0');assert.equal(tabs[0].attrs['aria-selected'],'true');
 h.preferences.notesShowCounts=false;h.ui.settingsChanged(['notesShowCounts']);tabs=h.els.get('notes-detail-tabs').children;assert.equal(tabs[0].children.length,1);assert.equal(tabs[0].textContent,'聯絡人');assert.deepEqual(h.errors,[]);
});

test('workspace recycle bin lists preserved tags inside padded rows and explains restoring the table first',async t=>{const h=setup(t),state=h.store.addTemplate(),[root,contacts]=state.document.sheets,master=h.store.saveRecord({sheetId:root.id,title:'Archived',notes:'',tags:['Keep this tag'],values:{},fileLinks:[]}).result.id,detail=h.store.saveRecord({sheetId:contacts.id,title:'Person',notes:'',tags:['Contact tag'],values:{[contacts.fields[0].id]:[master]},fileLinks:[]}).result.id;h.store.trash('record',master,1,false);h.store.trash('sheet',contacts.id,contacts.version,false);h.ui.activate();await flush();h.els.get('notes-trash-view').events.click();const list=h.els.get('notes-table').children[0];assert.equal(list.className,'notes-trash-list');assert.match(list.textContent,/沒有獨立的標籤回收筒/);assert.match(list.textContent,/Keep this tag/);assert.match(list.textContent,/請先還原所屬表格/);const rows=list.children.filter(node=>node.className.includes('notes-trash-entry')),person=rows.find(node=>node.textContent.includes('Person'));assert.equal(findButton(person,'還原紀錄').disabled,true);const archived=rows.find(node=>node.textContent.includes('Archived'));findButton(archived,'還原紀錄').events.click();await flush();const restored=h.store.get().document.records.find(record=>record.id===master);assert.equal(restored.deletedAt,null);assert.deepEqual(restored.tags,['Keep this tag']);assert.equal(h.store.get().document.records.find(record=>record.id===detail).tags[0],'Contact tag');assert.deepEqual(h.errors,[]);});

const gridCells=h=>descendants(h.els.get('notes-table')).filter(node=>node.attrs.role==='gridcell');
const keyEvent=(key,extra={})=>({key,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...extra});
test('grid saves changed cells on Tab, wraps to the next row and skips writes for unchanged Enter',async t=>{
 const h=setup(t,{settings:{notesView:'grid',notesSort:'title'}});const result=h.store.saveSheet({name:'Data',fields:[{id:crypto.randomUUID(),label:'Value',type:'text'}]}),sheet=result.document.sheets[0];for(const title of ['Alpha','Beta'])h.store.saveRecord({sheetId:sheet.id,title,values:{},tags:[],notes:'',fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-sort').value='title';h.els.get('notes-sort').events.change();let cells=gridCells(h),recordId=cells[0].dataset.recordId,revision=h.store.get().revision;
 cells[0].events.dblclick();await cells[0].children[0].events.keydown(keyEvent('Enter'));assert.equal(h.store.get().revision,revision);assert.equal(h.document.activeElement.dataset.fieldId,sheet.fields[0].id);
 cells=gridCells(h);cells[1].events.dblclick();cells[1].children[0].value='saved';await cells[1].children[0].events.keydown(keyEvent('Tab'));assert.equal(h.store.get().document.records.find(r=>r.id===recordId).values[sheet.fields[0].id],'saved');assert.equal(h.document.activeElement.dataset.fieldId,'title');assert.notEqual(h.document.activeElement.dataset.recordId,recordId);assert.deepEqual(h.errors,[]);
});
test('grid validation failure keeps one draft; Escape discards it and configurable Enter moves down',async t=>{
 const h=setup(t,{settings:{notesView:'grid',notesGridEnter:'down',notesGridEditNext:true}}),sheet=h.store.saveSheet({name:'Data',fields:[]}).document.sheets[0];for(const title of ['Alpha','Beta'])h.store.saveRecord({sheetId:sheet.id,title,values:{},tags:[],notes:'',fileLinks:[]});h.ui.activate();await flush();let cells=gridCells(h),revision=h.store.get().revision;cells[0].events.dblclick();const input=cells[0].children[0];input.value='';cells[1].events.dblclick();assert.equal(cells[1].children.length,0);assert.equal(h.document.activeElement,input);await input.events.keydown(keyEvent('Tab'));assert.equal(h.store.get().revision,revision);assert.equal(input.disabled,false);assert.equal(input.value,'');assert.equal(h.document.activeElement,input);input.value='Kept';await input.events.keydown(keyEvent('Escape'));assert.equal(h.store.get().revision,revision);cells=gridCells(h);const origin=cells[0].dataset.recordId;cells[0].events.dblclick();await cells[0].children[0].events.keydown(keyEvent('Enter'));assert.notEqual(h.document.activeElement.dataset?.recordId,origin);assert.equal(h.document.activeElement.tagName,'INPUT');
});
test('workspace Delete confirms checked records, ignores inputs and can be disabled',async t=>{
 const h=setup(t),sheet=h.store.saveSheet({name:'Data',fields:[]}).document.sheets[0];h.store.saveRecord({sheetId:sheet.id,title:'Item',values:{},tags:[],notes:'',fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-page').classList.toggle('hidden',false);h.els.get('notes-select-filtered').events.click();h.docEvents.keydown(keyEvent('Delete',{target:{tagName:'INPUT'}}));assert.equal(h.els.get('notes-confirm-dialog').open,false);h.preferences.notesDeleteKey=false;h.docEvents.keydown(keyEvent('Delete'));assert.equal(h.els.get('notes-confirm-dialog').open,false);h.preferences.notesDeleteKey=true;h.docEvents.keydown(keyEvent('Delete'));assert.equal(h.els.get('notes-confirm-dialog').open,true);assert.equal(h.store.get().document.records[0].deletedAt,null);h.els.get('notes-confirm-apply').events.click();await flush();assert.ok(h.store.get().document.records[0].deletedAt);assert.deepEqual(h.errors,[]);
});

test('grid Tab crosses the last cell into the next page and Shift+Tab returns without a write',async t=>{
 const h=setup(t,{settings:{notesView:'grid',notesPageSize:25}}),sheet=h.store.saveSheet({name:'Data',fields:[]}).document.sheets[0];h.store.change(doc=>{for(let i=0;i<26;i++)doc.records.push({id:crypto.randomUUID(),sheetId:sheet.id,title:'Item '+i,notes:'',tags:[],values:{},fileLinks:[],version:1,createdAt:'2026-11-02T00:00:00Z',updatedAt:'2026-11-02T00:00:00Z',deletedAt:null});});h.ui.activate();await flush();const revision=h.store.get().revision,last=gridCells(h).at(-1);last.events.keydown(keyEvent('Tab',{target:last}));assert.equal(h.els.get('notes-page-info').textContent,'2 / 2');const first=gridCells(h)[0];first.events.keydown(keyEvent('Tab',{target:first,shiftKey:true}));assert.equal(h.els.get('notes-page-info').textContent,'1 / 2');assert.equal(h.document.activeElement.dataset.recordId,last.dataset.recordId);assert.equal(h.store.get().revision,revision);assert.deepEqual(h.errors,[]);
});

test('share management selects a master profile and shows its fixed scope and separate folder',async t=>{
 const h=setup(t);h.store.addTemplate();h.store.addTemplate('projects');h.ui.activate();await flush();const roots=M.masterTableTree(h.store.get().document).map(branch=>branch.master),profiles=[{id:'default',name:'原有共用設定'},...roots.map(root=>({id:root.id,name:root.name}))];let current={enabled:false,folder:null,autoPublish:false,intervalMinutes:5,files:[],total:0,busy:false,profileId:'default',profiles};h.api.shareStatus=async()=>current;h.api.shareSelect=async id=>{current={...current,profileId:id,folder:'H:\\Share\\Clients',publishScope:{mode:'masters',masterIds:[id]},receiveScope:{mode:'masters',masterIds:[id]}};return current;};await h.ui.openShare();assert.equal(h.els.get('notes-share-profile').children.length,3);assert.equal(h.els.get('notes-share-scope-config').hidden,false);h.els.get('notes-share-profile').value=roots[0].id;await h.els.get('notes-share-profile').events.change();await flush();assert.equal(h.els.get('notes-share-scope-config').hidden,true);assert.equal(h.els.get('notes-share-folder').textContent,'H:\\Share\\Clients');assert.match(h.els.get('notes-share-profile-hint').textContent,/其他主表不變/);h.api.shareSelect=async()=>{throw new Error('共享作業進行中');};h.els.get('notes-share-profile').value=roots[1].id;await h.els.get('notes-share-profile').events.change();await flush();assert.equal(h.els.get('notes-share-profile').value,roots[0].id);assert.match(h.errors.at(-1),/進行中/);
});

test('workspace sharing shortcuts follow the selected master and detail family, not the management profile',async t=>{
 const h=setup(t);h.store.addTemplate();h.store.addTemplate('projects');const branches=M.masterTableTree(h.store.get().document),roots=branches.map(branch=>branch.master),calls=[],profiles=roots.map((root,index)=>({id:root.id,name:root.name,enabled:true,folder:'/shared/'+index}));const state={enabled:true,files:[],total:0,profileId:roots[1].id,profiles};h.api.shareStatus=async()=>state;h.api.shareCheck=async id=>{calls.push(['check',id]);return state;};h.api.sharePublish=async id=>{calls.push(['publish',id]);return state;};h.api.shareSelect=async id=>{calls.push(['settings',id]);return {...state,profileId:id};};h.ui.activate();await flush();await h.ui.openShare();h.els.get('notes-share-close').events.click();h.els.get('notes-sheets').children.find(node=>node.id==='notes-nav-sheet-'+roots[0].id).events.click();assert.match(h.els.get('notes-share-current-info').textContent,/\/shared\/0/);await h.els.get('notes-share-quick-check').events.click();await flush();assert.deepEqual(calls.at(-1),['check',roots[0].id]);h.els.get('notes-share-quick-publish').events.click();assert.equal(h.els.get('notes-confirm-dialog').open,true);assert.match(h.els.get('notes-confirm-text').textContent,/\/shared\/0/);h.els.get('notes-confirm-apply').events.click();await flush();assert.deepEqual(calls.at(-1),['publish',roots[0].id]);h.els.get('notes-sheets').children.find(node=>node.id==='notes-nav-sheet-'+roots[1].id).events.click();await h.els.get('notes-share-quick-check').events.click();await flush();assert.deepEqual(calls.at(-1),['check',roots[1].id]);await h.els.get('notes-share-current-settings').events.click();await flush();assert.deepEqual(calls.at(-1),['settings',roots[1].id]);assert.deepEqual(h.errors,[]);
});

test('master and detail card widths both honor the configured title mode',async t=>{
 const h=setup(t,{settings:{notesView:'cards',notesCardWidthMode:'title',notesCardMaxWidth:420}}),state=h.store.addTemplate(),root=state.document.sheets[0],detail=state.document.sheets[1],master=h.store.saveRecord({sheetId:root.id,title:'Client',notes:'',tags:[],values:{},fileLinks:[]}).result.id;h.store.saveRecord({sheetId:detail.id,title:'Proposal-Phase 1111111111111111111111111',notes:'',tags:[],values:{[detail.fields[0].id]:[master]},fileLinks:[]});h.ui.activate();await flush();let grid=h.els.get('notes-table').children.find(node=>node.className==='notes-card-grid');assert.equal(grid.dataset.widthMode,'title');assert.match(grid.attrs.style,/420px/);h.els.get('notes-table').children[0].children[0].events.click({});await flush();const tab=descendants(h.els.get('notes-detail-tabs')).find(node=>node.tagName==='BUTTON'&&node.textContent.includes(detail.name));tab.events.click();await flush();grid=h.els.get('notes-table').children.find(node=>node.className==='notes-card-grid');assert.equal(grid.dataset.widthMode,'title');assert.match(grid.attrs.style,/420px/);h.ui.openCardSettings();h.els.get('notes-card-max-width').value='900';h.els.get('notes-card-apply').events.click();assert.match(h.els.get('notes-card-status').textContent,/240–720/);h.els.get('notes-card-max-width').value='500';h.els.get('notes-card-width-mode').value='uniform';h.els.get('notes-card-apply').events.click();assert.equal(h.preferences.notesCardMaxWidth,500);assert.equal(h.preferences.notesCardWidthMode,'uniform');
});

test('detail tools collapse without clearing filters or selection, persist their state, and leave table tabs visible',async t=>{
 const h=setup(t),s=h.store.addTemplate(),[root,contacts]=s.document.sheets,client=h.store.saveRecord({sheetId:root.id,title:'Client',notes:'',tags:[],values:{},fileLinks:[]}).result.id;
 h.store.saveRecord({sheetId:contacts.id,title:'Alice',notes:'',tags:[],values:{[contacts.fields[0].id]:[client]},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Client').events.click();
 const panel=h.els.get('notes-panel-tools');assert.equal(panel.hidden,true);assert.equal(h.els.get('notes-detail-tabs').hidden,false);assert.match(h.els.get('notes-panel-tools-summary').textContent,/聯絡人.*1 筆/);
 setToolbarOpen(h,true);assert.equal(h.preferences.notesDetailToolsExpanded,true);h.els.get('notes-search').value='Alice';h.els.get('notes-search').events.input();h.els.get('notes-select-filtered').events.click();
 setToolbarOpen(h,false);assert.equal(h.preferences.notesDetailToolsExpanded,false);assert.equal(h.els.get('notes-search').value,'Alice');assert.match(h.els.get('notes-panel-tools-summary').textContent,/搜尋：Alice.*已勾選 1 筆/);assert.match(h.els.get('notes-table').textContent,/Alice/);
 h.els.get('notes-master-back').events.click();assert.equal(panel.hidden,false);assert.equal(h.preferences.notesDetailToolsExpanded,false);assert.deepEqual(h.errors,[]);
});

test('direct shared locations stay editable and offer open/show without a favorite; a failed add preserves the draft',async t=>{
 const h=setup(t);h.api.inspectLinks=async paths=>{if(paths.includes('bad'))throw new Error('位置不存在');return paths.map(path=>({path,type:'folder'}));};const sheet=h.store.saveSheet({name:'Documents',fields:[]}).document.sheets[0];h.ui.activate();await flush();h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='Shared';h.els.get('notes-direct-paths').value='bad';h.els.get('notes-direct-add').events.click();await flush();assert.equal(h.els.get('notes-direct-paths').value,'bad');assert.equal(h.els.get('notes-record-title').value,'Shared');
 const share='\\\\Server\\Clients\\Acme';h.els.get('notes-direct-paths').value=share;h.els.get('notes-direct-add').events.click();await flush();assert.match(h.els.get('notes-record-files').textContent,/直接路徑/);h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();const saved=h.store.get().document.records[0];assert.equal(saved.fileLinks[0].path,share);assert.equal(saved.fileLinks[0].favoriteId,null);
 h.els.get('notes-inspect-current').events.click();const actions=[];h.api.openLink=async(...args)=>actions.push(args);
 for(const label of ['Acme',share,'複製路徑']){findButton(h.els.get('notes-detail-body'),label).events.click();await flush();}
 assert.deepEqual(actions,[[saved.id,0,'open'],[saved.id,0,'show'],[saved.id,0,'copy']]);
 findButton(h.els.get('notes-detail-body'),'編輯').events.click();h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();assert.equal(h.store.get().document.records[0].fileLinks[0].path,share);assert.equal(h.errors.length,1);
});

test('master and detail toolbars collapse independently and view modes do not overwrite another group',async t=>{
 const h=setup(t),state=h.store.addTemplate(),[root,detail]=state.document.sheets,master=h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{},fileLinks:[]}).result.id;h.store.saveRecord({sheetId:detail.id,title:'Contact',notes:'',tags:[],values:{[detail.fields[0].id]:[master]},fileLinks:[]});h.ui.activate();await flush();const panel=h.els.get('notes-panel-tools');assert.equal(panel.hidden,false);setToolbarOpen(h,false);assert.equal(h.preferences.notesMasterToolsExpanded,false);h.els.get('notes-view-cards').events.click();assert.equal(h.preferences.notesTableViews[root.id],'cards');assert.equal(h.preferences.notesDetailView,'list');assert.equal(h.els.get('notes-table').dataset.view,'cards');
 findButton(h.els.get('notes-table'),'Acme').events.click();assert.equal(panel.hidden,true);assert.equal(h.els.get('notes-table').dataset.view,'list');setToolbarOpen(h,true);h.els.get('notes-view-grid').events.click();assert.equal(h.preferences.notesTableViews[detail.id],'grid');assert.equal(h.preferences.notesTableViews[root.id],'cards');assert.equal(h.els.get('notes-table').dataset.view,'grid');h.els.get('notes-master-back').events.click();assert.equal(panel.hidden,true);assert.equal(h.els.get('notes-table').dataset.view,'cards');assert.equal(h.preferences.notesDetailToolsExpanded,true);assert.deepEqual(h.errors,[]);
});
test('each master and detail table keeps its own view mode across navigation',async t=>{
 const h=setup(t,{settings:{notesMasterView:'list',notesDetailView:'list'}});
 const {document}=h.store.addTemplate(),[clients,contacts,files]=document.sheets;
 const {document:withProjects}=h.store.addTemplate('projects');
 const projects=M.masterTableTree(withProjects).find(branch=>branch.master.id!==clients.id).master;
 h.store.saveRecord({sheetId:clients.id,title:'Acme',notes:'',tags:[],values:{},fileLinks:[]});
 h.ui.activate();await flush();
 const mode=()=>h.els.get('notes-table').dataset.view;
 await h.ui.openSearchTarget('sheet',clients.id);
 h.els.get('notes-view-cards').events.click();
 findButton(h.els.get('notes-table'),'Acme').events.click();
 assert.equal(mode(),'list');
 h.els.get('notes-view-grid').events.click();
 const selectDetail=name=>h.els.get('notes-detail-tabs').children.find(tab=>tab.textContent.startsWith(name)).events.click();
 selectDetail(files.name);
 assert.equal(mode(),'list');
 h.els.get('notes-view-cards').events.click();
 selectDetail(contacts.name);
 assert.equal(mode(),'grid');
 h.els.get('notes-master-back').events.click();
 assert.equal(mode(),'cards');
 await h.ui.openSearchTarget('sheet',projects.id);
 assert.equal(mode(),'list');
 h.els.get('notes-view-grid').events.click();
 h.els.get('notes-search-scope').value='all';
 h.els.get('notes-search-scope').events.change();
 h.els.get('notes-view-list').events.click();
 await h.ui.openSearchTarget('sheet',clients.id);
 assert.equal(mode(),'cards');
 await h.ui.openSearchTarget('sheet',projects.id);
 assert.equal(mode(),'grid');
 assert.equal(h.preferences.notesTableViews[contacts.id],'grid');
 assert.equal(h.preferences.notesTableViews[files.id],'cards');
 assert.equal(h.preferences.notesMasterView,'list');
 assert.equal(h.preferences.notesDetailView,'list');
 assert.deepEqual(h.errors,[]);
});

test('table status remains available when controls collapse, remembers each table, and handles select and checkbox fields independently',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0],detail=state.document.sheets.find(sheet=>sheet.name==='紀錄'),status=root.fields.find(field=>field.label==='狀態'),done=detail.fields.find(field=>field.type==='checkbox'),add=(sheet,title,values)=>h.store.saveRecord({sheetId:sheet.id,title,notes:'',tags:[],values,fileLinks:[]}).result.id,a=add(root,'Active',{[status.id]:status.options[0]}),b=add(root,'Pending',{[status.id]:status.options[1]});add(detail,'Done',{[detail.fields[0].id]:[a],[done.id]:true});add(detail,'Todo',{[detail.fields[0].id]:[a],[done.id]:false});
 h.ui.activate();await flush();assert.equal(h.els.get('notes-status-filter-wrap').hidden,false);h.els.get('notes-status-filter').value='v:'+status.options[0];h.els.get('notes-status-filter').events.change();assert.match(h.els.get('notes-table').textContent,/Active/);assert.doesNotMatch(h.els.get('notes-table').textContent,/Pending/);setToolbarOpen(h,false);assert.equal(h.els.get('notes-status-filter-wrap').hidden,false);
 findButton(h.els.get('notes-table'),'Active').events.click();h.els.get('notes-detail-tabs').children.find(node=>node.textContent.startsWith('紀錄')).events.click();assert.equal(h.els.get('notes-status-filter-label').textContent,done.label);h.els.get('notes-status-filter').value='false';h.els.get('notes-status-filter').events.change();assert.match(h.els.get('notes-table').textContent,/Todo/);assert.doesNotMatch(h.els.get('notes-table').textContent,/Done/);h.els.get('notes-master-back').events.click();assert.equal(h.els.get('notes-status-filter').value,'v:'+status.options[0]);assert.equal(h.preferences.notesStatusFilters[detail.id].value,'false');
 h.els.get('notes-clear-filters').events.click();assert.equal(h.els.get('notes-status-filter').value,'');assert.match(h.els.get('notes-table').textContent,/Pending/);assert.equal(h.preferences.notesStatusFilters[detail.id].value,'false');assert.deepEqual(h.errors,[]);
});
test('custom status fields can be selected or disabled and mixed search does not inherit a table filter',async t=>{
 const h=setup(t),field={id:crypto.randomUUID(),label:'Custom progress',type:'select',options:['Draft','Approved']},sheet=h.store.saveSheet({name:'Custom',fields:[field]}).document.sheets[0];for(const value of field.options)h.store.saveRecord({sheetId:sheet.id,title:value,notes:'',tags:[],values:{[field.id]:value},fileLinks:[]});h.ui.activate();await flush();assert.equal(h.els.get('notes-status-filter-wrap').hidden,true);h.els.get('notes-status-field').value=field.id;h.els.get('notes-status-field').events.change();assert.equal(h.els.get('notes-status-filter-wrap').hidden,false);h.els.get('notes-status-filter').value='v:Draft';h.els.get('notes-status-filter').events.change();assert.doesNotMatch(h.els.get('notes-table').textContent,/Approved/);h.els.get('notes-search-scope').value='all';h.els.get('notes-search-scope').events.change();assert.equal(h.els.get('notes-status-filter-wrap').hidden,true);assert.match(h.els.get('notes-table').textContent,/Approved/);h.els.get('notes-search-scope').value='sheet';h.els.get('notes-search-scope').events.change();h.els.get('notes-status-field').value='none';h.els.get('notes-status-field').events.change();assert.equal(h.els.get('notes-status-filter-wrap').hidden,true);assert.match(h.els.get('notes-table').textContent,/Approved/);assert.deepEqual(h.errors,[]);
});

test('saved status views restore their table and mode without changing detail settings or leaking checkbox filters',async t=>{
 const h=setup(t),status={id:crypto.randomUUID(),label:'狀態',type:'select',options:['Active','Waiting']},sheet=h.store.saveSheet({name:'Clients',fields:[status]}).document.sheets[0];for(const value of status.options)h.store.saveRecord({sheetId:sheet.id,title:value,notes:'',tags:[],values:{[status.id]:value},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-status-filter').value='v:Active';h.els.get('notes-status-filter').events.change();h.els.get('notes-view-cards').events.click();h.els.get('notes-manage-tools').events.click();h.els.get('notes-tool-name').value='Active clients';h.els.get('notes-tool-save-view').events.click();await flush();const option=h.els.get('notes-saved-views').children.find(node=>node.textContent==='Active clients');assert.ok(option);h.els.get('notes-tools-close').events.click();h.els.get('notes-status-filter').value='v:Waiting';h.els.get('notes-status-filter').events.change();h.els.get('notes-view-list').events.click();h.els.get('notes-saved-views').value=option.value;h.els.get('notes-saved-views').events.change();assert.equal(h.els.get('notes-status-filter').value,'v:Active');assert.equal(h.els.get('notes-table').dataset.view,'cards');assert.equal(h.preferences.notesDetailView,'list');assert.doesNotMatch(h.els.get('notes-table').textContent,/Waiting/);assert.deepEqual(h.errors,[]);
});

test('status filter is a sibling of disclosure so keyboard or selection does not toggle the toolbar',()=>{
 const {documentFromHTML}=require('./helpers/dom'),document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8')),panel=document.getElementById('notes-panel-tools'),filter=document.getElementById('notes-status-filter');assert.equal(panel.contains(filter),false);assert.equal(filter.closest('#notes-panel-controls'),panel.parentElement);assert.equal(panel.contains(document.getElementById('notes-search')),true);assert.equal(document.getElementById('notes-table').closest('#notes-panel-tools'),null);assert.equal(document.querySelectorAll('#notes-status-filter').length,1);
});

test('first workspace entry selects a master with its title and saved status instead of mixing the configured global search scope',async t=>{
 const h=setup(t,{settings:{notesSearchScope:'all',notesView:'cards',notesMasterToolsExpanded:false}}),clients=h.store.addTemplate(),root=clients.document.sheets[0],status=root.fields.find(field=>field.label==='狀態'),projects=h.store.addTemplate('projects'),other=projects.document.sheets.find(sheet=>sheet.name==='專案');
 for(const [sheet,title,values] of [[root,'Shared active',{[status.id]:status.options[0]}],[root,'Shared pending',{[status.id]:status.options[1]}],[other,'Shared project',{}]])h.store.saveRecord({sheetId:sheet.id,title,notes:'',tags:[],values,fileLinks:[]});
 h.preferences.notesStatusFilters[root.id]={fieldId:'auto',forField:status.id,value:'v:'+status.options[0]};h.ui.activate();await flush();
 assert.equal(h.els.get('notes-master-context').hidden,false);assert.equal(h.els.get('notes-master-heading').textContent,'客戶清單');assert.equal(h.els.get('notes-search-scope').value,'sheet');assert.equal(h.els.get('notes-search-context').hidden,true);assert.equal(h.els.get('notes-panel-tools').hidden,true);assert.equal(h.els.get('notes-status-filter').disabled,false);assert.match(h.els.get('notes-table').textContent,/Shared active/);assert.doesNotMatch(h.els.get('notes-table').textContent,/Shared pending|Shared project/);
 h.els.get('notes-search').value='Shared';h.els.get('notes-search').events.input();assert.equal(h.els.get('notes-search-scope').value,'all');assert.equal(h.els.get('notes-search-context').hidden,false);assert.equal(h.els.get('notes-search-heading').textContent,'全域搜尋');assert.equal(h.els.get('notes-master-context').hidden,true);assert.match(h.els.get('notes-table').textContent,/Shared project/);
 h.els.get('notes-search').value='';h.els.get('notes-search').events.input();assert.equal(h.els.get('notes-master-context').hidden,false);assert.equal(h.els.get('notes-master-heading').textContent,'客戶清單');assert.doesNotMatch(h.els.get('notes-table').textContent,/Shared project/);assert.equal(h.preferences.notesSearchScope,'all');assert.deepEqual(h.errors,[]);
});
test('manually selected scopes remain explicit while typing or clearing and reopening the workspace preserves them',async t=>{
 const h=setup(t,{settings:{notesSearchScope:'all'}});h.store.addTemplate();h.ui.activate();await flush();h.els.get('notes-search-scope').value='masters';h.els.get('notes-search-scope').events.change();h.els.get('notes-search').value='Query';h.els.get('notes-search').events.input();assert.equal(h.els.get('notes-search-scope').value,'masters');h.els.get('notes-search').value='';h.els.get('notes-search').events.input();h.ui.activate();assert.equal(h.els.get('notes-search-scope').value,'masters');assert.equal(h.els.get('notes-search-context').hidden,false);assert.equal(h.els.get('notes-search-heading').textContent,'所有主表清單');assert.deepEqual(h.errors,[]);
});
test('startup chooses a root even when imported sheets are stored with a detail first, and handles an empty workspace',async t=>{
 const empty=setup(t,{settings:{notesSearchScope:'all'}});empty.ui.activate();await flush();assert.equal(empty.els.get('notes-master-context').hidden,true);assert.match(empty.els.get('notes-table').textContent,/建立客戶管理範本/);assert.deepEqual(empty.errors,[]);
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];h.store.change(doc=>doc.sheets.reverse());h.ui.activate();await flush();assert.equal(h.els.get('notes-master-context').hidden,false);assert.equal(h.els.get('notes-master-heading').textContent,'客戶清單');assert.equal(h.els.get('notes-new-record').textContent,'＋ 客戶');assert.equal(h.els.get('notes-detail-tabs').hidden,true);assert.deepEqual(h.errors,[]);
});
test('active status has a clear action that preserves the keyword, date, table, mode and other tables filters',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0],status=root.fields.find(field=>field.label==='狀態'),other=crypto.randomUUID();h.preferences.notesStatusFilters[other]={fieldId:'none',forField:'',value:''};for(const [title,value] of [['Acme active',status.options[0]],['Acme pending',status.options[1]]])h.store.saveRecord({sheetId:root.id,title,notes:'',tags:[],values:{[status.id]:value},fileLinks:[]});h.ui.activate();await flush();assert.equal(h.els.get('notes-status-clear').hidden,true);h.els.get('notes-view-cards').events.click();h.els.get('notes-search').value='Acme';h.els.get('notes-search').events.input();h.els.get('notes-status-filter').value='v:'+status.options[0];h.els.get('notes-status-filter').events.change();assert.equal(h.els.get('notes-status-filter-wrap').dataset.active,'true');assert.equal(h.els.get('notes-status-clear').hidden,false);assert.equal(h.els.get('notes-status-clear').disabled,false);assert.equal(h.els.get('notes-status-filter').attrs['aria-label'],'依狀態篩選');assert.doesNotMatch(h.els.get('notes-panel-tools-summary').textContent,/狀態：/);
 h.els.get('notes-status-clear').events.click();assert.equal(h.els.get('notes-status-clear').hidden,true);assert.equal(h.els.get('notes-status-filter-wrap').dataset.active,'false');assert.equal(h.els.get('notes-search').value,'Acme');assert.equal(h.els.get('notes-table').dataset.view,'cards');assert.equal(h.preferences.notesStatusFilters[other].fieldId,'none');assert.match(h.els.get('notes-table').textContent,/Acme pending/);assert.equal(h.document.activeElement,h.els.get('notes-status-filter'));assert.deepEqual(h.errors,[]);
});

test('the shared header contains separate status and disclosure controls and expansion announces the correct region',async t=>{
 const {documentFromHTML}=require('./helpers/dom'),document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8')),toggle=document.getElementById('notes-panel-toggle'),panel=document.getElementById('notes-panel-tools'),filter=document.getElementById('notes-status-filter');
 assert.equal(toggle.tagName,'BUTTON');assert.equal(toggle.type,'button');assert.equal(toggle.getAttribute('aria-controls'),panel.id);assert.equal(panel.getAttribute('aria-labelledby'),toggle.id);assert.equal(toggle.parentElement,filter.closest('.notes-panel-header'));assert.equal(toggle.contains(filter),false);assert.equal(panel.contains(filter),false);assert.equal(panel.contains(document.getElementById('notes-batch-delete')),true);assert.equal(document.getElementById('notes-view-tools').contains(document.querySelector('.notes-content-top')),false);assert.equal(document.getElementById('notes-panel-controls').contains(document.getElementById('notes-table')),false);
 const h=setup(t);h.store.addTemplate();h.ui.activate();await flush();assert.equal(h.els.get('notes-panel-toggle').attrs['aria-expanded'],'true');h.els.get('notes-panel-toggle').events.click();assert.equal(h.els.get('notes-panel-toggle').attrs['aria-expanded'],'false');assert.equal(h.els.get('notes-panel-tools').hidden,true);assert.equal(h.els.get('notes-status-filter-wrap').hidden,false);h.els.get('notes-panel-toggle').events.click();assert.equal(h.els.get('notes-panel-toggle').attrs['aria-expanded'],'true');assert.equal(h.els.get('notes-panel-tools').hidden,false);assert.deepEqual(h.errors,[]);
});

test('changing or clearing status in the shared header leaves toolbar expansion unchanged and retains the chosen rows',async t=>{
 const h=setup(t,{settings:{notesMasterToolsExpanded:false}}),state=h.store.addTemplate(),root=state.document.sheets[0],field=root.fields.find(item=>item.label==='狀態');for(const [index,value] of field.options.entries())h.store.saveRecord({sheetId:root.id,title:'Client '+index,notes:'',tags:[],values:{[field.id]:value},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-status-filter').value='v:'+field.options[0];h.els.get('notes-status-filter').events.change();assert.equal(h.els.get('notes-panel-tools').hidden,true);assert.match(h.els.get('notes-table').textContent,/Client 0/);assert.doesNotMatch(h.els.get('notes-table').textContent,/Client 1/);setToolbarOpen(h,true);h.els.get('notes-status-clear').events.click();assert.equal(h.els.get('notes-panel-tools').hidden,false);assert.match(h.els.get('notes-table').textContent,/Client 1/);assert.equal(h.preferences.notesMasterToolsExpanded,true);assert.deepEqual(h.errors,[]);
});

test('manual import exposes the configured default and only explicit save changes the general default',async t=>{
 const h=setup(t);h.store.addTemplate();h.ui.activate();await flush();h.els.get('notes-import').events.click();assert.equal(h.els.get('notes-import-mode').value,'copy');assert.match(h.els.get('notes-import-default-hint').textContent,/一般資料包.*另存副本/);assert.equal(h.els.get('notes-import-save-default').disabled,true);h.els.get('notes-import-mode').value='skip';h.els.get('notes-import-mode').events.change();assert.equal(h.preferences.notesImportMode,'copy');assert.match(h.els.get('notes-import-default-hint').textContent,/本次使用：合併/);h.els.get('notes-import-save-default').events.click();assert.equal(h.preferences.notesImportMode,'skip');assert.equal(h.preferences.notesSharedImportMode,'merge');assert.equal(h.els.get('notes-import-save-default').disabled,true);h.els.get('notes-transfer-cancel').events.click();h.els.get('notes-import').events.click();assert.equal(h.els.get('notes-import-mode').value,'skip');assert.deepEqual(h.errors,[]);
});
test('choosing a package automatically previews after the busy read finishes without importing or changing defaults',async t=>{
 const h=setup(t);h.store.addTemplate();const packet=M.exportPackage(h.store.get().document,{scope:'all'});let previews=0;h.api.chooseImport=async()=>({name:'network-source.json'});h.api.importPreview=async mode=>{previews++;return h.store.importPreview(packet,mode);};h.ui.activate();await flush();h.els.get('notes-import').events.click();const revision=h.store.get().revision;await h.els.get('notes-import-choose').events.click();await flush();assert.equal(previews,1);assert.equal(h.els.get('notes-transfer-apply').disabled,false);assert.equal(h.store.get().revision,revision);assert.equal(h.preferences.notesImportMode,'copy');assert.deepEqual(h.errors,[]);
});

test('shared preview defaults can be saved separately while an explicit source clone remains a one-time choice',async t=>{
 const h=setup(t);h.store.addTemplate();const packet=M.exportPackage(h.store.get().document,{scope:'all'});h.api.shareStatus=async()=>({enabled:true,folder:'/share',files:[{name:'source.json'}],total:1});h.api.shareLoad=async name=>({name});h.api.importPreview=async mode=>h.store.importPreview(packet,mode);h.ui.activate();await flush();h.els.get('notes-share-open').events.click();await flush();findButton(h.els.get('notes-share-files'),'複製到本機').events.click();await flush();assert.equal(h.els.get('notes-import-mode').value,'clone');assert.match(h.els.get('notes-import-default-hint').textContent,/共享資料包.*預設：共享差異合併.*本次使用：複製來源/);assert.equal(h.preferences.notesSharedImportMode,'merge');h.els.get('notes-import-save-default').events.click();assert.equal(h.preferences.notesSharedImportMode,'clone');assert.equal(h.preferences.notesImportMode,'copy');assert.equal(h.els.get('notes-transfer-apply').disabled,false);assert.deepEqual(h.errors,[]);
});

test('shared conflict UI requires a choice, previews the merged result and writes only on confirmation',async t=>{
 const h=setup(t),sheet=h.store.addTemplate().document.sheets[0];
 h.store.saveRecord({sheetId:sheet.id,title:'Before',notes:'Common',tags:[],values:{},fileLinks:[]});
 const packet=M.exportPackage(h.store.get().document,{scope:'all'});
 const meta={source:crypto.randomUUID(),profileId:'default',sourceRevision:1,sourceVersion:1};
 h.store.importCommit(h.store.importPreview(packet,'merge',meta).token);
 const record=h.store.get().document.records[0];
 h.store.saveRecord({...record,expectedVersion:record.version,notes:'<b>Local</b>'});
 packet.document.records[0].title='Renamed';
 packet.document.records[0].notes='Source';
 const incoming={...meta,sourceRevision:2,sourceVersion:2};
 h.api.shareStatus=async()=>({enabled:true,folder:'/share',files:[{name:'source.json'}],total:1});
 h.api.shareLoad=async name=>({name,supportsMerge:true});
 h.api.importPreview=async(mode,resolution)=>h.store.importPreview(packet,mode,incoming,{reviewConflicts:true,resolution});
 h.api.importCommit=async token=>h.store.importCommit(token);
 h.ui.activate();
 await flush();
 h.els.get('notes-share-open').events.click();
 await flush();
 findButton(h.els.get('notes-share-files'),'比較並匯入').events.click();
 await flush();
 const apply=h.els.get('notes-transfer-apply'),resolve=h.els.get('notes-transfer-resolve');
 const list=h.els.get('notes-transfer-conflict-list');
 assert.match(list.textContent,/Common.*<b>Local<\/b>.*Source/);
 assert.equal(apply.disabled,true);
 assert.equal(resolve.disabled,true);
 const choice=descendants(list).find(node=>node.tagName==='SELECT');
 choice.value='local';
 choice.events.change();
 assert.equal(resolve.disabled,false);
 await resolve.onclick();
 assert.equal(h.els.get('notes-transfer-conflicts').hidden,true);
 assert.equal(apply.disabled,false);
 assert.equal(h.store.get().document.records[0].title,'Before');
 apply.events.click();
 await flush();
 const saved=h.store.get().document.records[0];
 assert.equal(saved.title,'Renamed');
 assert.equal(saved.notes,'<b>Local</b>');
 assert.deepEqual(h.errors,[]);
});

test('Excel toolbar export sends the current table and only matching record IDs',async t=>{
 const h=setup(t),sheet=h.store.saveSheet({name:'紀錄',fields:[]}).document.sheets[0],calls=[];
 const save=title=>h.store.saveRecord({sheetId:sheet.id,title,notes:'',tags:[],values:{},fileLinks:[]}).result.id;
 const match=save('要匯出的紀錄');
 save('其他內容');
 h.api.exportTable=async(...args)=>{calls.push(args);return {canceled:false,count:1};};
 h.ui.activate();
 await flush();
 h.els.get('notes-search').value='要匯出';
 h.els.get('notes-search').events.input();
 const control=h.els.get('notes-export-excel');
 assert.equal(control.disabled,false);
 await control.events.click();
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[[sheet.id,[match],h.store.get().revision]]);
 assert.match(h.els.get('notes-status').textContent,/已匯出 1 筆/);
 h.els.get('notes-search-scope').value='all';
 h.els.get('notes-search-scope').events.change();
 assert.equal(control.disabled,true);
});

test('workspace and record drops stage paths in the link tab without writing until save',async t=>{
 const h=setup(t);h.store.addTemplate();h.ui.activate();await flush();
 const before=h.store.get(),dialog=h.els.get('notes-record-dialog'),input=h.els.get('notes-direct-paths');
 h.ui.dropRecord(['C:\\工作\\文件.pdf','C:\\工作\\資料夾']);
 assert.equal(dialog.open,true);
 assert.equal(h.els.get('notes-form-links').hidden,false);
 assert.equal(input.value,'C:\\工作\\文件.pdf\nC:\\工作\\資料夾');
 assert.equal(h.store.get().revision,before.revision);
 assert.throws(()=>h.ui.dropRecord(['C:\\不應覆寫']),/目前編輯/);
 h.drops.get('notes-record-dialog')(['C:\\工作\\文件.pdf','C:\\另一份']);
 assert.equal(input.value,'C:\\工作\\文件.pdf\nC:\\工作\\資料夾\nC:\\另一份');
 h.els.get('notes-record-title').value='拖放紀錄';
 h.els.get('notes-record-form').requestSubmit();await flush();
 const saved=h.store.get().document.records[0];
 assert.equal(saved.title,'拖放紀錄');
 assert.deepEqual(saved.fileLinks.map(link=>link.path),input.value.split('\n'));
});

test('bulk edit modal blocks navigation and ignores an outdated asynchronous preview',async t=>{
 const h=setup(t),state=h.store.addTemplate(),sheet=state.document.sheets[0];h.store.saveCopies({sheetId:sheet.id,title:'Before',notes:'keep',tags:[],values:{},fileLinks:[]},2);h.ui.activate();await flush();
 h.els.get('notes-select-filtered').events.click();h.els.get('notes-bulk-edit').events.click();assert.equal(h.els.get('notes-bulk-dialog').open,true);assert.equal(h.ui.canLeave(),false);
 let resolve;h.api.bulkPreview=()=>new Promise(done=>resolve=done);const input=h.els.get('notes-bulk-value').children[0];input.value='Outdated';h.els.get('notes-bulk-prepare').events.click();input.value='Current';h.els.get('notes-bulk-value').events.input();resolve({token:'outdated',count:2,rows:[]});await flush();assert.equal(h.els.get('notes-bulk-apply').disabled,true);
 h.api.bulkPreview=async(input,revision)=>h.store.bulkPreview(input,revision);h.api.bulkCommit=async token=>h.store.bulkCommit(token);await h.els.get('notes-bulk-prepare').events.click();assert.equal(h.els.get('notes-bulk-apply').disabled,false);h.els.get('notes-bulk-apply').events.click();await flush();assert.equal(h.els.get('notes-bulk-dialog').open,false);assert.ok(h.store.get().document.records.every(record=>record.title==='Current'&&record.notes==='keep'));assert.equal(h.ui.canLeave(),true);
});

test('record form inserts identical details under different master IDs and bulk editor can include another master',async t=>{
 const h=setup(t,{settings:{notesShowCopyCount:true}}),state=h.store.addTemplate(),root=state.document.sheets[0],detail=state.document.sheets[1],parent=M.parentField(state.document,detail),a=h.store.saveRecord({sheetId:root.id,title:'A',notes:'',tags:[],values:{},fileLinks:[]}).result.id,b=h.store.saveRecord({sheetId:root.id,title:'B',notes:'',tags:[],values:{},fileLinks:[]}).result.id;
 h.store.saveRecord({sheetId:detail.id,title:'Existing',notes:'keep',tags:[],values:{[parent.id]:[a]},fileLinks:[]});h.api.saveRecord=async input=>h.store.saveCopies({...input,fileLinks:[]},input.copies||1);h.api.bulkPreview=async(input,revision)=>h.store.bulkPreview(input,revision);h.api.bulkCommit=async token=>h.store.bulkCommit(token);
 h.ui.activate();await flush();findButton(h.els.get('notes-table'),'A').events.click();h.els.get('notes-new-record').events.click();h.els.get('notes-record-title').value='Cross master';h.els.get('notes-copy-count').value='2';h.els.get('notes-copy-across').checked=true;h.els.get('notes-copy-across').events.change();
 const target=descendants(h.els.get('notes-copy-masters')).find(node=>node.tagName==='LABEL'&&node.textContent==='B'),check=target.children.find(node=>node.tagName==='INPUT');check.checked=true;check.events.change();assert.match(h.els.get('notes-copy-summary').textContent,/2.*2.*4/);h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();assert.equal(h.store.get().document.records.filter(record=>record.title==='Cross master').length,4);
 h.els.get('notes-select-filtered').events.click();h.els.get('notes-bulk-edit').events.click();assert.equal(h.els.get('notes-bulk-targets').hidden,false);const extra=descendants(h.els.get('notes-bulk-records')).find(node=>node.tagName==='LABEL'&&node.textContent.startsWith('B ／')),pick=extra.children.find(node=>node.tagName==='INPUT');pick.checked=true;pick.events.change();h.els.get('notes-bulk-field').value='notes';h.els.get('notes-bulk-field').events.change();h.els.get('notes-bulk-value').children[0].value='Together';await h.els.get('notes-bulk-prepare').events.click();h.els.get('notes-bulk-apply').events.click();await flush();const changed=h.store.get().document.records.filter(record=>record.notes==='Together');assert.equal(new Set(changed.map(record=>record.values[parent.id][0])).size,2);
});

test('sheet editor reviews populated column removal before writing and keeps the parent relation intact',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0],detail=state.document.sheets[1],field={id:crypto.randomUUID(),label:'已完成',type:'checkbox'};h.store.saveSheet({...detail,expectedVersion:detail.version,fields:[...detail.fields,field]});const parent=M.parentField(h.store.get().document,detail),master=h.store.saveRecord({sheetId:root.id,title:'Master',notes:'',tags:[],values:{},fileLinks:[]}).result.id;h.store.saveRecord({sheetId:detail.id,title:'Detail',notes:'',tags:[],values:{[parent.id]:[master],[field.id]:true},fileLinks:[]});h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Master').events.click();h.els.get('notes-edit-sheet').events.click();const row=h.els.get('notes-field-editor').children.find(row=>row.children[0].value==='已完成');findButton(row,'移除').events.click();const revision=h.store.get().revision;h.els.get('notes-sheet-form').events.submit({preventDefault(){}});await flush();assert.equal(h.els.get('notes-sheet-review-dialog').open,true);assert.equal(h.store.get().revision,revision);assert.match(h.els.get('notes-sheet-review-list').textContent,/有效紀錄 1/);h.els.get('notes-sheet-review-confirm').checked=true;h.els.get('notes-sheet-review-confirm').events.change();h.els.get('notes-sheet-review-apply').events.click();await flush();assert.ok(!h.store.get().document.sheets.find(sheet=>sheet.id===detail.id).fields.some(item=>item.id===field.id));assert.ok(h.store.get().document.records.filter(record=>record.sheetId===detail.id).every(record=>record.values[parent.id][0]===master));assert.match(h.els.get('notes-status').textContent,/備份/);
});
test('hidden copy count stays one while cross-master targets remain available',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0],detail=state.document.sheets[1];h.store.saveRecord({sheetId:root.id,title:'Single parent',notes:'',tags:[],values:{},fileLinks:[]});let sent;h.api.saveRecord=async input=>{sent=input;return h.store.saveCopies({...input,fileLinks:[]},input.copies);};h.ui.activate();await flush();findButton(h.els.get('notes-table'),'Single parent').events.click();h.els.get('notes-new-record').events.click();assert.equal(h.els.get('notes-copy-count-field').hidden,true);assert.equal(h.els.get('notes-copy-targets').hidden,false);h.els.get('notes-copy-count').value='20';h.els.get('notes-record-title').value='Only one';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();assert.equal(sent.copies,1);assert.equal(h.store.get().document.records.filter(row=>row.title==='Only one').length,1);
});

test('website field renders open/copy controls and edits as a URL input',async t=>{
 const h=setup(t),saved=h.store.saveSheet({name:'Links',fields:[{id:crypto.randomUUID(),label:'網站',type:'url'}]}),sheet=saved.document.sheets.find(item=>item.id===saved.result.id),field=sheet.fields[0],record=h.store.saveRecord({sheetId:sheet.id,title:'Website',notes:'',tags:[],values:{[field.id]:'https://example.com/help'},fileLinks:[]}).document.records[0],calls=[];
 h.api.openWebsite=async(...args)=>calls.push(args);h.ui.activate();await flush();await h.ui.openSearchTarget('record',record.id);await flush();
 const walk=node=>[node,...node.children.flatMap(walk)],nodes=walk(h.els.get('notes-detail-body')),open=nodes.find(node=>node.tagName==='BUTTON'&&node.textContent==='開啟網站 ↗'),copy=nodes.find(node=>node.tagName==='BUTTON'&&node.textContent==='複製網址');assert.ok(open);assert.ok(copy);open.events.click();await flush();copy.events.click();await flush();assert.deepEqual(calls,[[record.id,field.id],[record.id,field.id,'copy']]);
 nodes.find(node=>node.tagName==='BUTTON'&&node.textContent==='編輯').events.click();assert.ok(walk(h.els.get('notes-record-fields')).some(node=>node.tagName==='INPUT'&&node.type==='url'));assert.deepEqual(h.errors,[]);
});


test('card field ordering survives apply and the color editor leaves names in a dedicated column',async t=>{
 const h=setup(t,{settings:{notesView:'cards'}}),state=h.store.addTemplate(),root=state.document.sheets[0];
 const [code,status,address]=root.fields;
 h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{[code.id]:'A-10',[status.id]:'合作中',[address.id]:'HK'},fileLinks:[]});
 h.ui.activate();await flush();
 h.els.get('notes-card-config').events.click();await flush();
 const settings=h.els.get('notes-card-fields');
 const [codeRow,,addressRow]=settings.children;
 const drag={dataTransfer:{setData(){}},preventDefault(){}};
 addressRow.children[0].events.dragstart(drag);
 codeRow.events.dragover(drag);codeRow.events.drop(drag);
 assert.match(h.els.get('notes-card-preview').textContent,/地址HK客戶代號A-10.*合作中/);
 h.els.get('notes-card-apply').events.click();h.els.get('notes-card-cancel').events.click();
 assert.deepEqual([...h.preferences.notesCardFields[root.id]].slice(0,2),[address.id,code.id]);
 assert.match(h.els.get('notes-table').textContent,/地址HK客戶代號A-10.*合作中/);
 h.els.get('notes-edit-sheet').events.click();
 const editor=h.els.get('notes-field-editor');
 const entry=descendants(editor).find(node=>node.className==='notes-option-color-row');
 assert.equal(entry.children[0].textContent,'合作中');
 assert.equal(entry.children[1].type,'color');
 assert.equal(entry.children[2].textContent,'清除顏色');
 assert.deepEqual(h.errors,[]);
});

test('a master without detail tables opens its record and keeps collapsed tools in the selection header',async t=>{
 const h=setup(t),state=h.store.addTemplate(),root=state.document.sheets[0];
 h.store.change(doc=>{doc.sheets=doc.sheets.filter(sheet=>sheet.id===root.id);});
 h.store.saveRecord({sheetId:root.id,title:'Solo',notes:'完整筆記',tags:[],values:{},fileLinks:[]});
 h.ui.activate();await flush();
 findButton(h.els.get('notes-table'),'Solo').events.click();
 assert.equal(h.els.get('notes-detail').hidden,false);
 assert.match(h.els.get('notes-detail-body').textContent,/完整筆記/);
 assert.equal(h.els.get('notes-detail-tabs').hidden,true);
 setToolbarOpen(h,false);
 const more=h.els.get('notes-compact-more'),actions=h.els.get('notes-compact-actions');
 assert.equal(more.hidden,false);
 assert.equal(more.parentElement,h.els.get('notes-master-more-slot'));
 assert.deepEqual(actions.children,[h.els.get('notes-current-actions'),h.els.get('notes-table-actions'),h.els.get('notes-selection-bar')]);
 setToolbarOpen(h,true);
 assert.equal(more.hidden,true);
 assert.equal(h.els.get('notes-table-actions').parentElement,h.els.get('notes-table-actions-slot'));
 assert.equal(actions.children.length,0);
});

test('favorite tag links are hidden in overview and new entry by default, and an edit leaves existing links intact',async t=>{
 const h=setup(t,{settings:{notesLinkMode:'tags'}});
 const sheet=h.store.saveSheet({name:'Links',fields:[]}).document.sheets[0];
 const saved=h.store.saveRecord({sheetId:sheet.id,title:'Linked',notes:'',tags:[],values:{},fileLinks:[],
  favoriteTagLinks:[{tag:'Keep',authorized:false}]}).document.records[0];
 let submitted;
 h.api.saveRecord=async input=>{submitted=input;return h.store.saveRecord({...input,fileLinks:[]});};
 h.ui.activate();await flush();
 findButton(h.els.get('notes-table'),'Linked').events.click();
 assert.doesNotMatch(h.els.get('notes-detail-body').textContent,/收藏標籤連結/);
 findButton(h.els.get('notes-detail-body'),'編輯').events.click();
 assert.doesNotMatch(h.els.get('notes-record-files').textContent,/Keep/);
 h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();
 assert.equal(Object.hasOwn(submitted,'favoriteTags'),false);
 assert.deepEqual(h.store.get().document.records.find(record=>record.id===saved.id).favoriteTagLinks,saved.favoriteTagLinks);
 h.els.get('notes-new-record').events.click();
 h.els.get('notes-pick-favorites').events.click();await flush();
 assert.equal(h.els.get('notes-link-tag-tab').hidden,true);
 assert.equal(h.els.get('notes-tag-choice').hidden,true);
 assert.equal(h.els.get('notes-path-choice').hidden,false);
});

test('the right-side overview width saves on drag and resets using the same preference',async()=>{
 const {documentFromHTML}=require('./helpers/dom');
 const document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8'));
 const $=id=>document.getElementById(id),window={addEventListener(){}},widths=[],styles={};
 document.documentElement.style.setProperty=(key,value)=>styles[key]=value;
 const handle=$('notes-detail-resizer'),panel=$('notes-detail');
 panel.getBoundingClientRect=()=>({width:400});
 handle.setPointerCapture=()=>{};handle.hasPointerCapture=()=>false;
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/sidebar-resize.js'),'utf8'),{window,document});
 let width=400;
 window.sidebarResize.initNotesDetail({getWidth:()=>width,save:value=>{width=value;widths.push(value);},isBusy:()=>false});
 await handle.dispatch('pointerdown',{button:0,pointerId:1,clientX:700});
 await handle.dispatch('pointermove',{pointerId:1,clientX:630});
 assert.equal(styles['--notes-detail-width'],'470px');
 assert.deepEqual(widths,[]);
 await handle.dispatch('pointerup',{pointerId:1});
 assert.deepEqual(widths,[470]);
 await handle.dispatch('keydown',{key:'ArrowRight'});
 assert.equal(width,460);
 await handle.dispatch('dblclick');
 assert.deepEqual(widths,[470,460,400]);
});

test('card preview supports direct reorder and value placement with per-field settings',async t=>{
 const h=setup(t,{settings:{notesView:'cards'}}),root=h.store.addTemplate().document.sheets[0];
 const [code,status,address]=root.fields;
 h.store.saveRecord({sheetId:root.id,title:'Acme',notes:'',tags:[],values:{[code.id]:'A-10',[status.id]:'合作中',[address.id]:'HK'},fileLinks:[]});
 h.ui.activate();await flush();
 h.els.get('notes-card-config').events.click();await flush();
 const preview=h.els.get('notes-card-preview'),rows=()=>descendants(preview).filter(node=>node.className==='notes-card-field');
 const drag={dataTransfer:{setData(){}},preventDefault(){}};
 rows()[1].children[0].events.dragstart(drag);
 rows()[0].events.drop(drag);
 assert.equal(rows()[0].children[0].textContent,address.label);
 rows()[0].children[1].events.dragstart(drag);
 assert.equal(preview.dataset.placingValue,'true');
 descendants(preview).find(node=>node.tagName==='SPAN'&&node.dataset.position==='below').events.drop(drag);
 assert.equal(preview.dataset.placingValue,'false');
 assert.equal(rows()[0].dataset.position,'below');
 h.els.get('notes-card-apply').events.click();h.els.get('notes-card-cancel').events.click();
 assert.deepEqual([...h.preferences.notesCardFields[root.id]].slice(0,2),[address.id,code.id]);
 assert.equal(h.preferences.notesCardFieldPositions[root.id][address.id],'below');
 const rendered=descendants(h.els.get('notes-table')).filter(node=>node.className==='notes-card-field');
 assert.equal(rendered[0].dataset.position,'below');
 assert.equal(rendered[1].dataset.position,'right');
 assert.equal(require('../src/settings-model').normalize(h.preferences).notesCardFieldPositions[root.id][address.id],'below');
});

test('record file buttons are optional and direct file links stay available',async t=>{
 const h=setup(t),sheet=h.store.saveSheet({name:'Links',fields:[]}).document.sheets[0];
 const saved=h.store.saveRecord({sheetId:sheet.id,title:'Linked',notes:'',tags:[],values:{},
  fileLinks:[{favoriteId:null,path:'/local/folder',label:'Folder',type:'folder'}]}).document.records[0];
 const calls=[];h.api.openLink=async(...args)=>calls.push(args);
 h.ui.activate();await flush();
 findButton(h.els.get('notes-table'),'Linked').events.click();
 const detail=h.els.get('notes-detail-body');
 findButton(detail,'開啟').events.click();await flush();
 findButton(detail,'定位').events.click();await flush();
 h.preferences.notesShowFileLinkButtons=false;h.ui.settingsChanged(['notesShowFileLinkButtons']);
 const labels=descendants(detail).filter(node=>node.tagName==='BUTTON').map(node=>node.textContent);
 assert.equal(labels.includes('開啟'),false);assert.equal(labels.includes('定位'),false);
 findButton(detail,'Folder').events.click();await flush();
 findButton(detail,'/local/folder').events.click();await flush();
 assert.deepEqual(calls,['open','show','open','show'].map(action=>[saved.id,0,action]));
});

test('record overview opens each summary URL and copies importable CSV into another table',async t=>{
 const h=setup(t),makeSheet=name=>{
  const saved=h.store.saveSheet({name,fields:[{id:crypto.randomUUID(),label:'摘要',type:'longtext'}]});
  return saved.document.sheets.find(item=>item.id===saved.result.id);
 };
 const source=makeSheet('CSV source'),target=makeSheet('CSV target');
 const first='https://example.com/path?q=one&v=2',second='https://other.test/help';
 const summary='參考：'+first+'，其次 ('+second+').\n"保留原文", 001';
 const id=h.store.saveRecord({sheetId:source.id,title:'Record, one',notes:'first\nsecond',tags:[],values:{[source.fields[0].id]:summary},fileLinks:[]}).result.id;
 const calls=[];h.api.openWebsite=async(...args)=>calls.push(args);
 h.ui.activate();await flush();await h.ui.openSearchTarget('record',id);
 const overview=h.els.get('notes-detail-body');
 assert.ok(descendants(overview).some(node=>node.tagName==='DD'&&node.textContent===summary));
 for(const url of [first,second]){findButton(overview,url).events.click();await flush();}
 assert.deepEqual(calls,[[id,source.fields[0].id,'open',first],[id,source.fields[0].id,'open',second]]);
 findButton(overview,'複製 CSV').events.click();await flush();
 const csv=h.toasts.find(value=>value.startsWith('標題,'));
 assert.ok(csv);
 await h.ui.openSearchTarget('sheet',target.id);
 h.els.get('notes-tabular-open').events.click();
 h.els.get('notes-table-format').value='csv';
 h.els.get('notes-table-text').value=csv;
 h.els.get('notes-table-read').events.click();
 h.els.get('notes-table-preview-button').events.click();await flush();
 assert.equal(h.els.get('notes-table-apply').disabled,false);
 h.els.get('notes-table-apply').events.click();await flush();
 const imported=h.store.get().document.records.find(record=>record.sheetId===target.id);
 assert.equal(imported.title,'Record, one');assert.equal(imported.notes,'first\nsecond');
 assert.equal(imported.values[target.fields[0].id],summary);
 assert.deepEqual(h.errors,[]);
});

test('long text height is restored per field for other records and ignores layout changes',async t=>{
 let onResize;
 class Observer{constructor(callback){onResize=callback;}observe(){}disconnect(){}}
 const h=setup(t,{ResizeObserver:Observer}),fields=['摘要','備考'].map(label=>({id:crypto.randomUUID(),label,type:'longtext'}));
 const {result}=h.store.saveSheet({name:'Text areas',fields});
 const ids=['First note','Second note'].map(title=>h.store.saveRecord({sheetId:result.id,title,notes:'',tags:[],values:{},fileLinks:[]}).result.id);
 const input=label=>descendants(h.els.get('notes-record-fields')).find(node=>node.attrs['aria-label']===label);
 h.ui.activate();await flush();await h.ui.openSearchTarget('record',ids[0]);
 findButton(h.els.get('notes-detail-body'),'編輯').events.click();
 onResize();
 assert.deepEqual(Object.keys(h.preferences.notesLongTextHeights),[]);
 input('摘要').style.height='250px';onResize();
 await new Promise(resolve=>setTimeout(resolve,180));
 assert.equal(h.preferences.notesLongTextHeights[fields[0].id],250);
 input('摘要').style.height='120px';onResize();
 h.els.get('notes-record-close').events.click();h.els.get('notes-record-dialog').events.close();
 assert.equal(h.preferences.notesLongTextHeights[fields[0].id],120);
 await h.ui.openSearchTarget('record',ids[1]);
 findButton(h.els.get('notes-detail-body'),'編輯').events.click();
 assert.equal(input('摘要').style.height,'120px');assert.equal(input('備考').style.height,undefined);
});

test('record overview copies only the requested text, preserving whitespace and omitting empty fields',async t=>{
 const h=setup(t),fields=[['摘要','longtext'],['空欄','text'],['數量','number']].map(([label,type])=>({id:crypto.randomUUID(),label,type}));
 const {result}=h.store.saveSheet({name:'Copy text',fields}),summary='  first, "quoted"\nhttps://example.test/path\nsecond  ',notes='Line 1\nLine 2';
 const id=h.store.saveRecord({sheetId:result.id,title:'Copy this title',notes,tags:[],values:{[fields[0].id]:summary,[fields[2].id]:12},fileLinks:[]}).result.id;
 h.ui.activate();await flush();await h.ui.openSearchTarget('record',id);
 const copyButtons=()=>descendants(h.els.get('notes-detail-body')).filter(node=>node.className==='notes-text-copy');
 assert.deepEqual(copyButtons().map(node=>node.attrs['aria-label']),['複製摘要','複製筆記']);
 h.preferences.notesShowTitleCopy=true;h.ui.settingsChanged(['notesShowTitleCopy']);
 const buttons=copyButtons();
 assert.deepEqual(buttons.map(node=>node.attrs['aria-label']),['複製標題','複製摘要','複製筆記']);
 for(const [index,value] of ['Copy this title',summary,notes].entries()){
  buttons[index].events.click();await flush();
  assert.equal(h.toasts.at(-2),value);
  assert.equal(h.toasts.at(-1),'已'+buttons[index].title);
 }
 const doc=h.store.get().document;
 for(const fieldId of [fields[1].id,fields[2].id,crypto.randomUUID()]){
  assert.throws(()=>M.clipboardText(doc,{kind:'text',ids:[id],fieldId}),/無效|移除|不可用/);
 }
 assert.deepEqual(h.errors,[]);
});

test('cards place selected status next to the date and omit it when hidden by the card layout',async t=>{
 const h=setup(t,{settings:{notesView:'cards'}}),sheet=h.store.addTemplate().document.sheets[0],[code,status]=sheet.fields;
 h.store.saveRecord({sheetId:sheet.id,title:'Card',notes:'',tags:[],values:{[code.id]:'001',[status.id]:'合作中'},fileLinks:[]});
 h.ui.activate();await flush();
 const card=()=>descendants(h.els.get('notes-table')).find(node=>node.tagName==='ARTICLE');
 const footer=()=>card().children.find(node=>node.className==='notes-card-footer');
 assert.match(footer().textContent,/\d{4}-\d{2}-\d{2}合作中/);
 assert.doesNotMatch(card().children.find(node=>node.className==='notes-card-body').textContent,/合作中/);
 h.preferences.notesCardFields={[sheet.id]:[code.id]};h.ui.settingsChanged(['notesCardFields']);
 assert.doesNotMatch(card().textContent,/合作中/);
});

test('clipboard visibility hides copy actions while retaining open links and duplicate record',async t=>{
 const h=setup(t,{settings:{notesShowTitleCopy:true,notesShowDetailCopy:false}});
 const {result}=h.store.saveSheet({name:'Clipboard controls',fields:[{id:crypto.randomUUID(),label:'網址',type:'url'}]});
 const sheet=h.store.get().document.sheets[0],id=h.store.saveRecord({sheetId:result.id,title:'A record',notes:'A note',tags:[],
  values:{[sheet.fields[0].id]:'https://example.test/'},fileLinks:[{favoriteId:null,path:'/local/folder',label:'Folder',type:'folder'}]}).result.id;
 h.ui.activate();await flush();await h.ui.openSearchTarget('record',id);
 const detail=h.els.get('notes-detail-body');
 findButton(detail,'複製紀錄');findButton(detail,'開啟網站 ↗');findButton(detail,'https://example.test/');
 assert.equal(descendants(detail).filter(node=>node.className==='notes-text-copy').length,0);
 for(const label of ['複製總覽','複製 CSV','複製網址','複製路徑']){
  assert.ok(!descendants(detail).some(node=>node.tagName==='BUTTON'&&node.textContent===label));
 }
});

test('card settings persist custom footer positions and expose overflow without opening the record',async t=>{
 const h=setup(t,{settings:{notesView:'cards'}});
 const root=h.store.saveSheet({name:'Footer layout',fields:[['代號','text'],['狀態','select'],['地址','text'],['負責人','text']]
  .map(([label,type])=>({id:crypto.randomUUID(),label,type,options:type==='select'?['合作中']:[]}))}).document.sheets[0];
 const [code,status,address,owner]=root.fields;
 h.store.saveRecord({sheetId:root.id,title:'Footer card',notes:'',tags:[],
  values:{[code.id]:'A001',[status.id]:'合作中',[address.id]:'Full street address',[owner.id]:'Owner name'},fileLinks:[]});
 h.ui.activate();await flush();
 h.els.get('notes-card-config').events.click();await flush();
 const config=h.els.get('notes-card-fields'),rows=config.children;
 for(const [index,position] of [[0,'footer'],[1,'right'],[2,'footer'],[3,'footer']]){
  const row=rows[index],check=descendants(row).find(node=>node.tagName==='INPUT'),select=descendants(row).find(node=>node.tagName==='SELECT');
  check.checked=true;select.value=position;select.events.change();
 }
 h.els.get('notes-card-apply').events.click();h.els.get('notes-card-cancel').events.click();
 const normalized=require('../src/settings-model').normalize(h.preferences);
 assert.deepEqual(normalized.notesCardFieldPositions[root.id],{[code.id]:'footer',[status.id]:'right',[address.id]:'footer',[owner.id]:'footer'});
 const table=h.els.get('notes-table'),card=descendants(table).find(node=>node.tagName==='ARTICLE');
 assert.match(card.children.find(node=>node.className==='notes-card-body').textContent,/合作中/);
 const footer=card.children.find(node=>node.className==='notes-card-footer');
 assert.match(footer.textContent,/A001.*Full street address/);
 assert.doesNotMatch(footer.textContent,/Owner name|合作中/);
 let stopped=false;
 findButton(footer,'+1').events.click({stopPropagation(){stopped=true;}});
 assert.equal(stopped,true);
 assert.equal(h.els.get('notes-card-footer-dialog').open,true);
 assert.equal(h.els.get('notes-detail').hidden,true);
 assert.match(h.els.get('notes-card-footer-list').textContent,/A001.*Full street address.*Owner name/);
 h.els.get('notes-card-footer-close').events.click();
 assert.equal(h.els.get('notes-card-footer-dialog').open,false);
 assert.deepEqual(h.errors,[]);
});

test('record favorite action lives in the overview header and opens the shared tag picker',async t=>{
 const h=setup(t),state=h.store.addTemplate(),sheet=state.document.sheets[0];
 const record=h.store.saveRecord({sheetId:sheet.id,title:'Header favorite',notes:'',tags:[],values:{},fileLinks:[]}).result;
 h.api.batchBookmarks=async()=>({bookmarks:[]});h.api.setBookmark=async()=>({bookmarks:[]});
 // The picker is shared with the favorites tab; assert the working-area entry supplies the correct target.
 let picked;h.window.workspaceFavoritesUI={editBookmark:async target=>{picked=target;return {views:[],templates:[],pins:[],bookmarks:[{kind:target.kind,id:target.id}]};}};
 h.ui.activate();await flush();h.els.get('notes-master-select').value=record.id;h.els.get('notes-master-select').events.change();h.els.get('notes-master-overview').events.click();
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
 assert.match(html,/<div class="notes-detail-head">\s*<strong>紀錄總覽<\/strong>\s*<button id="notes-bookmark-record"/);
 assert.equal(h.els.get('notes-bookmark-record').hidden,false);
 assert.equal(h.els.get('notes-bookmark-record').attrs['aria-haspopup'],'dialog');
 assert.ok(!descendants(h.els.get('notes-detail-body')).some(item=>item.textContent==='☆ 收藏'));
 h.els.get('notes-bookmark-record').events.click();await flush();
 assert.equal(picked.kind,'record');assert.equal(picked.id,record.id);assert.equal(picked.anchor,h.els.get('notes-bookmark-record'));
 assert.equal(h.els.get('notes-bookmark-record').textContent,'★ 已收藏');assert.deepEqual(h.errors,[]);
});


test('record overview identifies a record included by whole-table tracking',async t=>{
 const h=setup(t),state=h.store.addTemplate(),sheet=state.document.sheets[0];
 const record=h.store.saveRecord({sheetId:sheet.id,title:'Tracked master',notes:'',tags:[],values:{},fileLinks:[]}).result;
 h.window.workspaceBookmarkModel=require('../src/workspace-bookmark-model');h.api.batchBookmarks=async()=>({});h.api.tools=async()=>({views:[],templates:[],pins:[],bookmarks:[{kind:'sheet',id:sheet.id,followRecords:true,tags:[]}]});
 h.ui.activate();await flush();h.els.get('notes-master-select').value=record.id;h.els.get('notes-master-select').events.change();h.els.get('notes-master-overview').events.click();
 assert.equal(h.els.get('notes-bookmark-record').textContent,'★ 整表收藏');assert.deepEqual(h.errors,[]);
});
