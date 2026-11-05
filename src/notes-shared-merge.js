'use strict';

const crypto=require('node:crypto');
const M=require('./notes-model');
const S=require('./notes-sharing-model');
class MergeConflict extends Error {
 constructor(message,review){
  super(message);
  this.review=review;
 }
}
const REVIEW_LIMIT=100;
const valueKey=(id,kind,key)=>[id,kind,key].join(':');
const displayValue=value=>{
 if(value===undefined||value===null||value==='')return '（空白）';
 const text=typeof value==='string'?value:JSON.stringify(value,null,2);
 return text.length>4000?text.slice(0,4000)+'…（預覽已截短）':text;
};

function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))??'undefined').digest('hex');
const missing=digest(undefined);
const index=items=>new Map(items.map(item=>[item.id,item]));

function identity(context){
 if(!context||!M.ID.test(context.source)||!(context.profileId==='default'||M.ID.test(context.profileId))||
  !Number.isSafeInteger(context.sourceRevision)||context.sourceRevision<0)return null;
 const scope=S.scope(context.scope);
 return {profileId:context.profileId,source:context.source,revision:context.sourceRevision,
  version:Number.isSafeInteger(context.sourceVersion)&&context.sourceVersion>0?context.sourceVersion:0,
  scope:JSON.stringify([scope.mode,[...scope.masterIds].sort()])};
}

function describe(record){
 const {version,createdAt,updatedAt,id,values,fileLinks,favoriteTagLinks,...fields}=record;
 return {
  fields:{...fields,fileLinks:fileLinks.map(({favoriteId,...link})=>link),
   favoriteTagLinks:favoriteTagLinks.map(({authorized,...link})=>link)},
  values
 };
}
function structure(entity){
 const {version,createdAt,updatedAt,...content}=entity;
 return content;
}
const indexObject=items=>Object.fromEntries(items.map(item=>[item.id,item]));
const hashes=object=>Object.fromEntries(Object.entries(object).map(([key,value])=>[key,digest(value)]));

const fieldHashes=fields=>hashes(indexObject(fields));

function baseline(document,meta,{tombstones=[],commit=null,prior=null}={}){
 const display={};
 let remaining=256*1024;
 return {...meta,display,...(commit?{commitId:commit.id,recycled:Object.fromEntries(tombstones.map(item=>[item.id,item.deletedAt]))}:{}),
  sheetFields:Object.fromEntries(document.sheets.map(({id,fields,...sheet})=>[id,{header:digest(structure(sheet)),fields:fieldHashes(fields)}])),
  areas:Object.fromEntries(document.areas.map(item=>[item.id,digest(structure(item))])),
  sheets:Object.fromEntries(document.sheets.map(item=>[item.id,digest(structure(item))])),
  records:{...Object.fromEntries(tombstones.filter(item=>prior?.records[item.id]).map(item=>[item.id,prior.records[item.id]])),...Object.fromEntries(document.records.map(item=>{
   const {fields,values}=describe(item);
   for(const [kind,entries] of [['fields',fields],['values',values]]){
    for(const [key,value] of Object.entries(entries)){
     const id=valueKey(item.id,kind,key);
     const size=Buffer.byteLength(JSON.stringify({[id]:value}))+1;
     if(size<=4096&&size<=remaining){display[id]=value;remaining-=size;}
    }
   }
   return [item.id,{fields:hashes(fields),values:hashes(values)}];
  }))}
 };
}
function matches(base,meta){
 return base&&base.source===meta.source&&base.scope===meta.scope;
}
function older(base,meta){
 return meta.version&&base.version?meta.version<base.version:meta.revision<base.revision;
}
function sameVersion(base,meta){
 return meta.version&&base.version?meta.version===base.version:meta.revision===base.revision;
}

