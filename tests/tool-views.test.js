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

test('saved log table scope and display defaults apply without expanding a missing selection',()=>{
 const now='2026-11-04T01:00:00.000Z',doc=notes.template(randomUUID,now,'clients');
 const logs=doc.sheets.find(sheet=>sheet.name==='紀錄');
 const other=doc.sheets.find(sheet=>sheet.id!==logs.id);
 const config=configuration({kind:'logs'});
 const settings={scope:'selected',sheetIds:[logs.id],layout:'cards',sort:'oldest'};
 const result=viewData(doc,[],[],config,{sheetId:other.id},settings);
 assert.deepEqual(result.tables.map(sheet=>sheet.id),[logs.id]);
 assert.equal(result.sheetId,logs.id);
 assert.equal(result.layout,'cards');
 assert.equal(result.sort,'oldest');
 assert.equal(viewData(doc,[],[],config,{layout:'list'},settings).layout,'list');
 const shortcut=viewData(doc,[],[],configuration({kind:'logs',sheetId:other.id}),{},settings);
 assert.equal(shortcut.sheetId,other.id);
 logs.deletedAt=now;
 assert.deepEqual(viewData(doc,[],[],config,{},settings).tables,[]);
});

test('the subtle resize grip occupies its own space in the footer',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const {documentFromHTML}=require('./helpers/dom');
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/index.html'),'utf8'));
 const window={
  desktopAPI:{get:async()=>({}),onChanged(){}},
  settingsUI:{get:()=>({dialogSizes:{}})}
 };
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/dialog-sizes.js'),'utf8'),{
  window,document,MutationObserver:class {observe(){}}
 });
 window.dialogSizesUI.init();
 const save=document.getElementById('notes-record-save');
 const footer=save.parentElement,grip=footer.querySelector('.dialog-size-grip');
 assert.equal(grip.type,'button');
 assert.equal(grip.textContent,'');
 assert.equal(grip.parentElement,footer);
 assert.match(grip.getAttribute('aria-label'),/調整/);
 assert.equal(save.type,'submit');
});

test('floating month uses unpaginated day counts and searches the related master name',()=>{
 const {randomUUID}=require('node:crypto'),M=require('../src/notes-model');
 const now='2026-11-01T12:00:00Z',doc=M.template(randomUUID,now,'clients');
 const root=doc.sheets[0],detail=doc.sheets.find(sheet=>sheet.name==='紀錄');
 const master={id:randomUUID(),sheetId:root.id,title:'北區客戶',notes:'',tags:[],values:{},createdAt:now,updatedAt:now,fileLinks:[],favoriteTagLinks:[],deletedAt:null,version:1};
 const parent=M.parentField(doc,detail),date=detail.fields.find(field=>field.type==='date');
 doc.records=[master,...Array.from({length:32},(_,i)=>({...master,id:randomUUID(),sheetId:detail.id,title:'行程 '+i,values:{[parent.id]:[master.id],[date.id]:'2026-11-03'}}))];
 const result=viewData(doc,[],[],configuration({kind:'planning'}),{mode:'calendar',month:'2026-11',day:'2026-11-03',query:'北區'});
 assert.equal(result.counts['2026-11-03'],32);
 assert.equal(result.rows.length,30);
 assert.match(result.rows[0].detail,/北區客戶/);
});

test('small calendar counts dated timeline items separately and searches their labels',()=>{
 const {randomUUID}=require('node:crypto'),M=require('../src/notes-model');
 const now='2026-11-01T12:00:00Z',doc=M.template(randomUUID,now,'projects');
 const sheet=doc.sheets[0],timeline={id:randomUUID(),type:'timeline',label:'專案階段'},recordId=randomUUID();
 sheet.fields.push(timeline);
 doc.records=[{id:recordId,sheetId:sheet.id,title:'網站改版',notes:'',deletedAt:null,values:{
  [timeline.id]:[{label:'上線',date:'2026-11-03'},{label:'檢查',date:'2026-11-03'},
   {label:'未排期',date:''},{label:'回顧',date:'2026-12-03'}]
 }}];
 const calendar=configuration({kind:'planning'}),filters={mode:'calendar',month:'2026-11',day:'2026-11-03'};
 const all=viewData(doc,[],[],calendar,filters);
 assert.deepEqual(all.counts,{'2026-11-03':2});
 assert.ok(all.rows.every(row=>row.id===recordId&&row.eventKind==='timeline'));
 const filtered=viewData(doc,[],[],calendar,{...filters,query:'上線'});
 assert.equal(filtered.total,1);
 assert.equal(filtered.rows[0].title,'上線');
 assert.match(filtered.rows[0].detail,/網站改版.*專案階段/);
 doc.records[0].deletedAt=now;
 assert.equal(viewData(doc,[],[],calendar,filters).total,0);
});
