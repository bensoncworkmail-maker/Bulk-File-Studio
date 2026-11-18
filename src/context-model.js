'use strict';
(() => {
 function snapshot(data,document,productivity,tracking,tools){
  const sheets=new Set(document.sheets.filter(row=>!row.deletedAt).map(row=>row.id)),records=new Map(document.records.filter(row=>!row.deletedAt&&sheets.has(row.sheetId)).map(row=>[row.id,row]));
  const resources=(ids,items,kind)=>ids.map(id=>{const row=items.find(item=>item.id===id);return {id,kind,name:row?.name||'已移除的資源',available:Boolean(row)};});
  return {revision:data.revision,activeContextId:data.contexts.some(row=>row.id===data.activeContextId)?data.activeContextId:null,contexts:data.contexts.map(row=>{const record=records.get(row.masterId);return {id:row.id,name:row.name,masterId:record?.id||null,sheetId:record?.sheetId||null,masterTitle:record?.title||'',missingMaster:Boolean(row.masterId&&!record),resources:[...(record?[{id:record.id,kind:'record',name:record.title,available:true}]:[]),...resources(row.worksetId?[row.worksetId]:[],productivity.worksets,'workset'),...resources(row.trackingIds,tracking.queries,'tracking'),...resources(row.viewIds,tools.views,'view'),...resources(row.snippetIds,productivity.snippets,'snippet')]};})};
 }
 function current(state){return state?.contexts.find(row=>row.id===state.activeContextId)||null;}
 function defaults(state){const row=current(state);return row?{contextId:row.id,name:row.name,masterId:row.masterId,recordId:row.masterId,sheetId:row.sheetId,snippetId:row.resources.find(item=>item.kind==='snippet'&&item.available)?.id||null,trackingId:row.resources.find(item=>item.kind==='tracking'&&item.available)?.id||null}:null;}
 const api=Object.freeze({snapshot,current,defaults});if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.contextModel=api;
})();
