'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const M=require('../src/notes-model');
const {NotesStore}=require('../src/notes-store');

function setup(t){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-shared-merge-'));
 const filename=path.join(folder,'workspace.sqlite');
 let store=new NotesStore(filename);
 t.after(()=>{store.close();fs.rmSync(folder,{recursive:true,force:true});});
 const initial=store.addTemplate('clients'),sheet=initial.document.sheets[0];
 const field=sheet.fields.find(item=>item.type==='text');
 const make=title=>store.saveRecord({sheetId:sheet.id,title,notes:'base',tags:[],values:field?{[field.id]:'original'}:{},fileLinks:[]}).result.id;
 const id=make('原始紀錄'),onlyLocal=make('來源省略這筆');
 const published=M.exportPackage(store.get().document,{scope:'all'});
 const meta={source:randomUUID(),profileId:'default',scope:{mode:'all',masterIds:[]},sourceRevision:1,sourceVersion:1};
 const revision=store.get().revision;
 const base=store.importPreview(published,'merge',meta);
 assert.equal(store.importCommit(base.token).revision,revision);
 return {
  get store(){return store;},published,meta,id,onlyLocal,field,
  restart(){store.close();store=new NotesStore(filename);}
 };
}

test('confirmed shared pulls merge different fields and retain records omitted from newer snapshots',t=>{
 const h=setup(t);
 const record=h.store.get().document.records.find(item=>item.id===h.id);
 h.store.saveRecord({...record,expectedVersion:record.version,notes:'本機獨立筆記'});
 h.restart();
 const update=structuredClone(h.published);
 update.document.records=update.document.records.filter(item=>item.id!==h.onlyLocal);
 update.document.records[0].title='來源新標題';
 if(h.field)delete update.document.records[0].values[h.field.id];
 const ctx={...h.meta,sourceRevision:2,sourceVersion:2};
 const result=h.store.importShared(update,h.store.get().revision,ctx);
 const saved=result.document.records.find(item=>item.id===h.id);
 assert.equal(saved.notes,'本機獨立筆記');assert.equal(saved.title,'來源新標題');
 if(h.field)assert.equal(saved.values[h.field.id],undefined);
 assert.ok(result.document.records.some(item=>item.id===h.onlyLocal));
 assert.equal(h.store.history(h.id)[0].operation,'共享差異合併');
 const same=h.store.importPreview(update,'merge',ctx);
 assert.equal(h.store.importCommit(same.token).revision,result.revision);
 assert.throws(()=>h.store.importPreview(h.published,'merge',h.meta),/早於/);
});

test('shared field conflicts never write changes or advance the accepted base',t=>{
 const h=setup(t),record=h.store.get().document.records.find(item=>item.id===h.id);
 h.store.saveRecord({...record,expectedVersion:record.version,title:'本機標題'});
 const update=structuredClone(h.published);
 update.document.records[0].title='來源標題';
 update.document.records[1].notes='另一筆遠端修改';
 const ctx={...h.meta,sourceRevision:2,sourceVersion:2},before=h.store.get();
 assert.throws(()=>h.store.importPreview(update,'merge',ctx),/衝突.*標題/);
 assert.deepEqual(h.store.get(),before);
 update.document.records[0].title='本機標題';
 const result=h.store.importShared(update,before.revision,ctx);
 assert.equal(result.document.records[1].notes,'另一筆遠端修改');
 update.document.records[1].notes='同版本被換內容';
 assert.throws(()=>h.store.importPreview(update,'merge',ctx),/同一發布版本/);
});

