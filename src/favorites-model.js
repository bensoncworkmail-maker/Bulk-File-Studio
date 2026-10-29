'use strict';
(() => {
 const collator=new Intl.Collator('zh-Hant',{numeric:true,sensitivity:'base'});
 const COLUMNS=Object.freeze({name:{label:'名稱',width:'minmax(180px,1.2fr)',min:180,sort:'name'},location:{label:'位置',width:'minmax(210px,1.6fr)',min:210,sort:'path'},tags:{label:'標籤',width:'140px',min:140},type:{label:'類型',width:'90px',min:90,sort:'type'},size:{label:'大小',width:'100px',min:100,sort:'size'},modified:{label:'修改時間',width:'155px',min:155,sort:'modified'},status:{label:'狀態',width:'115px',min:115}});
 const DEFAULT_COLUMNS=Object.freeze(['name','location','tags','status']);
 const basename=value=>value.split(/[\\/]/).filter(Boolean).pop()||value;
 function columns(input){const found=Array.isArray(input)?[...new Set(input.filter(key=>Object.hasOwn(COLUMNS,key)))]:[...DEFAULT_COLUMNS];return ['name',...found.filter(key=>key!=='name')];}
 function tagList(items,sort='name',direction='asc'){
  const tags=new Map();for(const item of items)for(const tag of item.tags){const key=tag.toLocaleLowerCase(),prior=tags.get(key);tags.set(key,{key,name:prior?.name||tag,count:(prior?.count||0)+1,recent:Math.max(prior?.recent||0,Date.parse(item.updatedAt)||0)});}
  const sign=direction==='desc'?-1:1;
  return [...tags.values()].sort((a,b)=>((sort==='count'?a.count-b.count:sort==='recent'?a.recent-b.recent:collator.compare(a.name,b.name))||collator.compare(a.name,b.name))*sign);
 }
 function typeLabel(item){if(item.type==='folder')return '資料夾';const name=basename(item.path),index=name.lastIndexOf('.');return index>0&&index<name.length-1?name.slice(index+1).toUpperCase()+' 檔案':'檔案';}
 function sortItems(items,sort='recent',direction='desc'){
  const sign=direction==='desc'?-1:1;return [...items].sort((a,b)=>{let order;
   if(sort==='size'||sort==='modified'){const av=sort==='size'?a.size:a.modifiedMs,bv=sort==='size'?b.size:b.modifiedMs;if(av==null||bv==null)return av==null?(bv==null?collator.compare(a.path,b.path):1):-1;order=av-bv;}
   else if(sort==='recent')order=a.createdAt.localeCompare(b.createdAt);else if(sort==='type')order=collator.compare(typeLabel(a),typeLabel(b));else order=collator.compare(sort==='path'?a.path:a.label||basename(a.path),sort==='path'?b.path:b.label||basename(b.path));
   return (order||collator.compare(a.path,b.path))*sign;
  });
 }
 function sizeLabel(value){if(value==null)return '—';if(value===0)return '0 B';const units=['B','KB','MB','GB','TB'];const index=Math.min(4,Math.floor(Math.log(value)/Math.log(1024)));return (value/1024**index).toLocaleString('zh-Hant',{maximumFractionDigits:index?1:0})+' '+units[index];}
 const exports={COLUMNS,DEFAULT_COLUMNS,columns,tagList,typeLabel,sortItems,sizeLabel,basename};if(typeof module!=='undefined'&&module.exports)module.exports=exports;else globalThis.favoritesModel=Object.freeze(exports);
})();
