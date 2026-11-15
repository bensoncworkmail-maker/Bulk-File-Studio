'use strict';
(() => {
 const MAX_QUERY=4096;
 function normalizeQuery(input){
  if(!input||typeof input!=='object'||typeof input.text!=='string'||!['all','file','folder'].includes(input.type))throw Error('搜尋條件無效');
  const mode=input.mode===undefined?'simple':input.mode;
  if(!['simple','syntax'].includes(mode))throw Error('搜尋語法模式無效');
  const text=input.text.trim();
  if(!text||text.length>MAX_QUERY||/[\x00-\x1f\x7f]/.test(text))throw Error('請輸入 1–4096 字的單行 Everything 搜尋條件');
  if(mode==='simple'&&(text.length>256||/[":<>|]/.test(text)))throw Error('檔名模式只接受 1–256 字關鍵字或萬用字元；進階條件請切換 Everything 語法');
  return {text,type:input.type,mode};
 }
 function buildQuery(input){
  const query=normalizeQuery(input);
  if(query.mode==='syntax')return query.text;
  return (query.type==='file'?'file: ':query.type==='folder'?'folder: ':'')+query.text.split(/\s+/).map(word=>'"'+word+'"').join(' ');
 }
 const api={normalizeQuery,buildQuery,MAX_QUERY};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.everythingQuery=Object.freeze(api);
})();