test('manual conflict review previews and commits only resolved changes, then tracks the source values',t=>{
 const h=setup(t),record=h.store.get().document.records.find(item=>item.id===h.id);
 h.store.saveRecord({...record,expectedVersion:record.version,notes:'本機筆記'});
 const input=structuredClone(h.published);
 input.document.records[0].title='來源重新命名';
 input.document.records[0].notes='來源筆記';
 const ctx={...h.meta,sourceRevision:2,sourceVersion:2};
 const options={reviewConflicts:true},before=h.store.get();
 const review=h.store.importPreview(input,'merge',ctx,options);
 assert.equal(review.conflicts.length,1);
 const [{id,name,base,local,source,editable}]=review.conflicts;
 assert.deepEqual({name,base,local,source,editable},
  {name:'筆記',base:'base',local:'本機筆記',source:'來源筆記',editable:true});
 assert.throws(()=>h.store.importCommit(review.token),/預覽已失效/);
 assert.throws(()=>h.store.importPreview(input,'merge',ctx,{...options,resolution:{
  token:review.token,choices:[{id:'wrong-field',choice:'source'}]
 }}),/無效/);
 assert.deepEqual(h.store.get(),before);
 const preview=h.store.importPreview(input,'merge',ctx,{...options,resolution:{
  token:review.token,choices:[{id,choice:'local'}]
 }});
 assert.equal(preview.counts.updated,1);
 assert.deepEqual(h.store.get(),before);
 const result=h.store.importCommit(preview.token),saved=result.document.records.find(item=>item.id===h.id);
 assert.ok(fs.existsSync(result.result.backup));
 assert.equal(saved.title,'來源重新命名');
 assert.equal(saved.notes,'本機筆記');

 const next=structuredClone(input);
 next.document.records[0].title='來源再次命名';
 const received=h.store.importShared(next,result.revision,{...ctx,sourceRevision:3,sourceVersion:3});
 assert.equal(received.document.records[0].title,'來源再次命名');
 assert.equal(received.document.records[0].notes,'本機筆記');
});

test('manual first pull requires choices for differing fields and rejects stale resolutions',t=>{
 const h=setup(t),record=h.store.get().document.records.find(item=>item.id===h.id);
 h.store.saveRecord({...record,expectedVersion:record.version,notes:'本機筆記'});
 const input=structuredClone(h.published);
 input.document.records[0].title='來源標題';
 const ctx={...h.meta,source:randomUUID()},options={reviewConflicts:true};
 const review=h.store.importPreview(input,'merge',ctx,options);
 assert.equal(review.conflicts.length,2);
 assert.ok(review.conflicts.every(conflict=>conflict.base==='（沒有共同版本）'));
 const resolve=(token,conflicts,customTitle)=>h.store.importPreview(input,'merge',ctx,{...options,resolution:{
  token,choices:conflicts.map(({id,name})=>name==='標題'?{id,choice:'custom',value:customTitle}:{id,choice:'source'})
 }});
 assert.throws(()=>resolve(review.token,review.conflicts,'   '),/無效/);
 const fresh=h.store.get().document.records[0];
 h.store.saveRecord({...fresh,expectedVersion:fresh.version,notes:'再次編輯'});
 assert.throws(()=>resolve(review.token,review.conflicts,'合併標題'),/預覽已失效/);
 const rereview=h.store.importPreview(input,'merge',ctx,options);
 const preview=resolve(rereview.token,rereview.conflicts,' 合併標題 ');
 const saved=h.store.importCommit(preview.token).document.records[0];
 assert.equal(saved.title,'合併標題');
 assert.equal(saved.notes,'base');
});

function releases(t,h){
 const {perform}=require('../src/notes-share-worker');
 const S=require('../src/notes-sharing-model');
 const folder=path.dirname(h.store.filename);
 const scope=h.meta.scope;
 let previousCommit=null,version=h.meta.sourceVersion;
 return {
  publish(document,{parent=previousCommit}={}){
   version++;
   const published=perform({action:'publish',folder,deviceId:h.meta.source,revision:version,version,scope,
    data:S.shareSnapshot(document,scope),previousCommit:parent});
   previousCommit=published.commit;
   const {data,sharing}=perform({action:'read',folder,name:published.name});
   return {data,sharing,name:published.name,context:{...h.meta,sourceRevision:sharing.revision,sourceVersion:sharing.version}};
  }
 };
}
function pull(store,{data,context}){
 const preview=store.importPreview(data,'merge',context);
 store.importCommit(preview.token);
 return preview;
}

