'use strict';
(() => {
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,LIMIT=12;
 const TYPES=Object.freeze({'new-record':'新增指定表格紀錄','import-paths':'匯入路徑並套用標籤','open-sheet':'開啟指定表格'});
 function entry(input){
  if(!input||typeof input!=='object'||!ID.test(input.id)||!Object.hasOwn(TYPES,input.type)||typeof input.label!=='string'||!input.label.trim()||input.label.trim().length>30||/[\x00-\x1f\x7f]/.test(input.label))throw new Error('快捷動作名稱或類型無效');
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean'||input.useClipboard!==undefined&&typeof input.useClipboard!=='boolean')throw new Error('快捷動作開關無效');
  const result={id:input.id,type:input.type,label:input.label.trim(),enabled:input.enabled!==false};
  if(input.type==='import-paths'){
   if(!Array.isArray(input.tags)||input.tags.length>20||input.tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.trim().length>32||/[\x00-\x1f\x7f]/.test(tag)))throw new Error('快捷標籤無效，每個最多 32 字元、每項最多 20 個');
   const tags=new Map();for(const tag of input.tags)tags.set(tag.trim().toLocaleLowerCase(),tag.trim());result.tags=[...tags.values()];result.useClipboard=input.useClipboard===true;
  }else{
   if(!ID.test(input.sheetId))throw new Error('請選擇快捷動作的表格');result.sheetId=input.sheetId;
   if(input.type==='new-record'&&input.masterId){if(!ID.test(input.masterId))throw new Error('預設主紀錄無效');result.masterId=input.masterId;}
  }
  return result;
 }
 function normalize(input,strict=false){
  if(!Array.isArray(input)||input.length>LIMIT){if(strict)throw new Error('快捷動作最多 '+LIMIT+' 項');return [];}
  const actions=[],ids=new Set();for(const value of input)try{const action=entry(value);if(ids.has(action.id))throw new Error('快捷動作識別碼重複');ids.add(action.id);actions.push(action);}catch(error){if(strict)throw error;}
  return actions;
 }
 const api={ID,LIMIT,TYPES,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.quickActionsModel=Object.freeze(api);
})();
