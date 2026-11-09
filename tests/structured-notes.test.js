'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const M=require('../src/notes-model');
const {NotesStore}=require('../src/notes-store');
const {DraftNotes}=require('../src/draft-notes');

function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-structured-'));
 const store=new NotesStore(path.join(dir,'workspace.sqlite'));
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const addSheet=(name,types)=>store.saveSheet({name,fields:types.map(type=>({
  id:randomUUID(),type,label:M.TYPES[type],options:type==='select'||type==='multiselect'?['進行中','已完成']:[],
  ...(type==='select'||type==='multiselect'?{optionColors:{進行中:'#12ABCD',已移除:'#aabbcc'}}:{})
 }))}).document.sheets.at(-1);
 return {store,addSheet,dir};
}

test('structured workspace fields and option colors survive Excel and workspace data round trips',async t=>{
 const {store,addSheet}=setup(t);
 const sheet=addSheet('工作',['checklist','workflow','timeline','select','multiselect']);
 const [checklist,workflow,timeline,select,multiselect]=sheet.fields;
 const values={
  [checklist.id]:[{label:'核對報價',done:true},{label:'寄出文件',done:false}],
  [workflow.id]:[{label:'草擬',status:'done'},{label:'覆核',status:'active'}],
  [timeline.id]:[{label:'交付',date:'2026-11-20'},{label:'啟動',date:'2026-11-10'},{label:'後續',date:''}],
  [select.id]:'進行中',[multiselect.id]:['進行中','已完成']
 };
 assert.deepEqual(select.optionColors,{進行中:'#12abcd'});
 assert.deepEqual(multiselect.optionColors,select.optionColors);
 const saved=store.saveRecord({sheetId:sheet.id,title:'報價',values,notes:'',tags:[],fileLinks:[]});
 const doc=saved.document;
 assert.match(M.cell(doc,checklist,values[checklist.id]),/\[x\] 核對報價/);
 assert.match(M.cell(doc,workflow,values[workflow.id]),/2\. \[進行中\] 覆核/);
 assert.equal(M.cell(doc,timeline,values[timeline.id]),'2026-11-10 · 啟動\n2026-11-20 · 交付\n未設定日期 · 後續');
 assert.equal(M.searchRecords(doc,{query:'核對報價',sheetId:sheet.id}).length,1);
 const X=require('../src/notes-xlsx');
 const xlsx=await X.writeXlsx(M.tabularExport(doc,sheet.id,[saved.result.id]));
 const rows=(await X.readXlsx(xlsx)).sheets[0].rows;
 const input={rows,sheetId:sheet.id,mapping:M.suggestMapping(sheet,rows,true),header:true};
 const roundTrip=M.createTabular(doc,input,randomUUID,new Date().toISOString());
 assert.deepEqual(roundTrip.errors,[]);
 assert.deepEqual(roundTrip.records[0].values,values);
 assert.deepEqual(M.normalizeDocument(JSON.parse(JSON.stringify(doc))),doc);
 assert.throws(()=>M.gridValue(timeline,'[{"label":"日期","date":"2026-02-30"}]'),/日期無效/);
 const invalid=structuredClone(doc);
 invalid.sheets[0].fields.find(field=>field.id===select.id).optionColors.進行中='red';
 assert.throws(()=>M.normalizeDocument(invalid),/色碼/);
});

test('drafts preserve existing text and transfer structured items to the only matching field or to notes',async t=>{
 const {store,addSheet,dir}=setup(t);
 const target=addSheet('工作',['workflow']);
 const fallback=addSheet('備忘',['workflow','workflow']);
 const drafts=new DraftNotes({store:()=>store,settings:()=>({}),imageDir:path.join(dir,'draft-images'),
  onSent(){},onError(error){throw error;}});
 const legacy=store.createDraft();
 assert.equal(legacy.type,'text');
 assert.deepEqual(legacy.items,[]);
 const items=[{label:'測試',status:'active'}];
 const saved=drafts.save(legacy.id,legacy.version,{title:'',body:'備註',type:'workflow',items});
 assert.deepEqual(store.draft(legacy.id).items,items);
 assert.throws(()=>drafts.save(legacy.id,legacy.version,{title:'',body:'',type:'workflow',items}),/草稿已變更/);
 const first=await drafts.send(saved.id,saved.version,target.id,'');
 const structured=store.get().document.records.find(record=>record.id===first.id);
 assert.equal(structured.notes,'備註');
 assert.deepEqual(structured.values[target.fields[0].id],items);

 const empty=store.createDraft();
 const listOnly=drafts.save(empty.id,empty.version,{title:'',body:'',type:'workflow',items});
 assert.equal(store.draftList()[0].summary,'測試');
 const second=await drafts.send(listOnly.id,listOnly.version,fallback.id,'');
 const plain=store.get().document.records.find(record=>record.id===second.id);
 assert.equal(plain.title,'測試');
 assert.equal(plain.notes,'1. [進行中] 測試');
 assert.deepEqual(plain.values,{});
});


test('structured notes render explicit states, completion progress and dates in chronological order',async()=>{
 const {documentFromHTML}=require('./helpers/dom'),vm=require('node:vm');
 const document=documentFromHTML('<html><body></body></html>'),window={structuredNoteModel:M.structured};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/structured-note-ui.js'),'utf8'),{window,document});
 const {view,editor}=window.structuredNoteUI;
 const checklist=view('checklist',[{label:'核對報價',done:true},{label:'寄出',done:false}]);
 assert.match(checklist.textContent,/1 \/ 2 已完成/);
 assert.equal(checklist.querySelector('[aria-label="未完成"]').textContent,'');
 const workflow=view('workflow',[{label:'覆核',status:'active'}]);
 assert.equal(workflow.querySelector('.structured-note-meta').dataset.status,'active');
 assert.match(workflow.textContent,/覆核進行中/);
 const items=[{label:'交付',date:'2026-11-20'},{label:'啟動',date:'2026-11-10'}];
 assert.match(view('timeline',items).textContent,/啟動2026-11-10交付2026-11-20/);
 const timeline=editor('timeline',items);
 assert.deepEqual(Array.from(timeline.value(),row=>row.label),['交付','啟動']);
 await timeline.element.querySelector('[aria-label="依日期排序時間軸"]').dispatch('click');
 assert.deepEqual(Array.from(timeline.value(),row=>row.label),['啟動','交付']);
});