test('published recycle and restore travel across skipped releases and keep record IDs and local-only rows',t=>{
 const h=setup(t),publisher=releases(t,h),source=new NotesStore(path.join(path.dirname(h.store.filename),'publisher.sqlite'));
 t.after(()=>source.close());
 source.importCommit(source.importPreview(h.published,'clone').token,{confirmClone:true});
 const parent=source.get().document.records.find(record=>record.id===h.id);
 const sheet=source.get().document.sheets.find(sheet=>M.parentField(source.get().document,sheet)?.targetSheetId===parent.sheetId);
 const parentField=M.parentField(source.get().document,sheet);
 const child=source.saveRecord({sheetId:sheet.id,title:'聯絡資料',notes:'',tags:[],values:{[parentField.id]:[parent.id]},fileLinks:[]}).result.id;
 const first=publisher.publish(source.get().document);
 assert.equal(first.data.packageVersion,5);
 assert.equal(first.sharing.commit.parentCommitId,null);
 pull(h.store,first);
 const localOnly=h.store.saveRecord({sheetId:parent.sheetId,title:'本機新紀錄',notes:'',tags:[],values:{},fileLinks:[]}).result.id;
 const original=source.get().document.records.find(record=>record.id===parent.id);
 source.saveRecord({...original,title:'主檔已改名',expectedVersion:original.version});
 const renamed=publisher.publish(source.get().document);
 assert.equal(pull(h.store,renamed).counts.updated,1);
 assert.deepEqual(h.store.get().document.records.find(record=>record.id===child).values[parentField.id],[parent.id]);
 source.trash('record',parent.id,source.get().document.records.find(record=>record.id===parent.id).version);
 const deleted=publisher.publish(source.get().document);
 const latest=publisher.publish(source.get().document);
 assert.equal(latest.sharing.commit.parentCommitId,deleted.sharing.commit.id);
 assert.ok(latest.sharing.commit.ancestors.includes(renamed.sharing.commit.id));
 assert.deepEqual(latest.data.tombstones.map(item=>item.id),[parent.id]);
 const preview=h.store.importPreview(latest.data,'merge',latest.context);
 assert.equal(preview.recycled,1);
 assert.ok(preview.records.some(row=>row.key===parent.id&&row.status==='updated'));
 assert.ok(h.store.importDetails(preview.token,parent.id).changes.some(change=>change.label==='回收筒狀態'));
 h.store.importCommit(preview.token);
 assert.equal(pull(h.store,latest).recycled,0);
 const received=h.store.get().document;
 assert.ok(received.records.find(record=>record.id===parent.id).deletedAt);
 assert.deepEqual(received.records.find(record=>record.id===child).values[parentField.id],[parent.id]);
 assert.equal(received.records.find(record=>record.id===localOnly).deletedAt,null);
 source.trash('record',parent.id,source.get().document.records.find(record=>record.id===parent.id).version,true);
 pull(h.store,publisher.publish(source.get().document));
 assert.equal(h.store.get().document.records.find(record=>record.id===parent.id).deletedAt,null);
});

test('a source recycle conflicting with a local edit pauses automatic merge and offers a manual decision',t=>{
 const h=setup(t),publisher=releases(t,h),document=M.clone(h.published.document);
 pull(h.store,publisher.publish(document));
 const local=h.store.get().document.records.find(record=>record.id===h.id);
 h.store.saveRecord({...local,expectedVersion:local.version,notes:'本機未發布的改動'});
 document.records.find(record=>record.id===h.id).deletedAt='2026-11-05T00:00:00.000Z';
 const next=publisher.publish(document);
 assert.throws(()=>h.store.importPreview(next.data,'merge',next.context),/來源已回收，本機有變更/);
 const conflict=h.store.importPreview(next.data,'merge',next.context,{reviewConflicts:true});
 assert.equal(conflict.conflicts.length,1);
 assert.equal(conflict.conflicts[0].name,'回收筒狀態');
 const preview=h.store.importPreview(next.data,'merge',next.context,{reviewConflicts:true,
  resolution:{token:conflict.token,choices:[{id:conflict.conflicts[0].id,choice:'local'}]}});
 assert.equal(preview.recycled,0);
 h.store.importCommit(preview.token);
 assert.equal(pull(h.store,publisher.publish(document)).recycled,0);
 assert.equal(h.store.get().document.records.find(record=>record.id===h.id).notes,'本機未發布的改動');
});

test('shared commits clear values, merge independent column additions and remove source columns by ID',t=>{
 const h=setup(t),publisher=releases(t,h),document=M.clone(h.published.document);
 pull(h.store,publisher.publish(document));
 const sourceSheet=document.sheets[0],dropped=h.field.id,sourceField={...h.field,id:randomUUID(),label:'來源新增'};
 const localField={...h.field,id:randomUUID(),label:'本機新增'};
 h.store.change(doc=>doc.sheets[0].fields.push(localField));
 sourceSheet.fields.push(sourceField);
 const row=document.records.find(record=>record.id===h.id);
 row.values[sourceField.id]='將清空';
 pull(h.store,publisher.publish(document));
 delete row.values[sourceField.id];
 sourceSheet.fields=sourceSheet.fields.filter(field=>field.id!==dropped);
 for(const record of document.records)delete record.values[dropped];
 const preview=pull(h.store,publisher.publish(document));
 assert.equal(preview.counts.updated,2);
 const received=h.store.get().document;
 assert.ok(received.sheets[0].fields.some(field=>field.id===localField.id));
 assert.ok(received.sheets[0].fields.some(field=>field.id===sourceField.id));
 assert.ok(!received.sheets[0].fields.some(field=>field.id===dropped));
 assert.deepEqual(received.records.find(record=>record.id===h.id).values,{});
});

