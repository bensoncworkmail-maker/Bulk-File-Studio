'use strict';
(() => {
 const collator=new Intl.Collator('zh-Hant',{numeric:true,sensitivity:'base'});
 const columns=typeof module!=='undefined'&&module.exports?require('./everything-result-columns'):window.everythingResultColumns;
 const location=columns.location;
 function filterRows(entries,text=''){
  const words=String(text).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return words.length?entries.filter(({item})=>{const haystack=(item.name+'\n'+item.path).toLocaleLowerCase();return words.every(word=>haystack.includes(word));}):entries;
 }
 function sortedRows(rows,key='name',direction='asc'){
  const number=columns.COLUMNS[key]?.number===true,sign=direction==='desc'?-1:1;
  const value=item=>columns.value(item,key);
  return rows.map((item,index)=>({item,index})).sort((a,b)=>{
   const left=value(a.item),right=value(b.item);
   if(number){const l=Number.isFinite(left),r=Number.isFinite(right);if(l!==r)return l?-1:1;if(!l)return a.index-b.index;}
   return (number?left-right:collator.compare(left||'',right||''))*sign||a.index-b.index;
  });
 }
 const api={location,sortedRows,filterRows};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.everythingTrackingView=Object.freeze(api);
})();
