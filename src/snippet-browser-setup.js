'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {assertLocalPath}=require('./offline-policy');
const HOST='com.bulkfilestudio.snippets';
const EXTENSION='fnedgolaiejcanmihnhgfbcionfedgeo';

function installBrowserSnippetExtension({root,executable,systemRoot}){
 const folder=assertLocalPath(path.join(root,'browser-snippet-capture'));
 const extension=path.join(folder,'extension'),launcher=path.join(folder,'host.cmd'),manifest=path.join(folder,HOST+'.json');
 fs.mkdirSync(extension,{recursive:true});
 for(const file of ['manifest.json','background.js','connection.html'])
  fs.copyFileSync(path.join(__dirname,'browser-snippet-extension',file),path.join(extension,file));
 for(const file of ['snippet-browser-host.js','snippet-selection-message.js'])
  fs.copyFileSync(path.join(__dirname,file),path.join(folder,file));
 // Avoid echoing commands into Chrome's native messaging stream.
 const quotedExe=executable.replaceAll('%','%%');
 fs.writeFileSync(launcher,'@echo off\r\nsetlocal DisableDelayedExpansion\r\nchcp 65001 >nul\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"'+quotedExe+'" "%~dp0snippet-browser-host.js"\r\n');
 fs.writeFileSync(manifest,JSON.stringify({
  name:HOST,description:'Bulk File Studio 常用文字片段',path:launcher,type:'stdio',
  allowed_origins:['chrome-extension://'+EXTENSION+'/']
 }));
 const reg=path.win32.join(systemRoot,'System32','reg.exe');
 for(const vendor of ['Google\\Chrome','Microsoft\\Edge']){
  const key='HKCU\\Software\\'+vendor+'\\NativeMessagingHosts\\'+HOST;
  execFileSync(reg,['add',key,'/ve','/t','REG_SZ','/d',manifest,'/f'],{windowsHide:true,stdio:'ignore',timeout:5000});
 }
 return extension;
}

module.exports={installBrowserSnippetExtension,HOST,EXTENSION};
