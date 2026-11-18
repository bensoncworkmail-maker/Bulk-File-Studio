'use strict';
const crypto=require('node:crypto'),M=require('./workflow-model'),{writeJSON}=require('./productivity-store'),{readStableBytes}=require('./bounded-file-read');
const empty=()=>({version:1,revision:0,contexts:[],formulas:[],automations:[],inbox:[],runs:[],recentFolders:[],activeContextId:null});
function normalize(input){
 if(!input||input.version!==1||!Number.isSafeInteger(input.revision)||input.revision<0)throw Error('工作流程格式無效');const data={...empty(),revision:input.revision};
 for(const kind of ['contexts','formulas','automations']){if(!Array.isArray(input[kind])||input[kind].length>100)throw Error('工作流程項目過多');data[kind]=input[kind].map(item=>M.definition(kind,item));if(new Set(data[kind].map(item=>item.id)).size!==data[kind].length)throw Error('工作流程識別碼重複');}
 if(!Array.isArray(input.inbox)||input.inbox.length>500||!Array.isArray(input.runs)||input.runs.length>200)throw Error('工作流程歷程無效');
 data.inbox=input.inbox.map(row=>({id:M.id(row.id),draftId:M.id(row.draftId),recordId:row.recordId?M.id(row.recordId):null,source:M.text(row.source,100),at:M.text(row.at,40)}));
 data.runs=input.runs.map(row=>({id:M.id(row.id),ruleId:M.id(row.ruleId),name:M.text(row.name,100),at:M.text(row.at,40),status:['completed','failed'].includes(row.status)?row.status:'failed',count:Math.max(0,Math.min(500,Number(row.count)||0)),automatic:row.automatic===true,eventKey:M.text(row.eventKey||'',120),...(row.error?{error:M.text(row.error,2000)}:{})}));
 if(!Array.isArray(input.recentFolders)||input.recentFolders.length>12)throw Error('最近資料夾清單無效');data.recentFolders=input.recentFolders.map(value=>{require('./offline-policy').assertLocalPath(value);return M.text(value,4096);});data.activeContextId=input.activeContextId?M.id(input.activeContextId):null;
 if(Buffer.byteLength(JSON.stringify(data))>12*1024*1024)throw Error('工作流程資料超過 12 MB');return data;
}
class WorkflowStore{
 constructor(filename,onChanged=()=>{}){this.filename=filename;this.onChanged=onChanged;this.read();}
 read(){try{return normalize(JSON.parse(readStableBytes(this.filename,{maxBytes:12*1024*1024,label:'工作流程設定'})));}catch(error){if(error.code==='ENOENT')return empty();throw error;}}
 change(task,revision){const data=this.read();if(revision!==undefined&&data.revision!==revision)throw Error('工作流程設定已變更，請重新整理');const result=task(data);data.revision++;writeJSON(this.filename,normalize(data));try{this.onChanged();}catch{/* Persisted changes remain valid if a window has closed. */}return result??data;}
 save(kind,input,revision){return this.change(data=>{if(!['contexts','formulas','automations'].includes(kind))throw Error('設定類型無效');if(input.id&&!data[kind].some(item=>item.id===input.id))throw Error('設定已移除');const item=M.definition(kind,{...input,id:input.id||crypto.randomUUID()});data[kind]=[...data[kind].filter(value=>value.id!==item.id),item];if(data[kind].length>100)throw Error('每類最多 100 個設定');return item;},revision);}
 remove(kind,id,revision){return this.change(data=>{if(!['contexts','formulas','automations'].includes(kind)||!data[kind].some(item=>item.id===id))throw Error('設定已移除');data[kind]=data[kind].filter(item=>item.id!==id);if(data.activeContextId===id)data.activeContextId=null;},revision);}
}
module.exports={WorkflowStore,normalize,empty};
