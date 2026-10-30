'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{TextDecoder}=require('node:util');
const {assertLocalPath}=require('./offline-policy');
const {LIMITS}=require('./notes-model');
function readPackageFile(filename){
 assertLocalPath(filename);const initial=fs.lstatSync(filename);if(!initial.isFile()||initial.size>LIMITS.bytes)throw new Error('資料包必須是 20 MB 以內的一般 JSON 檔案');
 const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>LIMITS.bytes)throw new Error('資料包過大或不是一般檔案');const buffer=Buffer.allocUnsafe(stat.size+1);let size=0;while(size<buffer.length){const count=fs.readSync(fd,buffer,size,buffer.length-size,null);if(!count)break;size+=count;}if(size>stat.size)throw new Error('資料包讀取期間已變更，請重試');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size)));}finally{fs.closeSync(fd);}
}
function writePackageFile(filename,data){assertLocalPath(filename);const temp=path.join(path.dirname(filename),'.bfs-workspace-'+randomUUID()+'.tmp'),text=JSON.stringify(data,null,2)+'\n';if(Buffer.byteLength(text)>LIMITS.bytes)throw new Error('匯出資料包超過 20 MB');try{fs.writeFileSync(temp,text,{encoding:'utf8',mode:0o600,flag:'wx'});fs.renameSync(temp,filename);}finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}}
module.exports={readPackageFile,writePackageFile};
