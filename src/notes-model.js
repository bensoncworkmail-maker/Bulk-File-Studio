'use strict';
(() => {
 const TYPES={text:'文字',longtext:'長文字',number:'數字',date:'日期',checkbox:'勾選',select:'單選',multiselect:'多選',phone:'電話',email:'Email',relation:'關聯紀錄'};
 const LIMITS={sheets:100,fields:50,records:5000,bytes:20*1024*1024};
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const fail=message=>{throw new Error(message);};
 const clone=value=>JSON.parse(JSON.stringify(value));
 const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
 function text(value,max,label,required=false){if(typeof value!=='string'||value.length>max||value.includes('\0')||required&&!value.trim())fail(label+'無效或過長');return value;}
 function id(value){if(typeof value!=='string'||!ID.test(value))fail('識別碼無效');return value;}
 function strings(value,max,count,label){if(!Array.isArray(value)||value.length>count)fail(label+'數量無效');return [...new Set(value.map(item=>text(item,max,label,true).trim()))];}
 function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('日期格式無效');return value;}
 const activeSheet=(doc,sheetId)=>doc.sheets.find(sheet=>sheet.id===sheetId&&!sheet.deletedAt);
 const live=(doc,record)=>!record.deletedAt&&Boolean(activeSheet(doc,record.sheetId));
 function normalizeDocument(input){
  if(!isObject(input)||input.schemaVersion!==1||!Array.isArray(input.sheets)||input.sheets.length>LIMITS.sheets||!Array.isArray(input.records)||input.records.length>LIMITS.records)fail('資料工作區格式或數量無效');
  const doc={schemaVersion:1,id:id(input.id),name:text(input.name,100,'工作區名稱',true),sheets:[],records:[]};
  const used=new Set();const unique=value=>{id(value);if(used.has(value))fail('識別碼重複');used.add(value);return value;};
  const meta=value=>({version:Number.isSafeInteger(value.version)&&value.version>0?value.version:1,createdAt:text(value.createdAt,40,'建立時間',true),updatedAt:text(value.updatedAt,40,'修改時間',true),deletedAt:value.deletedAt===null||value.deletedAt===undefined?null:text(value.deletedAt,40,'刪除時間',true)});
  for(const source of input.sheets){
   if(!isObject(source)||!Array.isArray(source.fields)||source.fields.length>LIMITS.fields)fail('表格欄位無效');
   const sheet={id:unique(source.id),name:text(source.name,100,'表格名稱',true).trim(),fields:[],...meta(source)};
   for(const field of source.fields){
    if(!isObject(field)||!Object.hasOwn(TYPES,field.type))fail('欄位類型無效');
    sheet.fields.push({id:unique(field.id),label:text(field.label,80,'欄位名稱',true).trim(),type:field.type,options:['select','multiselect'].includes(field.type)?strings(field.options,100,100,'選項'):[],targetSheetId:field.type==='relation'?id(field.targetSheetId):null});
   }
   doc.sheets.push(sheet);
  }
  const sheets=new Map(doc.sheets.map(sheet=>[sheet.id,sheet]));
  for(const sheet of doc.sheets)for(const field of sheet.fields)if(field.type==='relation'&&!sheets.has(field.targetSheetId))fail('關聯目標表格不存在');
  for(const source of input.records){
   if(!isObject(source)||!sheets.has(source.sheetId)||!isObject(source.values))fail('紀錄所屬表格或欄位資料無效');
   const record={id:unique(source.id),sheetId:source.sheetId,title:text(source.title,200,'紀錄標題',true).trim(),notes:text(source.notes,100000,'筆記'),tags:strings(source.tags,32,20,'標籤'),values:{},fileLinks:[],...meta(source)};
   const sheet=sheets.get(record.sheetId),fields=new Map(sheet.fields.map(field=>[field.id,field]));
   for(const key of Object.keys(source.values))if(!fields.has(key))fail('紀錄包含不存在的欄位');
   for(const field of sheet.fields){
    const value=source.values[field.id];if(value===undefined||value===null||value==='')continue;
    if(field.type==='number'){if(typeof value!=='number'||!Number.isFinite(value))fail('數字欄位無效');record.values[field.id]=value;}
    else if(field.type==='checkbox'){if(typeof value!=='boolean')fail('勾選欄位無效');record.values[field.id]=value;}
    else if(field.type==='date')record.values[field.id]=date(value);
    else if(field.type==='relation'){if(!Array.isArray(value)||value.length>500)fail('關聯數量無效');record.values[field.id]=[...new Set(value.map(id))];}
    else if(field.type==='select'){if(!field.options.includes(value))fail('單選值不在選項中');record.values[field.id]=value;}
    else if(field.type==='multiselect'){const list=strings(value,100,100,'多選');if(list.some(item=>!field.options.includes(item)))fail('多選值不在選項中');record.values[field.id]=list;}
    else record.values[field.id]=text(value,field.type==='longtext'?20000:2000,'欄位文字');
   }
   if(!Array.isArray(source.fileLinks)||source.fileLinks.length>100)fail('檔案連結數量無效');
   for(const link of source.fileLinks){if(!isObject(link)||!['file','folder'].includes(link.type))fail('檔案連結無效');record.fileLinks.push({favoriteId:link.favoriteId===null?null:id(link.favoriteId),path:text(link.path,4096,'檔案位置',true),label:text(link.label,200,'檔案名稱'),type:link.type});}
   doc.records.push(record);
  }
  const records=new Map(doc.records.map(record=>[record.id,record]));
  for(const record of doc.records)for(const field of sheets.get(record.sheetId).fields)if(field.type==='relation')for(const target of record.values[field.id]||[]){if(records.get(target)?.sheetId!==field.targetSheetId)fail('關聯紀錄不存在或屬於其他表格');}
  return doc;
 }
 function linked(doc,recordId){
  const current=doc.records.find(record=>record.id===recordId);if(!current)return [];
  const ids=new Set(),sheets=new Map(doc.sheets.map(sheet=>[sheet.id,sheet]));for(const record of doc.records){const sheet=sheets.get(record.sheetId);for(const field of sheet.fields.filter(field=>field.type==='relation')){const targets=record.values[field.id]||[];if(record.id===recordId)targets.forEach(target=>ids.add(target));if(targets.includes(recordId))ids.add(record.id);}}
  ids.delete(recordId);return doc.records.filter(record=>ids.has(record.id)&&live(doc,record));
 }
 function cell(doc,field,value){if(value===null||value===undefined)return '';if(field.type==='checkbox')return value?'✓':'—';if(field.type==='relation')return value.map(id=>{const record=doc.records.find(record=>record.id===id);return record?(live(doc,record)?record.title:record.title+'（已刪除）'):'（未提供）';}).join('、');return Array.isArray(value)?value.join('、'):String(value);}
 function template(makeId,now){
  const doc={schemaVersion:1,id:makeId(),name:'我的資料工作區',sheets:[],records:[]};
  const sheet=(name,definitions)=>{const value={id:makeId(),name,fields:definitions.map(([label,type,options=[],targetSheetId=null])=>({id:makeId(),label,type,options,targetSheetId})),version:1,createdAt:now,updatedAt:now,deletedAt:null};doc.sheets.push(value);return value;};
  const clients=sheet('客戶',[['客戶代號','text'],['狀態','select',['合作中','待跟進','已結束']],['地址','text']]);
  sheet('聯絡人',[['相關客戶','relation',[],clients.id],['職位','text'],['電話','phone'],['Email','email']]);
  sheet('合約',[['相關客戶','relation',[],clients.id],['開始日期','date'],['到期日期','date'],['金額','number'],['狀態','select',['草稿','生效','到期','已結束']]]);
  sheet('跟進紀錄',[['相關客戶','relation',[],clients.id],['跟進日期','date'],['下次跟進','date'],['已完成','checkbox']]);
  return doc;
 }
 function exportPackage(doc,{scope='all',id:scopeId,related=false}={}){
  if(!['all','sheet','record'].includes(scope))fail('匯出範圍無效');
  if(scope==='sheet'&&!activeSheet(doc,scopeId)||scope==='record'&&!doc.records.some(record=>record.id===scopeId&&live(doc,record)))fail('請選取有效的匯出項目');
  const activeRecords=new Map(doc.records.filter(record=>live(doc,record)).map(record=>[record.id,record])),sheetsById=new Map(doc.sheets.map(sheet=>[sheet.id,sheet]));
  let selected=doc.records.filter(record=>activeRecords.has(record.id)&&(scope==='all'||scope==='sheet'&&record.sheetId===scopeId||scope==='record'&&record.id===scopeId));const selectedIds=new Set(selected.map(record=>record.id));
  if(related){const roots=new Set(selectedIds);for(const record of activeRecords.values())for(const field of sheetsById.get(record.sheetId).fields.filter(field=>field.type==='relation'))if((record.values[field.id]||[]).some(id=>roots.has(id)))selectedIds.add(record.id);const queue=[...selectedIds];for(let index=0;index<queue.length;index++){const record=activeRecords.get(queue[index]);for(const field of sheetsById.get(record.sheetId).fields.filter(field=>field.type==='relation'))for(const id of record.values[field.id]||[])if(!selectedIds.has(id)&&activeRecords.has(id)){selectedIds.add(id);queue.push(id);}}}
  selected=doc.records.filter(record=>selectedIds.has(record.id)&&live(doc,record));const sheetIds=new Set(selected.map(record=>record.sheetId));if(scope==='all')doc.sheets.filter(sheet=>!sheet.deletedAt).forEach(sheet=>sheetIds.add(sheet.id));if(scope==='sheet')sheetIds.add(scopeId);
  let changed=true;while(changed){changed=false;for(const sheet of doc.sheets.filter(sheet=>sheetIds.has(sheet.id)))for(const field of sheet.fields)if(field.type==='relation'&&!sheetIds.has(field.targetSheetId)){sheetIds.add(field.targetSheetId);changed=true;}}
  let omittedRelations=0;const data={...clone(doc),sheets:clone(doc.sheets.filter(sheet=>sheetIds.has(sheet.id))),records:clone(selected)};
  for(const record of data.records){record.fileLinks=record.fileLinks.map(link=>({...link,favoriteId:null}));for(const field of data.sheets.find(sheet=>sheet.id===record.sheetId).fields)if(field.type==='relation'&&record.values[field.id]){const before=record.values[field.id];record.values[field.id]=before.filter(id=>selectedIds.has(id)&&activeRecords.has(id));omittedRelations+=before.length-record.values[field.id].length;}}
  return {format:'BulkFileStudio.Workspace',packageVersion:1,exportedAt:new Date().toISOString(),omittedRelations,document:normalizeDocument(data)};
 }
 function readPackage(input){if(!isObject(input)||input.format!=='BulkFileStudio.Workspace'||input.packageVersion!==1)fail('不是支援的 Studio 資料包');const doc=normalizeDocument(input.document);for(const record of doc.records)for(const link of record.fileLinks)link.favoriteId=null;return doc;}
 function mergeDocument(current,incoming,mode,makeId,now){
  if(!['copy','skip','update'].includes(mode))fail('匯入方式無效');
  const next=clone(current),doc=clone(incoming);let added=0,updated=0,skipped=0;
  if(mode==='copy'){
   const mapping=new Map();for(const sheet of doc.sheets){mapping.set(sheet.id,makeId());for(const field of sheet.fields)mapping.set(field.id,makeId());}for(const record of doc.records)mapping.set(record.id,makeId());
   for(const sheet of doc.sheets){sheet.id=mapping.get(sheet.id);sheet.name+='（匯入副本）';sheet.name=sheet.name.slice(0,100);sheet.version=1;sheet.createdAt=sheet.updatedAt=now;for(const field of sheet.fields){field.id=mapping.get(field.id);if(field.targetSheetId)field.targetSheetId=mapping.get(field.targetSheetId);}}
   for(const record of doc.records){const sheet=incoming.sheets.find(sheet=>sheet.id===record.sheetId),values={};for(const field of sheet.fields)if(Object.hasOwn(record.values,field.id))values[mapping.get(field.id)]=field.type==='relation'?record.values[field.id].map(id=>mapping.get(id)):record.values[field.id];record.id=mapping.get(record.id);record.sheetId=mapping.get(record.sheetId);record.values=values;record.version=1;record.createdAt=record.updatedAt=now;}
   next.sheets.push(...doc.sheets);next.records.push(...doc.records);added=doc.records.length;
  }else{
   for(const sheet of doc.sheets){const old=next.sheets.find(value=>value.id===sheet.id);if(!old){next.sheets.push(sheet);continue;}for(const field of sheet.fields){const existing=old.fields.find(value=>value.id===field.id);if(existing){if(existing.type!==field.type||existing.targetSheetId!==field.targetSheetId)fail('欄位結構衝突，請改用另存副本');if(mode==='update'){existing.label=field.label;existing.options=[...new Set([...existing.options,...field.options])];}}else old.fields.push(field);}if(mode==='update'){old.name=sheet.name;old.updatedAt=now;old.version++;}}
   for(const record of doc.records){const index=next.records.findIndex(value=>value.id===record.id);if(index<0){next.records.push(record);added++;}else if(mode==='skip')skipped++;else{if(next.records[index].sheetId!==record.sheetId)fail('紀錄所屬表格衝突，請改用另存副本');record.values={...next.records[index].values,...record.values};record.version=next.records[index].version+1;record.updatedAt=now;next.records[index]=record;updated++;}}
  }
  return {document:normalizeDocument(next),summary:{added,updated,skipped,sheets:doc.sheets.length}};
 }
 const api={TYPES,LIMITS,ID,clone,text,id,normalizeDocument,live,linked,cell,template,exportPackage,readPackage,mergeDocument};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.notesModel=Object.freeze(api);
})();
