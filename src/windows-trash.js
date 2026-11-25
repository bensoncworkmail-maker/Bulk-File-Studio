'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');

function runWindowsBatch(verify, launch) {
 const script=fs.readFileSync(path.join(__dirname,'windows-trash.ps1'),'utf8');
 const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const command=Buffer.from(script,'utf16le').toString('base64');
 return new Promise((resolve,reject)=>{
  const child=launch(executable,['-NoProfile','-NonInteractive','-Sta','-EncodedCommand',command],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  const lines=createInterface({input:child.stdout});
  let outcomes, finished=false;
  const timer=setTimeout(()=>finish(null,true),15000);
  function finish(error,stop=false){
   if(finished)return;
   finished=true;
   clearTimeout(timer);
   lines.close();
   if(stop)child.kill();
   if(error)reject(error);
   else resolve(outcomes??null);
  }
  child.once('error',()=>finish());
  child.once('close',()=>finish());
  child.stdin.on('error',()=>finish(null,true));
  lines.on('line',line=>{
   if(finished)return;
   if(!outcomes&&line==='ready'){
    clearTimeout(timer);
    try{
     const paths=verify();
     // Once paths are sent, never retry them through a second recycle operation.
     outcomes=paths.map(()=> 'Windows 未確認已回收');
     child.stdin.end(JSON.stringify({paths})+'\n');
    }catch(error){finish(error,true);}
    return;
   }
   const result=/^(\d+):(recycled|unavailable|[0-9A-F]{8})$/.exec(line);
   if(!outcomes||!result||Number(result[1])>=outcomes.length)return;
   const [,index,status]=result;
   outcomes[Number(index)]=status==='recycled'?null:status==='unavailable'?'Windows 無法移至資源回收筒':'Windows 回收失敗 (0x'+status+')';
  });
 });
}

function recycleWindowsBatch(verify,{platform=process.platform,launch=spawn}={}) {
 return platform==='win32'?runWindowsBatch(verify,launch):null;
}

module.exports={recycleWindowsBatch};
