'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),M=require('../src/notes-model'),{NotesStore}=require('../src/notes-store');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-tabular-')),store=new NotesStore(path.join(dir,'workspace.sqlite'));t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});const state=store.addTemplate();return {store,state};}
function master(store,sheet){return store.saveRecord({sheetId:sheet.id,title:'Acme',notes:'Keep',tags:[],values:{},fileLinks:[]}).result.id;}
test('Excel-style contact rows map by headings and create six records atomically with the selected master',t=>{const {store,state}=setup(t),[clients,contacts]=state.document.sheets,id=master(store,clients),rows=[['Name','Phone','Email'],...Array.from({length:6},(_,i)=>[String.fromCharCode(65+i),'00'+i,i+'@example.com'])],mapping=M.suggestMapping(contacts,rows,true),before=store.get();assert.equal(mapping[0],'title');assert.equal(mapping[1],contacts.fields.find(field=>field.type==='phone').id);const preview=store.tabularPreview({sheetId:contacts.id,masterId:id,revision:before.revision,rows,mapping,header:true,dateFormat:'ymd'});assert.equal(preview.count,6);assert.equal(preview.errorCount,0);assert.ok(preview.token);assert.equal(store.get().document.records.length,1);const result=store.tabularCommit(preview.token);assert.ok(fs.existsSync(result.result.backup));const records=result.document.records.filter(record=>record.sheetId===contacts.id);assert.equal(records.length,6);assert.ok(records.every(record=>record.values[contacts.fields[0].id][0]===id));assert.equal(records[0].values[mapping[1]],'000');assert.equal(result.document.records[0].notes,'Keep');assert.throws(()=>store.tabularCommit(preview.token),/失效/);});
test('invalid import rows prevent all writes; correcting mapping and rows can be previewed again',t=>{const {store,state}=setup(t),[clients,contacts]=state.document.sheets,id=master(store,clients),input={sheetId:contacts.id,masterId:id,revision:store.get().revision,rows:[['Name','Phone'],['Valid','123'],['','456']],mapping:['title',contacts.fields.find(field=>field.type==='phone').id],header:true,dateFormat:'ymd'};let preview=store.tabularPreview(input);assert.equal(preview.token,null);assert.equal(preview.errorCount,1);assert.equal(preview.errors[0].row,3);assert.equal(store.get().document.records.length,1);assert.throws(()=>store.tabularCommit('invalid'));input.rows[2][0]='Fixed';preview=store.tabularPreview(input);assert.ok(preview.token);const old=store.get().document.records[0];store.saveRecord({...old,title:'Changed',expectedVersion:old.version});assert.throws(()=>store.tabularCommit(preview.token),/失效/);assert.equal(store.get().document.records.length,1);});
test('date order, blank rows, multi-value tags and explicit duplicate mapping are validated',t=>{const {store,state}=setup(t),clients=state.document.sheets[0],contracts=state.document.sheets.find(sheet=>sheet.name==='合約'),id=master(store,clients),dateField=contracts.fields.find(field=>field.type==='date'),base={sheetId:contracts.id,masterId:id,revision:store.get().revision,header:true,dateFormat:'dmy',mapping:['title',dateField.id,'tags'],rows:[['Name','Date','Tags'],['Contract','31/10/2026','VIP, Follow'],['','','']]};const preview=store.tabularPreview(base);assert.equal(preview.count,1);assert.equal(preview.skipped,1);const result=store.tabularCommit(preview.token),record=result.document.records[1];assert.equal(record.values[dateField.id],'2026-10-31');assert.deepEqual(record.tags,['VIP','Follow']);assert.throws(()=>M.createTabular(store.get().document,{...base,mapping:['title',dateField.id,dateField.id]},()=>'',new Date().toISOString()),/重複/);assert.throws(()=>store.tabularPreview({...base,revision:store.get().revision,masterId:null}),/主紀錄/);});
test('paste parsing and source validation bound rows, cells and source content; header-only cannot commit',t=>{const {store,state}=setup(t),sheet=state.document.sheets[0],rows=M.parseTSV('Name\tPhone\r\n"A\nB"\t00123\r\n',{limit:50000});assert.deepEqual(rows,[['Name','Phone'],['A\nB','00123']]);assert.throws(()=>M.parseTSV('x\t'.repeat(500)),/500/);assert.equal(M.parseTSV('x\t'.repeat(500),{limit:50000})[0].length,501);assert.throws(()=>M.tabularRows(Array.from({length:1002},()=>[])),/1000/);const preview=store.tabularPreview({sheetId:sheet.id,masterId:null,revision:store.get().revision,header:true,rows:[['Name']],mapping:['title'],dateFormat:'ymd'});assert.equal(preview.token,null);assert.equal(preview.count,0);assert.throws(()=>M.tabularRows([['\0']]));});