function merge(current,incoming,prior,now,managed,review,{tombstones=[],versioned=false}={}){
 const next=M.clone(current),conflicts=[],choices=[];
 const decisions=review?.decisions;
 const consumed=new Set();
 const outsideAreas=new Set(managed?current.sheets.filter(sheet=>!managed.has(sheet.id)).map(sheet=>sheet.areaId):[]);
 const managedAreas=new Set(incoming.sheets.filter(sheet=>managed?.has(sheet.id)).map(sheet=>sheet.areaId));
 let added=0,updated=0,recycled=0;
 const patch=(local,remote,common,label,fieldReview)=>{
  const lh=digest(local),rh=digest(remote);
  if(rh===lh||rh===common)return local;
  if(lh===common||!common&&local===undefined&&!fieldReview)return remote;
  if(fieldReview){
   const {id,title,sheet,name,editable,maxLength,kind,key,format=displayValue}=fieldReview;
   const isTitle=kind==='fields'&&key==='title';
   const decision=decisions?.get(id);
   if(decision){
    consumed.add(id);
    if(decision.choice==='local')return local;
    if(decision.choice==='source')return remote;
    if(decision.choice==='custom'&&editable&&typeof decision.value==='string'&&decision.value.length<=maxLength&&
     !decision.value.includes('\0')&&(!isTitle||decision.value.trim())){
     return isTitle?decision.value.trim():decision.value||(
      kind==='values'?undefined:'');
    }
    throw new Error('無效的共享衝突選擇：'+label);
   }
   if(choices.length===REVIEW_LIMIT)throw new MergeConflict(
    '待處理的欄位衝突超過 '+REVIEW_LIMIT+' 個。請縮小接收範圍，再重新預覽。');
   const base=common===missing?'（空白）':Object.hasOwn(prior?.display||{},id)?
    format(prior.display[id]):common?'（此基準未保存欄位原值）':'（沒有共同版本）';
   choices.push({id,title,sheet,name,base,local:format(local),source:format(remote),editable,maxLength});
   return local;
  }
  conflicts.push(label);return local;
 };

 const recordsBySheet=new Map();
 for(const record of next.records){
  if(!recordsBySheet.has(record.sheetId))recordsBySheet.set(record.sheetId,[]);
  recordsBySheet.get(record.sheetId).push(record);
 }
 const removedFields=new Map();
 function mergeFields(old,item,schemaBase){
  const local=index(old.fields),remote=index(item.fields),selected=[];
  const ids=new Set([...local.keys(),...remote.keys()]);
  for(const id of ids){
   const left=local.get(id),right=remote.get(id),common=schemaBase.fields[id]??missing;
   const name=(right||left).label,label=item.name+' ／ '+name;
   const affected=!right&&left?(recordsBySheet.get(item.id)||[]).filter(record=>Object.hasOwn(record.values,id)):[];
   const destructive=!right&&left&&common!==missing&&affected.some(record=>
    digest(record.values[id])!==(prior.records[record.id]?.values[id]??missing));
   const choice=review?{id:valueKey(item.id,'schema',id),title:item.name,sheet:item.name,
    name:!right?'移除欄位 '+name+'（'+affected.length+' 筆有值）':name,
    editable:false,maxLength:0}:null;
   const value=patch(left,right,destructive?undefined:common,label,choice);
   if(value!==undefined)selected.push(value);
   else if(left){
    if(!removedFields.has(item.id))removedFields.set(item.id,new Set());
    removedFields.get(item.id).add(id);
   }
  }
  return selected;
 }
 for(const kind of ['areas','sheets']){
  const entities=index(next[kind]),remote=index(incoming[kind]);
  for(const [id,item] of remote){
   if(kind==='sheets'&&item.deletedAt)continue;
   const local=entities.get(id),old=local&&structure(local),common=prior?.[kind][id];
   if(managed&&(kind==='sheets'?!managed.has(id):!managedAreas.has(id)||outsideAreas.has(id))){
    if(!local)conflicts.push(item.name+'（接收範圍外的依賴項目尚未建立）');
    continue;
   }
   if(local?.deletedAt&&common&&digest(structure(item))!==common){
    conflicts.push(item.name+'（本機表格在回收筒）');continue;
   }
   let value;
   if(versioned&&kind==='sheets'&&local&&(prior?.sheetFields?.[id]||common===digest(old))){
    const {fields:localFields,...localHeader}=old,{fields:remoteFields,...remoteHeader}=structure(item);
    const schemaBase=prior.sheetFields?.[id]||{header:digest(localHeader),fields:fieldHashes(localFields)};
    const header=patch(localHeader,remoteHeader,schemaBase.header,item.name+'（表格設定）');
    value={...header,fields:mergeFields(local,item,schemaBase)};
   }else value=patch(old,structure(item),common,item.name+'（'+(kind==='areas'?'群組':'表格結構')+'）');
   if(digest(value)===digest(old))continue;
   if(!local){next[kind].push(M.clone(item));continue;}
   const changed={...item,...value};
   if(kind==='sheets'){
    changed.version=local.version+1;changed.createdAt=local.createdAt;changed.updatedAt=now;
   }
   next[kind][next[kind].indexOf(local)]=changed;
  }
 }

 const originals=index(current.records),localById=index(next.records),sheets=index(next.sheets);
 const sourceSheets=index(incoming.sheets),sourceRecords=index(incoming.records);
 const recycledIds=new Set(tombstones.map(mark=>mark.id));
 for(const mark of tombstones){
  const local=localById.get(mark.id),common=prior?.records[mark.id];
  if(!local||local.deletedAt||prior?.recycled?.[mark.id]===mark.deletedAt)continue;
  if(local.sheetId!==mark.sheetId||managed&&!managed.has(mark.sheetId)){
   conflicts.push(local.title+'（回收標記與本機表格不符）');continue;
  }
  const current=describe(local),unchanged=common&&digest(hashes(current.fields))===digest(common.fields)&&
   digest(hashes(current.values))===digest(common.values);
  const choice=review?{id:valueKey(mark.id,'fields','deletedAt'),title:local.title,
   sheet:sheets.get(local.sheetId)?.name,name:'回收筒狀態',editable:false,maxLength:0,
   format:value=>value?'移至回收筒':'有效'}:null;
  const deletedAt=patch(local.deletedAt,mark.deletedAt,unchanged?digest(local.deletedAt):undefined,
   local.title+'（來源已回收，本機有變更或沒有共同版本）',choice);
  if(deletedAt!==local.deletedAt){
   local.deletedAt=deletedAt;local.version++;local.updatedAt=now;recycled++;
  }
 }
 for(const record of incoming.records){
  if(record.deletedAt)continue;
  const local=localById.get(record.id),common=prior?.records[record.id],label=record.title;
  const right=describe(record);
  const remoteChanged=()=>!common||['fields','values'].some(key=>digest(hashes(right[key]))!==digest(common[key]));
  if(!local){
   if(common){if(remoteChanged())conflicts.push(label+'（本機已移除）');continue;}
   if(sheets.get(record.sheetId)?.deletedAt){conflicts.push(label+'（本機表格在回收筒）');continue;}
   next.records.push(M.clone(record));added++;continue;
  }
  const restoring=Boolean(versioned&&prior?.recycled?.[local.id]===local.deletedAt&&local.deletedAt);
  const left=describe(restoring?{...local,deletedAt:null}:local);
  if(!restoring&&digest(left)===digest(right))continue;
  if(!common&&(!review||local.sheetId!==record.sheetId)&&!(restoring&&digest(left)===digest(right))){conflicts.push(label+'（沒有共同版本）');continue;}
  if((!restoring&&local.deletedAt||sheets.get(local.sheetId)?.deletedAt)&&remoteChanged()){
   conflicts.push(label+'（本機紀錄或表格在回收筒）');continue;
  }
  const result={...local,values:{...local.values}};
  let changed=restoring;
  if(restoring)result.deletedAt=null;
  const fields=new Map((sourceSheets.get(record.sheetId)?.fields||[]).map(field=>[field.id,field]));
  for(const kind of ['fields','values']){
   for(const key of new Set([...Object.keys(right[kind]),...Object.keys(common?.[kind]||left[kind])])){
    const to=right[kind][key],base=common?(common[kind][key]??missing):undefined;
    const field=kind==='values'?fields.get(key):null;
    if(kind==='values'&&removedFields.get(record.sheetId)?.has(key))continue;
    // An exported relation cannot reference recycled rows. Keep those local links
    // and let the tombstone control visibility and subsequent restoration.
    const relation=field?.type==='relation',original=left[kind][key];
    const hidden=versioned&&relation&&Array.isArray(original)?original.filter(id=>recycledIds.has(id)):[];
    let from=original;
    if(hidden.length&&base===digest(original)&&Array.isArray(to)&&to.length===original.length-hidden.length&&
     digest(original.filter(id=>!recycledIds.has(id)))===digest(to))continue;
    if(hidden.length&&base!==digest(original))from=original.filter(id=>!recycledIds.has(id));
    if(!Object.hasOwn(right[kind],key)&&(!field||relation&&(!versioned||managed&&!managed.has(field.targetSheetId))))continue;
    const name=kind==='values'?(field?.label||'自訂欄位'):({title:'標題',notes:'筆記',tags:'標籤',fileLinks:'檔案位置',favoriteTagLinks:'收藏標籤',sheetId:'所屬表格',deletedAt:'回收狀態'}[key]||key);
    const editable=kind==='fields'?['title','notes'].includes(key):['text','longtext','email','phone'].includes(field?.type);
    const maxLength=kind==='fields'?(key==='title'?200:100000):field?.type==='longtext'?20000:2000;
    const fieldReview=review&&!(kind==='fields'&&['sheetId','deletedAt'].includes(key))?
     {id:valueKey(record.id,kind,key),title:local.title,sheet:sourceSheets.get(record.sheetId)?.name,name,editable,maxLength,kind,key}:null;
    const selected=patch(from,to,base,label+' ／ '+name,fieldReview);
    if(selected===from)continue;
    const target=kind==='values'?result.values:result;
    if(relation&&hidden.length)target[key]=[...new Set([...(selected||[]),...hidden])];
    else if(selected===undefined)delete target[key];
    else if(key==='fileLinks')target[key]=selected.map(link=>({...link,favoriteId:local.fileLinks.find(item=>item.path===link.path&&item.type===link.type)?.favoriteId||null}));
    else if(key==='favoriteTagLinks')target[key]=selected.map(link=>({...link,authorized:local.favoriteTagLinks.some(item=>item.tag.toLocaleLowerCase()===link.tag.toLocaleLowerCase()&&item.authorized)}));
    else if(field?.type==='relation'&&Array.isArray(from)&&Array.isArray(selected))target[key]=[...new Set([...selected,...from.filter(id=>!sourceRecords.has(id))])];
    else target[key]=selected;
    changed=true;
   }
  }
  if(changed){result.version=local.version+1;result.updatedAt=now;next.records[next.records.indexOf(local)]=result;updated++;}
 }

 if(conflicts.length)throw new MergeConflict('共享合併有 '+conflicts.length+' 處衝突，未寫入任何變更：'+conflicts.slice(0,8).join('、')+'。請核對本機與來源版本。');
 if(decisions&&consumed.size!==decisions.size)throw new Error('衝突選擇已失效，請重新預覽');
 if(choices.length){
  if(decisions)throw new Error('請處理所有共享衝突後再預覽');
  throw new MergeConflict('請處理 '+choices.length+' 個共享欄位衝突。',choices);
 }
 for(const record of next.records){
  let removed=false;
  for(const id of removedFields.get(record.sheetId)||[]){
   if(Object.hasOwn(record.values,id)){delete record.values[id];removed=true;}
  }
  if(removed&&record.version===originals.get(record.id)?.version){record.version++;record.updatedAt=now;updated++;}
 }

 let document;
 try{document=M.normalizeDocument(next);}
 catch(error){throw new MergeConflict('共享合併後的結構或關聯有衝突，未寫入：'+error.message);}
 // Schema normalization must not implicitly rewrite existing local values.
 for(const [position,record] of document.records.entries()){
  if(digest(describe(record))!==digest(describe(next.records[position])))throw new MergeConflict('表格結構變更會改動未明確合併的紀錄：'+record.title+'，未寫入。');
 }
 return {document,summary:{added,updated,skipped:0,recycled,sourceRecycled:tombstones.length,sheets:incoming.sheets.length}};
}

const contentDigest=({display,sheetFields,...content})=>digest(content);
module.exports={MergeConflict,identity,baseline,matches,older,sameVersion,merge,contentDigest};
