'use strict';
(() => {
 const TYPES=Object.freeze([
  {extension:'txt',label:'純文字 (.txt)'},{extension:'md',label:'Markdown (.md)'},
  {extension:'log',label:'記錄文字 (.log)'},{extension:'csv',label:'CSV 文字 (.csv)'},
  {extension:'json',label:'JSON 文字 (.json)'},{extension:'html',label:'HTML 原始文字 (.html)'}
 ]);
 function extension(input='txt'){
  if(typeof input!=='string'||!/^\.?[a-zA-Z0-9]{1,12}$/.test(input))throw new Error('副檔名請使用 1–12 個英文字母或數字');
  return input.replace(/^\./,'').toLowerCase();
 }
 function filters(value){const ext=extension(value),all=[{extension:ext,label:TYPES.find(type=>type.extension===ext)?.label||'自訂文字 (.'+ext+')'},...TYPES.filter(type=>type.extension!==ext)];return [...all.map(type=>({name:type.label+'（UTF-8 純文字）',extensions:[type.extension]})),{name:'所有檔案（UTF-8 文字內容）',extensions:['*']}];}
 const api={TYPES,extension,filters};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.draftExportTypes=Object.freeze(api);
})();
