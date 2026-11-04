'use strict';

const {ID,LIMITS}=require('./notes-model');
const MAX_SAVED_TABLES=2*LIMITS.sheets;
const SORTS=Object.freeze(['recent','oldest','title']);

function normalize(input,strict=false){
 const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const ids=Array.isArray(value.sheetIds)?value.sheetIds:[];
 const validIds=ids.filter(id=>typeof id==='string'&&ID.test(id));
 if(strict&&(value!==input||!['all','selected'].includes(value.scope)||
  !Array.isArray(value.sheetIds)||ids.length>MAX_SAVED_TABLES||validIds.length!==ids.length||
  !['list','cards'].includes(value.layout)||!SORTS.includes(value.sort))){
  throw new Error('查看紀錄設定無效');
 }
 return {
  scope:value.scope==='selected'?'selected':'all',
  sheetIds:[...new Set(validIds)].slice(0,MAX_SAVED_TABLES),
  layout:value.layout==='cards'?'cards':'list',
  sort:SORTS.includes(value.sort)?value.sort:'recent'
 };
}

function allowedSheet(config,settings,sheetId){
 if(config.sheetId)return config.sheetId===sheetId;
 return settings.scope==='all'||settings.sheetIds.includes(sheetId);
}

module.exports={normalize,allowedSheet};
