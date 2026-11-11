'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom'),M=require('../src/notes-model'),{NotesStore}=require('../src/notes-store'),{NotesToolsStore,workspaceBookmarks}=require('../src/notes-tools-store');
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-favorite-ui-')),store=new NotesStore(path.join(dir,'workspace.sqlite')),tools=new NotesToolsStore(path.join(dir,'tools.json'));
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const [master,detail]=store.addTemplate().document.sheets,code=master.fields.find(field=>field.type==='text');
 const add=(sheet,title,values={},notes='')=>store.saveRecord({sheetId:sheet.id,title,values,notes,tags:[],fileLinks:[]}).result.id;
 const parent=add(master,'St John',{[code.id]:'stjohn'}),child=add(detail,'Man',{[detail.fields[0].id]:[parent]},'<script>literal note</script>');
 const targets=[{kind:'record',id:child},{kind:'sheet',id:detail.id}];tools.batchBookmarks(store.get().document,targets,'save',['Work']);tools.setLogPin(store.get().document,child,true);
 const document=documentFromHTML(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8')),errors=[],visits=[],calls=[],changes=[],toasts=[];
 document.getElementById('favorites-page').classList.remove('hidden');
 const proto=Object.getPrototypeOf(document.createElement('input'));if(!proto.favoriteChecked){const match=proto.matches;proto.matches=function(selector){return (!selector.includes(':checked')||this.checked)&&match.call(this,selector.replace(/:checked/g,''));};proto.favoriteChecked=true;}
 const settings=require('../src/settings-model').normalize({favoriteStartKind:'workspace'});
 const api={bookmarks:async()=>workspaceBookmarks(store.get().document,tools.get()),get:async()=>store.get(),favorites:async()=>({items:[]}),onChanged:fn=>changes.push(fn),onToolsChanged(){},batchBookmarks:async(...args)=>{calls.push(args);tools.batchBookmarks(store.get().document,...args);return tools.get();},copy:async input=>calls.push(input)};
 const window={workspaceAPI:api,notesModel:M,webLinkModel:require('../src/web-link-model'),settingsUI:{get:()=>settings},notesUI:{openSearchTarget:async(...args)=>visits.push(args)},sidebarResize:{initFavoritesWorkspace(){}},addEventListener(){},innerWidth:1200,innerHeight:900};
 for(const name of ['workspace-favorite-detail.js','workspace-favorites.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src',name),'utf8'),{window,document},{filename:name});
 window.workspaceFavoritesUI.init({isBusy:()=>false,showFailure:(title,error)=>errors.push(error.message),showToast:text=>toasts.push(text)});window.workspaceFavoritesUI.activate();
 return {settings,window,document,api,store,tools,master,detail,parent,child,targets,errors,visits,calls,changes,toasts,$:id=>document.getElementById(id)};
}
const find=(parent,label)=>{const control=parent.querySelectorAll('button').find(node=>node.textContent===label);assert.ok(control,'Missing button '+label);return control;};
test('favorite titles preview values locally, with a separate workspace action and close control',async t=>{
 const h=fixture(t);await flush();await find(h.$('workspace-favorite-list'),'Man').dispatch('click');await flush();
 assert.equal(h.$('workspace-favorite-detail').hidden,false);assert.match(h.$('workspace-favorite-detail-body').textContent,/St John/);assert.match(h.$('workspace-favorite-detail-body').textContent,/<script>literal note<\/script>/);
 assert.equal(h.visits.length,0);
 await find(h.$('workspace-favorite-detail-body'),'在工作區開啟').dispatch('click');assert.deepEqual(h.visits,[['record',h.child]]);
 await h.$('workspace-favorite-detail-close').dispatch('click');assert.equal(h.$('workspace-favorite-detail').hidden,true);assert.equal(h.document.activeElement.dataset.target,'record:'+h.child);assert.deepEqual(h.errors,[]);
});
test('quick removal calls the bookmark action directly and retains independent log pins',async t=>{
 const h=fixture(t);await flush();await find(h.$('workspace-favorite-list'),'Man').dispatch('click');await flush();
 const row=h.$('workspace-favorite-list').children.find(row=>row.textContent.includes('Man'));
 await find(row,'移除收藏').dispatch('click');await flush();
 assert.equal(h.$('workspace-favorite-tag-dialog').open,false);assert.equal(h.$('workspace-favorite-detail').hidden,true);
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),[[{kind:'record',id:h.child}],'remove',[]]);
 const remaining=workspaceBookmarks(h.store.get().document,h.tools.get()).find(item=>item.id===h.child);assert.equal(remaining.saved,false);assert.equal(remaining.logPinned,true);
 const pinnedRow=h.$('workspace-favorite-list').children.find(row=>row.textContent.includes('Man'));
 assert.match(pinnedRow.textContent,/僅釘選/);assert.ok(!pinnedRow.querySelectorAll('button').some(button=>button.textContent==='移除收藏'));
 assert.equal(h.toasts.at(-1),'已移除收藏；查看紀錄釘選仍保留');
});
test('failed quick removal preserves the favorite and open preview',async t=>{
 const h=fixture(t);await flush();await find(h.$('workspace-favorite-list'),'Man').dispatch('click');await flush();
 h.api.batchBookmarks=async()=>{throw Error('disk full');};
 await find(h.$('workspace-favorite-detail-body'),'移除收藏').dispatch('click');await flush();
 assert.equal(h.tools.get().bookmarks.length,2);assert.equal(h.$('workspace-favorite-detail').hidden,false);assert.match(h.$('workspace-favorite-detail-body').textContent,/Man/);assert.deepEqual(h.errors,['disk full']);
});
test('table favorites show a bounded record preview and support inspecting records and returning',async t=>{
 const h=fixture(t);await flush();await find(h.$('workspace-favorite-list'),h.detail.name).dispatch('click');await flush();
 const body=h.$('workspace-favorite-detail-body');assert.match(body.textContent,/表格欄位/);assert.match(body.textContent,/紀錄預覽/);assert.match(body.textContent,/1 筆紀錄/);
 const record=body.querySelectorAll('.notes-related')[0];await record.dispatch('click');await flush();assert.match(body.textContent,/<script>literal note<\/script>/);
 await find(body,'返回表格').dispatch('click');await flush();assert.match(body.textContent,/紀錄預覽/);assert.deepEqual(h.errors,[]);
});
test('stale preview responses cannot replace the selected item or reopen a closed panel',async t=>{
 const h=fixture(t);await flush();const deferred=[];h.api.get=()=>new Promise(resolve=>deferred.push(resolve));
 await find(h.$('workspace-favorite-list'),'Man').dispatch('click');await flush();await find(h.$('workspace-favorite-list'),h.detail.name).dispatch('click');await flush();
 deferred[1](h.store.get());await flush();deferred[0](h.store.get());await flush();assert.match(h.$('workspace-favorite-detail-body').textContent,/紀錄預覽/);
 await find(h.$('workspace-favorite-list'),'Man').dispatch('click');await flush();await h.$('workspace-favorite-detail-close').dispatch('click');deferred[2](h.store.get());await flush();assert.equal(h.$('workspace-favorite-detail').hidden,true);
});
test('source tabs control distinct panels and favorite state filtering stays separate from tags',async t=>{
 const h=fixture(t);await flush();h.tools.batchBookmarks(h.store.get().document,[h.targets[0]],'remove');await h.changes[0]();await flush();
 h.$('workspace-favorite-state').value='pinned';await h.$('workspace-favorite-state').dispatch('change');assert.equal(h.$('workspace-favorite-list').children.length,1);assert.match(h.$('workspace-favorite-list').textContent,/Man/);
 await h.$('favorite-kind-files').dispatch('click');assert.equal(h.$('favorite-files-layout').hidden,false);assert.equal(h.$('workspace-favorites-panel').hidden,true);
 await h.$('favorite-kind-files').dispatch('keydown',{key:'ArrowRight'});await flush();assert.equal(h.$('workspace-favorites-panel').hidden,false);assert.equal(h.$('favorite-kind-workspace').getAttribute('aria-selected'),'true');assert.equal(h.$('favorite-files-layout').hidden,true);
});