test('shared commit validation rejects tampered snapshots and unrelated release chains',t=>{
 const h=setup(t),publisher=releases(t,h),document=M.clone(h.published.document);
 const first=publisher.publish(document);
 pull(h.store,first);
 const next=publisher.publish(document);
 const tampered=structuredClone(next.data);
 tampered.document.records[0].title='內容被改動';
 assert.throws(()=>h.store.importPreview(tampered,'merge',next.context),/雜湊不符/);
 const fork=publisher.publish(document,{parent:null});
 assert.throws(()=>h.store.importPreview(fork.data,'merge',fork.context),/無法驗證來源接續/);
});

test('automatic receive applies a safe source recycle and records it in history',t=>{
 const h=setup(t),publisher=releases(t,h),document=M.clone(h.published.document);
 pull(h.store,publisher.publish(document));
 const row=document.records.find(record=>record.id===h.id);
 row.deletedAt='2026-11-05T00:00:00.000Z';
 const released=publisher.publish(document);
 const applied=h.store.importShared(released.data,h.store.get().revision,
  {...released.context,sourceCommit:released.sharing.commit.id});
 assert.equal(applied.result.recycled,1);
 assert.equal(applied.document.records.find(record=>record.id===h.id).deletedAt,row.deletedAt);
 assert.equal(h.store.history(h.id)[0].sourceCommit,released.sharing.commit.id);
});

test('removing a source column with receiver edits requires an explicit decision',t=>{
 const h=setup(t),publisher=releases(t,h),document=M.clone(h.published.document),field=h.field.id;
 pull(h.store,publisher.publish(document));
 const local=h.store.get().document.records.find(record=>record.id===h.id);
 h.store.saveRecord({...local,expectedVersion:local.version,values:{[field]:'只在本機修改'}});
 document.sheets[0].fields=document.sheets[0].fields.filter(item=>item.id!==field);
 for(const row of document.records)delete row.values[field];
 const {data,context}=publisher.publish(document);
 const conflict=h.store.importPreview(data,'merge',context,{reviewConflicts:true});
 assert.equal(conflict.conflicts.length,1);
 assert.match(conflict.conflicts[0].name,/移除欄位/);
 const preview=h.store.importPreview(data,'merge',context,{reviewConflicts:true,
  resolution:{token:conflict.token,choices:[{id:conflict.conflicts[0].id,choice:'source'}]}});
 const applied=h.store.importCommit(preview.token);
 assert.ok(!applied.document.sheets[0].fields.some(item=>item.id===field));
 assert.equal(applied.document.records.find(record=>record.id===h.id).values[field],undefined);
});

test('a scoped receiver applies tombstones only inside its selected master family',t=>{
 const h=setup(t),publisher=releases(t,h);
 const {document:withProjects}=h.store.addTemplate('projects');
 const other=M.masterTableTree(withProjects).at(-1).master.id;
 const outside=h.store.saveRecord({sheetId:other,title:'其他主表紀錄',values:{},notes:'',tags:[],fileLinks:[]}).result.id;
 const document=M.clone(h.store.get().document);
 const scope={mode:'masters',masterIds:[document.records.find(record=>record.id===h.id).sheetId]};
 const receive=release=>({...release,context:{...release.context,scope}});
 pull(h.store,receive(publisher.publish(document)));
 for(const id of [h.id,outside])document.records.find(record=>record.id===id).deletedAt='2026-11-05T00:00:00.000Z';
 const release=publisher.publish(document);
 assert.equal(release.data.tombstones.length,2);
 const preview=pull(h.store,receive(release));
 assert.equal(preview.sourceRecycled,1);
 assert.equal(preview.recycled,1);
 assert.equal(h.store.get().document.records.find(record=>record.id===outside).deletedAt,null);
});
