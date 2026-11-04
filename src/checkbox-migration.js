'use strict';

function convertCheckboxes(document,previous,next,mappings={},now){
 if(!mappings||typeof mappings!=='object'||Array.isArray(mappings)){
  throw new Error('欄位轉換設定無效');
 }
 const records=document.records.filter(record=>record.sheetId===previous.id);
 const conversions=new Map();
 for(const field of previous.fields){
  const target=next.fields.find(candidate=>candidate.id===field.id);
  if(field.type!=='checkbox'||target?.type!=='select')continue;
  if(!records.some(record=>typeof record.values[field.id]==='boolean'))continue;
  const mapping=mappings[field.id];
  if(!mapping||mapping.checked===mapping.unchecked||!Array.isArray(target.options)||
     !target.options.includes(mapping.checked)||!target.options.includes(mapping.unchecked)){
   throw new Error('請設定「'+field.label+'」勾選與未勾選各自對應的單選值');
  }
  conversions.set(field.id,mapping);
 }
 for(const record of records){
  let changed=false;
  for(const [id,mapping] of conversions){
   const value=record.values[id];
   if(typeof value!=='boolean')continue;
   record.values[id]=value?mapping.checked:mapping.unchecked;
   changed=true;
  }
  if(changed){
   record.version++;
   record.updatedAt=now;
  }
 }
}

module.exports={convertCheckboxes};