test('favorite detail module loads after its workspace model',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
 assert.ok(html.indexOf('src="notes-model.js"')<html.indexOf('src="workspace-favorite-detail.js"'));
});


test('returning to workspace favorites reloads fields changed while away',async t=>{
 const h=fixture(t);await flush();await find(h.$('workspace-favorite-list'),'Man').dispatch('click');await flush();
 await h.$('favorite-kind-files').dispatch('click');
 h.store.change(doc=>{doc.records.find(item=>item.id===h.child).notes='Updated while away';});
 await h.$('favorite-kind-workspace').dispatch('click');await flush();
 assert.match(h.$('workspace-favorite-detail-body').textContent,/Updated while away/);
});

test('clicking a favorite row opens details while checkboxes, action buttons and text selection remain independent',async t=>{
 const h=fixture(t);await flush();let row=h.$('workspace-favorite-list').children.find(row=>row.textContent.includes('Man'));
 await row.dispatch('click',{target:row.querySelector('small'),button:0});await flush();assert.equal(h.$('workspace-favorite-detail').hidden,false);
 await h.$('workspace-favorite-detail-close').dispatch('click');row=h.$('workspace-favorite-list').children.find(row=>row.textContent.includes('Man'));
 for(const target of [row.querySelector('input'),find(row,'編輯標籤')]){await row.dispatch('click',{target});await flush();assert.equal(h.$('workspace-favorite-detail').hidden,true);}
 h.window.getSelection=()=>({toString:()=> 'selected text'});await row.dispatch('click',{target:row.querySelector('small')});await flush();assert.equal(h.$('workspace-favorite-detail').hidden,true);
 assert.equal(h.visits.length,0);
});


