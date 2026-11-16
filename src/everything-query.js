'use strict';
(() => {
 const MAX_QUERY=4096;
 // Explicit extension lists work with IPC without relying on GUI filter macros.
 const FILE_TYPES=Object.freeze({
  audio:'aac;ac3;aif;aiff;amr;ape;au;flac;m4a;m4b;mid;midi;mka;mp2;mp3;oga;ogg;opus;ra;wav;wma',
  compressed:'7z;ace;arj;bz2;cab;gz;gzip;iso;lha;lzh;lz;lzma;rar;tar;tgz;txz;xz;z;zip;zipx;zst',
  document:'csv;doc;docm;docx;epub;htm;html;log;md;odp;ods;odt;pdf;ppt;pptm;pptx;rtf;tex;text;tsv;txt;wpd;wps;xls;xlsb;xlsm;xlsx;xml',
  executable:'appx;appxbundle;bat;cmd;com;exe;msi;msix;msixbundle;msp;msu;ps1;scr;vbs',
  picture:'arw;avif;bmp;cr2;cr3;dng;gif;heic;heif;ico;jpeg;jpg;jxl;nef;png;psd;raw;rw2;svg;tif;tiff;webp',
  video:'3g2;3gp;asf;avi;divx;flv;m2ts;m2v;m4v;mkv;mov;mp4;mpeg;mpg;mts;ogm;ogv;rm;rmvb;ts;vob;webm;wmv',
  pdf:'pdf',
  spreadsheet:'csv;ods;tsv;xls;xlsb;xlsm;xlsx',
  presentation:'key;odp;ppt;pptm;pptx',
  text:'conf;ini;json;log;md;rtf;tex;text;toml;txt;xml;yaml;yml',
  code:'c;cc;cpp;cs;css;go;h;hpp;html;java;js;jsx;kt;lua;php;py;rb;rs;sh;sql;swift;ts;tsx;vue',
  ebook:'azw;azw3;cbz;cbr;epub;fb2;mobi',
  database:'accdb;db;db3;mdb;sqlite;sqlite3',
  font:'eot;otf;ttc;ttf;woff;woff2',
  diskimage:'bin;dmg;img;iso;mdf;nrg;vhd;vhdx;vmdk;vdi',
  subtitle:'ass;smi;srt;ssa;sub;vtt',
  design:'ai;blend;cad;dwg;dxf;eps;fig;indd;psb;psd;sketch;stl;step;stp;xd'
 });
 function normalizeExtensions(input){
  if(typeof input!=='string'||input.length>2048)throw Error('副檔名清單無效');
  const values=input.trim().split(/[;,，\s]+/).filter(Boolean).map(value=>value.replace(/^\./,'').toLowerCase());
  if(!values.length||values.length>100||values.some(value=>!/^[-a-z0-9_+]{1,20}$/.test(value)))throw Error('請輸入 1–100 個副檔名，以逗號、空格或分號分隔（不含萬用字元）');
  return [...new Set(values)].sort().join(';');
 }
 function normalizeQuery(input){
  if(!input||typeof input!=='object'||typeof input.text!=='string'||typeof input.type!=='string'||!(['all','file','folder','custom'].includes(input.type)||Object.hasOwn(FILE_TYPES,input.type)))throw Error('搜尋條件無效');
  const mode=input.mode===undefined?'simple':input.mode;
  if(!['simple','syntax'].includes(mode))throw Error('搜尋語法模式無效');
  const text=input.text.trim();
  if(!text||text.length>MAX_QUERY||/[\x00-\x1f\x7f]/.test(text))throw Error('請輸入 1–4096 字的單行 Everything 搜尋條件');
  if(mode==='simple'&&(text.length>256||/[":<>|]/.test(text)))throw Error('檔名模式只接受 1–256 字關鍵字或萬用字元；進階條件請切換 Everything 語法');
  return {text,type:input.type,mode,...(input.type==='custom'?{extensions:normalizeExtensions(input.extensions)}:{})};
 }
 function buildQuery(input){
  const query=normalizeQuery(input);
  const extensions=query.type==='custom'?query.extensions:FILE_TYPES[query.type];
  if(extensions){
   const text=query.mode==='syntax'?query.text:query.text.split(/\s+/).map(word=>'"'+word+'"').join(' ');
   // Group the entire user expression so OR branches cannot bypass the type filter.
   return 'file: ext:'+extensions+' <'+text+'>';
  }
  if(query.mode==='syntax')return query.text;
  return (query.type==='file'?'file: ':query.type==='folder'?'folder: ':'')+query.text.split(/\s+/).map(word=>'"'+word+'"').join(' ');
 }
 function searchExpression(input){const query=normalizeQuery(input),text=buildQuery(query);return query.mode==='syntax'&&['file','folder'].includes(query.type)?query.type+': <'+text+'>':text;}
 const api={searchExpression,normalizeQuery,buildQuery,MAX_QUERY,FILE_TYPES,normalizeExtensions};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.everythingQuery=Object.freeze(api);
})();
