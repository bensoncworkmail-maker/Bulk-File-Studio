'use strict';
const {writeHistory}=require('./rename-history');
function perform(input,{executeRelocation=require('./move-core').executeRelocation,checkpoint=()=>{},progress=()=>{}}={}){
 const moves=input.moves,record={version:3,kind:'move',state:'pending',createdAt:new Date().toISOString(),moves};writeHistory(input.historyPath,record);
 executeRelocation(moves,{onCheckpoint:checkpoint,onProgress:progress,onPrepared:()=>writeHistory(input.historyPath,record)});
 let warning='',history=true;try{writeHistory(input.historyPath,{...record,state:'completed'});}catch(error){history=false;warning='搬移已完成，但復原紀錄未能完成：'+error.message;}return {changed:moves.length,moves,history,warning};
}
module.exports={perform};
