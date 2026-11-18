'use strict';
const {parentPort,workerData}=require('node:worker_threads'),{perform}=require('./relocation-perform'),flag=new Int32Array(workerData.shared);
try{const value=perform(workerData,{checkpoint:()=>{if(Atomics.load(flag,0))throw Object.assign(Error('已取消搬移，正在保留／復原來源。'),{code:'CANCELED'});},progress:value=>parentPort.postMessage({type:'progress',value})});parentPort.postMessage({type:'result',value});}
catch(error){parentPort.postMessage({type:'error',message:error.message,code:error.code,rollbackIncomplete:error.rollbackIncomplete,recoveryMoves:error.recoveryMoves||[]});}
