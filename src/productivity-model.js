'use strict';
(() => {
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const text=(value,max,label,required=false)=>{if(typeof value!=='string'||value.length>max||/\0/.test(value)||required&&!value.trim())throw new Error(label+'無效');return value.trim();};
 const ids=value=>{if(!Array.isArray(value)||value.length>100||value.some(id=>!ID.test(id))||new Set(value).size!==value.length)throw new Error('選取項目無效');return [...value];};
 function entry(kind,input){
  if(!input||!ID.test(input.id))throw new Error('工具識別碼無效');
  const out={id:input.id,name:text(input.name,100,'名稱',true)};
  if(kind==='snippets'){let shortcut=input.shortcut||'';if(shortcut){const S=typeof module!=='undefined'&&module.exports?require('./global-shortcuts'):globalThis.globalShortcutModel;shortcut=S.normalize(shortcut);if(!shortcut)throw new Error('文字片段快捷鍵無效');}return {...out,...(shortcut?{shortcut}:{}),category:text(input.category||'',60,'分類'),body:(text(input.body,20000,'文字內容',true),input.body)};}
  if(kind==='worksets'){const favoriteIds=ids(input.favoriteIds),recordIds=ids(input.recordIds);if(favoriteIds.length>20)throw new Error('工作集每次最多開啟 20 個收藏位置');const paths=input.paths||[];if(!Array.isArray(paths)||paths.length+favoriteIds.length>20||paths.some(p=>typeof p!=='string'||!p.trim()||p.length>4096||/[\x00-\x1f]/.test(p)))throw new Error('每個工作集最多 20 個檔案或資料夾位置');if(!favoriteIds.length&&!recordIds.length&&!paths.length)throw new Error('工作集至少需要一個位置或紀錄');return {...out,favoriteIds,recordIds,...(paths.length?{paths:[...new Set(paths)]}:{})};}
  if(kind!=='rules')throw new Error('工具類型無效');
  const extensions=text(input.extensions||'',200,'副檔名').toLowerCase().split(/[,，\s]+/).filter(Boolean).map(value=>value.replace(/^\./,''));
  if(extensions.some(value=>! /^[a-z0-9_-]{1,20}$/.test(value)))throw new Error('副檔名格式無效');
  const tags=(input.tags||[]).map(value=>text(value,32,'標籤',true));if(tags.length>20)throw new Error('最多 20 個標籤');
  for(const key of ['after','before'])if(input[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(input[key])||!Number.isFinite(Date.parse(input[key]+'T00:00:00Z'))||new Date(input[key]+'T00:00:00Z').toISOString().slice(0,10)!==input[key]))throw new Error('日期無效');
  if(input.after&&input.before&&input.after>input.before)throw new Error('日期範圍無效');
  const prefix=text(input.prefix||'',100,'檔名前綴');if(/[<>:"/\\|?*\x00-\x1f]/.test(prefix))throw new Error('檔名前綴包含不允許的字元');
  return {...out,extensions:[...new Set(extensions)].join(','),contains:text(input.contains||'',100,'名稱條件'),after:input.after||'',before:input.before||'',prefix,tags:[...new Set(tags)],folder:text(input.folder||'',4096,'目標資料夾')};
 }
 function normalize(input){
  if(!input||input.version!==1)throw new Error('工具箱資料格式無效');const out={version:1};
  for(const kind of ['rules','worksets','snippets']){if(!Array.isArray(input[kind])||input[kind].length>(kind==='snippets'?500:100))throw new Error('工具數量超過上限');out[kind]=input[kind].map(value=>entry(kind,value));if(new Set(out[kind].map(value=>value.id)).size!==out[kind].length)throw new Error('工具識別碼重複');}const keys=out.snippets.map(item=>item.shortcut).filter(Boolean);if(new Set(keys).size!==keys.length)throw new Error('文字片段快捷鍵重複');return out;
 }
 function matches(rule,file){const extension=file.name.includes('.')?file.name.split('.').pop().toLowerCase():'';return (!rule.extensions||rule.extensions.split(',').includes(extension))&&(!rule.contains||file.name.toLocaleLowerCase().includes(rule.contains.toLocaleLowerCase()))&&(!rule.after||file.date>=rule.after)&&(!rule.before||file.date<=rule.before);}
 function expandSnippet(body,{today,customer}={}){return body.replace(/\{\{(today|customer)\}\}/g,(_,key)=>key==='today'?today||new Date().toLocaleDateString('sv-SE'):customer||'');}
 function masterLabels(doc){
  const sheets=new Map(doc.sheets.filter(sheet=>!sheet.deletedAt).map(sheet=>[sheet.id,sheet]));
  const areas=new Map((doc.areas||[]).map(area=>[area.id,area.masterSheetId]));
  const records=new Map(doc.records.filter(record=>!record.deletedAt&&sheets.has(record.sheetId)).map(record=>[record.id,record]));
  const fields=new Map([...sheets.values()].map(sheet=>{
   const masterId=areas.get(sheet.areaId);
   return [sheet.id,masterId!==sheet.id?sheet.fields.find(field=>field.type==='relation'&&field.targetSheetId===masterId):undefined];
  }));
  return record=>{
   const parent=fields.get(record.sheetId);
   if(!parent)return '';
   return (record.values[parent.id]||[]).map(id=>records.get(id))
    .filter(master=>master?.sheetId===parent.targetSheetId).map(master=>master.title).join('、');
  };
 }
 function agenda(document,reminders,month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('月份無效');const sheets=new Map(document.sheets.filter(value=>!value.deletedAt).map(value=>[value.id,value])),records=new Map(document.records.filter(value=>!value.deletedAt&&sheets.has(value.sheetId)).map(value=>[value.id,value])),events=[],masterLabel=masterLabels(document);
  for(const record of records.values())for(const field of sheets.get(record.sheetId).fields.filter(value=>value.type==='date')){const date=record.values[field.id];if(date?.startsWith(month+'-'))events.push({recordId:record.id,title:record.title,sheet:sheets.get(record.sheetId).name,label:field.label,master:masterLabel(record),date,kind:'date'});}
  for(const item of reminders){const record=records.get(item.recordId);if(!record&&!item.standalone)continue;const time=new Date(item.at),date=time.getFullYear()+'-'+String(time.getMonth()+1).padStart(2,'0')+'-'+String(time.getDate()).padStart(2,'0');if(date.startsWith(month+'-'))events.push({recordId:record?.id||null,...(item.standalone?{standalone:true,reminderId:item.id}:{}),title:item.standalone?.title||record?.title||'草稿提醒',sheet:item.standalone?'草稿提醒':sheets.get(record.sheetId).name,label:'提醒',master:record?masterLabel(record):'',date,at:item.at,status:item.status,kind:'reminder'});}
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
 }
 function board(document,sheetId,fieldId){const sheet=document.sheets.find(value=>value.id===sheetId&&!value.deletedAt),field=sheet?.fields.find(value=>value.id===fieldId&&value.type==='select');if(!field)throw new Error('請選取單選狀態欄位');return ['',...field.options].map(value=>({value,label:value||'未設定',records:document.records.filter(record=>record.sheetId===sheetId&&!record.deletedAt&&(record.values[fieldId]||'')===value)}));}
 const api={ID,text,entry,normalize,matches,expandSnippet,agenda,board,masterLabels};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.studioProductivity=Object.freeze(api);
})();
