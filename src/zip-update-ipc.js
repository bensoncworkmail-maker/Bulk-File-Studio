'use strict';
const path=require('node:path'),fs=require('node:fs'),{ZipUpdate}=require('./zip-update'),{assertLocalPath}=require('./offline-policy');
function register({handle,root,dialog,parent,fileOperation,progress,openPath}){
 const service=new ZipUpdate(path.join(root,'zip-updates'),{progress});
 const index=(rows,value)=>{if(!Number.isInteger(value)||value<0||value>=rows.length)throw Error('常用位置已變更，請重新選擇');const folder=rows[value];assertLocalPath(folder);if(!fs.statSync(folder).isDirectory())throw Error('常用資料夾已不存在，請重新選擇');return folder;};
 const choose=async options=>dialog.showOpenDialog(parent(),options);
 handle('zip-update',async(_,action,value)=>{
  if(action==='state')return service.state();if(action==='cancel')return service.cancel();
  if(service.busy)throw Error('ZIP 操作仍在執行，請稍候或取消');
  if(action==='choose-zip'){
   const defaultPath=value===undefined?service.history.sourceFolders[0]:index(service.history.sourceFolders,value),r=await choose({title:'選擇要更新的 ZIP',defaultPath,properties:['openFile'],filters:[{name:'ZIP 壓縮檔',extensions:['zip']}]});return r.canceled?{canceled:true}:service.openZip(r.filePaths[0]);
  }
  if(action==='drop-zip')return service.openZip(value);
  if(action==='choose-source-folder'){const r=await choose({title:'加入常用 ZIP 來源資料夾',defaultPath:service.history.sourceFolders[0],properties:['openDirectory']});return r.canceled?{canceled:true}:service.rememberSource(r.filePaths[0]);}
  if(action==='choose-target'){const r=await choose({title:'選擇接收更新的資料夾',defaultPath:service.selected.target||service.history.targetFolders[0],properties:['openDirectory']});return r.canceled?{canceled:true}:service.setTarget(r.filePaths[0]);}
  if(action==='select-target')return service.setTarget(index(service.history.targetFolders,value));
  if(action==='preview')return service.preview(value);
  if(action==='apply')return fileOperation(async()=>{
   const {plan,rows}=service.getPlan(value?.token,value?.ids);const choice=await dialog.showMessageBox(parent(),{type:'question',title:'確認 ZIP 更新',message:`套用 ${rows.length} 個檔案至所選資料夾？`,detail:plan.target+'\n新增 '+rows.filter(r=>r.status==='added').length+' 個；覆寫 '+rows.filter(r=>r.status==='changed').length+' 個。\n覆寫前會備份原檔；ZIP 以外的目標檔案保留。\n\n'+rows.slice(0,15).map(r=>r.destination).join('\n')+(rows.length>15?'\n…其餘項目已列於預覽。':''),buttons:['確認套用','取消'],defaultId:1,cancelId:1,noLink:true});if(choice.response!==0)return {canceled:true};return service.apply(value.token,value.ids);
  });
  if(action==='undo')return fileOperation(async()=>{const {run}=service.readRun(value),choice=await dialog.showMessageBox(parent(),{type:'warning',title:'還原 ZIP 更新',message:'還原這次更新？',detail:run.target+'\n覆寫檔案會還原備份；這次新增的檔案會移除。更新後再次修改的檔案會保留並列為衝突。',buttons:['確認還原','取消'],defaultId:1,cancelId:1,noLink:true});return choice.response===0?service.undo(value):{canceled:true};});
  if(action==='open-target'){const folder=value?service.readRun(value).run.target:service.selected.target;assertLocalPath(folder);const error=await openPath(folder);if(error)throw Error(error);return {opened:true};}
  if(action==='details'){const {dir,run}=service.readRun(value);return service.result(run,dir);}
  if(action==='open-backup'){const {dir}=service.readRun(value);assertLocalPath(dir);const error=await openPath(dir);if(error)throw Error(error);return {opened:true};}
  throw Error('ZIP 更新操作無效');
 });return service;
}
module.exports={register};
