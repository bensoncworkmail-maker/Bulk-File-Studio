'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{TextDecoder}=require('node:util');
const {assertLocalPath}=require('./offline-policy');
const {LIMITS}=require('./notes-model');
const {readStableBytes}=require('./bounded-file-read');
function readPackageFile(filename){assertLocalPath(filename);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readStableBytes(filename,{maxBytes:LIMITS.bytes,label:'資料包'})));}

function writePackageFile(filename,data){assertLocalPath(filename);const temp=path.join(path.dirname(filename),'.bfs-workspace-'+randomUUID()+'.tmp'),text=JSON.stringify(data,null,2)+'\n';if(Buffer.byteLength(text)>LIMITS.bytes)throw new Error('匯出資料包超過 20 MB');try{fs.writeFileSync(temp,text,{encoding:'utf8',mode:0o600,flag:'wx'});fs.renameSync(temp,filename);}finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}}
module.exports={readPackageFile,writePackageFile};
