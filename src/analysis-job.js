'use strict';
const {Worker}=require('node:worker_threads'),path=require('node:path');
function run(kind,paths,progress=()=>{}){
 const shared=new SharedArrayBuffer(4),flag=new Int32Array(shared);let worker;
 const result=new Promise((resolve,reject)=>{let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};
  try{worker=new Worker(path.join(__dirname,'file-analysis-worker.js').replace(/([\\/])([^\\/]+\.asar)([\\/])/,'$1$2.unpacked$3'),{workerData:{kind,paths,shared}});}catch(error){finish(error);return;}
  worker.on('message',message=>{if(message.type==='progress'){try{progress(message.value);}catch{}}else if(message.type==='result')finish(null,message.value);else finish(Error(message.message));});worker.on('error',error=>finish(error));worker.on('exit',code=>{if(!settled)finish(Error('分析作業中斷（'+code+'）'));});
 });return {result,cancel:()=>Atomics.store(flag,0,1)};
}
module.exports={run};
