'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const model=require('./notes-model');
const {assertLocalPath}=require('./offline-policy');
class NotesStore {
 constructor(filename){
  assertLocalPath(filename);fs.mkdirSync(path.dirname(filename),{recursive:true});this.filename=filename;this.pending=null;
  let DatabaseSync;try{({DatabaseSync}=require('node:sqlite'));}catch{throw new Error('此執行環境缺少 SQLite，請使用完整的新版 Studio 安裝檔');}
  this.db=new DatabaseSync(filename,{allowExtension:false});
  try{
   this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=3000;');
   const version=this.db.prepare('PRAGMA user_version').get().user_version;if(version>2)throw new Error('資料工作區來自較新版本，請更新 Studio');
   this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
   this.db.exec('CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS record_history (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, saved_at TEXT NOT NULL, document TEXT NOT NULL); CREATE INDEX IF NOT EXISTS history_by_record ON record_history(record_id,saved_at);');
   if(!this.db.prepare('SELECT id FROM workspace WHERE id=1').get()){if(version>=1)throw new Error('工作區主資料遺失，已停止寫入；請保留檔案並使用備份還原');const document={schemaVersion:2,id:crypto.randomUUID(),name:'我的資料工作區',sheets:[],records:[]};this.db.prepare('INSERT INTO workspace VALUES (1,0,?)').run(JSON.stringify(document));}
   this.get();if(version===1)this.backup('before-upgrade');this.db.exec('PRAGMA user_version=2;');
  }catch(error){this.db.close();throw error;}
 }
 close(){this.db.close();}
 get(){const row=this.db.prepare('SELECT revision,document FROM workspace WHERE id=1').get();if(!row||Buffer.byteLength(row.document)>model.LIMITS.bytes)throw new Error('工作區資料遺失或過大，已停止寫入');return {revision:row.revision,document:model.normalizeDocument(JSON.parse(row.document))};}
 change(task,expectedRevision){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const state=this.get();if(expectedRevision!==undefined&&expectedRevision!==state.revision)throw new Error('工作區已變更，請重新整理後再試');
   const before=new Map(state.document.records.map(record=>[record.id,JSON.stringify(record)]));
   const result=task(state.document),doc=model.normalizeDocument(state.document),json=JSON.stringify(doc);if(Buffer.byteLength(json)>model.LIMITS.bytes)throw new Error('工作區超過 20 MB 上限，請分批匯出整理');
   for(const record of doc.records)if(before.has(record.id)&&before.get(record.id)!==JSON.stringify(record)){this.db.prepare('INSERT INTO record_history VALUES (?,?,?,?)').run(crypto.randomUUID(),record.id,new Date().toISOString(),before.get(record.id));this.db.prepare('DELETE FROM record_history WHERE record_id=? AND id NOT IN (SELECT id FROM record_history WHERE record_id=? ORDER BY saved_at DESC,rowid DESC LIMIT 10)').run(record.id,record.id);}
   this.db.prepare('UPDATE workspace SET revision=revision+1,document=? WHERE id=1').run(json);this.db.exec('COMMIT');this.pending=null;return {revision:state.revision+1,document:doc,result};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 addTemplate(kind='clients'){return this.change(doc=>{const sample=model.template(()=>crypto.randomUUID(),new Date().toISOString(),kind);doc.areas.push(...sample.areas);doc.sheets.push(...sample.sheets);return {areaId:sample.areas[0].id};});}
 completeClientDetails(areaId,revision){if(!Number.isSafeInteger(revision))throw new Error('請重新整理群組');return this.change(doc=>{const area=doc.areas.find(area=>area.id===areaId),root=doc.sheets.find(sheet=>sheet.id===area?.masterSheetId&&!sheet.deletedAt);if(!root||!['客戶','客戶清單','客戶列表'].includes(root.name))throw new Error('請選擇客戶主表群組');const missing=new Set(model.missingClientDetails(doc,areaId)),sample=model.template(()=>crypto.randomUUID(),new Date().toISOString()),templateRoot=sample.sheets[0].id;for(const sheet of sample.sheets.filter(sheet=>missing.has(sheet.name))){sheet.areaId=area.id;for(const field of sheet.fields)if(field.targetSheetId===templateRoot)field.targetSheetId=root.id;doc.sheets.push(sheet);}return {added:[...missing]};},revision);}
 saveArea(input){if(!input||typeof input!=='object')throw new Error('群組設定無效');return this.change(doc=>{const old=input.id?doc.areas.find(area=>area.id===input.id):null;if(input.id&&!old)throw new Error('群組已移除');const area={id:old?.id||crypto.randomUUID(),name:input.name,masterSheetId:input.masterSheetId||null};if(old)Object.assign(old,area);else doc.areas.push(area);if(input.includeUngrouped===true)for(const sheet of doc.sheets)if(!sheet.areaId){sheet.areaId=area.id;sheet.version++;sheet.updatedAt=new Date().toISOString();}return {areaId:area.id};},input.baseRevision);}
 removeArea(id,revision){return this.change(doc=>{if(!doc.areas.some(area=>area.id===id))throw new Error('群組已移除');doc.areas=doc.areas.filter(area=>area.id!==id);for(const sheet of doc.sheets)if(sheet.areaId===id){sheet.areaId=null;sheet.version++;sheet.updatedAt=new Date().toISOString();}},revision);}
 duplicateRecord(id,version){return this.change(doc=>{const old=doc.records.find(record=>record.id===id&&model.live(doc,record));if(!old||old.version!==version)throw new Error('紀錄已變更，請重新整理');const now=new Date().toISOString(),copy={...model.clone(old),id:crypto.randomUUID(),title:(old.title+'（副本）').slice(0,200),version:1,createdAt:now,updatedAt:now};doc.records.push(copy);return {id:copy.id};});}
 saveSheet(input){
  if(!input||typeof input!=='object'||!Array.isArray(input.fields))throw new Error('表格設定無效');
  return this.change(doc=>{
   const old=input.id?doc.sheets.find(sheet=>sheet.id===input.id):null;if(input.id&&(!old||old.deletedAt||old.version!==input.expectedVersion))throw new Error('表格已變更或移至回收筒，請重新整理');
   const now=new Date().toISOString(),sheet={id:old?.id||crypto.randomUUID(),name:input.name,areaId:input.areaId===undefined?(old?.areaId||null):input.areaId||null,fields:input.fields,createdAt:old?.createdAt||now,updatedAt:now,deletedAt:null,version:(old?.version||0)+1};
   if(old){if(old.areaId!==sheet.areaId)for(const area of doc.areas)if(area.masterSheetId===old.id)area.masterSheetId=null;const removed=old.fields.filter(field=>!sheet.fields.some(next=>next.id===field.id));for(const field of removed)if(doc.records.some(record=>record.sheetId===old.id&&record.values[field.id]!==undefined&&record.values[field.id]!==null&&record.values[field.id]!==''&&record.values[field.id]!==false&&(!Array.isArray(record.values[field.id])||record.values[field.id].length)))throw new Error('「'+field.label+'」仍有資料（包含回收筒），請先清空；欄位不會被直接刪除');for(const record of doc.records.filter(record=>record.sheetId===old.id))for(const field of removed)delete record.values[field.id];doc.sheets[doc.sheets.indexOf(old)]=sheet;}else doc.sheets.push(sheet);
   return {id:sheet.id};
  },input.baseRevision);
 }
 saveRecord(input){
  if(!input||typeof input!=='object')throw new Error('紀錄資料無效');
  return this.change(doc=>{
   const old=input.id?doc.records.find(record=>record.id===input.id):null;if(input.id&&(!old||old.deletedAt||old.version!==input.expectedVersion))throw new Error('紀錄已變更或刪除，請重新開啟');
   const sheet=doc.sheets.find(sheet=>sheet.id===(old?.sheetId||input.sheetId)&&!sheet.deletedAt);if(!sheet)throw new Error('表格已刪除');
   const parent=model.parentField(doc,sheet),parents=parent?input.values?.[parent.id]:null;if(parent&&(!Array.isArray(parents)||parents.length!==1||!doc.records.some(record=>record.id===parents[0]&&record.sheetId===parent.targetSheetId&&model.live(doc,record)))&&(!old||JSON.stringify(parents)!==JSON.stringify(old.values[parent.id])))throw new Error('明細必須關聯一筆可用的主紀錄；請先選擇客戶或其他主紀錄');
   const now=new Date().toISOString(),record={id:old?.id||crypto.randomUUID(),sheetId:sheet.id,title:input.title,notes:input.notes,tags:input.tags,values:input.values,fileLinks:input.fileLinks,createdAt:old?.createdAt||now,updatedAt:now,deletedAt:null,version:(old?.version||0)+1};
   if(old)doc.records[doc.records.indexOf(old)]=record;else doc.records.push(record);return {id:record.id};
  });
 }
 batchTrash(entries,includeDetails,revision){if(!Number.isSafeInteger(revision))throw new Error('請重新整理批次選取');return this.change(doc=>{const plan=model.deletionPlan(doc,entries,includeDetails),now=new Date().toISOString(),targets=new Set(plan.ids);for(const record of doc.records)if(targets.has(record.id)){record.deletedAt=now;record.updatedAt=now;record.version++;}return {count:plan.ids.length,details:plan.details,sharedRetained:plan.sharedRetained};},revision);}
 trash(kind,id,expectedVersion,restore=false){
  if(!['sheet','record'].includes(kind))throw new Error('回收筒操作無效');
  return this.change(doc=>{const list=kind==='sheet'?doc.sheets:doc.records,item=list.find(item=>item.id===id);if(!item||item.version!==expectedVersion)throw new Error('項目已變更，請重新整理');if(restore&&kind==='record'&&!doc.sheets.some(sheet=>sheet.id===item.sheetId&&!sheet.deletedAt))throw new Error('請先還原所屬表格');item.deletedAt=restore?null:new Date().toISOString();item.updatedAt=new Date().toISOString();item.version++;});
 }
 history(recordId){model.id(recordId);return this.db.prepare('SELECT id,saved_at,document FROM record_history WHERE record_id=? ORDER BY saved_at DESC,rowid DESC LIMIT 10').all(recordId).map(row=>({id:row.id,savedAt:row.saved_at,record:JSON.parse(row.document)}));}
 restoreHistory(recordId,historyId,expectedVersion){const entry=this.db.prepare('SELECT document FROM record_history WHERE id=? AND record_id=?').get(historyId,recordId);if(!entry)throw new Error('找不到修改歷史');const previous=JSON.parse(entry.document);return this.saveRecord({...previous,expectedVersion});}
 exportPreview(options){const state=this.get(),data=model.exportPackage(state.document,options);this.pending={kind:'export',token:crypto.randomUUID(),revision:state.revision,data,expires:Date.now()+600000};return {token:this.pending.token,sheets:data.document.sheets.map(sheet=>({name:sheet.name,count:data.document.records.filter(record=>record.sheetId===sheet.id).length})),records:data.document.records.map(record=>({title:record.title,sheet: data.document.sheets.find(sheet=>sheet.id===record.sheetId).name})),links:data.document.records.reduce((sum,record)=>sum+record.fileLinks.length,0),omittedRelations:data.omittedRelations};}
 takePreview(token,kind){const state=this.get(),pending=this.pending;if(!pending||pending.kind!==kind||token!==pending.token||pending.expires<Date.now()||pending.revision!==state.revision)throw new Error('預覽已失效，請重新預覽');return pending;}
 importPreview(input,mode){const incoming=model.readPackage(input),state=this.get(),merged=model.mergeDocument(state.document,incoming,mode,()=>crypto.randomUUID(),new Date().toISOString());if(Buffer.byteLength(JSON.stringify(merged.document))>model.LIMITS.bytes)throw new Error('匯入後工作區超過 20 MB');this.pending={kind:'import',token:crypto.randomUUID(),revision:state.revision,data:merged.document,expires:Date.now()+600000,summary:merged.summary};return {token:this.pending.token,...merged.summary,links:incoming.records.reduce((sum,record)=>sum+record.fileLinks.length,0),records:incoming.records.map(record=>({title:record.title,sheet:incoming.sheets.find(sheet=>sheet.id===record.sheetId).name})),sheets:incoming.sheets.map(sheet=>({name:sheet.name,count:incoming.records.filter(record=>record.sheetId===sheet.id).length}))};}
 backup(prefix){const folder=path.join(path.dirname(this.filename),'workspace-backups');assertLocalPath(folder);fs.mkdirSync(folder,{recursive:true});const filename=path.join(folder,prefix+'-'+Date.now()+'-'+crypto.randomUUID()+'.sqlite');this.db.prepare('VACUUM INTO ?').run(filename);return filename;}
 restorePreview(filename){
  assertLocalPath(filename);const key=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value),folder=path.join(path.dirname(this.filename),'workspace-backups');
  if(key(path.dirname(filename))!==key(folder)||!/^before-(import|restore|upgrade)-[0-9]+-[0-9a-f-]+\.sqlite$/i.test(path.basename(filename))||!fs.lstatSync(filename).isFile())throw new Error('請選取本程式資料位置內的工作區備份');
  const {DatabaseSync}=require('node:sqlite'),backup=new DatabaseSync(filename,{readOnly:true,allowExtension:false});let document;
  try{backup.exec('PRAGMA trusted_schema=OFF');const row=backup.prepare('SELECT document FROM workspace WHERE id=1').get();if(!row||Buffer.byteLength(row.document)>model.LIMITS.bytes)throw new Error('備份資料無效');document=model.normalizeDocument(JSON.parse(row.document));}finally{backup.close();}
  const state=this.get();if(document.id!==state.document.id)throw new Error('備份不屬於目前工作區');
  this.pending={kind:'restore',token:crypto.randomUUID(),revision:state.revision,data:document,expires:Date.now()+600000};return {token:this.pending.token,records:document.records.map(record=>({title:record.title,sheet:document.sheets.find(sheet=>sheet.id===record.sheetId).name})),sheets:document.sheets.map(sheet=>({name:sheet.name,count:document.records.filter(record=>record.sheetId===sheet.id).length})),name:path.basename(filename)};
 }
 restoreCommit(token){const pending=this.takePreview(token,'restore'),backup=this.backup('before-restore');return this.change(doc=>{Object.assign(doc,pending.data);return {backup};},pending.revision);}
 importCommit(token){
  const pending=this.takePreview(token,'import'),backup=this.backup('before-import');
  const result=this.change(doc=>{Object.assign(doc,pending.data);return {backup,...pending.summary};},pending.revision);return result;
 }
}
module.exports={NotesStore};
