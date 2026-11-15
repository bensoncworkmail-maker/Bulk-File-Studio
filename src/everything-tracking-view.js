'use strict';
(() => {
 const collator=new Intl.Collator('zh-Hant',{numeric:true,sensitivity:'base'});
 function location(item){
  const value=item.path,index=Math.max(value.lastIndexOf('\\'),value.lastIndexOf('/'));
  return index===0?value.slice(0,1):index===2&&value[1]===':'?value.slice(0,3):index<0?'':value.slice(0,index);
 }
 function sortedRows(rows,key='name',direction='asc'){
  const number=key==='size'||key==='modified',sign=direction==='desc'?-1:1;
  const value=item=>key==='location'?location(item):key==='size'?item.type==='folder'?null:item.size:key==='modified'?item.modifiedMs:item.name;
  return rows.map((item,index)=>({item,index})).sort((a,b)=>{
   const left=value(a.item),right=value(b.item);
   if(number){const l=Number.isFinite(left),r=Number.isFinite(right);if(l!==r)return l?-1:1;if(!l)return a.index-b.index;}
   return (number?left-right:collator.compare(left||'',right||''))*sign||a.index-b.index;
  });
 }
 const api={location,sortedRows};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.everythingTrackingView=Object.freeze(api);
})();
