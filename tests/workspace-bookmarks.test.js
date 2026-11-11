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
 return {add,store,tools,targets,parent,child,code,master,detail,doc:()=>store.get().document};
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


test('following a table derives current records, merges manual favorites and pins, and preserves no duplicate storage',t=>{
 const h=fixture(t),table={kind:'sheet',id:h.detail.id};
 h.tools.batchBookmarks(h.doc(),[table],'save',['Table'],{followRecords:true});h.tools.batchBookmarks(h.doc(),[h.targets[0]],'save',['Manual']);h.tools.setLogPin(h.doc(),h.child,true);
 const next=h.add(h.detail,'New contact',{[h.detail.fields[0].id]:[h.parent]});
 h.store.change(doc=>{doc.records.find(record=>record.id===h.child).title='Renamed contact';});
 const rows=workspaceBookmarks(h.doc(),h.tools.get()),child=rows.find(item=>item.id===h.child);
 assert.equal(rows.filter(item=>item.id===h.child).length,1);assert.equal(child.title,'Renamed contact');assert.equal(child.tracked,true);assert.equal(child.manual,true);assert.equal(child.logPinned,true);assert.deepEqual(child.tags,['Manual','Table']);assert.ok(rows.some(item=>item.id===next&&!item.manual));
 assert.equal(h.tools.get().bookmarks.length,2);assert.equal(rows.find(item=>item.id===h.detail.id).followedCount,2);
 const plain=workspaceBookmarks(h.doc(),h.tools.get(),{inheritTags:false});assert.deepEqual(plain.find(item=>item.id===next).tags,[]);assert.deepEqual(plain.find(item=>item.id===h.child).tags,['Manual']);
 assert.deepEqual(new NotesToolsStore(h.tools.filename).get(),h.tools.get());
});
test('table-followed rows disappear on recycle or reassignment and return on restore',t=>{
 const h=fixture(t);h.tools.batchBookmarks(h.doc(),[{kind:'sheet',id:h.detail.id}],'save',[],{followRecords:true});
 let child=h.doc().records.find(item=>item.id===h.child);h.store.trash('record',child.id,child.version);assert.ok(!workspaceBookmarks(h.doc(),h.tools.get()).some(item=>item.id===child.id));
 child=h.doc().records.find(item=>item.id===h.child);h.store.trash('record',child.id,child.version,true);assert.ok(workspaceBookmarks(h.doc(),h.tools.get()).some(item=>item.id===child.id));
 const doc=h.doc(),record=doc.records.find(item=>item.id===h.child);record.sheetId=h.master.id;record.values={};assert.ok(!workspaceBookmarks(doc,h.tools.get()).some(item=>item.id===child.id));
 const sheet=h.doc().sheets.find(item=>item.id===h.detail.id);h.store.trash('sheet',sheet.id,sheet.version);assert.ok(!workspaceBookmarks(h.doc(),h.tools.get()).some(item=>item.id===child.id));
});
test('removing a followed record excludes it until explicitly restored to the table collection',t=>{
 const h=fixture(t),table={kind:'sheet',id:h.detail.id};h.tools.batchBookmarks(h.doc(),[table],'save',['Table'],{followRecords:true});
 h.tools.batchBookmarks(h.doc(),[h.targets[0]],'remove');assert.ok(!workspaceBookmarks(h.doc(),h.tools.get()).some(item=>item.id===h.child));assert.deepEqual(h.tools.get().bookmarks[0].excludedRecordIds,[h.child]);
 const next=h.add(h.detail,'Added later',{[h.detail.fields[0].id]:[h.parent]});assert.ok(workspaceBookmarks(h.doc(),h.tools.get()).some(item=>item.id===next));
 h.tools.batchBookmarks(h.doc(),[table],'save',['Table'],{followRecords:true,resetExclusions:true});assert.ok(workspaceBookmarks(h.doc(),h.tools.get()).some(item=>item.id===h.child));
 h.tools.batchBookmarks(h.doc(),[h.targets[0]],'save',['Manual']);h.tools.batchBookmarks(h.doc(),[table],'save',['Table'],{followRecords:false});
 const rows=workspaceBookmarks(h.doc(),h.tools.get());assert.ok(rows.some(item=>item.id===h.child&&item.manual));assert.ok(!rows.some(item=>item.id===next));
 h.tools.batchBookmarks(h.doc(),[table],'remove');assert.ok(workspaceBookmarks(h.doc(),h.tools.get()).some(item=>item.id===h.child));
});
test('large table collections do not consume the manual favorite limit and support bulk exclusions atomically',t=>{
 const h=fixture(t),table={kind:'sheet',id:h.detail.id};h.tools.batchBookmarks(h.doc(),[table],'save',[],{followRecords:true});
 const doc=h.doc(),base=doc.records.find(item=>item.id===h.child),crypto=require('node:crypto');for(let i=0;i<510;i++)doc.records.push({...base,id:crypto.randomUUID(),title:'Contact '+i});
 const rows=workspaceBookmarks(doc,h.tools.get()).filter(item=>item.kind==='record');assert.equal(rows.length,511);assert.equal(h.tools.get().bookmarks.length,1);
 const before=h.tools.get(),mock=t.mock.method(fs,'renameSync',()=>{throw Error('disk unavailable');});assert.throws(()=>h.tools.batchBookmarks(doc,rows.map(({kind,id})=>({kind,id})),'remove'),/disk unavailable/);mock.mock.restore();assert.deepEqual(h.tools.get(),before);
 h.tools.batchBookmarks(doc,rows.map(({kind,id})=>({kind,id})),'remove');assert.equal(workspaceBookmarks(doc,h.tools.get()).filter(item=>item.kind==='record').length,0);assert.equal(h.tools.get().bookmarks[0].excludedRecordIds.length,511);
 assert.throws(()=>h.tools.batchBookmarks(doc,[h.targets[0]],'save',[],{followRecords:true}),/只適用表格/);
});


