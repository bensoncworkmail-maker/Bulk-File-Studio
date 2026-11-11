'use strict';
(() => {
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function normalize(input,strict=false){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{},ids=Array.isArray(value.sheetIds)?value.sheetIds:[];
  if(strict&&(value!==input||!['all','selected'].includes(value.scope)||!Array.isArray(value.sheetIds)||ids.length>200||ids.some(id=>typeof id!=='string'||!ID.test(id))||typeof value.includeStandalone!=='boolean'))throw new Error('日曆表格範圍設定無效');
  return {scope:value.scope==='selected'?'selected':'all',sheetIds:[...new Set(ids.filter(id=>typeof id==='string'&&ID.test(id)))].slice(0,200),includeStandalone:value.includeStandalone!==false};
 }
 function allows(input,sheetId,standalone=false){const scope=normalize(input);return standalone?scope.includeStandalone:scope.scope==='all'||scope.sheetIds.includes(sheetId);}
 const api={normalize,allows};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.calendarScope=Object.freeze(api);
})();
