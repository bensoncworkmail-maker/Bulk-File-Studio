'use strict';
const M=require('./notes-model'),web=require('./web-link-model');
async function openRecordWebsite({document,recordId,fieldId,shell,clipboard,action='open'}){
 const record=document.records.find(item=>item.id===recordId&&M.live(document,item)),sheet=record&&document.sheets.find(sheet=>sheet.id===record.sheetId);
 if(!record||!sheet.fields.some(field=>field.id===fieldId&&['url','text','longtext'].includes(field.type)))throw new Error('網址欄位已移除或紀錄不可用');
 if(!['open','copy'].includes(action))throw new Error('網址操作無效');
 const url=web.normalize(record.values[fieldId]);if(action==='copy'){clipboard.writeText(url);return {copied:true};}await shell.openExternal(url);return {opened:true};
}
module.exports={openRecordWebsite};
