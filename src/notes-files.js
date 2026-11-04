'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{TextDecoder}=require('node:util');
const {assertLocalPath}=require('./offline-policy');
const {LIMITS}=require('./notes-model');
const {readStableBytes}=require('./bounded-file-read');
function readPackageFile(filename){assertLocalPath(filename);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readStableBytes(filename,{maxBytes:LIMITS.bytes,label:'資料包'})));}

function writeWorkspaceFile(filename,data){
 assertLocalPath(filename);
 const temp=path.join(path.dirname(filename),'.bfs-workspace-'+randomUUID()+'.tmp');
 try{fs.writeFileSync(temp,data,{mode:0o600,flag:'wx'});fs.renameSync(temp,filename);}
 finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
}
function writePackageFile(filename,data){
 const text=JSON.stringify(data,null,2)+'\n';
 if(Buffer.byteLength(text)>LIMITS.bytes)throw new Error('匯出資料包超過 20 MB');
 writeWorkspaceFile(filename,text);
}
module.exports={readPackageFile,writePackageFile,writeWorkspaceFile};
