'use strict';
(() => {
 const M=typeof module!=='undefined'&&module.exports?require('./notes-model'):window.notesModel;
 function index(doc){return {records:new Map(doc.records.map(item=>[item.id,item])),sheets:new Map(doc.sheets.map(item=>[item.id,item])),areas:new Map(doc.areas.map(item=>[item.id,item])),masterSummaries:new Map()};}
 function bookmarkTarget(doc,kind,id,maps=index(doc)){
  const record=kind==='record'?maps.records.get(id):null;
  if(kind==='record'&&(!record||!M.live(doc,record)))return null;
  const sheet=maps.sheets.get(record?.sheetId||id);if(!sheet||sheet.deletedAt)return null;
  const area=maps.areas.get(sheet.areaId),type=record?'record':area?.masterSheetId===id?'master':M.parentField(doc,sheet)?'detail':'table',parent=M.parentField(doc,sheet);
  const masters=record&&parent?(record.values[parent.id]||[]).slice(0,5).map(id=>maps.records.get(id)).filter(item=>item&&M.live(doc,item)).map(item=>{
   if(!maps.masterSummaries.has(item.id)){
    const values=[];
    for(const field of maps.sheets.get(item.sheetId).fields){
     if(field.type==='relation')continue;const value=M.cell(doc,field,item.values[field.id]);
     if(value){const text=field.label+'：'+value;values.push(text.length>200?text.slice(0,199)+'…':text);if(values.length===3)break;}
    }
    maps.masterSummaries.set(item.id,{id:item.id,title:item.title,values});
   }
   return maps.masterSummaries.get(item.id);
  }):[];
  return {title:record?.title||sheet.name,type,masters,context:[area?.name,record?sheet.name:null].filter(Boolean).join(' ／ ')};
 }
 function trackingBookmark(doc,tools,recordId){
  const record=doc.records.find(item=>item.id===recordId&&M.live(doc,item));
  return record?(tools.bookmarks||[]).find(item=>item.kind==='sheet'&&item.id===record.sheetId&&item.followRecords===true&&!(item.excludedRecordIds||[]).includes(record.id)):undefined;
 }
 function workspaceBookmarks(doc,tools,{inheritTags=true}={}){
  const maps=index(doc),pins=new Set(tools.logPins||[]),bookmarks=tools.bookmarks||[],rows=[],byKey=new Map();
  for(const item of bookmarks){
   const owner=item.kind==='record'?maps.records.get(item.id):null;
   if(owner&&!M.live(doc,owner)&&bookmarks.some(table=>table.kind==='sheet'&&table.id===owner.sheetId&&table.followRecords&&!(table.excludedRecordIds||[]).includes(item.id)))continue;
   const target=bookmarkTarget(doc,item.kind,item.id,maps),row={...item,...target,type:target?.type||(item.kind==='sheet'?'table':'record'),available:Boolean(target),saved:true,manual:true,tracked:false,ownTags:[...item.tags],logPinned:item.kind==='record'&&pins.has(item.id)};
   rows.push(row);byKey.set(item.kind+':'+item.id,row);
  }
  for(const table of bookmarks.filter(item=>item.kind==='sheet'&&item.followRecords&&maps.sheets.has(item.id)&&!maps.sheets.get(item.id).deletedAt)){
   const excluded=new Set(table.excludedRecordIds||[]);let followedCount=0;
   for(const record of doc.records){
    if(record.sheetId!==table.id||excluded.has(record.id)||!M.live(doc,record))continue;
    followedCount++;
    let row=byKey.get('record:'+record.id);
    if(!row){row={...bookmarkTarget(doc,'record',record.id,maps),kind:'record',id:record.id,tags:[],ownTags:[],available:true,saved:true,manual:false,tracked:true,addedAt:table.addedAt,logPinned:pins.has(record.id)};rows.push(row);byKey.set('record:'+record.id,row);}
    row.tracked=true;row.trackedBy={id:table.id,title:maps.sheets.get(table.id).name};
    if(inheritTags)row.tags=[...new Map([...row.tags,...table.tags].map(tag=>[tag.toLocaleLowerCase(),tag])).values()];
   }
   byKey.get('sheet:'+table.id).followedCount=followedCount;
  }
  for(const id of pins){
   if(byKey.has('record:'+id))continue;
   const target=bookmarkTarget(doc,'record',id,maps);if(target)rows.push({...target,id,kind:'record',tags:[],ownTags:[],available:true,saved:false,manual:false,tracked:false,logPinned:true});
  }
  return rows;
 }
 const api={bookmarkTarget,trackingBookmark,workspaceBookmarks};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.workspaceBookmarkModel=Object.freeze(api);
})();
