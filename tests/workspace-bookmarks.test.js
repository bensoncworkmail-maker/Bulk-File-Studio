'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {NotesStore}=require('../src/notes-store'),{NotesToolsStore,workspaceBookmarks}=require('../src/notes-tools-store');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-bookmarks-')),store=new NotesStore(path.join(dir,'workspace.sqlite'));
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const [master,detail]=store.addTemplate().document.sheets;
 const add=(sheet,title,values={})=>store.saveRecord({sheetId:sheet.id,title,values,notes:'',tags:[],fileLinks:[]}).result.id;
 const code=master.fields.find(field=>field.type==='text'),parent=add(master,'St John',{[code.id]:'stjohn'}),child=add(detail,'Man',{[detail.fields[0].id]:[parent]});
 const tools=new NotesToolsStore(path.join(dir,'workspace-tools.json')),targets=[{kind:'record',id:child},{kind:'sheet',id:master.id}];
 return {store,tools,targets,parent,child,code,master,detail,doc:()=>store.get().document};
}
test('tagged favorite creation is atomic and master values resolve from current workspace data',t=>{
 const h=fixture(t);h.tools.batchBookmarks(h.doc(),h.targets,'save',['Work']);
 const rows=workspaceBookmarks(h.doc(),h.tools.get()),record=rows.find(item=>item.id===h.child);
 assert.deepEqual(record.masters,[{id:h.parent,title:'St John',values:[h.code.label+'：stjohn']}]);
 assert.deepEqual(record.tags,['Work']);
 h.store.change(doc=>{doc.records.find(item=>item.id===h.parent).title='Renamed';});
 assert.equal(workspaceBookmarks(h.doc(),h.tools.get()).find(item=>item.id===h.child).masters[0].title,'Renamed');
 assert.deepEqual(new NotesToolsStore(h.tools.filename).get(),h.tools.get());
});
test('bulk tags preserve distinct tags and log pins, clear and remove only the requested bookmarks',t=>{
 const h=fixture(t);h.tools.batchBookmarks(h.doc(),h.targets,'save',['Work']);h.tools.setLogPin(h.doc(),h.child,true);
 h.tools.batchBookmarks(h.doc(),h.targets,'addTags',['work','Urgent']);
 assert.ok(h.tools.get().bookmarks.every(item=>item.tags.join(',')==='Work,Urgent'));
 h.tools.batchBookmarks(h.doc(),[h.targets[0]],'clearTags');
 assert.deepEqual(h.tools.get().bookmarks.find(item=>item.id===h.child).tags,[]);
 assert.equal(h.tools.get().bookmarks.find(item=>item.kind==='sheet').tags.length,2);
 h.tools.batchBookmarks(h.doc(),h.targets,'remove');
 const [pinned]=workspaceBookmarks(h.doc(),h.tools.get());assert.equal(pinned.id,h.child);assert.equal(pinned.saved,false);assert.equal(pinned.logPinned,true);
 h.tools.batchBookmarks(h.doc(),[h.targets[0]],'addTags',['Follow']);
 assert.deepEqual(h.tools.get().bookmarks[0].tags,['Follow']);
});
test('invalid targets, tag limits and failed writes never partially update a batch',t=>{
 const h=fixture(t);h.tools.batchBookmarks(h.doc(),h.targets,'save',['Original']);
 const before=h.tools.get(),disk=fs.readFileSync(h.tools.filename,'utf8');
 const stale={kind:'record',id:'00000000-0000-4000-8000-000000000000'};
 assert.throws(()=>h.tools.batchBookmarks(h.doc(),[...h.targets,stale],'addTags',['New']),/已移除/);
 assert.throws(()=>h.tools.batchBookmarks(h.doc(),[h.targets[0],h.targets[0]],'save'),/重複/);
 assert.throws(()=>h.tools.batchBookmarks(h.doc(),h.targets,'addTags',Array.from({length:21},(_,i)=>'Tag'+i)),/20/);
 assert.throws(()=>h.tools.batchBookmarks(h.doc(),[{kind:'file',id:h.child}],'save'),/類型/);
 assert.throws(()=>h.tools.batchBookmarks(h.doc(),h.targets,'deleteFiles'),/操作/);
 assert.deepEqual(h.tools.get(),before);assert.equal(fs.readFileSync(h.tools.filename,'utf8'),disk);
 const mock=t.mock.method(fs,'renameSync',()=>{throw new Error('disk unavailable');});
 assert.throws(()=>h.tools.batchBookmarks(h.doc(),h.targets,'clearTags'),/disk unavailable/);mock.mock.restore();
 assert.deepEqual(h.tools.get(),before);assert.equal(fs.readFileSync(h.tools.filename,'utf8'),disk);
});
