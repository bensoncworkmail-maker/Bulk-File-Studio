'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{TextDecoder}=require('node:util'),M=require('./notes-model');
const Commit=require('./notes-share-commit');
const S=require('./notes-sharing-model');
const {readStableBytes}=require('./bounded-file-read');
const FILE=/^BFS-Workspace-[0-9a-f-]{36}-[0-9]+-[0-9a-f-]{36}\.json$/i;
function packageIdentity(name){const match=/^BFS-Workspace-([0-9a-f-]{36})-([0-9]+)-[0-9a-f-]{36}\.json$/i.exec(name||'');if(!match)return null;const published=Number(match[2]);return Number.isSafeInteger(published)&&published>=0?{source:match[1],published}:null;}
function validateFolder(value,platform=process.platform){
 if(typeof value!=='string'||!value||value.length>4000||/[\0\r\n]/.test(value))throw new Error('分享資料夾路徑無效');
 if(platform==='win32'){if(/^\\\\[?.]\\/.test(value)||!path.win32.isAbsolute(value)||/[<>"|?*]/.test(value)||value.slice(2).includes(':'))throw new Error('分享資料夾不接受裝置路徑或非完整路徑');if(value.startsWith('\\\\')&&!/^\\\\[^\\]+\\[^\\]+/.test(value))throw new Error('請選取完整的共享資料夾');}
 else if(!path.isAbsolute(value))throw new Error('請選取完整資料夾路徑');return path[platform==='win32'?'win32':'posix'].resolve(value);
}
function safeFolder(value){const folder=validateFolder(value);let current=folder;while(true){const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('分享資料夾不接受符號連結或非資料夾位置');const parent=path.dirname(current);if(parent===current)break;current=parent;}return folder;}
function readBounded(filename){
 const bytes=readStableBytes(filename,{maxBytes:M.LIMITS.bytes,label:'共享資料包'});
 const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),identity=packageIdentity(path.basename(filename));
 const document=M.readPackage(input);
 let sharing=null;
 if(input.sharing){
  const raw=input.sharing;
  if(!M.ID.test(raw.source)||raw.source!==identity?.source||!Number.isSafeInteger(raw.revision)||raw.revision<0)throw new Error('共享資料包來源與檔名不符');
  if(raw.version!==undefined&&(!Number.isSafeInteger(raw.version)||raw.version<1))throw new Error('發布版本無效');
  sharing={source:raw.source,revision:raw.revision,...(raw.version?{version:raw.version}:{}),...(raw.scope?{scope:S.scope(raw.scope)}:{})};
 }
 if(input.packageVersion===5){
  const scope=S.scope(sharing?.scope);
  sharing={...sharing,scope,commit:Commit.validate(input,document,scope)};
 }
 return {data:{format:'BulkFileStudio.Workspace',packageVersion:input.packageVersion,
  ...(input.packageVersion>=4?{sharing}:{}),...(input.packageVersion===5?{tombstones:input.tombstones}:{}),document},sharing};
}

function perform(input){
 const folder=safeFolder(input.folder);
 if(input.action==='check'){const names=fs.readdirSync(folder);if(names.length>2000)throw new Error('分享資料夾項目過多，請使用專用資料夾或先整理');const files=[];for(const name of names.filter(name=>FILE.test(name))){const stat=fs.lstatSync(path.join(folder,name));if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=M.LIMITS.bytes)files.push({name,size:stat.size,modifiedAt:stat.mtime.toISOString()});}files.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)||a.name.localeCompare(b.name));return {files:files.slice(0,50),total:files.length};}
 if(input.action==='read'){if(typeof input.name!=='string'||!FILE.test(input.name))throw new Error('共享資料包名稱無效');return readBounded(path.join(folder,input.name));}
 if(input.action==='publish'){
  if(input.version!==undefined&&(!Number.isSafeInteger(input.version)||input.version<1))throw new Error('發布版本無效');
  if(!M.ID.test(input.deviceId)||!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('分享來源無效');
  const full=M.readPackage(input.data),selection=S.scope(input.scope);
  const document=selection.mode==='masters'?M.readPackage(M.exportPackage(full,{scope:'masters',masterIds:selection.masterIds})):full;
  const versioned=Array.isArray(input.data.tombstones);
  const sharing={source:input.deviceId,revision:input.revision,...(input.version?{version:input.version}:{}),
   ...(input.scope||versioned?{scope:selection}:{})};
  const data={format:'BulkFileStudio.Workspace',packageVersion:versioned?5:selection.mode==='masters'?4:3,
   exportedAt:new Date().toISOString(),sharing,document};
  if(versioned){
   data.tombstones=input.data.tombstones;
   sharing.commit=Commit.create(sharing,document,data.tombstones,input.previousCommit);
   Commit.validate(data,document,selection);
  }
  const text=JSON.stringify(data)+'\n';
  if(Buffer.byteLength(text)>M.LIMITS.bytes)throw new Error('共享資料包超過 20 MB');
  const name='BFS-Workspace-'+input.deviceId+'-'+Date.now()+'-'+crypto.randomUUID()+'.json',target=path.join(folder,name),temp=path.join(folder,'.bfs-share-'+crypto.randomUUID()+'.tmp');try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.copyFileSync(temp,target,fs.constants.COPYFILE_EXCL);return {name,revision:input.revision,size:Buffer.byteLength(text),modifiedAt:new Date().toISOString(),...(sharing.commit?{commit:sharing.commit}:{})};}finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
 }
 throw new Error('分享操作無效');
}
module.exports={FILE,validateFolder,packageIdentity,perform};
if(require.main===module){const reply=message=>process.parentPort?process.parentPort.postMessage(message):process.send(message);const handle=async input=>{try{const folder=validateFolder(input.folder);const result=await require('./intranet-path').withIntranetPaths([folder],()=>perform(input));reply({ok:true,result});}catch(error){reply({ok:false,error:String(error.message||error)});}};if(process.parentPort)process.parentPort.once('message',event=>handle(event.data));else process.once('message',handle);}
