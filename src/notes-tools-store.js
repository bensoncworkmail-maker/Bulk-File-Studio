'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),M=require('./notes-model');
const T=require('./notes-table-state');
const {assertLocalPath}=require('./offline-policy');
const LIMIT=4*1024*1024,BOOKMARK_LIMIT=500;
function bookmarkKey(kind,id){
 if(!['record','sheet'].includes(kind))throw new Error('收藏類型無效');
 return kind+':'+M.id(id);
}
function bookmarkTags(tags){
 if(!Array.isArray(tags)||tags.length>20)throw new Error('每項最多 20 個標籤');
 return [...new Map(tags.map(value=>M.text(value,32,'標籤',true).trim()).map(value=>[value.toLocaleLowerCase(),value])).values()];
}
const {bookmarkTarget,workspaceBookmarks,trackingBookmark}=require('./workspace-bookmark-model');
function view(input){
 if(!input||typeof input!=='object')throw new Error('檢視設定無效');const scopes=['sheet','master','area','all','masters','details'];if(!scopes.includes(input.scope))throw new Error('搜尋範圍無效');
 const out={scope:input.scope,query:M.text(input.query||'',256,'搜尋文字'),tag:M.text(input.tag||'',32,'標籤'),sort:input.sort==='title'?'title':'updated',mode:['list','cards','grid'].includes(input.mode)?input.mode:'list',due:['all','overdue','7','30','90'].includes(input.due)?input.due:'all',dateField:input.dateField==='updatedAt'?'updatedAt':input.dateField?M.id(input.dateField):''};
 if(input.statusFilter!==undefined)out.statusFilter=T.normalizeFilter(input.statusFilter);
 if(input.sortKey!==undefined){if(typeof input.sortKey!=='string'||!['title','updatedAt','tags','context','masters','summary'].includes(input.sortKey)&&!M.ID.test(input.sortKey))throw new Error('排序欄位無效');out.sortKey=input.sortKey;out.sortDirection=input.sortDirection==='desc'?'desc':'asc';}
 for(const key of ['sheetId','masterId'])out[key]=input[key]?M.id(input[key]):null;out.areaId=['all','ungrouped'].includes(input.areaId)?input.areaId:M.id(input.areaId);return out;
}
class NotesToolsStore{
 constructor(filename){
  assertLocalPath(filename);this.filename=filename;this.data={version:1,pins:[],views:[],templates:[]};
  try{
   if(fs.statSync(filename).size>LIMIT)throw new Error('工作區工具設定過大');
   this.data=normalizeTools(JSON.parse(fs.readFileSync(filename,'utf8')));
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }
 cleanTemplate(input){const doc=M.normalizeDocument(input);if(doc.records.length||doc.areas.length!==1||doc.sheets.some(sheet=>sheet.deletedAt))throw new Error('範本只可包含一個群組的空白表格');return doc;}
 get(){return M.clone(this.data);}
 change(task){const next=this.get(),result=task(next),text=JSON.stringify(next);if(Buffer.byteLength(text)>LIMIT)throw new Error('工作區工具設定超過 4 MB');fs.mkdirSync(path.dirname(this.filename),{recursive:true});const temp=this.filename+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,text,{encoding:'utf8',mode:0o600,flag:'wx'});fs.renameSync(temp,this.filename);}finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}this.data=next;return result??this.get();}
 saveView(name,state){name=M.text(name,100,'檢視名稱',true).trim();state=view(state);return this.change(data=>{if(data.views.length>=50)throw new Error('最多 50 個儲存檢視');data.views.push({id:crypto.randomUUID(),name,state});});}
 saveTemplate(name,doc,areaId){M.id(areaId);name=M.text(name,100,'範本名稱',true).trim();const data=M.exportPackage(doc,{scope:'area',id:areaId});data.document.records=[];const cleaned=this.cleanTemplate(data.document);return this.change(data=>{if(data.templates.length>=20)throw new Error('最多 20 個自訂範本');data.templates.push({id:crypto.randomUUID(),name,document:cleaned});});}
 remove(kind,id){if(!['views','templates'].includes(kind))throw new Error('工具類型無效');M.id(id);return this.change(data=>{data[kind]=data[kind].filter(item=>item.id!==id);});}
 pin(doc,id){const record=doc.records.find(record=>record.id===id&&M.live(doc,record)&&doc.areas.some(area=>area.masterSheetId===record.sheetId));if(!record)throw new Error('請選擇可用的主紀錄');return this.change(data=>{if(data.pins.includes(id))data.pins=data.pins.filter(value=>value!==id);else{if(data.pins.length>=100)throw new Error('最多釘選 100 筆');data.pins.push(id);}});}
 setBookmark(doc,kind,id,enabled){
  bookmarkKey(kind,id);if(typeof enabled!=='boolean')throw new Error('收藏狀態無效');
  const existing=this.data.bookmarks?.find(item=>item.kind===kind&&item.id===id);
  if(enabled&&existing||!enabled&&!existing&&(kind!=='record'||!trackingBookmark(doc,this.data,id)))return;
  return this.batchBookmarks(doc,[{kind,id}],enabled?'save':'remove');
 }
 setBookmarkTags(kind,id,tags){
  const key=bookmarkKey(kind,id),next=bookmarkTags(tags);
  this.change(data=>{
   const item=data.bookmarks?.find(item=>bookmarkKey(item.kind,item.id)===key);
   if(!item)throw new Error('收藏已移除');
   item.tags=next;
  });
 }
 batchBookmarks(doc,targets,action,tags=[],options={}){
  if(!Array.isArray(targets)||!targets.length||targets.length>M.LIMITS.records+BOOKMARK_LIMIT)throw new Error('請選擇 1 至 '+(M.LIMITS.records+BOOKMARK_LIMIT)+' 個收藏項目');
  if(!['save','addTags','clearTags','remove'].includes(action))throw new Error('收藏操作無效');
  const keys=targets.map(item=>bookmarkKey(item?.kind,item?.id));
  if(new Set(keys).size!==keys.length)throw new Error('收藏項目重複');
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['followRecords','resetExclusions'].includes(key)||typeof options[key]!=='boolean'))throw new Error('整表收藏選項無效');
  if(Object.keys(options).length&&(action!=='save'||targets.some(item=>item.kind!=='sheet')))throw new Error('整表收藏選項只適用表格');
  const nextTags=bookmarkTags(tags),selected=new Set(keys);
  this.change(data=>{
   let items=data.bookmarks||[];
   if(action==='remove'){
    items=items.filter(item=>!selected.has(bookmarkKey(item.kind,item.id)));
    const records=new Map(doc.records.map(item=>[item.id,item]));
    for(const table of items.filter(item=>item.kind==='sheet'&&item.followRecords)){
     const excluded=new Set(table.excludedRecordIds||[]);
     for(const target of targets)if(target.kind==='record'&&records.get(target.id)?.sheetId===table.id)excluded.add(target.id);
     if(excluded.size>M.LIMITS.records)throw new Error('表格排除紀錄過多，請重新納入後再排除');
     table.excludedRecordIds=[...excluded];
    }
   }
   else for(const target of targets){
    const key=bookmarkKey(target.kind,target.id);
    let item=items.find(item=>bookmarkKey(item.kind,item.id)===key);
    if(action==='clearTags'){
     if(item)item.tags=[];
     continue;
    }
    const live=bookmarkTarget(doc,target.kind,target.id);
    if(!live)throw new Error('工作區項目已移除，請重新整理收藏');
    if(!item){
     if(items.length>=BOOKMARK_LIMIT)throw new Error('最多收藏 '+BOOKMARK_LIMIT+' 個工作區項目');
     item={kind:target.kind,id:target.id,title:live.title,tags:[],addedAt:new Date().toISOString()};items.unshift(item);
    }
    if(target.kind==='record')for(const table of items.filter(item=>item.kind==='sheet'&&item.followRecords&&item.id===doc.records.find(record=>record.id===target.id)?.sheetId))table.excludedRecordIds=(table.excludedRecordIds||[]).filter(id=>id!==target.id);
    if(target.kind==='sheet'&&Object.hasOwn(options,'followRecords'))item.followRecords=options.followRecords;
    if(target.kind==='sheet'&&options.resetExclusions)item.excludedRecordIds=[];
    item.tags=action==='save'?nextTags:bookmarkTags([...item.tags,...nextTags].filter((tag,index,list)=>list.findIndex(value=>value.toLocaleLowerCase()===tag.toLocaleLowerCase())===index));
   }
   data.bookmarks=items;
  });
 }
 setLogPin(doc,id,pinned){
  M.id(id);
  if(typeof pinned!=='boolean')throw new Error('釘選狀態無效');
  const current=this.data.logPins||[];
  if(current.includes(id)===pinned)return;
  this.change(data=>{
   const liveIds=new Set(doc.records.filter(record=>M.live(doc,record)).map(record=>record.id));
   const ids=current.filter(value=>value!==id&&liveIds.has(value));
   if(pinned){
    if(!liveIds.has(id))throw new Error('紀錄已移除');
    if(ids.length>=100)throw new Error('最多釘選 100 筆跟進紀錄');
    ids.unshift(id);
   }
   data.logPins=ids;
  });
 }
}
function workspaceItems(doc,pins,query=''){
 const matches=M.searchRecords(doc,{scope:'all',query}),found=new Set(matches.map(record=>record.id));for(const record of matches){const sheet=doc.sheets.find(sheet=>sheet.id===record.sheetId),parent=M.parentField(doc,sheet);if(parent)for(const id of record.values[parent.id]||[])found.add(id);}
 const records=doc.records.filter(record=>found.has(record.id)&&M.live(doc,record)&&doc.areas.some(area=>area.masterSheetId===record.sheetId)).sort((a,b)=>Number(pins.includes(b.id))-Number(pins.includes(a.id))||b.updatedAt.localeCompare(a.updatedAt));
 return {total:records.length,items:records.slice(0,50).map(record=>{const context=M.recordContext(doc,record),related=M.linked(doc,record.id),details=[record,...related].flatMap(item=>doc.sheets.find(sheet=>sheet.id===item.sheetId).fields.filter(field=>['phone','email'].includes(field.type)).map(field=>field.label+'：'+M.cell(doc,field,item.values[field.id]))).filter(value=>!value.endsWith('：')).slice(0,5);return {id:record.id,title:record.title,group:context.area,pinned:pins.includes(record.id),summary:details.join(' · '),details:related.length};})};
}
function contactText(doc,id){const record=doc.records.find(record=>record.id===id&&M.live(doc,record)&&doc.areas.some(area=>area.masterSheetId===record.sheetId));if(!record)throw new Error('主紀錄已移除');return [record.title,...[record,...M.linked(doc,id)].flatMap(item=>doc.sheets.find(sheet=>sheet.id===item.sheetId).fields.filter(field=>['phone','email'].includes(field.type)&&item.values[field.id]).map(field=>(item.id===id?'':item.title+' · ')+field.label+'：'+M.cell(doc,field,item.values[field.id]))).slice(0,20)].join('\n');}
function normalizeTools(data){if(!data||data.version!==1||!Array.isArray(data.pins)||data.pins.length>100||!Array.isArray(data.views)||data.views.length>50||!Array.isArray(data.templates)||data.templates.length>20)throw new Error('工作區工具設定無效');const result={version:1,pins:[...new Set(data.pins.map(M.id))],views:data.views.map(item=>({id:M.id(item.id),name:M.text(item.name,100,'檢視名稱',true),state:view(item.state)})),templates:data.templates.map(item=>({id:M.id(item.id),name:M.text(item.name,100,'範本名稱',true),document:NotesToolsStore.prototype.cleanTemplate(item.document)}))};if(data.logPins!==undefined){
 if(!Array.isArray(data.logPins)||data.logPins.length>100)throw new Error('跟進紀錄釘選設定無效');
 result.logPins=[...new Set(data.logPins.map(M.id))];
}
if(data.bookmarks!==undefined){
 if(!Array.isArray(data.bookmarks)||data.bookmarks.length>BOOKMARK_LIMIT)throw new Error('工作區收藏設定無效');
 const keys=new Set();
 result.bookmarks=data.bookmarks.map(item=>{
  const key=bookmarkKey(item?.kind,item?.id);
  if(keys.has(key))throw new Error('工作區收藏重複');
  keys.add(key);
  if(typeof item.addedAt!=='string'||!Number.isFinite(Date.parse(item.addedAt)))throw new Error('收藏時間無效');
  const result={kind:item.kind,id:item.id,title:M.text(item.title,200,'收藏名稱',true),tags:bookmarkTags(item.tags),addedAt:item.addedAt};
  if(item.followRecords!==undefined){if(item.kind!=='sheet'||typeof item.followRecords!=='boolean')throw new Error('整表收藏選項無效');result.followRecords=item.followRecords;}
  if(item.excludedRecordIds!==undefined){if(item.kind!=='sheet'||!Array.isArray(item.excludedRecordIds)||item.excludedRecordIds.length>M.LIMITS.records)throw new Error('表格排除紀錄無效');result.excludedRecordIds=[...new Set(item.excludedRecordIds.map(M.id))];}
  return result;
 });
}
if(Buffer.byteLength(JSON.stringify(result))>LIMIT)throw new Error('工作區工具設定過大');return result;}
module.exports={NotesToolsStore,normalizeView:view,normalizeTools,workspaceItems,workspaceBookmarks,contactText};
