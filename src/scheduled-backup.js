'use strict';
const {writeJSON}=require('./productivity-store');
const {assertLocalPath}=require('./offline-policy');
const {readStableBytes}=require('./bounded-file-read');
class ScheduledBackup{
 constructor({filename,settings,backup,now=Date.now}){
  Object.assign(this,{filename,settings,backup,now});this.last=0;this.busy=false;
  try{const state=JSON.parse(readStableBytes(assertLocalPath(filename),{maxBytes:1024,label:'備份排程'}));if(Number.isFinite(state.last)&&state.last>=0)this.last=state.last;}
  catch(error){if(error.code!=='ENOENT')this.error=error.message;}
 }
 async tick(ui){
  const hours=this.settings().backupIntervalHours;
  if(!hours||this.busy||this.now()-this.last<hours*3600000)return {created:false,last:this.last};
  if(this.error)throw new Error('無法讀取備份排程：'+this.error);
  this.busy=true;
  try{const result=await this.backup(ui,'定時完整備份');const last=this.now();writeJSON(this.filename,{version:1,last});this.last=last;return {created:true,last,backup:result};}
  finally{this.busy=false;}
 }
}
module.exports={ScheduledBackup};
