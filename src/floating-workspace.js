'use strict';
const {randomUUID}=require('node:crypto');
// History is explicit, text-only and lives in this process. Never poll the clipboard.
function register({handle,clipboard,configure,openPage,openTool,idleCollapse,settings,saveLayout,mainTool,canMove=()=>true}){
 let history=[],revision=0;
 const invoke=async(action,value)=>{
  if(action==='idle-collapse')return idleCollapse();
  if(action==='panel'){if(!['files','planning','snippets','clipboard','contexts','drafts'].includes(value))throw Error('浮動分頁無效');return configure({floatingLastPanel:value});}
  if(action==='mode'){if(!['classic','bar','dock','bubble'].includes(value))throw Error('入口模式無效');return configure({floatingLauncher:value});}
  if(action==='page'){if(!['tracking','settings'].includes(value))throw Error('頁面無效');openPage(value);return {opened:true};}
  if(action==='options'){const patch=value||{},allowed=['floatingLauncher','floatingAutoCollapse','floatingRememberPanel','floatingRestorePanels','floatingDockEdge','floatingDockReveal','floatingOpacity','floatingToolLayout'];if(typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!allowed.includes(key)))throw Error('浮動設定無效');const next=require('./desktop-state').normalize({...settings(),...patch});for(const key of Object.keys(patch))if(key!=='floatingToolLayout'&&JSON.stringify(next[key])!==JSON.stringify(patch[key]))throw Error('浮動設定無效');return configure(patch);}
  if(action==='panel-pin'){if(typeof value!=='boolean')throw Error('固定狀態無效');return configure({floatingPanelPinned:value});}
  if(action==='layout'){const {kind,...patch}=value||{};if(!Object.hasOwn(require('./floating-tool-layout').TOOLS,kind))throw Error('工具無效');return configure({floatingToolLayout:{...settings().floatingToolLayout,[kind]:{...settings().floatingToolLayout[kind],...patch}}});}
  if(action==='main-tool')return mainTool(value);
  if(action==='tool'){if(!Object.hasOwn(require('./floating-tool-layout').TOOLS,value))throw Error('獨立工具無效');if(!canMove(value))throw Error('請先完成或取消工具內的編輯');saveLayout?.(value,{placement:'pinned',pinned:true,visible:true});return openTool(value);}
  if(action==='list')return history.map(row=>({...row}));
  if(action==='capture'){const epoch=++revision,text=await clipboard.readText();if(epoch!==revision)return history.map(row=>({...row}));if(typeof text!=='string'||!text.trim())throw Error('剪貼簿沒有文字');if(text.length>20000)throw Error('每項最多 20,000 字');history=history.filter(row=>row.text!==text);history.unshift({id:randomUUID(),text,createdAt:new Date().toISOString()});history=history.slice(0,20);return history.map(row=>({...row}));}
  if(action==='clear'){revision++;history=[];return [];}
  if(action==='remove'){revision++;if(typeof value!=='string')throw Error('項目無效');history=history.filter(row=>row.id!==value);return history.map(row=>({...row}));}
  if(action==='copy'){const row=history.find(row=>row.id===value);if(!row)throw Error('剪貼項目已移除');await clipboard.writeText(row.text);return {copied:true};}
  throw Error('浮動工作台操作無效');
 };handle('floating-workspace',(_,action,value)=>invoke(action,value));return invoke;
}
module.exports={register};
