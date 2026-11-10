'use strict';
(() => {
 function normalize(value){
  if(typeof value!=='string'||!value.trim()||value.length>2000||/[\x00-\x20\x7f\\]/.test(value.trim()))throw new Error('網址請使用完整的 http:// 或 https:// 位址');
  let url;try{url=new URL(value.trim());}catch{throw new Error('網址格式無效');}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('只接受不含帳號密碼的 HTTP／HTTPS 網址');
  return url.href;
 }
 function valid(value){try{normalize(value);return true;}catch{return false;}}
 function links(value,{whole=false}={}){
  if(typeof value!=='string')return [];
  const trimmed=value.trim();
  if(whole){
   return valid(trimmed)?[{start:value.indexOf(trimmed),text:trimmed,url:normalize(trimmed)}]:[];
  }
  const found=[];
  for(const match of value.matchAll(/(^|[^-a-z0-9_:/@.])(https?:\/\/(?:(?![,;]https?:\/\/)[^\s<>"'`，。；：！？、（）［］【】「」『』《》])+)/gi)){
   const start=match.index+match[1].length;
   let text=match[2];
   if(text===trimmed&&valid(text)){
    found.push({start,text,url:normalize(text)});
    continue;
   }
   const trailing=/[.,;:!?]+$/;
   const balance={')':0,']':0,'}':0};
   for(const char of text){
    if(char==='(')balance[')']++;
    else if(char==='[')balance[']']++;
    else if(char==='{')balance['}']++;
    else if(Object.hasOwn(balance,char))balance[char]--;
   }
   text=text.replace(trailing,'');
   while(balance[text.at(-1)]<0){
    balance[text.at(-1)]++;
    text=text.slice(0,-1).replace(trailing,'');
   }
   if(!valid(text))continue;
   found.push({start,text,url:normalize(text)});
  }
  return found;
 }
 const api={normalize,valid,links};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.webLinkModel=api;
})();