test('attachment cells validate before commit and report invalid paths on their source row',t=>{
 const {store,state}=setup(t),sheet=state.document.sheets[0],dir=path.dirname(store.filename),file=path.join(dir,'a,b.txt');
 fs.writeFileSync(file,'test');
 const rows=[['名稱','檔案／資料夾路徑'],['有附件','"'+file+'"\r\n'+dir+'\r\n'+file],['錯誤',path.join(dir,'missing')]];
 const input={sheetId:sheet.id,revision:state.revision,rows,header:true,mapping:M.suggestMapping(sheet,rows,true)};
 assert.deepEqual(input.mapping,['title','fileLinks']);
 const invalid=store.tabularPreview(input);
 assert.equal(invalid.token,null);assert.equal(invalid.errors[0].row,3);
 assert.match(invalid.errors[0].message,/位置不存在/);
 assert.equal(store.get().document.records.length,0);
 const preview=store.tabularPreview({...input,rows:rows.slice(0,2)});
 assert.deepEqual(preview.records[0].paths,[file,dir]);
 assert.deepEqual(store.tabularCommit(preview.token).document.records[0].fileLinks.map(link=>link.type),['file','folder']);
});

test('UNC attachments require explicit authorization and a newer preview invalidates an in-flight check',async t=>{
 const {store,state}=setup(t),sheet=state.document.sheets[0];
 const filepath=String.raw`\\server\share\report.pdf`;
 const input={sheetId:sheet.id,revision:state.revision,header:true,mapping:['title','fileLinks'],
  rows:[['標題','檔案／資料夾路徑'],['UNC record',filepath]]};
 const local=store.tabularPreview(input);
 assert.equal(local.token,null);
 assert.match(local.errors[0].message,/允許內網附件/);
 let finish;
 const pending=store.tabularPreviewIntranet(input,paths=>{
  assert.deepEqual(paths,[filepath]);
  return new Promise(resolve=>{finish=resolve;});
 });
 const newer=store.tabularPreview({...input,rows:[input.rows[0],['Local record','']]});
 finish();
 await assert.rejects(pending,/預覽已變更/);
 assert.ok(newer.token);
 assert.equal(store.tabularCommit(newer.token).document.records[0].title,'Local record');
});

test('approved UNC links are validated and committed without rewriting the network path',async t=>{
 const {store,state}=setup(t),sheet=state.document.sheets[0];
 const file=String.raw`\\host\share\file.pdf`,folder=String.raw`\\host\share\folder`;
 const input={sheetId:sheet.id,revision:state.revision,header:true,mapping:['title','fileLinks'],
  rows:[['標題','檔案／資料夾路徑'],['Network',file+'\n'+folder]]};
 const verify=async paths=>assert.deepEqual(paths,[file,folder]);
 const denied=await store.tabularPreviewIntranet(input,verify,async()=>{throw new Error('讀取失敗');});
 assert.equal(denied.token,null);
 assert.equal(denied.errors[0].row,2);
 const preview=await store.tabularPreviewIntranet(input,verify,async path=>({path,type:path===file?'file':'folder'}));
 assert.deepEqual(preview.records[0].paths,[file,folder]);
 assert.deepEqual(store.tabularCommit(preview.token).document.records[0].fileLinks.map(link=>link.type),['file','folder']);
});

test('workspace CSV handles quoted commas, quotes, multiline text and a UTF-8 BOM',()=>{
 const csv='\uFEFF標題,摘要,筆記\r\n"Name, Inc.","He said ""yes"".\nNext line","'+ 'x'.repeat(25000)+'"\r\n';
 const rows=M.tabularRows(M.parseCSV(csv));
 assert.deepEqual(rows[1],['Name, Inc.','He said "yes".\nNext line','x'.repeat(25000)]);
 assert.throws(()=>M.parseCSV('A,"unclosed'),/引號未結束/);
 assert.throws(()=>M.parseCSV('A,un"quoted'),/格式無效/);
 assert.deepEqual(M.parseTSV('Name\tTel\nName, Inc.\t001'),[['Name','Tel'],['Name, Inc.','001']]);
});
