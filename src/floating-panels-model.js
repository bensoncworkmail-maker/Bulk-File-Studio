'use strict';
(() => {
 const PANELS=Object.freeze({planning:'日曆／看板',snippets:'常用文字片段'});
 const keys=Object.keys(PANELS);
 const known=id=>typeof id==='string'&&Object.hasOwn(PANELS,id);
 const ids=value=>Array.isArray(value)?[...new Set(value.filter(known))]:[];
 function normalize(input,strict=false){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const enabled=Array.isArray(value.enabled)?ids(value.enabled):keys.slice();
  const order=ids(value.order);
  if(strict&&(value!==input||!Array.isArray(value.enabled)||enabled.length!==value.enabled.length||
   !Array.isArray(value.order)||order.length!==value.order.length||
   !(value.defaultPanel==='files'||enabled.includes(value.defaultPanel))||
   typeof value.collapsedMenu!=='boolean'||!['calendar','list','board'].includes(value.planningMode)||
   (value.snippetLayout!==undefined&&!['compact','preview'].includes(value.snippetLayout))||
   typeof value.snippetQuery!=='string'||value.snippetQuery.length>256||value.snippetQuery.includes('\0'))){
   throw new Error('浮動內容設定無效');
  }
  return {
   enabled,order:[...new Set([...order,...keys])],
   defaultPanel:enabled.includes(value.defaultPanel)?value.defaultPanel:'files',
   collapsedMenu:value.collapsedMenu!==false,
   planningMode:['list','board'].includes(value.planningMode)?value.planningMode:'calendar',
   snippetLayout:value.snippetLayout==='preview'?'preview':'compact',
   snippetQuery:typeof value.snippetQuery==='string'?value.snippetQuery.replace(/\0/g,'').slice(0,256):''
  };
 }
 function enabledPanels(settings){
  return settings.order.filter(id=>settings.enabled.includes(id));
 }
 const model={PANELS,normalize,enabledPanels};
 if(typeof module!=='undefined'&&module.exports)module.exports=model;
 else window.floatingPanelsModel=model;
})();
