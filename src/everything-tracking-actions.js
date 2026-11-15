'use strict';
const path=require('node:path');
const {parentPath}=require('./favorites-batch');
const pathAPI=value=>/^[a-z]:[\\/]/i.test(value)?path.win32:path;

async function trackingAction({tracking,id,token,indices,action,favorites,notifyFavorites,clipboard,shell,listPaths}){
 if(!['open','show','copy','copy-names','copy-folders','favorite','rename','move'].includes(action))throw Error('追蹤搜尋操作無效');
 const {paths,tags}=tracking.selection(id,token,indices);
 if(action==='favorite'){const result=favorites.addPaths(paths,tags);notifyFavorites();return result;}
 if(['copy','copy-names','copy-folders'].includes(action)){
  const values=action==='copy-names'?paths.map(value=>pathAPI(value).basename(value)):action==='copy-folders'?paths.map(parentPath):paths;
  const seen=new Set(),unique=action==='copy-folders'?values.filter(value=>{const key=pathAPI(value)===path.win32?path.win32.normalize(value).toLowerCase():path.normalize(value);if(seen.has(key))return false;seen.add(key);return true;}):values;
  clipboard.writeText(unique.join('\n'));return {copied:unique.length};
 }
 if(action==='rename'){
  for(const value of paths)if(require('./favorites-store').inspectPath(value).type!=='file')throw Error('批次改名只接受檔案；請取消選取資料夾，或改用批次搬移');
  return listPaths(paths,false);
 }
 if(action==='move')return {paths};
 if(paths.length!==1)throw Error('請逐項開啟或定位');
 if(action==='show'){shell.showItemInFolder(paths[0]);return {shown:true};}
 await require('./notes-location-links').safeLocationOpen(paths[0]);const error=await shell.openPath(paths[0]);if(error)throw Error(error);return {opened:true};
}
module.exports={trackingAction};
