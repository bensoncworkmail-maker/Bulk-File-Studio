'use strict';
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {readStableBytes}=require('./bounded-file-read');
const {selectionText}=require('./snippet-selection-message');

const INBOX_DIR='browser-snippet-capture';
const INBOX_FLAG='--snippet-selection-id';
const ID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const EXPIRY=60000;
const SUFFIXES=['request','pending','shown'];

function inboxFile(folder,id,suffix){
 if(typeof id!=='string'||!ID.test(id))throw Error('選取文字請求無效');
 return path.join(folder,id+'.'+suffix);
}
function discard(folder,id){
 for(const suffix of SUFFIXES)fs.rmSync(inboxFile(folder,id,suffix),{force:true});
}
function stageSelection(folder,body){
 if(!selectionText(body))throw Error('選取文字無效');
 fs.mkdirSync(folder,{recursive:true,mode:0o700});
 for(const file of fs.readdirSync(folder)){
  const [id,suffix]=file.split('.');
  if(!ID.test(id)||!SUFFIXES.includes(suffix)||file!==id+'.'+suffix)continue;
  const target=inboxFile(folder,id,suffix);
  try{if(Date.now()-fs.lstatSync(target).mtimeMs>EXPIRY)fs.rmSync(target,{force:true});}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
 const id=randomUUID();
 try{
  fs.writeFileSync(inboxFile(folder,id,'pending'),'',{flag:'wx',mode:0o600});
  fs.writeFileSync(inboxFile(folder,id,'request'),JSON.stringify(body),{flag:'wx',mode:0o600});
  return id;
 }catch(error){discard(folder,id);throw error;}
}
function receiveSelection(folder,id){
 const request=inboxFile(folder,id,'request');
 const stat=fs.lstatSync(inboxFile(folder,id,'pending'));
 if(!stat.isFile()||Date.now()-stat.mtimeMs>EXPIRY)throw Error('選取文字請求已過期');
 const raw=readStableBytes(request,{maxBytes:128*1024,label:'選取文字'}).toString('utf8');
 fs.unlinkSync(request);
 let body;
 try{body=selectionText(JSON.parse(raw));}catch{throw Error('選取文字格式無效');}
 if(!body)throw Error('選取文字無效');
 return body;
}
function markShown(folder,id){
 fs.renameSync(inboxFile(folder,id,'pending'),inboxFile(folder,id,'shown'));
}
function isShown(folder,id){return fs.existsSync(inboxFile(folder,id,'shown'));}
module.exports={INBOX_DIR,INBOX_FLAG,stageSelection,receiveSelection,markShown,isShown,discard};
