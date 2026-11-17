'use strict';
const fs=require('node:fs'),path=require('node:path'),network=require('./intranet-path');
// Parsing never accesses the network. Hostnames are resolved in a short-lived
// intranet scope only when the user refreshes or acts on an indexed result.
function resultPath(value){
 if(typeof value!=='string'||!value||value.length>32767||/["\x00-\x1f\x7f]/.test(value))throw Error('ES 回傳的完整路徑格式無效');
 if(network.isUNC(value)){
  const clean=require('./notes-location-links').locationPath(value);network.uncServer(clean);return clean;
 }
 if(!/^[a-z]:[\\/]/i.test(value))throw Error('ES 回傳的位置不是完整磁碟或共享路徑');
 return value;
}
function accessReason(error){
 if(['ENOENT','ENOTDIR'].includes(error.code))return '位置不存在或共享資料夾未連線';
 if(['EACCES','EPERM'].includes(error.code))return '沒有位置的存取權，請先在檔案總管連線並確認權限';
 if(['ENETUNREACH','EHOSTUNREACH','ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(error.code))return '共享主機無法連線或解析，請確認內網連線';
 return String(error.message||error).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,240);
}
function sharedInspector({stat=(value,options)=>fs.promises.lstat(value,options)}={}){
 // Reuse parent checks within this refresh only, never across actions/refreshes.
 const parents=new Map();
 async function directory(value){
  if(!parents.has(value))parents.set(value,(async()=>{const info=await stat(value);if(info.isSymbolicLink()||!info.isDirectory())throw Error('共享路徑不接受符號連結或無效的上層資料夾');})());
  return parents.get(value);
 }
 return async value=>{
  const clean=resultPath(value);network.assertIntranetPath(clean);
  const ancestors=[];for(let current=clean;;){const parent=path.win32.dirname(current);if(parent===current)break;ancestors.push(parent);current=parent;}
  for(const parent of ancestors.reverse())await directory(parent);
  const info=await stat(clean,{bigint:true});
  if(info.isSymbolicLink()||!info.isFile()&&!info.isDirectory())throw Error('只支援一般檔案或資料夾');
  return {type:info.isDirectory()?'folder':'file',identity:Object.fromEntries(['dev','ino','birthtimeNs'].map(key=>[key,String(info[key])])),size:info.isFile()?Number(info.size):null,modifiedMs:Number(info.mtimeMs)};
 };
}
module.exports={resultPath,accessReason,sharedInspector};
