'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {assertLocalPath}=require('./offline-policy');
const FILE=/^errors-(\d{4}-\d{2}-\d{2})-(\d{6})\.jsonl$/;
const DEFAULTS={diagnosticsEnabled:true,diagnosticsIncludeStack:true,diagnosticsIncludePaths:false,diagnosticsRetentionDays:7};
const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
class DiagnosticLog{
 constructor(folder,{getSettings=()=>DEFAULTS,environment={},appRoot='',now=Date.now,maxBytes=1024*1024,maxFiles=5}={}){
  Object.assign(this,{folder,getSettings,environment,appRoot,now,maxBytes,maxFiles});this.lastError='';this.seen=new Map();this.rateStart=0;this.rateCount=0;this.suppressed=0;
 }
 settings(){return {...DEFAULTS,...this.getSettings()};}
 scrub(value,max=6000,settings=this.settings()){
  let output=text(value,max).replace(/^Error invoking remote method '[^']+': (?:Error: )?/i,'').replace(/^Uncaught (?:Error: )?|^Error: /,'');
  output=output.replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [已隱藏]').replace(/\b(password|passwd|secret|authorization|access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1=[已隱藏]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[權杖]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[Email]').replace(/\b(?:https?|ftp):\/\/[^\s"'<>]+/gi,'[連結]');
  if(!settings.diagnosticsIncludePaths){
   if(this.appRoot)for(const root of new Set([this.appRoot,this.appRoot.replaceAll('\\','/'),this.appRoot.replaceAll('/','\\')]))output=output.replace(new RegExp(escape(root)+'(?=[\\\\/]|$)','gi'),'[app]');
   const masked=value=>'[位置]'+(/:\d+(?::\d+)?$/.exec(value)?.[0]||'');
   output=output.replace(/\b[A-Z]:[\\/][^\r\n"<>|)]*/gi,masked).replace(/\\\\[^\\\s]+\\[^\r\n"<>|)]*/g,masked).replace(/file:\/\/[^\s)]+/gi,'[位置]').replace(/(^|[\s("'=])\/[^\r\n"'<>)]*/gm,(_,prefix)=>prefix+'[位置]');
  }
  return output;
 }
 files(){
  assertLocalPath(this.folder);if(!fs.existsSync(this.folder))return [];
  const items=[];for(const name of fs.readdirSync(this.folder)){const match=FILE.exec(name);if(!match||!Number.isFinite(Date.parse(match[1]+'T00:00:00Z')))continue;const filename=path.join(this.folder,name),stat=fs.lstatSync(filename);if(stat.isFile()&&!stat.isSymbolicLink())items.push({name,filename,date:match[1],index:Number(match[2]),size:stat.size});}
  return items.sort((a,b)=>a.name.localeCompare(b.name));
 }
 prune(){
  const settings=this.settings(),days=[3,7,14,30].includes(settings.diagnosticsRetentionDays)?settings.diagnosticsRetentionDays:7,cutoff=new Date(this.now()-(days-1)*86400000).toISOString().slice(0,10);let files=this.files();
  for(const file of files.filter(file=>file.date<cutoff)){fs.unlinkSync(file.filename);}files=files.filter(file=>file.date>=cutoff);
  while(files.length>this.maxFiles){fs.unlinkSync(files.shift().filename);}return files;
 }
 record(source,action,error){
  try{
   const settings=this.settings();if(!settings.diagnosticsEnabled)return null;
   const rawMessage=typeof error==='string'?error:error?.message;if(rawMessage==='分享作業已取消')return null;
   const message=this.scrub(rawMessage||'未知錯誤',6000,settings),code=typeof error?.code==='string'||typeof error?.code==='number'?String(error.code).slice(0,64):'',now=this.now(),fingerprint=code+'\n'+message;
   const previous=this.seen.get(fingerprint);if(previous!==undefined&&now-previous<2000){this.suppressed++;return null;}this.seen.set(fingerprint,now);if(this.seen.size>500)this.seen.delete(this.seen.keys().next().value);
   if(now-this.rateStart>=60000){this.rateStart=now;this.rateCount=0;}if(this.rateCount++>=120){this.suppressed++;return null;}
   const entry={id:crypto.randomUUID(),at:new Date(now).toISOString(),level:'error',version:text(this.environment.version,40),platform:text(this.environment.platform,20),arch:text(this.environment.arch,20),electron:text(this.environment.electron,40),node:text(this.environment.node,40),source:this.scrub(source,40,settings),action:this.scrub(action,120,settings),code,message};
   if(settings.diagnosticsIncludeStack&&typeof error?.stack==='string')entry.stack=this.scrub(error.stack,12000,settings);
   const line=JSON.stringify(entry)+'\n';if(Buffer.byteLength(line)>this.maxBytes)return null;
   assertLocalPath(this.folder);fs.mkdirSync(this.folder,{recursive:true,mode:0o700});const files=this.prune(),today=entry.at.slice(0,10),last=files.filter(file=>file.date===today).at(-1);let index=last?.index||0;
   if(last&&last.size+Buffer.byteLength(line)>this.maxBytes)index++;if(index>999999)throw new Error('當日診斷紀錄數量已達上限');
   const filename=path.join(this.folder,`errors-${today}-${String(index).padStart(6,'0')}.jsonl`);assertLocalPath(filename);
   const fd=fs.openSync(filename,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|(fs.constants.O_NOFOLLOW||0),0o600);
   try{if(!fs.fstatSync(fd).isFile())throw new Error('診斷紀錄必須是一般檔案');fs.writeSync(fd,line,null,'utf8');}finally{fs.closeSync(fd);}
   this.prune();this.lastError='';return entry.id;
  }catch(error){this.lastError=String(error.message||error);return null;}
 }
 entries(limit=100){
  const rows=[],settings=this.settings();for(const file of this.prune().reverse()){
   assertLocalPath(file.filename);const fd=fs.openSync(file.filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));let content;
   try{const stat=fs.fstatSync(fd);if(!stat.isFile())continue;const offset=Math.max(0,stat.size-this.maxBytes),buffer=Buffer.alloc(Math.min(stat.size,this.maxBytes));const length=fs.readSync(fd,buffer,0,buffer.length,offset);content=buffer.subarray(0,length).toString('utf8');if(offset)content=content.slice(content.indexOf('\n')+1);}finally{fs.closeSync(fd);}
   for(const line of content.split('\n').reverse()){try{const value=JSON.parse(line);if(!value||typeof value.message!=='string'||!Number.isFinite(Date.parse(value.at)))continue;const entry={};for(const key of ['id','at','level','version','platform','arch','electron','node','source','action','code'])entry[key]=this.scrub(value[key],key==='action'?120:80,settings);entry.message=this.scrub(value.message,6000,settings);if(settings.diagnosticsIncludeStack&&value.stack)entry.stack=this.scrub(value.stack,12000,settings);rows.push(entry);if(rows.length>=limit)return rows;}catch{}}
  }return rows;
 }
 status(includeRecent=false){
  try{const files=this.prune();return {enabled:this.settings().diagnosticsEnabled,folder:this.folder,files:files.map(({name,size})=>({name,size})),bytes:files.reduce((sum,file)=>sum+file.size,0),maxBytes:this.maxBytes,maxFiles:this.maxFiles,suppressed:this.suppressed,error:this.lastError,...(includeRecent?{recent:this.entries(100)}:{})};}
  catch(error){this.lastError=String(error.message||error);return {enabled:this.settings().diagnosticsEnabled,folder:this.folder,files:[],bytes:0,maxBytes:this.maxBytes,maxFiles:this.maxFiles,suppressed:this.suppressed,error:this.lastError,...(includeRecent?{recent:[]}:{})};}
 }
 prepareFolder(){assertLocalPath(this.folder);fs.mkdirSync(this.folder,{recursive:true,mode:0o700});return this.folder;}
 clear(){let count=0;for(const file of this.files()){fs.unlinkSync(file.filename);count++;}this.seen.clear();this.lastError='';return {removed:count};}
 exportData(){return {format:'BulkFileStudio.Diagnostics',schemaVersion:1,exportedAt:new Date(this.now()).toISOString(),environment:{...this.environment},entries:this.entries(Infinity).reverse()};}
}
module.exports={DiagnosticLog,DEFAULTS};
