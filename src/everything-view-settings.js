'use strict';
(() => {
 const columns=typeof module!=='undefined'&&module.exports?require('./everything-result-columns'):window.everythingResultColumns;
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,MAX_SAVED=100;
 const direction=value=>value==='desc'?'desc':'asc';
 function sort(input){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{},key=Object.hasOwn(columns.COLUMNS,value.key)?value.key:'name';
  const directions=Object.fromEntries(Object.keys(columns.COLUMNS).filter(name=>['asc','desc'].includes(value.directions?.[name])).map(name=>[name,value.directions[name]]));
  const current=direction(value.direction);directions[key]=current;return {key,direction:current,directions};
 }
 function normalize(input){if(!input||typeof input!=='object'||Array.isArray(input))return {};return Object.fromEntries(Object.entries(input).filter(([id])=>ID.test(id)).slice(-MAX_SAVED).map(([id,value])=>[id,sort(value)]));}
 function normalizeSelections(input,max=500){
  if(!input||typeof input!=='object'||Array.isArray(input))return {};
  const result={};let remaining=750000;
  for(const [id,paths] of Object.entries(input).reverse()){
   if(!ID.test(id)||!Array.isArray(paths))continue;
   const kept=[...new Set(paths.filter(path=>typeof path==='string'&&path.length>0&&path.length<=2000&&!/[\x00-\x1f]/.test(path)))].slice(0,max);
   if(!kept.length)continue;
   const size=kept.reduce((length,path)=>length+path.length,0);
   if(size>remaining||Object.keys(result).length>=30)break;
   result[id]=kept;remaining-=size;
  }
  return Object.fromEntries(Object.entries(result).reverse());
 }
 const pathKey=value=>/^[a-z]:[\\/]|^\\\\/i.test(value)?value.replaceAll('/','\\').toLowerCase():value;
 function select(input,key,explicit){
  const value=sort(input);if(!Object.hasOwn(columns.COLUMNS,key))return value;
  const next=['asc','desc'].includes(explicit)?explicit:key===value.key?(value.direction==='asc'?'desc':'asc'):value.directions[key]||'asc';
  return {key,direction:next,directions:{...value.directions,[key]:next}};
 }
 function effective(input,visible){const value=sort(input);return visible.includes(value.key)?value:{...value,key:'name',direction:value.directions.name||'asc'};}
 const api={sort,normalize,normalizeSelections,pathKey,select,effective,MAX_SAVED};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.everythingViewSettings=Object.freeze(api);
})();
