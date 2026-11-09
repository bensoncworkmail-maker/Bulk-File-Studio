'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const model=require('./notes-model');
const Audit=require('./notes-audit');
const SharedMerge=require('./notes-shared-merge');
const {assertLocalPath}=require('./offline-policy');
const {locationPath,inspectLocation,inspectIntranetLocation}=require('./notes-location-links');
const {withIntranetPaths}=require('./intranet-path');
const tabularPaths=value=>value.split(/\r\n?|\n/).map(line=>line.trim().replace(/^"([^"]+)"$/,'$1')).filter(Boolean);
const isUNC=filepath=>/^[\\/]{2}/.test(filepath);

function tabularFileLinks(intranet=new Map()){
 const cache=new Map();
 return value=>{
  const paths=tabularPaths(value);
  if(paths.length>100)throw new Error('每筆紀錄最多匯入 100 個檔案／資料夾路徑');
  const links=new Map();
  for(const raw of paths){
   const filepath=locationPath(raw),key=process.platform==='win32'?filepath.toLowerCase():filepath;
   if(!cache.has(key)){
    if(cache.size>=1000)throw new Error('每次最多驗證 1,000 個不同的附件路徑');
    if(isUNC(filepath)?!intranet.has(filepath):!path.isAbsolute(filepath))throw new Error('附件須為可存取的完整路徑；UNC 共享須先允許內網附件');
    try{
     const result=isUNC(filepath)?intranet.get(filepath):inspectLocation(filepath);
     if(result instanceof Error)throw result;
     const {path:linkPath,type}=result;
     cache.set(key,{path:linkPath,type,favoriteId:null,label:''});
    }catch(error){cache.set(key,error);}
   }
   const link=cache.get(key);
   if(link instanceof Error)throw link;
   links.set(key,link);
  }
  return [...links.values()];
 };
}
class NotesStore {
 constructor(filename){
  assertLocalPath(filename);fs.mkdirSync(path.dirname(filename),{recursive:true});this.filename=filename;this.pending=null;
  let DatabaseSync;try{({DatabaseSync}=require('node:sqlite'));}catch{throw new Error('此執行環境缺少 SQLite，請使用完整的新版 Studio 安裝檔');}
  this.db=new DatabaseSync(filename,{allowExtension:false});
  try{
   this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=3000;');
   const version=this.db.prepare('PRAGMA user_version').get().user_version;if(version>3)throw new Error('資料工作區來自較新版本，請更新 Studio');
   this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
   this.db.exec('CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS record_history (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, saved_at TEXT NOT NULL, document TEXT NOT NULL); CREATE INDEX IF NOT EXISTS history_by_record ON record_history(record_id,saved_at);');
   this.db.exec('CREATE TABLE IF NOT EXISTS record_history_details (history_id TEXT PRIMARY KEY, metadata TEXT NOT NULL); CREATE TABLE IF NOT EXISTS share_merge_base (profile_id TEXT PRIMARY KEY, data TEXT NOT NULL);');
   this.db.exec('CREATE TABLE IF NOT EXISTS note_drafts (id TEXT PRIMARY KEY, version INTEGER NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL)');
   if(!this.db.prepare('SELECT id FROM workspace WHERE id=1').get()){if(version>=1)throw new Error('工作區主資料遺失，已停止寫入；請保留檔案並使用備份還原');const document={schemaVersion:3,id:crypto.randomUUID(),name:'我的資料工作區',sheets:[],records:[]};this.db.prepare('INSERT INTO workspace VALUES (1,0,?)').run(JSON.stringify(document));}
   this.get();if(version===1||version===2)this.backup('before-upgrade');this.db.exec('PRAGMA user_version=3;');
  }catch(error){this.db.close();throw error;}
 }
 close(){this.db.close();}
 get(){const row=this.db.prepare('SELECT revision,document FROM workspace WHERE id=1').get();if(!row||Buffer.byteLength(row.document)>model.LIMITS.bytes)throw new Error('工作區資料遺失或過大，已停止寫入');return {revision:row.revision,document:model.normalizeDocument(JSON.parse(row.document))};}
 change(task,expectedRevision,context={operation:'工作區操作'}){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const state=this.get();if(expectedRevision!==undefined&&expectedRevision!==state.revision)throw new Error('工作區已變更，請重新整理後再試');
   const beforeDocument=model.clone(state.document),before=new Map(beforeDocument.records.map(record=>[record.id,JSON.stringify(record)]));
   const result=task(state.document),doc=model.normalizeDocument(state.document),json=JSON.stringify(doc);if(Buffer.byteLength(json)>model.LIMITS.bytes)throw new Error('工作區超過 20 MB 上限，請分批匯出整理');
   if(context.operation==='共享差異合併'&&JSON.stringify(beforeDocument)===json){
    this.db.exec('COMMIT');this.pending=null;return {...state,result};
   }
   const beforeView=Audit.view(beforeDocument),afterView=Audit.view(doc);
   for(const record of doc.records)if(before.has(record.id)&&before.get(record.id)!==JSON.stringify(record)){
    const id=crypto.randomUUID(),previous=JSON.parse(before.get(record.id));this.db.prepare('INSERT INTO record_history VALUES (?,?,?,?)').run(id,record.id,new Date().toISOString(),before.get(record.id));
    const metadata={operation:context.operation||'工作區操作',source:context.source||'本機',sourceRevision:context.sourceRevision??null,sourceVersion:context.sourceVersion??null,sourceCommit:context.sourceCommit??null,scope:context.scope||null,packageName:context.packageName||'',workspaceRevision:state.revision+1,versionFrom:previous.version,versionTo:record.version,changes:Audit.recordChanges(previous,record,beforeView,afterView)};
    this.db.prepare('INSERT INTO record_history_details VALUES (?,?)').run(id,JSON.stringify(metadata));
    this.db.prepare('DELETE FROM record_history WHERE record_id=? AND id NOT IN (SELECT id FROM record_history WHERE record_id=? ORDER BY saved_at DESC,rowid DESC LIMIT 10)').run(record.id,record.id);
   }
   this.db.exec('DELETE FROM record_history_details WHERE history_id NOT IN (SELECT id FROM record_history)');
   this.db.prepare('UPDATE workspace SET revision=revision+1,document=? WHERE id=1').run(json);this.db.exec('COMMIT');this.pending=null;return {revision:state.revision+1,document:doc,result};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 addTemplate(kind='clients'){return this.change(doc=>{const sample=model.template(()=>crypto.randomUUID(),new Date().toISOString(),kind);doc.areas.push(...sample.areas);doc.sheets.push(...sample.sheets);return {areaId:sample.areas[0].id};});}
 completeClientDetails(target,revision){if(!Number.isSafeInteger(revision))throw new Error('請重新整理主表');return this.change(doc=>{let area=doc.areas.find(area=>area.id===target||area.masterSheetId===target);const root=doc.sheets.find(sheet=>sheet.id===(area?.masterSheetId||target)&&!sheet.deletedAt);if(!root||!['客戶','客戶清單','客戶列表'].includes(root.name))throw new Error('請選擇客戶主表');if(!area){area={...model.template(()=>crypto.randomUUID(),new Date().toISOString()).areas[0],id:crypto.randomUUID(),name:root.name,masterSheetId:root.id};doc.areas.push(area);root.areaId=area.id;}const missing=new Set(model.missingClientDetails(doc,area.id)),sample=model.template(()=>crypto.randomUUID(),new Date().toISOString()),templateRoot=sample.sheets[0].id;for(const sheet of sample.sheets.filter(sheet=>missing.has(sheet.name))){sheet.areaId=area.id;for(const field of sheet.fields)if(field.targetSheetId===templateRoot)field.targetSheetId=root.id;doc.sheets.push(sheet);}return {added:[...missing]};},revision);}
 saveArea(input){if(!input||typeof input!=='object')throw new Error('群組設定無效');return this.change(doc=>{const old=input.id?doc.areas.find(area=>area.id===input.id):null;if(input.id&&!old)throw new Error('群組已移除');const area={id:old?.id||crypto.randomUUID(),name:input.name,masterSheetId:input.masterSheetId||null,category:input.category===undefined?old?.category:input.category};if(old)Object.assign(old,area);else doc.areas.push(area);if(input.includeUngrouped===true)for(const sheet of doc.sheets)if(!sheet.areaId){sheet.areaId=area.id;sheet.version++;sheet.updatedAt=new Date().toISOString();}return {areaId:area.id};},input.baseRevision);}
 removeArea(id,revision){return this.change(doc=>{if(!doc.areas.some(area=>area.id===id))throw new Error('群組已移除');doc.areas=doc.areas.filter(area=>area.id!==id);for(const sheet of doc.sheets)if(sheet.areaId===id){sheet.areaId=null;sheet.version++;sheet.updatedAt=new Date().toISOString();}},revision);}
 duplicateRecord(id,version){return this.change(doc=>{const old=doc.records.find(record=>record.id===id&&model.live(doc,record));if(!old||old.version!==version)throw new Error('紀錄已變更，請重新整理');const now=new Date().toISOString(),copy={...model.clone(old),id:crypto.randomUUID(),title:(old.title+'（副本）').slice(0,200),version:1,createdAt:now,updatedAt:now};doc.records.push(copy);return {id:copy.id};});}
 saveSheet(input){return this.change(doc=>{const result=require('./notes-sheet-change').apply(doc,input,()=>crypto.randomUUID(),new Date().toISOString());return {id:result.id};},input?.baseRevision,{operation:'編輯表格與欄位'});}
 sheetPreview(input){
  this.pending=null;const state=this.get();if(input?.baseRevision!==undefined&&input.baseRevision!==state.revision)throw new Error('工作區已變更，請重新整理');
  const document=model.clone(state.document),result=require('./notes-sheet-change').apply(document,input,()=>crypto.randomUUID(),new Date().toISOString(),{allowRemoval:true});model.normalizeDocument(document);
  const token=crypto.randomUUID();this.pending={kind:'sheet-change',token,revision:state.revision,document,result,expires:Date.now()+600000};
  return {token,id:result.id,removed:result.removed,requiresConfirmation:result.removed.length>0,revision:state.revision};
 }
 sheetCommit(token,confirmRemoval=false){
  const pending=this.takePreview(token,'sheet-change');if(pending.result.removed.length&&confirmRemoval!==true)throw new Error('請確認移除欄位與所有紀錄中的值（包含回收筒）');
  const backup=this.backup('before-sheet-change');return this.change(doc=>{Object.assign(doc,pending.document);return {id:pending.result.id,backup,removed:pending.result.removed.length};},pending.revision,{operation:'確認移除欄位（已備份）'});
 }
 draftList(){
  return this.db.prepare("SELECT id, updated_at AS updatedAt, json_extract(data,'$.title') AS title, substr(CASE WHEN trim(json_extract(data,'$.body'))='' THEN COALESCE(json_extract(data,'$.items[0].label'),'') ELSE json_extract(data,'$.body') END,1,80) AS summary FROM note_drafts ORDER BY updated_at DESC, rowid DESC").all();
 }
 draft(id){
  model.id(id);
  const row=this.db.prepare('SELECT version, updated_at AS updatedAt, data FROM note_drafts WHERE id=?').get(id);
  if(!row)throw new Error('草稿已移除，請重新開啟');
  return {id,version:row.version,updatedAt:row.updatedAt,type:'text',items:[],...JSON.parse(row.data)};
 }
 createDraft(){
  const id=crypto.randomUUID(),now=new Date().toISOString(),data={title:'',body:'',attachments:[]};
  const insert=this.db.prepare('INSERT INTO note_drafts SELECT ?,1,?,? WHERE (SELECT count(*) FROM note_drafts)<50');
  if(!insert.run(id,now,JSON.stringify(data)).changes)throw new Error('最多保留 50 份草稿，請先送出或刪除一份');
  return this.draft(id);
 }
 saveDraft(id,version,patch,limit=100000){
  const old=this.draft(id);
  const {title,body,attachments,type,items}={...old,...patch};
  if(type!=='text'&&!model.structured.isType(type))throw new Error('草稿類型無效');
  const rows=type==='text'?[]:model.structured.normalize(type,items);
  model.text(title,200,'草稿標題');if(!Number.isSafeInteger(limit)||limit<0||limit>10000000)throw new Error('草稿上限設定無效');if(typeof body!=='string'||body.includes('\0')||limit>0&&body.length>limit&&body.length>old.body.length)throw new Error('草稿內容超過設定上限或格式無效');
  if(old.version!==version)throw new Error('草稿已變更，請重新開啟');
  if(title===old.title&&body===old.body&&attachments===old.attachments&&type===old.type&&JSON.stringify(rows)===JSON.stringify(old.items))return old;
  const now=new Date().toISOString();
  const update=this.db.prepare('UPDATE note_drafts SET version=version+1,updated_at=?,data=? WHERE id=? AND version=?');
  if(!update.run(now,JSON.stringify({title,body,attachments,type,items:rows}),id,version).changes)throw new Error('草稿已變更，請重新開啟');
  return this.draft(id);
 }
 deleteDraft(id,version){
  model.id(id);
  if(!Number.isSafeInteger(version)||!this.db.prepare('DELETE FROM note_drafts WHERE id=? AND version=?').run(id,version).changes){
   throw new Error('草稿已變更或已送出，請重新開啟');
  }
 }
 saveRecord(input,context={operation:'編輯紀錄'},draft){
  if(!input||typeof input!=='object')throw new Error('紀錄資料無效');
  return this.change(doc=>{
   const old=input.id?doc.records.find(record=>record.id===input.id):null;if(input.id&&(!old||old.deletedAt||old.version!==input.expectedVersion))throw new Error('紀錄已變更或刪除，請重新開啟');
   const sheet=doc.sheets.find(sheet=>sheet.id===(old?.sheetId||input.sheetId)&&!sheet.deletedAt);if(!sheet)throw new Error('表格已刪除');
   const parent=model.parentField(doc,sheet),parents=parent?input.values?.[parent.id]:null;if(parent&&(!Array.isArray(parents)||parents.length!==1||!doc.records.some(record=>record.id===parents[0]&&record.sheetId===parent.targetSheetId&&model.live(doc,record)))&&(!old||JSON.stringify(parents)!==JSON.stringify(old.values[parent.id])))throw new Error('明細必須關聯一筆可用的主紀錄；請先選擇客戶或其他主紀錄');
   const now=new Date().toISOString(),record={id:old?.id||crypto.randomUUID(),sheetId:sheet.id,title:input.title,notes:input.notes,tags:input.tags,values:input.values,fileLinks:input.fileLinks,favoriteTagLinks:input.favoriteTagLinks??old?.favoriteTagLinks??[],createdAt:old?.createdAt||now,updatedAt:now,deletedAt:null,version:(old?.version||0)+1};
   if(old)doc.records[doc.records.indexOf(old)]=record;else doc.records.push(record);
   if(draft)this.deleteDraft(draft.id,draft.version);
   return {id:record.id};
  },undefined,context);
 }
 batchSheets(entries,revision){if(!Number.isSafeInteger(revision))throw new Error('請重新整理表格選取');return this.change(doc=>{const plan=model.sheetDeletionPlan(doc,entries),now=new Date().toISOString();for(const entry of plan.sheets){const sheet=doc.sheets.find(sheet=>sheet.id===entry.id);sheet.deletedAt=now;sheet.updatedAt=now;sheet.version++;}return {count:plan.sheets.length,records:plan.records};},revision,{operation:'批次回收主表／明細表'});}

 batchAreas(ids,revision){if(!Number.isSafeInteger(revision)||!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length)throw new Error('群組選取無效');return this.change(doc=>{if(ids.some(id=>!doc.areas.some(area=>area.id===id)))throw new Error('群組已變更');doc.areas=doc.areas.filter(area=>!ids.includes(area.id));for(const sheet of doc.sheets)if(ids.includes(sheet.areaId)){sheet.areaId=null;sheet.version++;sheet.updatedAt=new Date().toISOString();}return {count:ids.length};},revision);}
 async tabularPreviewIntranet(input,verify=withIntranetPaths,inspect=inspectIntranetLocation){
  const marker={};this.pending=marker;
  if(!Number.isSafeInteger(input?.revision)||input.revision!==this.get().revision)throw new Error('工作區已變更，請重新整理後再預覽');
  const mapping=input.mapping;
  if(!Array.isArray(mapping)||mapping.length>100||mapping.filter(target=>target==='fileLinks').length!==1)return this.tabularPreview(input);
  const column=mapping.indexOf('fileLinks'),rows=model.tabularRows(input.rows).slice(input.header?1:0),paths=new Set(),hosts=new Set();
  for(const row of rows){
   const attachments=tabularPaths(row[column]||'');
   if(attachments.length>100)continue;
   for(const raw of attachments){
    let filepath;try{filepath=locationPath(raw);}catch{continue;}
    if(!isUNC(filepath))continue;
    paths.add(filepath);hosts.add(filepath.split('\\')[2].toLowerCase());
    if(paths.size>1000||hosts.size>10)throw new Error('每次最多驗證 1,000 個共享附件路徑及 10 台內網主機');
   }
  }
  const locations=[...paths],results=new Map();
  if(locations.length)await verify(locations,()=>{});
  for(let index=0;index<locations.length;index+=8){
   if(this.pending!==marker)throw new Error('預覽已變更，請重新預覽');
   await Promise.all(locations.slice(index,index+8).map(async filepath=>{
    try{results.set(filepath,await inspect(filepath));}
    catch(error){results.set(filepath,error);}
   }));
  }
  if(this.pending!==marker)throw new Error('預覽已變更，請重新預覽');
  return this.tabularPreview(input,results);
 }
 tabularPreview(input,intranet){this.pending=null;const current=this.get();if(!Number.isSafeInteger(input?.revision)||input.revision!==current.revision)throw new Error('工作區已變更，請重新整理後再預覽');const result=model.createTabular(current.document,input,()=>crypto.randomUUID(),new Date().toISOString(),tabularFileLinks(intranet)),sheet=current.document.sheets.find(sheet=>sheet.id===input.sheetId),token=result.errors.length||!result.records.length?null:crypto.randomUUID();if(token)this.pending={kind:'tabular',token,revision:current.revision,records:result.records,expires:Date.now()+600000};return {token,count:result.records.length,skipped:result.skipped,errorCount:result.errors.length,errors:result.errors.slice(0,100),records:result.records.slice(0,50).map(record=>({title:record.title,values:sheet.fields.map(field=>({label:field.label,value:model.cell(current.document,field,record.values[field.id])})).filter(item=>item.value),paths:record.fileLinks.map(link=>link.path)}))};}
 tabularCommit(token){const pending=this.takePreview(token,'tabular'),backup=this.backup('before-import');return this.change(doc=>{doc.records.push(...pending.records);return {count:pending.records.length,id:pending.records[0]?.id,backup};},pending.revision);}
 saveCopies(input,count){return this.change(doc=>{const plan=require('./notes-bulk').copies(doc,input,count,()=>crypto.randomUUID());Object.assign(doc,plan.document);return {id:plan.records[0].id,count:plan.records.length,masterCount:plan.masterCount};},undefined,{operation:'批次新增紀錄'});}
 bulkPreview(input,revision){this.pending=null;const state=this.get();if(state.revision!==revision)throw new Error('工作區已變更，請重新整理');const plan=require('./notes-bulk').edit(state.document,input),token=plan.rows.length?crypto.randomUUID():null;if(token)this.pending={kind:'bulk-edit',token,revision,document:plan.document,expires:Date.now()+600000};return {token,count:plan.rows.length,rows:plan.rows.slice(0,50).map(({before,after})=>({title:before.title,changes:Audit.recordChanges(before,after,Audit.view(state.document),Audit.view(plan.document))}))};}
 bulkCommit(token){const plan=this.takePreview(token,'bulk-edit'),backup=this.backup('before-bulk-edit');return this.change(doc=>{Object.assign(doc,plan.document);return {backup};},plan.revision,{operation:'批次編輯紀錄'});}
 updateCells(entries,revision){if(!Number.isSafeInteger(revision)||!Array.isArray(entries)||!entries.length||entries.length>500)throw new Error('每次請編輯 1–500 格');return this.change(doc=>{const seen=new Set(),changed=new Set(),now=new Date().toISOString();for(const entry of entries){const key=entry.recordId+':'+entry.fieldId;if(seen.has(key))throw new Error('儲存格重複');seen.add(key);const record=doc.records.find(record=>record.id===entry.recordId&&model.live(doc,record));if(!record)throw new Error('紀錄已移除');if(entry.fieldId==='title')record.title=model.text(entry.value,200,'標題',true);else{const field=doc.sheets.find(sheet=>sheet.id===record.sheetId).fields.find(field=>field.id===entry.fieldId);record.values[entry.fieldId]=model.gridValue(field,entry.value);}changed.add(record);}for(const record of changed){record.version++;record.updatedAt=now;}return {cells:entries.length,records:changed.size};},revision,{operation:'編輯儲存格'});}
 applyCustomTemplate(document,revision){const incoming=model.normalizeDocument(document);if(incoming.records.length||incoming.areas.length!==1)throw new Error('範本無效');return this.change(doc=>{const old=new Set(doc.areas.map(area=>area.id)),merged=model.mergeDocument(doc,incoming,'copy',()=>crypto.randomUUID(),new Date().toISOString()).document,newArea=merged.areas.find(area=>!old.has(area.id));newArea.name=incoming.areas[0].name;for(const [i,sheet] of merged.sheets.filter(sheet=>sheet.areaId===newArea.id).entries())sheet.name=incoming.sheets[i].name;Object.assign(doc,merged);return {areaId:newArea.id};},revision);}
 batchTrash(entries,includeDetails,revision){if(!Number.isSafeInteger(revision))throw new Error('請重新整理批次選取');return this.change(doc=>{const plan=model.deletionPlan(doc,entries,includeDetails),now=new Date().toISOString(),targets=new Set(plan.ids);for(const record of doc.records)if(targets.has(record.id)){record.deletedAt=now;record.updatedAt=now;record.version++;}return {count:plan.ids.length,details:plan.details,sharedRetained:plan.sharedRetained};},revision,{operation:'批次移至回收筒'});}
 trash(kind,id,expectedVersion,restore=false){
  if(!['sheet','record'].includes(kind))throw new Error('回收筒操作無效');
  return this.change(doc=>{const list=kind==='sheet'?doc.sheets:doc.records,item=list.find(item=>item.id===id);if(!item||item.version!==expectedVersion)throw new Error('項目已變更，請重新整理');if(restore&&kind==='record'&&!doc.sheets.some(sheet=>sheet.id===item.sheetId&&!sheet.deletedAt))throw new Error('請先還原所屬表格');item.deletedAt=restore?null:new Date().toISOString();item.updatedAt=new Date().toISOString();item.version++;},undefined,{operation:restore?'還原回收筒項目':'移至回收筒'});
 }
 history(recordId){
  model.id(recordId);const state=this.get(),current=state.document.records.find(record=>record.id===recordId),rows=this.db.prepare('SELECT h.id,h.saved_at,h.document,d.metadata FROM record_history h LEFT JOIN record_history_details d ON d.history_id=h.id WHERE h.record_id=? ORDER BY h.saved_at DESC,h.rowid DESC LIMIT 10').all(recordId),view=Audit.view(state.document);
  return rows.map((row,index)=>{const record=JSON.parse(row.document),next=index?JSON.parse(rows[index-1].document):current,metadata=row.metadata?JSON.parse(row.metadata):{operation:'舊版未記錄操作來源',source:'未記錄',versionFrom:record.version,versionTo:next?.version||null,changes:Audit.recordChanges(record,next,view,view),legacy:true};return {id:row.id,savedAt:row.saved_at,record,...metadata};});
 }
 restoreHistory(recordId,historyId,expectedVersion){const entry=this.db.prepare('SELECT document FROM record_history WHERE id=? AND record_id=?').get(historyId,recordId);if(!entry)throw new Error('找不到修改歷史');const previous=JSON.parse(entry.document);return this.saveRecord({...previous,favoriteTagLinks:previous.favoriteTagLinks||[],expectedVersion},{operation:'還原修改歷史'});}
 exportPreview(options){const state=this.get(),data=model.exportPackage(state.document,options);this.pending={kind:'export',token:crypto.randomUUID(),revision:state.revision,data,expires:Date.now()+600000};return {token:this.pending.token,sheets:data.document.sheets.map(sheet=>({name:sheet.name,count:data.document.records.filter(record=>record.sheetId===sheet.id).length})),records:data.document.records.map(record=>({title:record.title,sheet: data.document.sheets.find(sheet=>sheet.id===record.sheetId).name})),links:data.document.records.reduce((sum,record)=>sum+record.fileLinks.length,0),tagLinks:data.document.records.reduce((sum,record)=>sum+record.favoriteTagLinks.length,0),omittedRelations:data.omittedRelations};}
 takePreview(token,kind){const state=this.get(),pending=this.pending;if(!pending||pending.kind!==kind||token!==pending.token||pending.expires<Date.now()||pending.revision!==state.revision)throw new Error('預覽已失效，請重新預覽');return pending;}
 sharedBase(meta){
  if(!meta)return null;
  const row=this.db.prepare('SELECT data FROM share_merge_base WHERE profile_id=?').get(meta.profileId);
  const base=row?JSON.parse(row.data):null;
  return SharedMerge.matches(base,meta)?base:null;
 }
 hasSharedBase(context){return Boolean(this.sharedBase(SharedMerge.identity(context)));}
 saveSharedBase(value){
  if(!value)return;
  let data=JSON.stringify(value);
  if(Buffer.byteLength(data)>model.LIMITS.bytes&&value.display){
   const {display,...hashes}=value;
   data=JSON.stringify(hashes);
  }
  if(Buffer.byteLength(data)>model.LIMITS.bytes)throw new Error('共享基準超過 20 MB，請縮小接收範圍');
  this.db.prepare('INSERT OR REPLACE INTO share_merge_base VALUES (?,?)').run(value.profileId,data);
  this.db.exec('DELETE FROM share_merge_base WHERE profile_id NOT IN (SELECT profile_id FROM share_merge_base ORDER BY rowid DESC LIMIT 51)');
 }
 planImport(state,input,mode,context,review){
  const sharing=require('./notes-sharing-model'),now=new Date().toISOString();
  const meta=SharedMerge.identity(context);
  if(mode!=='merge'){
   const result=sharing.merge(state.document,input,mode,()=>crypto.randomUUID(),now,context.scope);
   if(meta&&['update','clone'].includes(mode))result.base=SharedMerge.baseline(result.incoming,meta,{commit:input.packageVersion===5?input.sharing.commit:null});
   return result;
  }
  if(!meta)throw new Error('差異合併只適用於具有效來源版本的共享資料包。');
  const projected=sharing.project(input,context.scope),incoming=model.readPackage(projected.data);
  const prior=this.sharedBase(meta),{tombstones,commit}=projected;
  if(prior&&SharedMerge.older(prior,meta))throw new SharedMerge.MergeConflict('這份資料包早於已接收版本，請選擇較新的版本。');
  if(prior?.commitId&&(!commit||commit.id!==prior.commitId&&!commit.ancestors.includes(prior.commitId))){
   throw new SharedMerge.MergeConflict('無法驗證來源接續上次接收的提交，請核對發布鏈或手動重建接收基準。');
  }
  const base=SharedMerge.baseline(incoming,meta,{tombstones,commit,prior});
  if(prior&&SharedMerge.sameVersion(prior,meta)&&(!commit||commit.id!==prior.commitId)&&
   SharedMerge.contentDigest(prior)!==SharedMerge.contentDigest(base)){
   throw new SharedMerge.MergeConflict('同一發布版本的資料內容有變更，請來源重新發布。');
  }
  return {...SharedMerge.merge(state.document,incoming,prior,now,projected.managed,review,{tombstones,versioned:Boolean(commit)}),incoming,base,scope:projected.config};
 }
 importPreview(input,mode,context={},options={}){
  let review=options.reviewConflicts&&mode==='merge'?{}:undefined;
  const resolution=options.resolution;
  if(resolution!==undefined){
   if(!review||!resolution)throw new Error('請先預覽共享差異合併');
   const pending=this.takePreview(resolution.token,'merge-review');
   if(pending.input!==input||!Array.isArray(resolution.choices)||resolution.choices.length!==pending.conflictIds.size){
    throw new Error('請處理所有共享衝突後再預覽');
   }
   const decisions=new Map();
   for(const decision of resolution.choices){
    if(!pending.conflictIds.has(decision?.id)||decisions.has(decision.id))throw new Error('無效的共享衝突選擇');
    decisions.set(decision.id,decision);
   }
   review={decisions};
  }else this.pending=null;
  const state=this.get(),previewContext={...context,packageVersion:input.packageVersion,localRevision:state.revision};
  let merged;
  try{merged=this.planImport(state,input,mode,context,review);}
  catch(error){
   if(!review||resolution||!(error instanceof SharedMerge.MergeConflict)||!error.review)throw error;
   const token=crypto.randomUUID();
   this.pending={kind:'merge-review',token,revision:state.revision,input,expires:Date.now()+600000,
    conflictIds:new Set(error.review.map(conflict=>conflict.id))};
   return {token,mode,context:previewContext,scope:context.scope,conflicts:error.review};
  }
  const incoming=merged.incoming;
  if(Buffer.byteLength(JSON.stringify(merged.document))>model.LIMITS.bytes)throw new Error('匯入後工作區超過 20 MB');
  if(mode==='update'||mode==='clone')Audit.preserveUnchanged(state.document,merged.document);
  const resultIds=new Set(merged.document.records.map(record=>record.id));
  const sourceIds=new Set(incoming.records.map(record=>record.id));
  const originalVersions=new Map(state.document.records.map(record=>[record.id,record.version]));
  const otherChanges=mode==='merge'?merged.document.records.filter(record=>!sourceIds.has(record.id)&&
   record.version!==originalVersions.get(record.id)):[];
  const auditInput=mode==='merge'?{...incoming,records:[...incoming.records.filter(record=>resultIds.has(record.id)),...otherChanges]}:incoming;
  const records=Audit.importRows(state.document,auditInput,merged.document,mode),structure=Audit.structureChanges(state.document,merged.document),counts=Object.fromEntries(['added','updated','skipped','unchanged',...(mode==='clone'?['removed']:[])].map(status=>[status,records.filter(row=>row.status===status).length]));
  const summary={...merged.summary,...counts,counts};this.pending={kind:'import',token:crypto.randomUUID(),revision:state.revision,data:merged.document,expires:Date.now()+600000,summary,context:{operation:mode==='clone'?'複製來源到本機':mode==='merge'?'共享差異合併':'匯入資料包',...context},mode,base:merged.base,incoming:mode==='skip'?incoming:null,recordKeys:new Set(records.map(row=>row.key))};
  return {token:this.pending.token,...summary,mode,scope:merged.scope,context:previewContext,structure,tagLinks:incoming.records.reduce((sum,record)=>sum+record.favoriteTagLinks.length,0),links:incoming.records.reduce((sum,record)=>sum+record.fileLinks.length,0),records,sheets:incoming.sheets.map(sheet=>({name:sheet.name,count:incoming.records.filter(record=>record.sheetId===sheet.id).length}))};
 }
 cancelPreview(token){if(this.pending?.token===token)this.pending=null;return {canceled:true};}
 importDetails(token,key){const pending=this.takePreview(token,'import');if(!pending.recordKeys.has(key))throw new Error('預覽紀錄無效');const state=this.get(),before=Audit.view(state.document),after=Audit.view(pending.data),old=before.records.get(key),next=pending.mode==='skip'?pending.incoming.records.find(record=>record.id===key):after.records.get(key);return {key,title:next?.title||old.title,status:!next?'removed':!old?'added':pending.mode==='skip'?'skipped':'compared',changes:Audit.recordChanges(old,next,before,pending.mode==='skip'?Audit.view(pending.incoming):after),note:!next?'來源複製會移除此筆本機紀錄；確認前會備份。':pending.mode==='skip'&&old?'略過模式保留本機版本；不套用這筆來源內容。':'顯示本次匯入將造成的差異；不是發布者完整操作歷史。'};}

 backup(prefix){const folder=path.join(path.dirname(this.filename),'workspace-backups');assertLocalPath(folder);fs.mkdirSync(folder,{recursive:true});const filename=path.join(folder,prefix+'-'+Date.now()+'-'+crypto.randomUUID()+'.sqlite');this.db.prepare('VACUUM INTO ?').run(filename);return filename;}
 restorePreview(filename){
  this.pending=null;
  assertLocalPath(filename);const key=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value),folder=path.join(path.dirname(this.filename),'workspace-backups');
  if(key(path.dirname(filename))!==key(folder)||!/^before-(import|restore|upgrade)-[0-9]+-[0-9a-f-]+\.sqlite$/i.test(path.basename(filename))||!fs.lstatSync(filename).isFile())throw new Error('請選取本程式資料位置內的工作區備份');
  const {DatabaseSync}=require('node:sqlite'),backup=new DatabaseSync(filename,{readOnly:true,allowExtension:false});let document;
  try{backup.exec('PRAGMA trusted_schema=OFF');const row=backup.prepare('SELECT document FROM workspace WHERE id=1').get();if(!row||Buffer.byteLength(row.document)>model.LIMITS.bytes)throw new Error('備份資料無效');document=model.normalizeDocument(JSON.parse(row.document));}finally{backup.close();}
  const state=this.get();if(document.id!==state.document.id)throw new Error('備份不屬於目前工作區');
  this.pending={kind:'restore',token:crypto.randomUUID(),revision:state.revision,data:document,expires:Date.now()+600000};return {token:this.pending.token,records:document.records.map(record=>({title:record.title,sheet:document.sheets.find(sheet=>sheet.id===record.sheetId).name})),sheets:document.sheets.map(sheet=>({name:sheet.name,count:document.records.filter(record=>record.sheetId===sheet.id).length})),name:path.basename(filename)};
 }
 restoreCommit(token){const pending=this.takePreview(token,'restore'),backup=this.backup('before-restore');return this.change(doc=>{Object.assign(doc,pending.data);this.db.exec('DELETE FROM share_merge_base');return {backup};},pending.revision,{operation:'完整還原備份'});}
 importShared(input,expectedRevision,context={}){
  if(this.pending&&this.pending.expires>Date.now())return {deferred:true,reason:'目前有尚未完成的匯入／匯出預覽，稍後會重試。'};
  const state=this.get();if(state.revision!==expectedRevision)return {deferred:true,reason:'本機資料已變更，請手動預覽匯入。'};
  const mode=SharedMerge.identity(context)?'merge':'update';
  const merged=this.planImport(state,input,mode,context);
  if(Buffer.byteLength(JSON.stringify(merged.document))>model.LIMITS.bytes)throw new Error('匯入後工作區超過 20 MB');
  if(mode==='update')Audit.preserveUnchanged(state.document,merged.document);
  const backup=this.backup('before-import');return this.change(doc=>{Object.assign(doc,merged.document);this.saveSharedBase(merged.base);return {backup,...merged.summary};},expectedRevision,{operation:mode==='merge'?'共享差異合併':'自動接收共享資料包',...context});
 }
 importCommit(token,options={}){
  const pending=this.takePreview(token,'import');if(pending.mode==='clone'&&options?.confirmClone!==true)throw new Error('複製來源到本機須再次確認取代範圍');const backup=this.backup('before-import');
  const result=this.change(doc=>{Object.assign(doc,pending.data);this.saveSharedBase(pending.base);return {backup,...pending.summary};},pending.revision,pending.context);return result;
 }
}
module.exports={NotesStore};
