'use strict';
const {parentPort,workerData}=require('node:worker_threads'),api=require('./file-analysis'),flag=new Int32Array(workerData.shared);
const checkpoint=()=>{if(Atomics.load(flag,0))throw Error('已取消分析');};
Promise.resolve().then(()=>{if(!['duplicates','compare'].includes(workerData.kind))throw Error('分析類型無效');return api[workerData.kind](workerData.paths,checkpoint,value=>parentPort.postMessage({type:'progress',value}));}).then(value=>parentPort.postMessage({type:'result',value}),error=>parentPort.postMessage({type:'error',message:error.message}));
