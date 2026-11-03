'use strict';
(() => {
 const LIMIT=12,DAY_LIMIT=3650;
 const TYPES=Object.freeze({all:'不限日期',today:'今天',yesterday:'昨天','last-days':'最近 N 天（含今天）','this-week':'本週（週一至週日）','last-week':'上週（週一至週日）','this-month':'本月','last-month':'上月',relative:'相對今天的起迄日',fixed:'固定日期範圍'});
 const DEFAULTS=Object.freeze([
  Object.freeze({id:'today',label:'今天',type:'today',enabled:true}),
  Object.freeze({id:'last7',label:'最近 7 天',type:'last-days',days:7,enabled:true}),
  Object.freeze({id:'last30',label:'最近 30 天',type:'last-days',days:30,enabled:true}),
  Object.freeze({id:'month',label:'本月',type:'this-month',enabled:true}),
  Object.freeze({id:'all',label:'不限日期',type:'all',enabled:true})
 ]);
 const fail=message=>{throw new Error(message);};
 function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
 function entry(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(input.id))fail('日期快捷按鈕識別碼無效');
  if(typeof input.label!=='string'||!input.label.trim()||input.label.trim().length>24||/[\x00-\x1f\x7f]/.test(input.label))fail('日期快捷按鈕名稱須為 1–24 字元');
  if(!Object.hasOwn(TYPES,input.type))fail('日期快捷範圍類型無效');
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean')fail('日期快捷顯示開關無效');
  const out={id:input.id,label:input.label.trim(),type:input.type,enabled:input.enabled!==false};
  if(input.type==='last-days'){if(!Number.isInteger(input.days)||input.days<1||input.days>DAY_LIMIT)fail('最近天數請填 1–3650');out.days=input.days;}
  if(input.type==='relative'){for(const key of ['fromOffset','toOffset'])if(!Number.isInteger(input[key])||Math.abs(input[key])>DAY_LIMIT)fail('相對天數請填 -3650 至 3650 的整數');if(input.fromOffset>input.toOffset)fail('日期快捷起日不可晚於迄日');out.fromOffset=input.fromOffset;out.toOffset=input.toOffset;}
  if(input.type==='fixed'){if(!validDate(input.from)||!validDate(input.to))fail('請選擇有效的固定日期');if(input.from>input.to)fail('日期快捷起日不可晚於迄日');out.from=input.from;out.to=input.to;}
  return out;
 }
 function normalize(input,strict=false){
  if(input===undefined)return DEFAULTS.map(item=>({...item}));
  if(!Array.isArray(input)||input.length>LIMIT){if(strict)fail('日期快捷按鈕最多 12 個');return DEFAULTS.map(item=>({...item}));}
  const out=[],ids=new Set();for(const item of input)try{const clean=entry(item);if(ids.has(clean.id))fail('日期快捷按鈕識別碼重複');ids.add(clean.id);out.push(clean);}catch(error){if(strict)throw error;}
  return out;
 }
 function iso(value){return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');}
 // Calendar arithmetic in local time preserves the displayed date across DST.
 function range(input,now=new Date()){
  const value=entry(input);if(value.type==='all')return {modifiedFrom:'',modifiedTo:''};if(value.type==='fixed')return {modifiedFrom:value.from,modifiedTo:value.to};
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('目前日期無效');
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12),day=offset=>{const date=new Date(today);date.setDate(date.getDate()+offset);return date;};let from=day(0),to=day(0);
  if(value.type==='yesterday')from=to=day(-1);
  if(value.type==='last-days')from=day(1-value.days);
  if(value.type==='relative'){from=day(value.fromOffset);to=day(value.toOffset);}
  if(['this-week','last-week'].includes(value.type)){const start=-((today.getDay()+6)%7)-(value.type==='last-week'?7:0);from=day(start);to=day(start+6);}
  if(['this-month','last-month'].includes(value.type)){const month=today.getMonth()-(value.type==='last-month'?1:0);from=new Date(today.getFullYear(),month,1,12);to=new Date(today.getFullYear(),month+1,0,12);}
  return {modifiedFrom:iso(from),modifiedTo:iso(to)};
 }
 const api={LIMIT,DAY_LIMIT,TYPES,DEFAULTS,normalize,range};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.searchDatePresets=Object.freeze(api);
})();
