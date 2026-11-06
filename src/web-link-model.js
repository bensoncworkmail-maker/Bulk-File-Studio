'use strict';
(() => {
 function normalize(value){
  if(typeof value!=='string'||!value.trim()||value.length>2000||/[\x00-\x20\x7f\\]/.test(value.trim()))throw new Error('網址請使用完整的 http:// 或 https:// 位址');
  let url;try{url=new URL(value.trim());}catch{throw new Error('網址格式無效');}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('只接受不含帳號密碼的 HTTP／HTTPS 網址');
  return url.href;
 }
 function valid(value){try{normalize(value);return true;}catch{return false;}}
 const api={normalize,valid};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.webLinkModel=api;
})();
