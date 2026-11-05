'use strict';
const M=require('./notes-model');
function edit(document,input,now=new Date().toISOString()){
 if(!input||!Array.isArray(input.entries)||!input.entries.length||input.entries.length>500||new Set(input.entries.map(item=>item.id)).size!==input.entries.length)throw new Error('請選取同一表格的 1–500 筆紀錄');
 const sheet=document.sheets.find(sheet=>sheet.id===input.sheetId&&!sheet.deletedAt),patch=input.patch;
 if(!sheet||!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!['title','notes','tags','values'].includes(key)))throw new Error('批次欄位設定無效');
 if(Object.hasOwn(patch,'values')&&(!patch.values||typeof patch.values!=='object'||Array.isArray(patch.values)))throw new Error('批次欄位值無效');
 if(patch.values&&Object.keys(patch.values).some(id=>!sheet.fields.some(field=>field.id===id)))throw new Error('欄位已移除，請重新預覽');
 const doc=structuredClone(document),rows=[],parent=M.parentField(doc,sheet);
 for(const entry of input.entries){
  const record=doc.records.find(record=>record.id===entry.id&&record.sheetId===sheet.id&&M.live(doc,record));
  if(!record||record.version!==entry.version)throw new Error('所選紀錄已修改或回收，請重新選取');
  const before=structuredClone(record);
  for(const key of ['title','notes','tags'])if(Object.hasOwn(patch,key))record[key]=structuredClone(patch[key]);
  if(patch.values)record.values={...record.values,...structuredClone(patch.values)};
  if(parent&&patch.values&&Object.hasOwn(patch.values,parent.id)){
   const ids=record.values[parent.id];if(!Array.isArray(ids)||ids.length!==1||!doc.records.some(item=>item.id===ids[0]&&item.sheetId===parent.targetSheetId&&M.live(doc,item)))throw new Error('明細必須保留一筆有效主紀錄');
  }
  const changed=JSON.stringify([before.title,before.notes,before.tags,before.values])!==JSON.stringify([record.title,record.notes,record.tags,record.values]);
  if(changed){record.version++;record.updatedAt=now;rows.push({before,after:record});}
 }
 // Validate all field types, relation IDs, size and total record limits before writing.
 M.normalizeDocument(doc);
 return {document:doc,rows};
}
function copies(document,input,count,uuid,now=new Date().toISOString()){
 if(input.id||!Number.isSafeInteger(count)||count<1||count>500)throw new Error('新增份數請填 1–500，編輯現有紀錄時不可重複建立');
 const sheet=document.sheets.find(sheet=>sheet.id===input.sheetId&&!sheet.deletedAt);if(!sheet)throw new Error('表格已移除');
 const parent=M.parentField(document,sheet),parents=input.values?.[parent?.id];
 if(parent&&(!Array.isArray(parents)||parents.length!==1||!document.records.some(record=>record.id===parents[0]&&record.sheetId===parent.targetSheetId&&M.live(document,record))))throw new Error('明細必須關聯一筆可用主紀錄');
 const doc=structuredClone(document),records=[];
 for(let index=0;index<count;index++)records.push({id:uuid(),sheetId:sheet.id,title:input.title,notes:input.notes||'',tags:input.tags||[],values:structuredClone(input.values||{}),fileLinks:structuredClone(input.fileLinks||[]),favoriteTagLinks:structuredClone(input.favoriteTagLinks||[]),version:1,createdAt:now,updatedAt:now,deletedAt:null});
 doc.records.push(...records);M.normalizeDocument(doc);return {document:doc,records};
}
module.exports={edit,copies};
