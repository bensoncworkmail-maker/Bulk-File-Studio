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