test('table bookmark picker honors the default follow option and saves it with tags',async t=>{
 const h=fixture(t);await flush();h.settings.favoriteTableDefaultFollow=true;
 const pending=h.window.workspaceFavoritesUI.editBookmark({kind:'sheet',id:h.master.id,title:h.master.name});await flush();
 assert.equal(h.$('workspace-favorite-follow-wrap').hidden,false);assert.equal(h.$('workspace-favorite-follow-records').checked,true);
 await h.$('workspace-favorite-tag-form').dispatch('submit');await flush();await pending;
 const rule=h.tools.get().bookmarks.find(item=>item.id===h.master.id);assert.equal(rule.followRecords,true);assert.ok(h.$('workspace-favorite-list').textContent.includes('St John'));assert.deepEqual(h.errors,[]);
});
test('table-generated rows respond immediately to visibility and inherited-tag settings and can be excluded',async t=>{
 const h=fixture(t);await flush();h.tools.batchBookmarks(h.store.get().document,[{kind:'sheet',id:h.detail.id}],'save',['TableTag'],{followRecords:true});
 const id=h.store.saveRecord({sheetId:h.detail.id,title:'Generated',notes:'',tags:[],values:{[h.detail.fields[0].id]:[h.parent]},fileLinks:[]}).result.id;
 h.changes[0]();await flush();let row=h.$('workspace-favorite-list').children.find(row=>row.textContent.includes('Generated'));assert.ok(row);assert.match(row.textContent,/TableTag/);
 h.settings.favoriteTableInheritTags=false;h.window.workspaceFavoritesUI.render();row=h.$('workspace-favorite-list').children.find(row=>row.textContent.includes('Generated'));assert.ok(!row.textContent.includes('TableTag'));
 h.settings.favoriteShowTableRecords=false;h.window.workspaceFavoritesUI.render();assert.ok(!h.$('workspace-favorite-list').textContent.includes('Generated'));
 h.settings.favoriteShowTableRecords=true;h.window.workspaceFavoritesUI.render();row=h.$('workspace-favorite-list').children.find(row=>row.textContent.includes('Generated'));await find(row,'移除收藏').dispatch('click');await flush();assert.ok(!h.$('workspace-favorite-list').textContent.includes('Generated'));assert.ok(h.tools.get().bookmarks.find(item=>item.id===h.detail.id).excludedRecordIds.includes(id));
});
test('large automatic collections initially render 200 rows and reveal more on demand',async t=>{
 const h=fixture(t);await flush();h.tools.batchBookmarks(h.store.get().document,[{kind:'sheet',id:h.detail.id}],'save',[],{followRecords:true});
 h.store.change(doc=>{const base=doc.records.find(item=>item.id===h.child);for(let i=0;i<210;i++)doc.records.push({...base,id:require('node:crypto').randomUUID(),title:'Extra '+i});});h.changes[0]();await flush();
 assert.equal(h.$('workspace-favorite-list').querySelectorAll('article').length,200);
 const more=h.$('workspace-favorite-list').querySelectorAll('button').find(button=>button.textContent.startsWith('顯示更多'));assert.ok(more);await more.dispatch('click');assert.equal(h.$('workspace-favorite-list').querySelectorAll('article').length,212);
});


test('favorite search retains all parent fields, long values and additional parents while summaries stay bounded',async t=>{
 const h=fixture(t);await flush();
 h.store.change(doc=>{
  const master=doc.sheets.find(sheet=>sheet.id===h.master.id),parent=doc.records.find(item=>item.id===h.parent),child=doc.records.find(item=>item.id===h.child);
  const code=master.fields.find(field=>field.type==='text');parent.values[code.id]='x'.repeat(220)+'long-value-match';
  for(let i=0;i<3;i++){const id=require('node:crypto').randomUUID();master.fields.push({id,label:'Extra '+i,type:'text'});parent.values[id]=i===2?'fourth-field-match':'Short '+i;}
  for(let i=1;i<=5;i++){const id=require('node:crypto').randomUUID();doc.records.push({...parent,id,title:i===5?'SixthParentMatch':'Parent '+i});child.values[h.detail.fields[0].id].push(id);}
 });
 h.changes[0]();await flush();
 const row=h.$('workspace-favorite-list').children.find(row=>row.textContent.includes('Man'));
 assert.equal(row.querySelectorAll('.workspace-favorite-master').length,5);
 assert.ok(row.querySelectorAll('.workspace-favorite-master-values').every(node=>node.textContent.length<=606));
 assert.ok(!row.textContent.includes('fourth-field-match'));assert.ok(!row.textContent.includes('long-value-match'));assert.ok(!row.textContent.includes('SixthParentMatch'));
 for(const query of ['fourth-field-match','long-value-match','SixthParentMatch']){
  h.$('workspace-favorite-search').value=query;await h.$('workspace-favorite-search').dispatch('input');
  assert.equal(h.$('workspace-favorite-list').querySelectorAll('article').length,1,query);assert.match(h.$('workspace-favorite-list').textContent,/Man/);
 }
 assert.deepEqual(h.errors,[]);
});
