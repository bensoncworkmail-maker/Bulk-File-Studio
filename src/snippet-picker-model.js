'use strict';
(() => {
 const DEFAULTS=Object.freeze({width:360,height:460,fontSize:13,density:'compact',groupTone:'accent',accent:'',previewLines:0,showCounts:true,showHint:true,rememberGroups:true,defaultExpanded:true});
 const ranges={width:[280,800],height:[240,1000],fontSize:[12,20],previewLines:[0,2]};
 function normalize(input,strict=false){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  if(strict&&value!==input)throw new Error('片段選擇窗設定無效');
  const out={...DEFAULTS};
  for(const key of Object.keys(out)){
   if(!Object.hasOwn(value,key))continue;
   const item=value[key],range=ranges[key];
   const valid=range?Number.isInteger(item)&&item>=range[0]&&item<=range[1]:key==='density'?['compact','comfortable'].includes(item):key==='groupTone'?['accent','strong','neutral'].includes(item):key==='accent'?typeof item==='string'&&(item===''||/^#[\da-f]{6}$/i.test(item)):typeof item==='boolean';
   if(strict&&!valid)throw new Error('片段選擇窗設定無效：'+key);
   if(valid)out[key]=key==='accent'?item.toLowerCase():item;
  }
  return out;
 }
 function history(input){
  const groups=new Map();
  if(Array.isArray(input))for(const pair of input.slice(-500))if(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&pair[0].length<=60&&!pair[0].includes('\0')&&typeof pair[1]==='boolean')groups.set(pair[0],pair[1]);
  return [...groups];
 }
 function updateGroups(previous,changes,categories){
  const allowed=new Set(categories);
  if(!Array.isArray(changes)||changes.length>500||history(changes).length!==changes.length||changes.some(([key])=>!allowed.has(key)))throw new Error('片段分類狀態無效');
  const groups=new Map(history(previous).filter(([key])=>allowed.has(key)));
  for(const [key,open] of changes){groups.delete(key);groups.set(key,open);}
  return [...groups].slice(-500);
 }
 function grouped(rows,prefs,saved){
  const states=new Map(prefs.rememberGroups?history(saved):[]),groups=new Map();
  for(const row of rows){const key=row.groupKey??row.detail??'';if(!groups.has(key))groups.set(key,{key,label:key||'未分類',open:states.has(key)?states.get(key):prefs.defaultExpanded,rows:[]});groups.get(key).rows.push(row);}
  const compare=new Intl.Collator('zh-Hant',{numeric:true});
  return [...groups.values()].sort((a,b)=>a.key&&b.key?compare.compare(a.label,b.label):Number(!a.key)-Number(!b.key));
 }
 function accentForeground(color){
  const rgb=color.slice(1).match(/../g).map(pair=>parseInt(pair,16)/255)
   .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#000000':'#ffffff';
 }
 const api={DEFAULTS,normalize,history,updateGroups,grouped,accentForeground};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.snippetPickerModel=api;
})();
