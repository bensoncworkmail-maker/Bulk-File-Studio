'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {assertLocalPath}=require('./offline-policy');
class IconWorker{
 constructor({launch=spawn,timeout=10000}={}){Object.assign(this,{launch,timeout});this.child=null;this.pending=new Map();this.serial=0;this.retryAfter=0;}
 start(){
  if(this.child)return this.ready;
  if(Date.now()<this.retryAfter)return Promise.reject(Error('圖示程序暫時無法使用'));
  const script=fs.readFileSync(path.join(__dirname,'windows-file-icon-worker.ps1'),'utf8');
  const child=this.launch(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Sta','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.child=child;let buffer='',rejectReady;
  this.ready=new Promise((resolve,reject)=>{
   rejectReady=reject;this.startTimer=setTimeout(()=>this.close(Error('圖示程序啟動逾時')),this.timeout);
   child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
    if(this.child!==child)return;buffer+=chunk;if(buffer.length>1048576)return this.close(Error('圖示回應過大'));
    let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;
     let message;try{message=JSON.parse(line);}catch{return this.close(Error('圖示回應無效'));}
     if(message.ready===true){clearTimeout(this.startTimer);this.rejectReady=null;resolve();continue;}
     const request=this.pending.get(message.id);if(!request)continue;clearTimeout(request.timer);this.pending.delete(message.id);message.ok?request.resolve(message.value):request.reject(Error('無法讀取圖示'));
    }
   });
  });this.rejectReady=rejectReady;
  const fail=()=>{if(this.child===child)this.close(Error('圖示程序已結束'));};
  child.once('error',fail);child.once('exit',fail);child.stdin.on('error',fail);child.stderr.resume();return this.ready;
 }
 async request(command){
  await this.start();if(!this.child)throw Error('圖示程序已結束');if(this.pending.size>=4)throw Error('圖示載入仍在處理');
  const id=++this.serial,child=this.child;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.close(Error('圖示載入逾時')),this.timeout);this.pending.set(id,{resolve,reject,timer});
   child.stdin.write(JSON.stringify({...command,id})+'\n',error=>{if(error&&this.child===child)this.close(error);});
  });
 }
 close(error=Error('圖示程序已停止')){
  const child=this.child;this.child=null;clearTimeout(this.startTimer);this.rejectReady?.(error);this.rejectReady=null;this.ready=null;
  for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}this.pending.clear();
  if(child){this.retryAfter=Date.now()+60000;child.stdin.destroy();child.kill();}
 }
}
class WindowsFileIcons{
 constructor({getFileIcon,readShortcutLink,platform=process.platform,worker=new IconWorker(),environment=process.env}={}){Object.assign(this,{getFileIcon,readShortcutLink,platform,worker,environment});}
 local(value,source){
  if(typeof value!=='string'||!value.trim())throw Error('圖示位置無效');
  const api=/^[a-z]:[\\/]/i.test(source)?path.win32:path;
  const expanded=value.replace(/%([^%]+)%/g,(match,key)=>this.environment[Object.keys(this.environment).find(name=>name.toLowerCase()===key.toLowerCase())]||match);
  if(/^[\\/]{2}/.test(expanded)||/^[a-z][a-z0-9+.-]*:/i.test(expanded)&&!(/^[a-z]:[\\/]/i.test(expanded)))throw Error('只讀取本機圖示');
  if(expanded.includes('%'))throw Error('圖示環境變數無效');
  const resolved=api.resolve(api.dirname(source),expanded);assertLocalPath(resolved);return resolved;
 }
 async get(filepath,options){
  if(this.platform!=='win32')return this.getFileIcon(filepath,options);
  assertLocalPath(filepath);
  if(/\.lnk$/i.test(filepath)){
   // Read metadata only; never launch the shortcut or pass its arguments to a shell.
   let link;try{link=this.readShortcutLink(filepath);}catch{return '';}
   const candidates=[];
   try{if(link.icon)candidates.push({path:this.local(link.icon,filepath),resource:true,index:Number.isInteger(link.iconIndex)?link.iconIndex:0});}catch{}
   try{if(link.target)candidates.push({path:this.local(link.target,filepath),resource:false,index:0});}catch{}
   for(const candidate of candidates)try{const value=await this.worker.request(candidate);if(value)return value;}catch{}
   return '';
  }
  try{const value=await this.worker.request({path:filepath,resource:false,index:0});if(value)return value;}catch{}
  // Electron's extensionless fallback may show a drive. Keep the bundled file glyph instead.
  return path.extname(filepath)?this.getFileIcon(filepath,options):'';
 }
 close(){this.worker.close();}
}
module.exports={IconWorker,WindowsFileIcons};
