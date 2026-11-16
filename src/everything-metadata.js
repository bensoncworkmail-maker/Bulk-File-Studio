'use strict';
const path=require('node:path');
const FLAGS=Object.freeze(['-full-path-and-name','-date-created','-date-accessed','-attributes','-date-recently-changed','-run-count','-date-run','-file-list-file-name','-date-format','2','-no-digit-grouping']);
function date(value){if(!/^\d{1,20}$/.test(value)||BigInt(value)===0n)return null;const ms=Number((BigInt(value)-116444736000000000n)/10000n);return Number.isFinite(ms)&&Math.abs(ms)<=8640000000000000?ms:null;}
function parse(bytes){
 if(bytes.length>20*1024*1024)throw Error('搜尋輸出過大，請縮小搜尋範圍');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch{throw Error('ES 輸出不是 UTF-8，請更新官方 ES 工具');}
 const records=[];let row=[],field='',quoted=false,closed=false;
 function cell(){row.push(field);field='';closed=false;}
 function record(){cell();if(row.some(value=>value!=='')){if(row.length!==8)throw Error('ES 額外欄位格式無效，請更新官方 ES 工具');records.push(row);if(records.length>501)throw Error('ES 未遵守結果上限，請更新官方 ES 工具');}row=[];}
 for(let i=0;i<text.length;i++){
  const char=text[i];if(quoted){if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else {quoted=false;closed=true;}}else field+=char;continue;}
  if(char==='"'){if(field||closed)throw Error('ES CSV 格式無效');quoted=true;}
  else if(char===',')cell();else if(char==='\r'||char==='\n'){if(char==='\r'&&text[i+1]==='\n')i++;record();}else {if(closed)throw Error('ES CSV 格式無效');field+=char;}
 }
 if(quoted)throw Error('ES CSV 格式無效');if(field||row.length||closed)record();
 const rows=[],seen=new Set();let skipped=0;
 for(const [file,created,accessed,attributes,recentlyChanged,runCount,dateRun,fileList] of records){
  if(!/^[a-z]:[\\/]/i.test(file)||file.length>32767||/["\x00-\x1f\x7f]/.test(file)){skipped++;continue;}
  const key=path.win32.normalize(file).toLowerCase();if(seen.has(key))continue;seen.add(key);
  rows.push({path:file,name:path.win32.basename(file),createdMs:date(created),accessedMs:date(accessed),attributes:/^[a-z0-9 -]{1,64}$/i.test(attributes)?attributes:null,recentlyChangedMs:date(recentlyChanged),runCount:/^\d{1,15}$/.test(runCount)&&Number.isSafeInteger(Number(runCount))?Number(runCount):null,dateRunMs:date(dateRun),fileList:fileList.length<=32767&&!/[\x00-\x1f\x7f]/.test(fileList)?fileList:null});
 }
 return {rows:rows.slice(0,500),truncated:records.length>500,skipped};
}
module.exports={FLAGS,parse,date};
