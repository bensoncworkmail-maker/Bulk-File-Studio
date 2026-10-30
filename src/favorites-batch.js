'use strict';
const path=require('node:path');
const {inspectPath,sameIdentity}=require('./favorites-store');
const {assertSafeOpen}=require('./offline-policy');
const LIMIT=20;
const windowsPath=value=>/^[a-z]:[\\/]/i.test(value);
function parentPath(value){return (windowsPath(value)?path.win32:path).dirname(value);}
function pathKey(value){return windowsPath(value)?path.win32.normalize(value).toLocaleLowerCase():path.normalize(value);}
function locationCount(items){return new Set(items.map(item=>pathKey(parentPath(item.path)))).size;}
function prepareBatch(store,ids,kind){
 if(!['open','locations'].includes(kind))throw new Error('批次開啟類型無效');
 const sources=store.selection(store.read(),ids),targets=new Map();
 for(const item of sources){
  const state=store.state(item);if(state.status!=='ready')throw new Error(item.path+'\n'+state.reason);
  const filepath=kind==='locations'?parentPath(item.path):item.path,actual=inspectPath(filepath);
  if(kind==='locations'&&actual.type!=='folder')throw new Error('所在位置不是資料夾');
  if(kind==='open')assertSafeOpen(filepath);
  targets.set(pathKey(filepath),{path:filepath,type:actual.type,identity:actual.identity});
 }
 if(targets.size>LIMIT)throw new Error(`每次最多開啟 ${LIMIT} 個目標，請縮小篩選或選取範圍`);
 return {kind,ids:sources.map(item=>item.id),sources:sources.map(({id,path,type,identity})=>({id,path,type,identity})),targets:[...targets.values()]};
}
async function executeBatch(store,plan,openPath){
 const current=prepareBatch(store,plan.ids,plan.kind);
 if(JSON.stringify(current)!==JSON.stringify(plan))throw new Error('收藏或來源已變更，請重新開啟選單');
 const failures=[];let opened=0;
 for(const target of plan.targets){try{
  const actual=inspectPath(target.path);if(actual.type!==target.type||!sameIdentity(actual.identity,target.identity))throw new Error('來源已被替換');
  if(plan.kind==='open')assertSafeOpen(target.path);
  const error=await openPath(target.path);if(error)throw new Error(error);opened++;
 }catch(error){failures.push(target.path+'：'+error.message);}}
 return {opened,failures,canceled:false};
}
module.exports={LIMIT,parentPath,locationCount,prepareBatch,executeBatch};
