'use strict';
(()=>{
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const SOURCES=['records','paths','favorites','tags','structure','tools','presets','sources'];
 const DEFAULTS=Object.freeze({tableMode:'all',sheetIds:[],modifiedFrom:'',modifiedTo:'',includePaths:true,includeTags:true,includeNotes:true,sources:[...SOURCES]});
 function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
 function normalize(input={},strict=false){
  if(!input||typeof input!=='object'||Array.isArray(input)){if(strict)throw new Error('搜尋條件無效');input={};}
  const result={...DEFAULTS,sheetIds:[],sources:[...SOURCES]};
  if(['all','selected'].includes(input.tableMode))result.tableMode=input.tableMode;
  if(Array.isArray(input.sheetIds))result.sheetIds=[...new Set(input.sheetIds.filter(id=>typeof id==='string'&&ID.test(id)))].slice(0,100);
  if(Array.isArray(input.sources))result.sources=[...new Set(input.sources.filter(kind=>SOURCES.includes(kind)))];
  for(const key of ['includePaths','includeTags','includeNotes'])if(typeof input[key]==='boolean')result[key]=input[key];
  for(const key of ['modifiedFrom','modifiedTo'])if(date(input[key]))result[key]=input[key];else if(strict&&input[key])throw new Error('修改日期格式無效');
  if(result.modifiedFrom&&result.modifiedTo&&result.modifiedFrom>result.modifiedTo){if(strict)throw new Error('修改日期起日不可晚於迄日');result.modifiedFrom=result.modifiedTo='';}
  return result;
 }
 // Local calendar boundaries, matching the date shown to the desktop user.
 function inRange(value,criteria){if(!criteria.modifiedFrom&&!criteria.modifiedTo)return true;const time=Date.parse(value);if(!Number.isFinite(time))return false;const start=criteria.modifiedFrom?new Date(criteria.modifiedFrom+'T00:00:00').getTime():-Infinity,end=criteria.modifiedTo?new Date(criteria.modifiedTo+'T00:00:00').getTime():Infinity;const after=criteria.modifiedTo?new Date(end):null;if(after)after.setDate(after.getDate()+1);return time>=start&&time<(after?after.getTime():Infinity);}
 function summary(input){const c=normalize(input),parts=[];if(c.tableMode==='selected')parts.push('指定 '+c.sheetIds.length+' 張表格');if(c.modifiedFrom||c.modifiedTo)parts.push('修改：'+(c.modifiedFrom||'不限')+' ～ '+(c.modifiedTo||'不限'));if(!c.includePaths)parts.push('不比對位置');if(!c.includeTags)parts.push('不比對標籤');if(!c.includeNotes)parts.push('不比對筆記');if(c.sources.length!==SOURCES.length)parts.push(c.sources.length+' 種來源');return parts.join(' · ');}
 const api={DEFAULTS,SOURCES,normalize,inRange,summary};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.searchCriteriaModel=Object.freeze(api);
})();
