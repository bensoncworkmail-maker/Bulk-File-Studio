'use strict';
const {randomUUID}=require('node:crypto');
// History is explicit, text-only and lives in this process. Never poll the clipboard.
function createClipboardHistory(clipboard){
 let history=[],revision=0;
 const invoke=async(action,value)=>{
  if(action==='list')return history.map(row=>({...row}));
  if(action==='capture'){const epoch=++revision,text=await clipboard.readText();if(epoch!==revision)return history.map(row=>({...row}));if(typeof text!=='string'||!text.trim())throw Error('剪貼簿沒有文字');if(text.length>20000)throw Error('每項最多 20,000 字');history=history.filter(row=>row.text!==text);history.unshift({id:randomUUID(),text,createdAt:new Date().toISOString()});history=history.slice(0,20);return history.map(row=>({...row}));}
  if(action==='clear'){revision++;history=[];return [];}
  if(action==='remove'){revision++;if(typeof value!=='string')throw Error('項目無效');history=history.filter(row=>row.id!==value);return history.map(row=>({...row}));}
  if(action==='copy'){const row=history.find(row=>row.id===value);if(!row)throw Error('剪貼項目已移除');await clipboard.writeText(row.text);return {copied:true};}
  throw Error('浮動工作台操作無效');
 };return invoke;
}
module.exports={createClipboardHistory};
