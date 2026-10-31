'use strict';
const path=require('node:path'),{Worker}=require('node:worker_threads');
const {snapshotMoves,executeMoves,prepareUndo}=require('./rename-core'),{writeHistory}=require('./rename-history');
function perform(input,onProgress){
 if(input.kind==='rename'){
  const moves=snapshotMoves(input.moves,{verification:'full',onProgress}),record={version:2,kind:'rename',verification:'full',state:'pending',createdAt:new Date().toISOString(),moves};
  writeHistory(input.historyPath,record);executeMoves(moves,{onProgress});
  try{writeHistory(input.historyPath,{...record,state:'completed'});return {changed:moves.length,moves,history:true,verification:'full'};}
  catch(error){return {changed:moves.length,moves,history:false,verification:'full',warning:'重新命名成功，但無法完成復原紀錄；自動復原已停用。請手動核對檔案：'+error.message};}
 }
 if(input.kind==='undo'){
  const history=input.history,moves=prepareUndo(history,{onProgress});writeHistory(input.historyPath,{...history,state:'undoing'});executeMoves(moves,{onProgress});
  try{writeHistory(input.historyPath,null);return {changed:moves.length,moves,verification:'full'};}
  catch(error){return {changed:moves.length,moves,verification:'full',warning:'檔案已還原，但清除復原紀錄時發生錯誤：'+error.message};}
 }
 throw new Error('不支援的改名作業');
}
function workerFilename(directory=__dirname){return path.join(directory,'rename-job-worker.js').replace(/([\\/])([^\\/]+\.asar)([\\/])/,'$1$2.unpacked$3');}
function run(input,onProgress){
 return new Promise((resolve,reject)=>{let settled=false,worker;const finish=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};
  try{worker=new Worker(workerFilename(),{workerData:input});}catch(error){finish(error);return;}
  worker.on('message',message=>{if(settled)return;if(message?.type==='progress'){try{onProgress?.(message.value);}catch{}return;}if(message?.type==='result')finish(null,message.value);else if(message?.type==='error')finish(new Error(message.message));});
  worker.on('error',error=>finish(error));worker.on('exit',code=>{if(!settled)finish(new Error('改名背景作業意外結束（'+code+'），請保留復原紀錄並核對檔案。'));});
 });
}
module.exports={perform,run,workerFilename};
