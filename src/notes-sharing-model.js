'use strict';
const M=require('./notes-model');
function scope(value){if(value===undefined||value===null)return {mode:'all',masterIds:[]};if(!value||!['all','masters'].includes(value.mode)||!Array.isArray(value.masterIds)||value.masterIds.length>100||value.masterIds.some(id=>!M.ID.test(id))||new Set(value.masterIds).size!==value.masterIds.length||value.mode==='masters'&&!value.masterIds.length)throw new Error('請選取至少一張有效主表');return {mode:value.mode,masterIds:value.mode==='all'?[]:[...value.masterIds]};}
function managedSheets(doc,config){
 if(config.mode==='all')return new Set(doc.sheets.map(sheet=>sheet.id));
 return new Set(doc.sheets.filter(sheet=>config.masterIds.includes(sheet.id)||
  config.masterIds.includes(M.parentField(doc,sheet)?.targetSheetId)).map(sheet=>sheet.id));
}
function shareSnapshot(doc,config){
 const data=M.exportPackage(doc,config.mode==='all'?{scope:'all'}:{scope:'masters',masterIds:config.masterIds});
 const managed=managedSheets(doc,config),included=new Set(data.document.sheets.map(sheet=>sheet.id));
 return {...data,tombstones:doc.records.filter(record=>record.deletedAt&&managed.has(record.sheetId)&&included.has(record.sheetId))
  .map(({id,sheetId,deletedAt})=>({id,sheetId,deletedAt}))};
}
function project(input,selection){
 const config=receivingScope(input.sharing?.scope,selection),doc=M.readPackage(input);
 if(input.packageVersion===5){
  const published=scope(input.sharing?.scope);
  require('./notes-share-commit').validate(input,doc,published);
  const allowed=managedSheets(doc,published);
  if(input.tombstones.some(item=>!allowed.has(item.sheetId)))throw new Error('共享回收標記超出發布範圍');
 }
 const managed=config.mode==='all'?null:new Set(M.masterTableTree(doc).filter(branch=>config.masterIds.includes(branch.master.id)).flatMap(branch=>[branch.master.id,...branch.children.map(sheet=>sheet.id)]));
 const data=managed?M.exportPackage(doc,{scope:'masters',masterIds:config.masterIds}):input;
 const tombstones=input.packageVersion===5?input.tombstones.filter(item=>!managed||managed.has(item.sheetId)):[];
 return {data,managed,config,tombstones,commit:input.packageVersion===5?input.sharing.commit:null};
}
function merge(current,input,mode,makeId,now,selection){
 const projected=project(input,selection),incoming=M.readPackage(projected.data);
 if(!projected.managed||mode==='copy')return {incoming,...M.mergeDocument(current,incoming,mode,makeId,now),scope:projected.config};
 const managed=new Set(projected.managed);for(const sheet of current.sheets)if(projected.config.masterIds.includes(sheet.id)||projected.config.masterIds.includes(M.parentField(current,sheet)?.targetSheetId))managed.add(sheet.id);
 const outsideSheets=current.sheets.filter(sheet=>!managed.has(sheet.id)),outsideAreas=new Set(outsideSheets.map(sheet=>sheet.areaId).filter(Boolean)),preservedSheets=new Map(outsideSheets.map(sheet=>[sheet.id,sheet])),preservedAreas=new Map(current.areas.filter(area=>outsideAreas.has(area.id)||!managed.has(area.masterSheetId)).map(area=>[area.id,area]));
 const merged=M.mergeDocument(current,incoming,mode,makeId,now,{preserveSheets:new Set(preservedSheets.keys()),preserveAreas:new Set(preservedAreas.keys())}),result=merged.document;
 result.sheets=result.sheets.map(sheet=>M.clone(preservedSheets.get(sheet.id)||sheet));for(const sheet of outsideSheets)if(!result.sheets.some(next=>next.id===sheet.id))result.sheets.push(M.clone(sheet));
 result.areas=result.areas.map(area=>M.clone(preservedAreas.get(area.id)||area));for(const area of preservedAreas.values())if(!result.areas.some(next=>next.id===area.id))result.areas.push(M.clone(area));
 if(mode==='clone'){result.id=current.id;for(const record of current.records)if(!managed.has(record.sheetId))result.records.push(M.clone(record));}
 try{merged.document=M.normalizeDocument(result);}catch(error){throw new Error('指定主表的關聯與本機資料衝突，已停止匯入；其他表格未變更。'+error.message);}
 const ids=new Set(merged.document.records.map(record=>record.id));if(mode==='clone')merged.summary.removed=current.records.filter(record=>!ids.has(record.id)).length;
 return {incoming,...merged,scope:projected.config};
}
function receivingScope(published,requested){const a=scope(published),b=scope(requested);if(a.mode==='all')return b;if(b.mode==='all')return a;return scope({mode:'masters',masterIds:a.masterIds.filter(id=>b.masterIds.includes(id))});}
module.exports={scope,shareSnapshot,project,merge,receivingScope};
