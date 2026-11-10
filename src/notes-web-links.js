'use strict';
const M=require('./notes-model'),web=require('./web-link-model');
async function openRecordWebsite({document,recordId,fieldId,shell,clipboard,action='open',selected}){
 const record=document.records.find(item=>item.id===recordId&&M.live(document,item));
 const field=record&&document.sheets.find(sheet=>sheet.id===record.sheetId)?.fields.find(field=>field.id===fieldId);
 if(!field||!['url','text','longtext'].includes(field.type))throw new Error('網址欄位已移除或紀錄不可用');
 if(!['open','copy'].includes(action))throw new Error('網址操作無效');
 const value=record.values[fieldId];
 const url=selected===undefined?web.normalize(value):web.links(value,{whole:field.type==='url'}).find(link=>link.text===selected)?.url;
 if(!url)throw new Error('網址已變更，請重新整理紀錄');
 if(action==='copy'){clipboard.writeText(url);return {copied:true};}
 await shell.openExternal(url);return {opened:true};
}
module.exports={openRecordWebsite};
