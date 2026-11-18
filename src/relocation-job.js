'use strict';
const path=require('node:path'),{Worker}=require('node:worker_threads');
function run(input,onProgress=()=>{}){
 const shared=new SharedArrayBuffer(4),flag=new Int32Array(shared),filename=path.join(__dirname,'relocation-job-worker.js').replace(/([\\/])([^\\/]+\.asar)([\\/])/,'$1$2.unpacked$3');
 let worker;const result=new Promise((resolve,reject)=>{let settled=false;const done=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};try{worker=new Worker(filename,{workerData:{...input,shared}});}catch(error){done(error);return;}worker.on('message',message=>{if(message.type==='progress'){try{onProgress(message.value);}catch{}}else if(message.type==='result')done(null,message.value);else {const error=Error(message.message);error.code=message.code;error.rollbackIncomplete=message.rollbackIncomplete;error.recoveryMoves=message.recoveryMoves;done(error);}});worker.on('error',error=>done(error));worker.on('exit',code=>{if(!settled)done(Error('搬移背景作業中斷（'+code+'）；請核對作業紀錄。'));});});
 return {result,cancel:()=>Atomics.store(flag,0,1)};
}
module.exports={run};
