'use strict';
const path=require('node:path'),fs=require('node:fs');
function registerWorkflow(options){
 const {handle,dialog,parent,fileOperation,tracking,favorites,productivity,clipboard}=options;
 const confirm=async(message,detail)=>{const value=await dialog.showMessageBox(parent(),{type:'warning',message,detail,buttons:['取消','確認'],defaultId:0,cancelId:0,noLink:true});return value.response===1&&!parent().isDestroyed();};
 const service=new(require('./workflow-service').WorkflowService)({...options,confirm});let queueRunning=false,queuePaused=false;
 function ensure(){if(options.blocked())throw Error('另一項操作仍在處理，請稍候');}
 handle('workflow-state',()=>service.state());
 handle('workflow-save',(_,kind,input,revision)=>{ensure();return service.save(kind,input,revision);});
 handle('workflow-remove',(_,kind,id,revision)=>{ensure();return service.store.remove(kind,id,revision);});
 handle('workflow-select',async(_,source)=>{
  ensure();if(source?.kind==='tracking')return service.select(tracking.selection(source.id,source.token,source.indices).paths);
  if(source?.kind==='favorites'){if(!Array.isArray(source.ids)||source.ids.length>1000)throw Error('收藏選取無效');return service.select(source.ids.map(id=>favorites.get(id,true).path));}
  if(!['files','folders','image'].includes(source?.kind))throw Error('來源類型無效');const value=await dialog.showOpenDialog(parent(),{title:source.kind==='image'?'選擇一張圖片':'選擇工具箱來源',properties:source.kind==='image'?['openFile']:[source.kind==='folders'?'openDirectory':'openFile','multiSelections'],...(source.kind==='image'?{filters:[{name:'圖片',extensions:['png','jpg','jpeg','bmp','gif','webp']}]}:{})});return value.canceled?{canceled:true}:service.select(value.filePaths);
 });
 handle('workflow-folder',async(_,choice)=>{ensure();const state=service.store.read();let folder;if(choice?.kind==='recent'){if(!state.recentFolders.includes(choice.path))throw Error('最近位置已變更');folder=choice.path;}else if(choice?.kind==='favorite'){const row=favorites.get(choice.id,true);if(row.type!=='folder')throw Error('請選取資料夾收藏');folder=row.path;}else{const value=await dialog.showOpenDialog(parent(),{title:'選取輸出／搬移資料夾',defaultPath:state.recentFolders[0],properties:['openDirectory']});if(value.canceled)return null;folder=value.filePaths[0];}return service.remember(folder);});
 handle('workflow-summary',(_,id,masterId)=>service.summary(id,masterId));
 handle('workflow-context',(_,id)=>{ensure();const item=service.store.read().contexts.find(row=>row.id===id);if(!item)throw Error('情境包已移除');service.store.change(data=>{data.activeContextId=id;});return item;});
 handle('workflow-snippet',(_,id,values,recordId,copy)=>service.snippet(id,values,recordId,copy===true));
 handle('workflow-snippet-paste',async(_,id,values,recordId)=>{ensure();service.snippet(id,values,recordId,true);if(process.platform!=='win32')throw Error('文字已複製；立即貼上需要 Windows');const paste=require('./snippet-paste');await paste.warm();parent().hide();await new Promise(resolve=>setTimeout(resolve,250));const target=await paste.capture();if(!target){parent().show();throw Error('文字已複製，無法確定前一視窗；請切換至目標後手動貼上');}try{return await paste.paste({target:{...target,noActivate:true}});}catch(error){parent().show();throw error;}});
 handle('workflow-clipboard',()=>clipboard.readText().slice(0,100000));
 handle('workflow-capture',(_,input)=>{ensure();return service.capture(input);});
 handle('workflow-convert',(_,id,version,sheetId,masterId)=>{ensure();return service.convert(id,version,sheetId,masterId);});
 handle('workflow-draft',(_,id)=>service.notes().draft(id));
 handle('workflow-dismiss',(_,draftId)=>{ensure();return service.store.change(data=>{data.inbox=data.inbox.filter(row=>row.draftId!==draftId);});});
 handle('workflow-automation-preview',(_,id,ids)=>{ensure();return service.planAutomation(id,ids);});
 handle('workflow-automation-apply',async(_,token)=>{ensure();const value=service.take(token,'automation');if(!await confirm('執行 '+value.rows.filter(row=>row.matched).length+' 筆符合條件的紀錄？','流程：'+value.rule.name+'\n'+value.rows.filter(row=>row.matched).map(row=>row.title).join('\n')))return {canceled:true};ensure();return service.applyAutomation(token);});
 handle('workflow-analyze',(_,kind,token)=>service.analyze(kind,token));
 handle('workflow-analysis-cancel',()=>{service.job?.cancel();return {requested:Boolean(service.job)};});
 handle('workflow-duplicates-trash',(_,token,paths)=>fileOperation(()=>service.trashDuplicates(token,paths)));
 handle('workflow-ocr',async(_,token,language)=>{ensure();const paths=service.selection(token);if(paths.length!==1)throw Error('OCR 請只選取一張圖片');return require('./windows-ocr').recognize(paths[0],{language});});
 handle('workflow-preview-file',(_,token,index)=>{const paths=service.selection(token);if(!Number.isSafeInteger(index)||!paths[index])throw Error('請選取一個來源');return productivity.previewFile(paths[index],'window');});
 handle('workflow-rules-preview',(_,token)=>{const paths=service.selection(token),W=require('./workflow-model'),rules=productivity.store.get().rules;return paths.map(source=>{const info=require('./favorites-store').inspectPath(source),values={name:path.basename(source),date:new Date(info.modifiedMs).toLocaleDateString('sv-SE'),extension:path.extname(source).slice(1).toLowerCase(),size:info.size},matches=rules.map(rule=>({id:rule.id,name:rule.name,destination:path.join(rule.folder||path.dirname(source),rule.prefix+path.basename(source)),explanation:W.evaluate(rule.conditions||W.legacyRule(rule),values)}));const hit=matches.filter(row=>row.explanation.matched);return {source,matches,conflict:hit.length>1&&new Set(hit.map(row=>row.destination)).size>1};});});
 handle('workflow-rule-conditions',(_,id,conditions)=>{ensure();const rule=productivity.store.get().rules.find(row=>row.id===id);if(!rule)throw Error('整理規則已移除');return productivity.store.save('rules',{...rule,conditions:require('./workflow-model').condition(conditions)});});
 handle('workflow-monitor',(_,id,enabled)=>{ensure();return tracking.changes.monitor(id,enabled,tracking.read().queries);});
 handle('workflow-tracking-seen',(_,id)=>{tracking.changes.seen(id);return {seen:true};});
 handle('workflow-tracking-refresh',async(_,id)=>{ensure();const value=await tracking.refresh(id);options.trackingChanged();return value;});
 handle('workflow-queue-add',(_,token,folder)=>{ensure();const known=service.store.read().recentFolders;if(!known.includes(folder))throw Error('請先選擇目的地');const paths=service.selection(token),moves=require('./move-core').planMove(paths,folder);return options.journal().enqueue('move',moves);});
 handle('workflow-queue-remove',(_,id)=>{const item=options.journal().list().find(row=>row.id===id);if(item?.state!=='queued')throw Error('只能取消尚未執行的作業');return options.journal().update(id,{state:'canceled'});});
 handle('workflow-queue-pause',()=>{queuePaused=true;return {paused:true};});
 handle('workflow-queue-run',async()=>{ensure();if(queueRunning)throw Error('佇列仍在執行');const jobs=options.journal().list().filter(row=>row.state==='queued').reverse();if(!jobs.length)throw Error('沒有待處理作業');if(!await confirm('執行 '+jobs.length+' 批搬移作業？',jobs.map(row=>row.moves.map(move=>move.source+' → '+move.destination).join('\n')).join('\n\n')))return {canceled:true};queueRunning=true;queuePaused=false;let count=0;try{for(const job of jobs){if(queuePaused)break;if(options.journal().list().find(row=>row.id===job.id)?.state!=='queued')continue;await fileOperation(()=>options.move(job.moves,job.id));count++;}return {count,paused:queuePaused};}finally{queueRunning=false;}});
 // Background checks are opt-in and read-only. Serial checks never cancel a
 // foreground ES request or overlap another file operation.
 let checking=false;service.timer=(options.setIntervalFn||setInterval)(async()=>{if(checking||options.blocked()||tracking.bridge.active)return;checking=true;try{const data=tracking.changes?.read();for(const id of data?.monitors||[]){if(options.blocked()||tracking.bridge.active)break;const query=tracking.read().queries.find(row=>row.id===id);if(!query?.enabled)continue;await tracking.refresh(id);options.trackingChanged();}}catch(error){options.onError(error);}finally{checking=false;}},60000);service.timer?.unref?.();return service;
}
module.exports={registerWorkflow};