test('recycling a record covered by whole-table tracking hides its combined manual row and restore brings it back once',t=>{
 const h=fixture(t);h.tools.batchBookmarks(h.doc(),[h.targets[0]],'save',['Manual']);h.tools.batchBookmarks(h.doc(),[{kind:'sheet',id:h.detail.id}],'save',[],{followRecords:true});
 let record=h.doc().records.find(item=>item.id===h.child);h.store.trash('record',record.id,record.version);assert.equal(workspaceBookmarks(h.doc(),h.tools.get()).filter(item=>item.id===h.child).length,0);
 record=h.doc().records.find(item=>item.id===h.child);h.store.trash('record',record.id,record.version,true);assert.equal(workspaceBookmarks(h.doc(),h.tools.get()).filter(item=>item.id===h.child).length,1);assert.ok(h.tools.get().bookmarks.some(item=>item.id===h.child));
});


test('workspace tag management merges owners atomically and preserves inherited records and sync exclusions',t=>{
 const h=fixture(t);h.tools.batchBookmarks(h.doc(),h.targets,'save',['Old','Existing']);h.tools.batchBookmarks(h.doc(),[h.targets[1]],'save',['Old','Existing'],{followRecords:true});
 h.tools.change(data=>{data.bookmarks.find(item=>item.kind==='sheet').excludedRecordIds=[h.parent];});h.tools.setLogPin(h.doc(),h.child,true);const beforeDoc=h.doc(),rules=h.tools.get().bookmarks.find(item=>item.kind==='sheet');
 assert.deepEqual(h.tools.manageBookmarkTag('old','EXISTING',2),{updated:2});assert.ok(h.tools.get().bookmarks.every(item=>item.tags.length===1&&item.tags[0].toLowerCase()==='existing'));
 assert.equal(h.tools.get().bookmarks.find(item=>item.kind==='sheet').followRecords,true);assert.deepEqual(h.tools.get().bookmarks.find(item=>item.kind==='sheet').excludedRecordIds,rules.excludedRecordIds);assert.deepEqual(h.doc(),beforeDoc);assert.deepEqual(h.tools.get().logPins,[h.child]);
 const before=h.tools.get(),disk=fs.readFileSync(h.tools.filename,'utf8');assert.throws(()=>h.tools.manageBookmarkTag('existing',null,1),/已變更/);assert.throws(()=>h.tools.manageBookmarkTag('existing',' ',2),/無效/);assert.throws(()=>h.tools.manageBookmarkTag('existing',null,0),/數量/);
 const mock=t.mock.method(fs,'renameSync',()=>{throw Error('disk full');});assert.throws(()=>h.tools.manageBookmarkTag('existing',null,2),/disk full/);mock.mock.restore();assert.deepEqual(h.tools.get(),before);assert.equal(fs.readFileSync(h.tools.filename,'utf8'),disk);
 h.tools.manageBookmarkTag('existing',null,2);assert.equal(h.tools.get().bookmarks.length,2);assert.ok(h.tools.get().bookmarks.every(item=>!item.tags.length));assert.deepEqual(new NotesToolsStore(h.tools.filename).get(),h.tools.get());
});
