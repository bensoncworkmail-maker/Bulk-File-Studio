'use strict';
(()=>{
 const TOOLS=Object.freeze({snippets:'常用文字',clipboard:'剪貼簿',files:'檔案',planning:'日曆',drafts:'草稿'});
 function normalize(input,strict=false,topmost=true){
  if(strict&&(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!Object.hasOwn(TOOLS,key))))throw Error('浮動工具配置無效');
  const result={};for(const kind of Object.keys(TOOLS)){const raw=input?.[kind]||{};if(strict&&(typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['placement','pinned','topmost','visible','collapsed','opacity','displayId','bounds','panelSize'].includes(key))))throw Error('浮動工具配置無效：'+kind);const row={placement:'quick',pinned:false,topmost,visible:false,collapsed:false,opacity:100,displayId:null,bounds:null,panelSize:null};
   for(const key of ['placement','pinned','topmost','visible','collapsed','opacity','displayId','bounds','panelSize'])if(Object.hasOwn(raw,key)){
    const value=raw[key];let valid=key==='placement'?['quick','pinned','main'].includes(value):key==='opacity'?Number.isFinite(value)&&value>=40&&value<=100:key==='displayId'?value===null||typeof value==='string'||Number.isFinite(value):key==='panelSize'?value===null||value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&Object.hasOwn(value,'width')&&Object.hasOwn(value,'height')&&Number.isInteger(value.width)&&Number.isInteger(value.height)&&value.width>=380&&value.width<=1600&&value.height>=360&&value.height<=1200:key==='bounds'?value===null||value&&['x','y','width','height'].every(k=>Number.isFinite(value[k]))&&value.width>=160&&value.height>=80&&value.width<=16000&&value.height<=16000:typeof value==='boolean';
    if(!valid){if(strict)throw Error('浮動工具配置無效：'+kind+'.'+key);continue;}row[key]=key==='panelSize'&&value?{width:value.width,height:value.height}:key==='bounds'&&value?Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.round(value[k])])):value;
   }result[kind]=row;
  }return result;
 }
 const api={TOOLS,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.floatingToolLayout=api;
})();
