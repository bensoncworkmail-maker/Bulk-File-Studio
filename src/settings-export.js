'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {normalize:normalizeSettings}=require('./settings-model');
const {normalize:normalizeDesktop}=require('./desktop-state');
const {normalize:normalizeShortcuts}=require('./shortcuts');
const {sanitizeSavedPresets}=require('./presets');
const {normalizeOptions}=require('./rename-core');
const {assertLocalPath}=require('./offline-policy');
function createSettingsExport(input,desktop,version,now=new Date()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('設定匯出資料無效');
 return {
  format:'BulkFileStudio.Settings',schemaVersion:1,application:{name:'Bulk File Studio',version},exportedAt:now.toISOString(),
  settings:normalizeSettings(input.settings),desktop:normalizeDesktop(desktop),shortcuts:normalizeShortcuts(input.shortcuts),
  naming:{activeRules:normalizeOptions(input.rules&&typeof input.rules==='object'?input.rules:{}),presets:sanitizeSavedPresets(input.presets).map(preset=>({...preset,rules:normalizeOptions(preset.rules)}))},
  excluded:['favorites','fileContents','undoHistory','windowBounds','windowsContextMenuRegistration','windowsLoginRegistration']
 };
}
function writeSettingsExport(filename,data){
 assertLocalPath(filename);
 const temp=path.join(path.dirname(filename),'.bfs-settings-'+crypto.randomUUID()+'.tmp');
 try{fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});fs.renameSync(temp,filename);}
 finally{try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
module.exports={createSettingsExport,writeSettingsExport};
