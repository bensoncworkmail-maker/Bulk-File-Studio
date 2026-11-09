'use strict';
(() => {
 const TYPES=Object.freeze({checklist:'待辦清單',workflow:'工作流程',timeline:'時間軸'});
 const STATES=Object.freeze({pending:'待處理',active:'進行中',done:'已完成'});
 const MAX_ROWS=30,MAX_LABEL=180;
 const isType=type=>Object.hasOwn(TYPES,type);
 function normalize(type,items){
  if(!isType(type)||!Array.isArray(items)||items.length>MAX_ROWS)throw new Error('清單最多 '+MAX_ROWS+' 個項目');
  return items.map(item=>{
   if(!item||typeof item.label!=='string'||!item.label.trim()||item.label.length>MAX_LABEL||/[\x00-\x1f]/.test(item.label))throw new Error('清單項目需要 1–'+MAX_LABEL+' 字的名稱');
   const label=item.label.trim();
   if(type==='checklist'){
    if(typeof item.done!=='boolean')throw new Error('待辦勾選狀態無效');
    return {label,done:item.done};
   }
   if(type==='workflow'){
    if(!Object.hasOwn(STATES,item.status))throw new Error('工作流程狀態無效');
    return {label,status:item.status};
   }
   const date=item.date;
   if(date!==''&&(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    !Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new Error('時間軸日期無效');
   return {label,date};
  });
 }
 function format(type,items){
  const rows=type==='timeline'?[...items].sort((a,b)=>(a.date||'9999-99-99').localeCompare(b.date||'9999-99-99')):items;
  return rows.map((item,index)=>{
   if(type==='checklist')return (item.done?'[x] ':'[ ] ')+item.label;
   if(type==='workflow')return (index+1)+'. ['+STATES[item.status]+'] '+item.label;
   return (item.date||'未設定日期')+' · '+item.label;
  }).join('\n');
 }
 const api=Object.freeze({TYPES,STATES,MAX_ROWS,MAX_LABEL,isType,normalize,format});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else window.structuredNoteModel=api;
})();
