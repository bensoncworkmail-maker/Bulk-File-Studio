'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {inspectPath}=require('./favorites-store');
const key=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
const within=(parent,child)=>{const rel=path.relative(key(parent),key(child));return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Snapshot the whole subtree so the second confirmation covers its contents too.
function snapshot(filepath,result=[]){
 const actual=inspectPath(filepath),stat=fs.lstatSync(filepath,{bigint:true});
 if(result.length>=5000)throw new Error('每批回收最多 5000 個檔案／資料夾（含子項目）');
 result.push({path:filepath,type:actual.type,identity:actual.identity,size:String(stat.size),mtime:String(stat.mtimeNs)});
 if(actual.type==='folder')for(const name of fs.readdirSync(filepath).sort())snapshot(path.join(filepath,name),result);
 return result;
}
function prepareTrash(store,ids){
 const all=store.read().items,selected=store.selection({items:all},ids);
 for(const item of selected){if(key(item.path)===key(path.parse(item.path).root))throw new Error('不可回收磁碟根目錄');if(store.state(item).status!=='ready')throw new Error('收藏位置不可用或已被替換：'+item.path);}
 const roots=selected.filter(item=>!selected.some(other=>other!==item&&other.type==='folder'&&within(other.path,item.path)));
 const targets=roots.map(item=>({path:item.path,type:item.type,entries:snapshot(item.path)}));
 if(targets.reduce((count,target)=>count+target.entries.length,0)>5000)throw new Error('每批回收最多 5000 個檔案／資料夾（含子項目）');
 const affected=all.filter(item=>targets.some(target=>key(target.path)===key(item.path)||target.type==='folder'&&within(target.path,item.path)));
 return {ids:[...ids],selected,affected,targets};
}
async function executeTrash(store,plan,trashItem){
 if(!same(prepareTrash(store,plan.ids),plan))throw new Error('檔案或收藏已變更，請重新確認');
 const failures=[],trashedPaths=[];let removed=0;
 for(const target of plan.targets){
  try{
   const current=store.read();
   const fresh={path:target.path,type:target.type,entries:snapshot(target.path)};
   const expected=plan.affected.filter(item=>key(item.path)===key(target.path)||target.type==='folder'&&within(target.path,item.path));
   const related=current.items.filter(item=>key(item.path)===key(target.path)||target.type==='folder'&&within(target.path,item.path));
   if(!same(fresh,target)||!same(related,expected))throw new Error('檔案或收藏已變更，請重新確認');
   await trashItem(target.path);trashedPaths.push(target.path);
   // An async OS operation can overlap a relink. Remove only unchanged records.
   const data=store.read(),removable=new Set(expected.filter(old=>data.items.some(item=>same(item,old))).map(item=>item.id));
   data.items=data.items.filter(item=>!removable.has(item.id));store.write(data);removed+=removable.size;
  }catch(error){failures.push(target.path+'：'+error.message);}
 }
 return {canceled:false,trashed:trashedPaths.length,trashedPaths,removed,failures};
}
module.exports={prepareTrash,executeTrash};
