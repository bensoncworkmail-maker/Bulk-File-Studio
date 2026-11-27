'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {assertLocalPath}=require('./offline-policy');
const {INBOX_DIR}=require('./snippet-selection-inbox');
const HOST='com.bulkfilestudio.snippets';
const EXTENSION='fnedgolaiejcanmihnhgfbcionfedgeo';

function writeBridgeFile(filename,body){
 assertLocalPath(filename);
 const bytes=Buffer.from(body);
 try{if(fs.readFileSync(filename).equals(bytes))return;}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const temp=filename+'.'+randomUUID()+'.tmp';
 try{
  fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
  fs.renameSync(temp,filename);
 }finally{fs.rmSync(temp,{force:true});}
}
function writeBridge(root,executable,existingOnly=false){
 const folder=assertLocalPath(path.join(root,INBOX_DIR));
 const extension=path.join(folder,'extension'),launcher=path.join(folder,'host.cmd'),manifest=path.join(folder,HOST+'.json');
 if(existingOnly&&!fs.existsSync(manifest))return null;
 fs.mkdirSync(extension,{recursive:true});
 for(const file of ['bounded-file-read.js','snippet-selection-message.js','snippet-selection-inbox.js','snippet-browser-host.js'])
  writeBridgeFile(path.join(folder,file),fs.readFileSync(path.join(__dirname,file)));
 for(const file of ['background.js','connection.html','connection.js','manifest.json'])
  writeBridgeFile(path.join(extension,file),fs.readFileSync(path.join(__dirname,'browser-snippet-extension',file)));
 // Avoid echoing commands into Chrome's native messaging stream.
 const quotedExe=executable.replaceAll('%','%%');
 writeBridgeFile(launcher,'@echo off\r\nsetlocal DisableDelayedExpansion\r\nchcp 65001 >nul\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"'+quotedExe+'" "%~dp0snippet-browser-host.js"\r\n');
 writeBridgeFile(manifest,JSON.stringify({
  name:HOST,description:'Bulk File Studio 常用文字片段',path:launcher,type:'stdio',
  allowed_origins:['chrome-extension://'+EXTENSION+'/']
 }));
 return {extension,manifest};
}

function installBrowserSnippetExtension({root,executable,systemRoot}){
 const {extension,manifest}=writeBridge(root,executable);
 const reg=path.win32.join(systemRoot,'System32','reg.exe');
 for(const vendor of ['Google\\Chrome','Microsoft\\Edge']){
  const key='HKCU\\Software\\'+vendor+'\\NativeMessagingHosts\\'+HOST;
  execFileSync(reg,['add',key,'/ve','/t','REG_SZ','/d',manifest,'/f'],{windowsHide:true,stdio:'ignore',timeout:5000});
 }
 return extension;
}

function refreshBrowserSnippetExtension({root,executable}){return writeBridge(root,executable,true);}
module.exports={installBrowserSnippetExtension,refreshBrowserSnippetExtension,HOST,EXTENSION};
