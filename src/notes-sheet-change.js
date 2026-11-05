'use strict';
const M=require('./notes-model');
const populated=value=>value!==undefined&&value!==null&&value!==''&&(!Array.isArray(value)||value.length>0);
function removedColumns(doc,old,next){
 if(!old)return [];
 return old.fields.filter(field=>!next.fields.some(next=>next.id===field.id)).map(field=>{
  const records=doc.records.filter(record=>record.sheetId===old.id&&populated(record.values[field.id]));
  return {id:field.id,label:field.label,type:field.type,active:records.filter(record=>M.live(doc,record)).length,recycled:records.filter(record=>!M.live(doc,record)).length,
   samples:records.slice(0,10).map(record=>({title:record.title,recycled:!M.live(doc,record),value:field.type==='checkbox'?(record.values[field.id]?'已勾選':'未勾選'):M.cell(doc,field,record.values[field.id])}))};
 });
}
function apply(doc,input,uuid,now,{allowRemoval=false}={}){
 if(!input||typeof input!=='object'||!Array.isArray(input.fields))throw new Error('表格設定無效');
 const old=input.id?doc.sheets.find(sheet=>sheet.id===input.id):null;
 if(input.id&&(!old||old.deletedAt||old.version!==input.expectedVersion))throw new Error('表格已變更或移至回收筒，請重新整理');
 const sheet={id:old?.id||uuid(),name:input.name,areaId:input.areaId===undefined?(old?.areaId||null):input.areaId||null,fields:structuredClone(input.fields),createdAt:old?.createdAt||now,updatedAt:now,deletedAt:null,version:(old?.version||0)+1};
 if(!old&&input.parentMasterId){
  const root=doc.sheets.find(item=>item.id===input.parentMasterId&&!item.deletedAt);if(!root||M.parentField(doc,root))throw new Error('請選取有效主表');let owner=doc.areas.find(area=>area.masterSheetId===root.id);
  if(!owner){owner={id:uuid(),name:root.name,masterSheetId:root.id,category:''};doc.areas.push(owner);root.areaId=owner.id;root.version++;root.updatedAt=now;}sheet.areaId=owner.id;
  if(!sheet.fields.some(field=>field.type==='relation'&&field.targetSheetId===root.id))throw new Error('明細表必須保留所屬主表關聯');
 }else if(!old&&input.asMaster===true){const owner={id:uuid(),name:sheet.name,masterSheetId:sheet.id,category:''};doc.areas.push(owner);sheet.areaId=owner.id;}
 const removed=removedColumns(doc,old,sheet);
 if(old){
  const parent=M.parentField(doc,old),replacement=parent&&sheet.fields.find(field=>field.id===parent.id);
  if(parent&&(!replacement||replacement.type!=='relation'||replacement.targetSheetId!==parent.targetSheetId))throw new Error('「'+parent.label+'」是必要的主從關聯欄位，不能刪除或改變目標；紀錄關聯使用 ID 維持');
  if(!allowRemoval&&removed.some(field=>field.active+field.recycled))throw new Error('「'+removed.filter(field=>field.active+field.recycled).map(field=>field.label).join('、')+'」仍有資料（包含回收筒），請先使用欄位刪除預覽，確認並備份後再移除');
  const before=new Map(doc.records.filter(record=>record.sheetId===old.id).map(record=>[record.id,{version:record.version,values:JSON.stringify(record.values)}]));
  require('./checkbox-migration').convertCheckboxes(doc,old,sheet,input.checkboxMappings,now);
  if(old.areaId!==sheet.areaId)for(const area of doc.areas)if(area.masterSheetId===old.id)area.masterSheetId=null;
  for(const record of doc.records.filter(record=>record.sheetId===old.id)){
   for(const field of removed)delete record.values[field.id];
   if(JSON.stringify(record.values)!==before.get(record.id).values){record.version=before.get(record.id).version+1;record.updatedAt=now;}
  }
  doc.sheets[doc.sheets.indexOf(old)]=sheet;
 }else doc.sheets.push(sheet);
 return {id:sheet.id,removed};
}
module.exports={apply,removedColumns,populated};
