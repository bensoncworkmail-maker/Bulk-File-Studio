'use strict';
const path=require('node:path'),network=require('./intranet-path');
const {parentPath}=require('./favorites-batch');
const columns=require('./everything-result-columns');
const pathAPI=value=>/^[a-z]:[\\/]/i.test(value)||network.isUNC(value)?path.win32:path;
function trackingBatchStore(tracking,id,token,indices){
 return {read:()=>null,selection:()=>tracking.selection(id,token,indices).paths.map((path,index)=>({id:String(index),path,...require('./favorites-store').inspectPath(path)})),state:()=>({status:'ready'})};
}
// Use tracking only for the selected sources; affected links remain real favorites.
function trackingTrashStore(tracking,favorites,id,token,indices){
 return {read:()=>favorites.read(),write:data=>favorites.write(data),selection:()=>tracking.entries(id,token,indices).rows.map(({path,type,identity})=>({path,type,identity}))};
}

async function trackingAction({tracking,id,token,indices,action,input,favorites,notifyFavorites,clipboard,shell,listPaths,bulkOpen,renameItem,trash}){
 if(!['open','show','copy','copy-names','copy-folders','copy-table','favorite','rename','move','bulk-open','bulk-locations','rename-item','trash'].includes(action))throw Error('追蹤搜尋操作無效');
 const entries=tracking.entries?tracking.entries(id,token,indices):tracking.selection(id,token,indices);
 if(entries.paths.some(network.isUNC)&&['trash','rename-item','rename','move'].includes(action))throw Error('共享位置支援開啟、定位、複製與收藏；改名、搬移或移至資源回收筒請在檔案總管操作');
 if(action==='trash')return trash({id,token,indices});
 return network.withIntranetPaths(entries.paths,async()=>{
 const {paths,tags,rows}=tracking.selection(id,token,indices);
 if(action==='bulk-open'||action==='bulk-locations')return bulkOpen({id,token,indices},action==='bulk-open'?'open':'locations');
 if(action==='rename-item'){
  if(paths.length!==1)throw Error('請只選取一個檔案或資料夾再重新命名');
  if(!input||typeof input.name!=='string')throw Error('請輸入新名稱');
  const result=await renameItem(paths[0],input.name);
  if(result.changed)tracking.applyMoves(result.moves);
  return result;
 }
 if(action==='copy-table'){
  const keys=input?.columns;
  if(!Array.isArray(keys)||!keys.length||keys.length>Object.keys(columns.COLUMNS).length||new Set(keys).size!==keys.length||keys.some(key=>!Object.hasOwn(columns.COLUMNS,key)))throw Error('表格欄位無效，請重新選擇欄位');
  if(input?.sizeUnit!==undefined&&!columns.SIZE_UNITS.includes(input.sizeUnit))throw Error('大小單位無效');
  const cell=value=>{const text=String(value).replace(/[\t\r\n\u0000-\u001f]/g,' ');return /^\s*[=+@-]/.test(text)?"'"+text:text;};
  const text=[keys.map(key=>columns.COLUMNS[key].label),...rows.map(row=>keys.map(key=>columns.display(row,key,{sizeUnit:input?.sizeUnit})))].map(row=>row.map(cell).join('\t')).join('\r\n');
  if(Buffer.byteLength(text,'utf8')>2*1024*1024)throw Error('複製內容過大，請減少選取項目或欄位');
  clipboard.writeText(text);return {copied:rows.length};
 }
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
 });
}
module.exports={trackingAction,trackingBatchStore,trackingTrashStore};
