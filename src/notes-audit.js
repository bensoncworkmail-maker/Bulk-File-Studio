'use strict';
const M=require('./notes-model');
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function view(doc){return {doc,sheets:new Map(doc.sheets.map(item=>[item.id,item])),records:new Map(doc.records.map(item=>[item.id,item]))};}
function plain(value){if(value===undefined||value===null||value==='')return '（空白）';if(typeof value==='boolean')return value?'是':'否';if(Array.isArray(value))return value.length?value.join('、'):'（空白）';return typeof value==='object'?JSON.stringify(value):String(value);}
function fieldValue(v,field,value){if(field?.type==='relation')return (value||[]).map(id=>{const record=v.records.get(id);return record?record.title+(record.deletedAt?'（已刪除）':''):'未提供紀錄 '+id;}).join('、')||'（空白）';return plain(value);}
function links(items,tag=false){return (items||[]).map(item=>tag?item.tag+'（'+(item.authorized?'本機已授權':'待確認')+'）':(item.label?item.label+' · ':'')+item.path+'（'+(item.favoriteId?'已連結收藏':'待重新連結')+'）').join('\n')||'（空白）';}
function recordChanges(before,after,beforeView,afterView){
 const result=[],add=(key,label,left,right,format=plain)=>{if(!same(left,right))result.push({key,label,before:format(left,false),after:format(right,true)});};
 add('title','名稱',before?.title,after?.title);add('sheetId','所屬表格',before?.sheetId,after?.sheetId,(id,next)=>(next?afterView:beforeView).sheets.get(id)?.name||plain(id));
 add('notes','筆記',before?.notes,after?.notes);add('tags','標籤',before?.tags,after?.tags);add('deletedAt','回收筒狀態',Boolean(before?.deletedAt),Boolean(after?.deletedAt),value=>value?'已移至回收筒':'有效');
 add('fileLinks','檔案／資料夾連結',before?.fileLinks,after?.fileLinks,value=>links(value));add('favoriteTagLinks','收藏標籤連結',before?.favoriteTagLinks,after?.favoriteTagLinks,value=>links(value,true));
 const leftFields=new Map((beforeView.sheets.get(before?.sheetId)?.fields||[]).map(field=>[field.id,field])),rightFields=new Map((afterView.sheets.get(after?.sheetId)?.fields||[]).map(field=>[field.id,field]));
 for(const id of new Set([...Object.keys(before?.values||{}),...Object.keys(after?.values||{})])){const left=leftFields.get(id),right=rightFields.get(id);add('field:'+id,right?.label||left?.label||id,before?.values?.[id],after?.values?.[id],(value,next)=>fieldValue(next?afterView:beforeView,next?right:left,value));}
 return result;
}
function preserveUnchanged(current,merged){const old=view(current),next=view(merged);merged.records=merged.records.map(record=>{const previous=old.records.get(record.id);return previous&&!recordChanges(previous,record,old,next).length?M.clone(previous):record;});return merged;}
function describeField(field,doc){return field.label+' · '+(M.TYPES[field.type]||field.type)+(field.options?.length?' · 選項：'+field.options.join('、'):'')+(field.targetSheetId?' · 關聯：'+(doc.sheets.find(sheet=>sheet.id===field.targetSheetId)?.name||'未提供表格'):'');}
function structureChanges(before,after){
 const result=[];for(const kind of ['areas','sheets']){const old=new Map(before[kind].map(item=>[item.id,item]));for(const item of after[kind]){const prior=old.get(item.id),changes=[];const add=(key,label,left,right)=>{const describe=(value,doc)=>key==='masterSheetId'?doc.sheets.find(sheet=>sheet.id===value)?.name||plain(value):key==='areaId'?doc.areas.find(area=>area.id===value)?.name||'未分組':plain(value);if(!same(left,right))changes.push({key,label,before:describe(left,before),after:describe(right,after)});};
 for(const [key,label] of (kind==='areas'?[['name','群組名稱'],['category','分類'],['masterSheetId','主表']]:[['name','表格名稱'],['areaId','所屬群組'],['deletedAt','回收筒狀態']]))add(key,label,prior?.[key],item[key]);
 if(kind==='sheets'){const fields=new Map((prior?.fields||[]).map(field=>[field.id,field]));for(const field of item.fields){const left=fields.get(field.id);if(!same(left,field))changes.push({key:field.id,label:'欄位：'+field.label,before:left?describeField(left,before):'（新增欄位）',after:describeField(field,after)});}for(const field of prior?.fields||[])if(!item.fields.some(next=>next.id===field.id))changes.push({key:field.id,label:'移除欄位：'+field.label,before:describeField(field,before),after:'（移除）'});}
 if(changes.length)result.push({kind:kind==='areas'?'群組':'表格',name:item.name,id:item.id,status:prior?'更新':'新增',changes});
 }}return result;
}
function importRows(current,incoming,merged,mode){
 const before=view(current),after=view(merged),original=new Map(current.records.map(item=>[item.id,item])),incomingView=mode==='skip'?view(incoming):after;const added=mode==='copy'?merged.records.slice(current.records.length):null;
 return incoming.records.map((record,index)=>{const next=added?added[index]:after.records.get(record.id),old=original.get(next.id),differences=recordChanges(old,mode==='skip'?record:next,before,incomingView),status=!old?'added':mode==='skip'?'skipped':differences.length?'updated':'unchanged';return {key:next.id,title:next.title,sheet:after.sheets.get(next.sheetId)?.name||'',status,changeCount:differences.length,versionFrom:old?.version||null,versionTo:next.version};});
}
module.exports={view,plain,recordChanges,structureChanges,importRows,preserveUnchanged};
