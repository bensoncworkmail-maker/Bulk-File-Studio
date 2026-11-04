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
