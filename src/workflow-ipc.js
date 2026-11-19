'use strict';
const path=require('node:path'),fs=require('node:fs');
function registerWorkflow(options){
 const {handle,dialog,parent,fileOperation,tracking,favorites,productivity,clipboard}=options;
 const confirm=async(message,detail)=>{const value=await dialog.showMessageBox(parent(),{type:'warning',message,detail,buttons:['取消','確認'],defaultId:0,cancelId:0,noLink:true});return value.response===1&&!parent().isDestroyed();};
 const service=new(require('./workflow-service').WorkflowService)({...options,confirm});
 function ensure(){if(options.blocked())throw Error('另一項操作仍在處理，請稍候');}
 handle('workflow-ocr-draft',(_,input)=>{ensure();return service.saveOcrDraft(input);});
 handle('workflow-state',()=>service.state());
 handle('workflow-context-state',()=>service.contextState());
 handle('workflow-save',(_,kind,input,revision)=>{ensure();return service.save(kind,input,revision);});
 handle('workflow-remove',(_,kind,id,revision)=>{ensure();if(kind!=='contexts')throw Error('此功能已移除');return service.store.remove(kind,id,revision);});
 handle('workflow-select',async(_,source)=>{
  ensure();if(source?.kind==='tracking')return service.select(tracking.selection(source.id,source.token,source.indices).paths);
  if(source?.kind==='favorites'){if(!Array.isArray(source.ids)||source.ids.length>1000)throw Error('收藏選取無效');return service.select(source.ids.map(id=>favorites.get(id,true).path));}
  if(!['files','folders','image'].includes(source?.kind))throw Error('來源類型無效');const value=await dialog.showOpenDialog(parent(),{title:source.kind==='image'?'選擇一張圖片':'選擇工具箱來源',properties:source.kind==='image'?['openFile']:[source.kind==='folders'?'openDirectory':'openFile','multiSelections'],...(source.kind==='image'?{filters:[{name:'圖片',extensions:['png','jpg','jpeg','bmp','gif','webp']}]}:{})});return value.canceled?{canceled:true}:service.select(value.filePaths);
 });
 handle('workflow-context',(_,id,revision)=>{ensure();if(options.contextCanSwitch?.()===false)throw Error('桌面工作情境仍有未儲存內容或正在處理，請先完成');return service.activateContext(id,revision);});
 handle('workflow-snippet',(_,id,values,recordId,copy)=>service.snippet(id,values,recordId,copy===true));
 handle('workflow-snippet-paste',async(_,id,values,recordId)=>{ensure();service.snippet(id,values,recordId,true);if(process.platform!=='win32')throw Error('文字已複製；立即貼上需要 Windows');const paste=require('./snippet-paste');await paste.warm();parent().hide();await new Promise(resolve=>setTimeout(resolve,250));const target=await paste.capture();if(!target){parent().show();throw Error('文字已複製，無法確定前一視窗；請切換至目標後手動貼上');}try{return await paste.paste({target:{...target,noActivate:true}});}catch(error){parent().show();throw error;}});
 handle('workflow-clipboard',()=>clipboard.readText().slice(0,100000));
 handle('workflow-ocr',async(_,token,language)=>{ensure();const paths=service.selection(token);if(paths.length!==1)throw Error('OCR 請只選取一張圖片');return require('./windows-ocr').recognize(paths[0],{language});});
 handle('workflow-preview-file',(_,token,index)=>{const paths=service.selection(token);if(!Number.isSafeInteger(index)||!paths[index])throw Error('請選取一個來源');return productivity.previewFile(paths[index],'window');});
 handle('workflow-rules-preview',(_,token)=>{const paths=service.selection(token),W=require('./workflow-model'),rules=productivity.store.get().rules;return paths.map(source=>{const info=require('./favorites-store').inspectPath(source),values={name:path.basename(source),date:new Date(info.modifiedMs).toLocaleDateString('sv-SE'),extension:path.extname(source).slice(1).toLowerCase(),size:info.size},matches=rules.map(rule=>({id:rule.id,name:rule.name,destination:path.join(rule.folder||path.dirname(source),rule.prefix+path.basename(source)),explanation:W.evaluate(rule.conditions||W.legacyRule(rule),values)}));const hit=matches.filter(row=>row.explanation.matched);return {source,matches,conflict:hit.length>1&&new Set(hit.map(row=>row.destination)).size>1};});});
 handle('workflow-rule-conditions',(_,id,conditions)=>{ensure();const rule=productivity.store.get().rules.find(row=>row.id===id);if(!rule)throw Error('整理規則已移除');return productivity.store.save('rules',{...rule,conditions:require('./workflow-model').condition(conditions)});});
 handle('workflow-monitor',(_,id,enabled)=>{ensure();return tracking.changes.monitor(id,enabled,tracking.read().queries);});
 handle('workflow-tracking-seen',(_,id)=>{tracking.changes.seen(id);return {seen:true};});
 handle('workflow-tracking-refresh',async(_,id)=>{ensure();const value=await tracking.refresh(id);options.trackingChanged();return value;});
 // Background checks are opt-in and read-only. Serial checks never cancel a
 // foreground ES request or overlap another file operation.
 let checking=false;service.timer=(options.setIntervalFn||setInterval)(async()=>{if(checking||options.blocked()||tracking.bridge.active)return;checking=true;try{const data=tracking.changes?.read();for(const id of data?.monitors||[]){if(options.blocked()||tracking.bridge.active)break;const query=tracking.read().queries.find(row=>row.id===id);if(!query?.enabled)continue;await tracking.refresh(id);options.trackingChanged();}}catch(error){options.onError(error);}finally{checking=false;}},60000);service.timer?.unref?.();return service;
}
module.exports={registerWorkflow};
