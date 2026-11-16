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
 function select(input,key,explicit){
  const value=sort(input);if(!Object.hasOwn(columns.COLUMNS,key))return value;
  const next=['asc','desc'].includes(explicit)?explicit:key===value.key?(value.direction==='asc'?'desc':'asc'):value.directions[key]||'asc';
  return {key,direction:next,directions:{...value.directions,[key]:next}};
 }
 function effective(input,visible){const value=sort(input);return visible.includes(value.key)?value:{...value,key:'name',direction:value.directions.name||'asc'};}
 const api={sort,normalize,select,effective,MAX_SAVED};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.everythingViewSettings=Object.freeze(api);
})();
