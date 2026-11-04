'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {withIntranetPaths}=require('../src/intranet-path');
const {viewData,configuration}=require('../src/tool-views-model');
const notes=require('../src/notes-model');
const quick=require('../src/quick-actions-model');

test('UNC policy blocks public addresses and WebDAV before filesystem work',async()=>{
 let reads=0;
 const read=()=>++reads;
 assert.equal(withIntranetPaths(['\\\\10.2.3.4\\Share\\manual.pdf'],read),1);
 for(const path of ['\\\\8.8.8.8\\Share\\manual.pdf','\\\\?\\UNC\\8.8.8.8\\Share\\manual.pdf',
  '\\\\nas@SSL\\DavWWWRoot\\manual.pdf','\\\\nas\\IPC$\\pipe']){
  assert.throws(()=>withIntranetPaths([path],read),/共享|內網/);
 }
 await assert.rejects(withIntranetPaths(['\\\\nas\\Share\\manual.pdf'],read,
  async()=>[{address:'10.1.2.3'},{address:'8.8.8.8'}]),/內網/);
 await assert.rejects(withIntranetPaths(['\\\\files.example.com\\Share\\manual.pdf'],read,
  async()=>[{address:'203.0.113.4'}]),/內網/);
 assert.equal(reads,1);
 await withIntranetPaths(['\\\\nas\\Share\\manual.pdf'],read,async()=>[{address:'192.168.2.4'}]);
 assert.equal(reads,2);
});

test('log views honor master selection, date field and stored checkbox values',()=>{
 const now='2026-11-04T01:00:00.000Z';
 const doc=notes.template(randomUUID,now,'clients');
 const master=doc.sheets[0],logs=doc.sheets.find(sheet=>sheet.name==='紀錄');
 const parent=notes.parentField(doc,logs),date=logs.fields.find(field=>field.type==='date');
 const done=logs.fields.find(field=>field.type==='checkbox');
 const record=(sheet,title,values={})=>({
  id:randomUUID(),sheetId:sheet.id,title,values,notes:'跟進內容',tags:[],
  createdAt:now,updatedAt:now,fileLinks:[],favoriteTagLinks:[],version:1,deletedAt:null
 });
 const a=record(master,'甲'),b=record(master,'乙');
 doc.records=[a,b,
  record(logs,'甲完成',{[parent.id]:[a.id],[date.id]:'2026-11-03',[done.id]:true}),
  record(logs,'甲待辦',{[parent.id]:[a.id],[date.id]:'2026-11-04',[done.id]:false}),
  record(logs,'乙待辦',{[parent.id]:[b.id],[date.id]:'2026-11-04',[done.id]:false})];
 const config=configuration({kind:'logs',scope:'master',sheetId:logs.id});
 assert.equal(viewData(doc,[],[],config).total,0);
 assert.deepEqual(viewData(doc,[],[],config,{masterId:a.id,dateField:date.id,
  from:'2026-11-04',stateField:done.id,value:'false',query:'跟進'}).rows.map(row=>row.title),['甲待辦']);
 const all=viewData(doc,[],[],configuration({kind:'logs',sheetId:logs.id}),{sort:'title'});
 assert.equal(all.total,3);
 assert.equal(all.masters.length,2);
});

test('quick widgets persist only their validated display mode and log scope',()=>{
 const action={id:randomUUID(),type:'view-logs',label:'View Logs',sheetId:randomUUID(),scope:'master',display:'main',query:'跟進'};
 assert.deepEqual(quick.normalize([action],true),[{...action,enabled:true}]);
 assert.throws(()=>quick.normalize([{...action,display:'browser'}],true),/浮動/);
 assert.throws(()=>quick.normalize([{...action,sheetId:''}],true),/表格/);
});
