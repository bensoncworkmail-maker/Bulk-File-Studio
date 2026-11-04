'use strict';

const M=require('./notes-model');
const P=require('./productivity-model');
const {normalize:normalizeLogs,allowedSheet}=require('./log-view-settings-model');
const PAGE_SIZE=30;

function configuration(input={}){
 const kind=input.kind;
 if(!['logs','planning','snippets'].includes(kind))throw new Error('工具類型無效');
 const sheetId=input.sheetId||'';
 if(sheetId&&!M.ID.test(sheetId))throw new Error('表格無效');
 return {kind,sheetId,scope:input.scope==='master'?'master':'all',query:P.text(input.query||'',256,'搜尋')};
}

function viewData(doc,reminders,snippets,config,filters={},logView){
 const query=P.text(filters.query??config.query,256,'搜尋').toLocaleLowerCase();
 const page=Number.isSafeInteger(filters.page)?Math.max(0,filters.page):0;
 const paginate=rows=>{
  const last=Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1),current=Math.min(page,last);
  return {rows:rows.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE),total:rows.length,page:current,last};
 };
 if(config.kind==='snippets'){
  const categories=[...new Set(snippets.map(item=>item.category).filter(Boolean))].sort();
  const rows=snippets.filter(item=>(!filters.category||item.category===filters.category)&&
   [item.name,item.category,item.body].some(value=>value.toLocaleLowerCase().includes(query)))
   .map(({id,name,category,body})=>({id,title:name,detail:category,summary:body.slice(0,220)}));
  return {...paginate(rows),categories};
 }
 const sheets=doc.sheets.filter(sheet=>!sheet.deletedAt);
 const records=doc.records.filter(record=>M.live(doc,record));
 if(config.kind==='planning'){
  if(filters.mode==='board'){
   const masterLabel=P.masterLabels(doc);
   const tables=sheets.filter(sheet=>sheet.fields.some(field=>field.type==='select'));
   const table=tables.find(sheet=>sheet.id===filters.sheetId)||tables[0];
   const stateFields=table?.fields.filter(field=>field.type==='select')||[];
   const state=stateFields.find(field=>field.id===filters.stateField)||stateFields[0];
   const columns=state?P.board(doc,table.id,state.id):[];
   const rows=columns.filter(column=>!filters.value||column.value===filters.value).flatMap(column=>
    column.records.filter(record=>(record.title+' '+record.notes+' '+masterLabel(record)).toLocaleLowerCase().includes(query))
     .map(record=>({id:record.id,title:record.title,group:column.label,detail:[table.name,masterLabel(record)].filter(Boolean).join(' · '),summary:record.notes.slice(0,180)})));
   return {...paginate(rows),tables:tables.map(({id,name})=>({id,name})),sheetId:table?.id,
    stateFields:stateFields.map(({id,label})=>({id,label})),stateField:state?.id,states:state?.options||[]};
  }
  const month=filters.month||new Date().toLocaleDateString('sv-SE').slice(0,7);
  const byId=new Map(records.map(record=>[record.id,record]));
  const rows=P.agenda(doc,reminders,month)
   .filter(event=>[event.title,event.sheet,event.label,event.master,byId.get(event.recordId)?.notes||''].some(value=>value.toLocaleLowerCase().includes(query)))
   .map(event=>({id:event.recordId,title:event.title,group:event.date,detail:[event.sheet,event.master,event.label].filter(Boolean).join(' · '),eventKind:event.kind}));
  if(filters.mode!=='calendar')return paginate(rows);
  const counts={};
  for(const row of rows)counts[row.group]=(counts[row.group]||0)+1;
  const today=new Date().toLocaleDateString('sv-SE');
  const day=typeof filters.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(filters.day)&&filters.day.startsWith(month+'-')?
   filters.day:today.startsWith(month+'-')?today:month+'-01';
  return {...paginate(rows.filter(row=>row.group===day)),month,day,counts};
 }
 const settings=normalizeLogs(logView);
 const tables=sheets.filter(sheet=>allowedSheet(config,settings,sheet.id));
 if(config.sheetId&&!tables.length)throw new Error('紀錄表格已移除，請更新快捷設定');
 const sort=['recent','oldest','title'].includes(filters.sort)?filters.sort:settings.sort;
 const layout=['list','cards'].includes(filters.layout)?filters.layout:settings.layout;
 const table=tables.find(sheet=>sheet.id===filters.sheetId)||tables.find(sheet=>/^(紀錄|日誌|log|logs)$/i.test(sheet.name))||tables[0];
 const parent=table&&M.parentField(doc,table);
 const masters=parent?records.filter(record=>record.sheetId===parent.targetSheetId):[];
 const masterById=new Map(masters.map(record=>[record.id,record]));
 const master=masterById.get(filters.masterId);
 const dateFields=table?.fields.filter(field=>field.type==='date')||[];
 const dateField=dateFields.find(field=>field.id===filters.dateField);
 const stateField=table?.fields.find(field=>field.id===filters.stateField&&['checkbox','select'].includes(field.type));
 const stateFields=(table?.fields||[]).filter(field=>['checkbox','select'].includes(field.type));
 const states=stateField?.type==='checkbox'?['true','false']:stateField?.options||[];
 const dateValue=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'';
 const from=dateValue(filters.from),to=dateValue(filters.to);
 if(from&&to&&from>to)throw new Error('開始日期必須早於或等於結束日期');
 const rows=[];
 for(const record of records){
  if(record.sheetId!==table?.id)continue;
  if(parent&&(master||config.scope==='master')&&(!master||!record.values[parent.id]?.includes(master.id)))continue;
  const day=dateField?(record.values[dateField.id]||''):new Date(record.updatedAt).toLocaleDateString('sv-SE');
  if((from&&(!day||day<from))||(to&&(!day||day>to)))continue;
  if(stateField&&states.includes(filters.value)&&String(record.values[stateField.id])!==filters.value)continue;
  const fields=table.fields.filter(field=>field.type!=='relation').map(field=>M.cell(doc,field,record.values[field.id]));
  const linked=parent?(record.values[parent.id]||[]).map(id=>masterById.get(id)?.title||'').join('、'):'';
  if(query&&![record.title,record.notes,...record.tags,...fields,linked].some(value=>value.toLocaleLowerCase().includes(query)))continue;
  rows.push({id:record.id,title:record.title,date:day,detail:[day,linked].filter(Boolean).join(' · '),summary:record.notes.slice(0,240),updatedAt:record.updatedAt});
 }
 rows.sort((a,b)=>{
  if(sort==='title')return a.title.localeCompare(b.title,'zh-Hant')||b.date.localeCompare(a.date);
  const dateOrder=a.date.localeCompare(b.date)||a.updatedAt.localeCompare(b.updatedAt);
  return (sort==='oldest'?dateOrder:-dateOrder)||a.title.localeCompare(b.title,'zh-Hant');
 });
 return {...paginate(rows),sort,layout,restricted:!config.sheetId&&settings.scope==='selected',
  tables:tables.map(({id,name})=>({id,name})),sheetId:table?.id,
  masters:masters.map(({id,title})=>({id,title})),masterRequired:Boolean(parent&&config.scope==='master'),
  dateFields:dateFields.map(({id,label})=>({id,label})),
  stateFields:stateFields.map(({id,label})=>({id,label})),states,checkbox:stateField?.type==='checkbox'};
}

module.exports={configuration,viewData};
