'use strict';
const {parentPort,workerData}=require('node:worker_threads'),{perform}=require('./rename-job');
let last=0,lastPhase='';
try{
 const result=perform(workerData,value=>{const now=Date.now();if(value.phase!==lastPhase||(value.totalBytes===undefined?value.fileIndex===value.totalFiles:value.completedBytes===value.totalBytes)||now-last>=100){last=now;lastPhase=value.phase;parentPort.postMessage({type:'progress',value});}});parentPort.postMessage({type:'result',value:result});
}catch(error){parentPort.postMessage({type:'error',message:String(error.message||error)});}finally{parentPort.close();}
