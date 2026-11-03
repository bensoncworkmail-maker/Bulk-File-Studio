'use strict';
const fs=require('node:fs');
const fields=['dev','ino','birthtimeNs','size','mtimeNs','ctimeNs'];
const same=(a,b)=>fields.every(field=>a[field]===b[field]);
// Callers validate the allowed directory/path before using this byte reader.
function readStableBytes(filename,{maxBytes,label='資料包'}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0)throw new Error('檔案大小限制無效');
 const initial=fs.lstatSync(filename,{bigint:true}),size=Number(initial.size);
 if(!initial.isFile()||!Number.isSafeInteger(size)||size>maxBytes)throw new Error(label+'必須是 '+Math.floor(maxBytes/1024/1024)+' MB 內的一般檔案');
 const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));
 try{
  const opened=fs.fstatSync(fd,{bigint:true});
  if(!opened.isFile()||!same(initial,opened))throw new Error(label+'已被替換或正在更新，請重新選取');
  const buffer=Buffer.allocUnsafe(size+1);let offset=0;
  while(offset<buffer.length){const count=fs.readSync(fd,buffer,offset,buffer.length-offset,null);if(!count)break;offset+=count;}
  if(offset!==size||!same(opened,fs.fstatSync(fd,{bigint:true}))||!same(opened,fs.lstatSync(filename,{bigint:true})))throw new Error(label+'讀取期間已變更或被替換，請重試');
  return buffer.subarray(0,offset);
 }finally{fs.closeSync(fd);}
}
module.exports={readStableBytes};
