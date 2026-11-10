'use strict';

const {createHash}=require('node:crypto');
const {ID,LIMITS}=require('./notes-model');
const MAX_SAVED_TABLES=2*LIMITS.sheets;
const SORTS=Object.freeze(['recent','oldest','title']);
const DISPLAY=Object.freeze({showCount:false,showEmptyPins:false,showWindowPin:true});

function normalize(input,strict=false){
 const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const ids=Array.isArray(value.sheetIds)?value.sheetIds:[];
 const validIds=ids.filter(id=>typeof id==='string'&&ID.test(id));
 if(strict&&(value!==input||!['all','selected'].includes(value.scope)||
  !Array.isArray(value.sheetIds)||ids.length>MAX_SAVED_TABLES||validIds.length!==ids.length||
  !['list','cards'].includes(value.layout)||!SORTS.includes(value.sort)||
  value.dateSource!==undefined&&!['followUp','modified'].includes(value.dateSource)||
  Object.keys(DISPLAY).some(key=>value[key]!==undefined&&typeof value[key]!=='boolean')||
  value.previewLines!==undefined&&(!Number.isSafeInteger(value.previewLines)||value.previewLines<0||value.previewLines>5))){
  throw new Error('查看紀錄設定無效');
 }
 return {
  scope:value.scope==='selected'?'selected':'all',
  sheetIds:[...new Set(validIds)].slice(0,MAX_SAVED_TABLES),
  layout:value.layout==='cards'?'cards':'list',
  sort:SORTS.includes(value.sort)?value.sort:'recent',
  dateSource:value.dateSource==='modified'?'modified':'followUp',
  previewLines:Number.isSafeInteger(value.previewLines)&&value.previewLines>=0&&value.previewLines<=5?value.previewLines:1,
  ...Object.fromEntries(Object.entries(DISPLAY).map(([key,fallback])=>[key,typeof value[key]==='boolean'?value[key]:fallback]))
 };
}

function allowedSheet(config,settings,sheetId){
 if(config.sheetId)return config.sheetId===sheetId;
 return settings.scope==='all'||settings.sheetIds.includes(sheetId);
}

function normalizeFilters(input){
 const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const filters={query:typeof value.query==='string'?value.query.slice(0,256):''};
 for(const key of ['sheetId','masterId','dateField','stateField']){
  if(typeof value[key]==='string'&&ID.test(value[key]))filters[key]=value[key];
 }
 for(const key of ['from','to']){
  if(typeof value[key]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value[key])){
   const date=new Date(value[key]+'T12:00:00Z');
   if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value[key])filters[key]=value[key];
  }
 }
 if(filters.stateField&&typeof value.value==='string')filters.value=value.value.slice(0,200);
 if(['list','cards'].includes(value.layout))filters.layout=value.layout;
 if(SORTS.includes(value.sort))filters.sort=value.sort;
 for(const key of ['advanced','pinnedOnly','pinsExpanded'])if(typeof value[key]==='boolean')filters[key]=value[key];
 return filters;
}

const logFilterKey=config=>createHash('sha256').update(JSON.stringify([config.sheetId,config.scope,config.query])).digest('hex');
function normalizeHistory(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return Object.fromEntries(Object.entries(value).filter(([key])=>/^[a-f0-9]{64}$/.test(key)).slice(-24)
  .map(([key,filters])=>[key,normalizeFilters(filters)]));
}

module.exports={normalize,allowedSheet,normalizeFilters,logFilterKey,normalizeHistory};
