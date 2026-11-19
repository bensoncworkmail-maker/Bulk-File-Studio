'use strict';
const {randomUUID}=require('node:crypto');
// History is explicit, text-only and lives in this process. Never poll the clipboard.
function register({handle,clipboard,configure,openPage,openTool,idleCollapse}){
 let history=[],revision=0;
 handle('floating-workspace',async(_,action,value)=>{
  if(action==='idle-collapse')return idleCollapse();
  if(action==='panel'){if(!['files','planning','snippets','clipboard'].includes(value))throw Error('浮動分頁無效');return configure({floatingLastPanel:value});}
  if(action==='mode'){if(!['classic','bar','dock','bubble'].includes(value))throw Error('入口模式無效');return configure({floatingLauncher:value});}
  if(action==='page'){if(!['tracking','settings'].includes(value))throw Error('頁面無效');openPage(value);return {opened:true};}
  if(action==='tool'){if(!['planning','snippets'].includes(value))throw Error('獨立工具無效');return openTool(value);}
  if(action==='list')return history.map(row=>({...row}));
  if(action==='capture'){const epoch=++revision,text=await clipboard.readText();if(epoch!==revision)return history.map(row=>({...row}));if(typeof text!=='string'||!text.trim())throw Error('剪貼簿沒有文字');if(text.length>20000)throw Error('每項最多 20,000 字');history=history.filter(row=>row.text!==text);history.unshift({id:randomUUID(),text,createdAt:new Date().toISOString()});history=history.slice(0,20);return history.map(row=>({...row}));}
  if(action==='clear'){revision++;history=[];return [];}
  if(action==='remove'){revision++;if(typeof value!=='string')throw Error('項目無效');history=history.filter(row=>row.id!==value);return history.map(row=>({...row}));}
  if(action==='copy'){const row=history.find(row=>row.id===value);if(!row)throw Error('剪貼項目已移除');await clipboard.writeText(row.text);return {copied:true};}
  throw Error('浮動工作台操作無效');
 });
}
module.exports={register};
