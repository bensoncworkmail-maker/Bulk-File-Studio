'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {inspectPathSnapshot,sameIdentity}=require('./favorites-store');
const key=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
const within=(parent,child)=>{const rel=path.relative(key(parent),key(child));return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
const covers=(target,item)=>key(target.path)===key(item.path)||target.type==='folder'&&within(target.path,item.path);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Snapshot the whole subtree so the second confirmation covers its contents too.
function snapshot(filepath,result=[]){
 if(result.length>=5000)throw new Error('每批回收最多 5000 個檔案／資料夾（含子項目）');
 const actual=inspectPathSnapshot(filepath);
 result.push(actual);
 if(actual.type==='folder')for(const name of fs.readdirSync(filepath).sort())snapshot(path.join(filepath,name),result);
 return result;
}
function prepareTrash(store,ids){
 const all=store.read().items,selected=store.selection({items:all},ids);
 for(const item of selected){if(key(item.path)===key(path.parse(item.path).root))throw new Error('不可回收磁碟根目錄');if(store.state&&store.state(item).status!=='ready')throw new Error('收藏位置不可用或已被替換：'+item.path);}
 const roots=selected.filter(item=>!selected.some(other=>other!==item&&other.type==='folder'&&within(other.path,item.path)));
 const targets=roots.map(item=>({path:item.path,type:item.type,entries:snapshot(item.path)}));
 if(targets.reduce((count,target)=>count+target.entries.length,0)>5000)throw new Error('每批回收最多 5000 個檔案／資料夾（含子項目）');
 const entries=new Map(targets.flatMap(target=>target.entries.map(entry=>[key(entry.path),entry])));
 for(const item of selected){const entry=entries.get(key(item.path));if(!entry||entry.type!==item.type||!sameIdentity(entry.identity,item.identity))throw new Error('選取項目已替換，請立即更新搜尋結果：'+item.path);}
 const affected=all.filter(item=>targets.some(target=>covers(target,item)));
 return {ids:[...ids],selected,affected,targets};
}
async function executeTrash(store,plan,trashItem){
 if(!same(prepareTrash(store,plan.ids),plan))throw new Error('檔案或收藏已變更，請重新確認');
 const failures=[],trashedPaths=[];let removed=0;
 for(const target of plan.targets){
  try{
   const current=store.read();
   const fresh={path:target.path,type:target.type,entries:snapshot(target.path)};
   const expected=plan.affected.filter(item=>covers(target,item));
   const related=current.items.filter(item=>covers(target,item));
   if(!same(fresh,target)||!same(related,expected))throw new Error('檔案或收藏已變更，請重新確認');
   await trashItem(target.path);trashedPaths.push(target.path);
   // An async OS operation can overlap a relink. Remove only unchanged records.
   const data=store.read(),removable=new Set(expected.filter(old=>data.items.some(item=>same(item,old))).map(item=>item.id));
   data.items=data.items.filter(item=>!removable.has(item.id));store.write(data);removed+=removable.size;
  }catch(error){failures.push(target.path+'：'+error.message);}
 }
 return {canceled:false,trashed:trashedPaths.length,trashedPaths,removed,failures};
}
async function executeTrashBatch(store,plan,recycleBatch,recycleItem){
 const paths=plan.targets.map(target=>target.path);
 const verify=()=>{
  if(!same(prepareTrash(store,plan.ids),plan))throw new Error('檔案或收藏已變更，請重新確認');
  return paths;
 };
 let outcomes=paths.length>1?await recycleBatch(verify):null;
 if(outcomes===null){
  verify();
  outcomes=[];
  for(const target of plan.targets){
   try{
    if(paths.length>1&&!same(snapshot(target.path),target.entries))throw new Error('檔案已變更，請重新確認');
    await recycleItem(target.path);
    outcomes.push(null);
   }catch(error){outcomes.push(error.message||'系統未確認已回收');}
  }
 }
 const failures=[],trashedPaths=[];
 for(const [index,filepath] of paths.entries()){
  if(outcomes[index]===null)trashedPaths.push(filepath);
  else failures.push(filepath+'：'+(outcomes[index]||'系統未確認已回收'));
 }
 let removed=0;
 const successful=new Set(trashedPaths),targets=plan.targets.filter(target=>successful.has(target.path));
 const covered=plan.affected.filter(item=>targets.some(target=>covers(target,item)));
 if(covered.length){
  try{
   const data=store.read(),expected=new Map(covered.map(item=>[item.id,item]));
   // Keep any bookmark added or relinked while the shell was running.
   const remaining=data.items.filter(item=>!same(item,expected.get(item.id)));
   if(remaining.length!==data.items.length){store.write({...data,items:remaining});removed=data.items.length-remaining.length;}
  }catch(error){failures.push('檔案已回收，但無法更新收藏：'+error.message);}
 }
 return {canceled:false,trashed:trashedPaths.length,trashedPaths,removed,failures};
}
module.exports={prepareTrash,executeTrash,executeTrashBatch};
