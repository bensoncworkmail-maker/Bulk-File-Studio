'use strict';
// Workspace links can refer to a user-selected network share. This does not change
// the browser request policy or grant network paths to rename/delete operations.
const fs=require('node:fs'),path=require('node:path');
const {withIntranetPaths}=require('./intranet-path');
const {assertLocalPath}=require('./offline-policy');
const BLOCKED=/\.(exe|com|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|msi|scr|lnk|url|website|hta|reg|appref-ms|scf|desktop|sh)$/i;
function locationPath(value){
 if(typeof value!=='string'||!value||value.length>4096||/[\x00-\x1f]/.test(value))throw new Error('請輸入有效的完整位置路徑');
 const windows=process.platform==='win32'||/^(?:[a-z]:[\\/]|[\\/]{2})/i.test(value),p=windows?path.win32:path;
 if(windows){
  const portable=value.replace(/\//g,'\\');
  if(/^\\\\[?.]\\/.test(portable)||/[<>"|?*]/.test(portable)||portable.slice(/^[a-z]:/i.test(portable)?2:0).includes(':'))throw new Error('不接受裝置路徑、網址或特殊檔案路徑');
  if(!/^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+(?:\\|$))/i.test(portable))throw new Error('請輸入磁碟完整路徑或 \\\\伺服器\\共享資料夾');
  if(portable.split('\\').some(part=>part&&part!=='.'&&part!=='..'&&(/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))))throw new Error('不接受裝置名稱或不明確的位置');
  value=p.normalize(portable);
 }else if(!p.isAbsolute(value))throw new Error('請使用完整路徑');
 return windows?p.normalize(value):path.normalize(value);
}
function inspectLocation(value){
 const filepath=locationPath(value),unc=/^\\\\/.test(filepath),p=unc?path.win32:path;
 try{
  if(!unc)assertLocalPath(filepath);
  // Do not traverse symbolic links/reparse links on a share either.
  let current=filepath;while(unc){if(fs.lstatSync(current).isSymbolicLink())throw new Error('位置不支援符號連結');const parent=p.dirname(current);if(parent===current)break;current=parent;}
  const stat=fs.lstatSync(filepath,{bigint:true});if(stat.isSymbolicLink()||!stat.isFile()&&!stat.isDirectory())throw new Error('只支援一般檔案或資料夾');
  return {path:filepath,type:stat.isDirectory()?'folder':'file',identity:Object.fromEntries(['dev','ino','birthtimeNs'].map(key=>[key,String(stat[key])]))};
 }catch(error){if(['ENOENT','ENOTDIR','EACCES','EPERM','ENETUNREACH','EHOSTUNREACH'].includes(error.code))throw new Error('位置不存在或沒有存取權；請確認共享資料夾已連線、磁碟代號及權限：'+filepath);throw error;}
}
function inspectLinks(paths){
 if(!Array.isArray(paths)||!paths.length||paths.length>100)throw new Error('每次請加入 1–100 個完整位置');
 const result=new Map();for(const value of paths){const item=inspectLocation(value),key=process.platform==='win32'?item.path.toLowerCase():item.path;result.set(key,item);}return [...result.values()];
}
async function openRecordLink({document,favorites,recordId,index,action,shell,clipboard}){
 const record=document.records.find(item=>item.id===recordId&&!item.deletedAt&&document.sheets.some(sheet=>sheet.id===item.sheetId&&!sheet.deletedAt));
 if(!record||!Number.isInteger(index)||index<0||index>=record.fileLinks.length||!['open','show','copy'].includes(action))throw new Error('檔案連結操作無效');
 const link=record.fileLinks[index],catalog=favorites.read().items,current=catalog.find(item=>item.id===link.favoriteId),filepath=current?.path||link.path;
 if(action==='copy'){clipboard.writeText(filepath);return;}
 // Existing local favorites retain their original identity checks.
 if(current)favorites.get(current.id,true);
 const actual=await withIntranetPaths([locationPath(filepath)],()=>inspectLocation(filepath));if(actual.type!==link.type)throw new Error('連結位置類型已變更，請重新連結');
 if(action==='show'){shell.showItemInFolder(actual.path);return;}
 if(actual.type==='file'&&BLOCKED.test(actual.path))throw new Error('此類程式或捷徑請使用「定位」後自行開啟');
 const error=await shell.openPath(actual.path);if(error)throw new Error(error);
}
module.exports={locationPath,inspectLocation,inspectLinks,openRecordLink};
