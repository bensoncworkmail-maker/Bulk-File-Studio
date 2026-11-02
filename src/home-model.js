'use strict';
const M=require('./notes-model');
const name=item=>item.label&&item.label!==item.path?item.label:String(item.path).split(/[\\/]/).filter(Boolean).pop()||item.path;
function snapshot({document:doc,favorites=[],tools={views:[],pins:[]}}){
 const sheets=new Map(doc.sheets.filter(sheet=>!sheet.deletedAt).map(sheet=>[sheet.id,sheet])),live=doc.records.filter(record=>M.live(doc,record)),records=new Map(live.map(record=>[record.id,record])),branches=M.masterTableTree(doc),masterSheets=new Set(branches.map(branch=>branch.master.id)),masters=live.filter(record=>masterSheets.has(record.sheetId));
 const recordItem=record=>{const sheet=sheets.get(record.sheetId);return {id:record.id,title:record.title,context:sheet.name,isMaster:masterSheets.has(sheet.id),updatedAt:record.updatedAt};};
 return {counts:{favorites:favorites.length,groups:branches.length,masters:masters.length,details:live.length-masters.length},pinned:(tools.pins||[]).map(id=>records.get(id)).filter(record=>record&&masterSheets.has(record.sheetId)).map(recordItem).slice(0,20),recentRecords:[...live].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.title.localeCompare(b.title)).slice(0,20).map(recordItem),recentFavorites:[...favorites].sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'')).slice(0,20).map(item=>({id:item.id,title:name(item),path:item.path,type:item.type})),groups:branches.map(({master,children})=>({id:master.id,title:master.name,masters:masters.filter(record=>record.sheetId===master.id).length,tables:children.length+1})),views:(tools.views||[]).map(item=>({id:item.id,title:item.name,scope:item.state.scope})).slice(0,20)};
}
module.exports={snapshot};
