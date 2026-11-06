'use strict';
const {spawn}=require('node:child_process'),path=require('node:path');
class PasteWorker {
 constructor(script,{launch=spawn,timeout=10000}={}){Object.assign(this,{script,launch,timeout});this.child=null;this.pending=new Map();this.serial=0;}
 start(){
  if(this.child)return this.ready;
  let child;try{child=this.launch(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(this.script,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});}catch(error){return Promise.reject(error);}
  this.child=child;this.epoch=require('node:crypto').randomUUID();this.isReady=false;let buffer='',errorText='',settled=false,resolveReady,rejectReady;
  this.ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const timer=setTimeout(()=>fail(new Error('貼上輔助程序啟動逾時')),this.timeout);
  this.startup={child,timer,reject:rejectReady};
  const fail=error=>{if(this.child!==child)return;clearTimeout(timer);if(!settled){settled=true;rejectReady(error);}this.stop(error);};
  child.once('error',fail);child.once('exit',()=>fail(new Error(errorText||'貼上輔助程序已結束')));
  child.stdin.on('error',fail);
  child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-1000);});
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
   if(this.child!==child)return;buffer+=chunk;if(buffer.length>32768)return fail(new Error('貼上輔助程序回應過大'));
   let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;
    let message;try{message=JSON.parse(line);}catch{return fail(new Error('貼上輔助程序回應無效'));}
    if(message.ready===true){if(!settled){settled=true;clearTimeout(timer);this.startup=null;this.isReady=true;resolveReady();}continue;}
    const entry=this.pending.get(message.id);if(!entry)continue;clearTimeout(entry.timer);this.pending.delete(message.id);message.ok?entry.resolve(message.value):entry.reject(new Error(String(message.error||'貼上未完成').slice(0,500)));
   }
  });
  return this.ready;
 }
 async request(command,{readyOnly=false,epoch}={}){
  if(readyOnly){if(!this.child||!this.isReady||this.epoch!==epoch)throw new Error('貼上程序已重新啟動，文字已複製；請重新開啟選單或手動貼上');}else await this.start();if(!this.child)throw new Error('貼上輔助程序已結束');if(this.pending.size>=4)throw new Error('貼上請求仍在處理');
  const id=++this.serial,child=this.child;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.stop(new Error('貼上輔助程序逾時，已取消待執行請求')),this.timeout);this.pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({...command,id})+'\n',error=>{if(error&&this.child===child)this.stop(error);});});
 }
 stop(error=new Error('貼上輔助程序已停止')){
  const child=this.child;this.child=null;this.ready=null;this.isReady=false;
  if(this.startup?.child===child){clearTimeout(this.startup.timer);this.startup.reject(error);this.startup=null;}
  for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(error);}this.pending.clear();
  if(child){child.stdin.destroy();child.kill();}
 }
}
module.exports={PasteWorker};
