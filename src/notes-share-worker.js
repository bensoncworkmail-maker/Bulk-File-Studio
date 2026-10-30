'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{TextDecoder}=require('node:util'),M=require('./notes-model');
const FILE=/^BFS-Workspace-[0-9a-f-]{36}-[0-9]+-[0-9a-f-]{36}\.json$/i;
function validateFolder(value,platform=process.platform){
 if(typeof value!=='string'||!value||value.length>4000||/[\0\r\n]/.test(value))throw new Error('分享資料夾路徑無效');
 if(platform==='win32'){if(/^\\\\[?.]\\/.test(value)||!path.win32.isAbsolute(value)||/[<>"|?*]/.test(value)||value.slice(2).includes(':'))throw new Error('分享資料夾不接受裝置路徑或非完整路徑');if(value.startsWith('\\\\')&&!/^\\\\[^\\]+\\[^\\]+/.test(value))throw new Error('請選取完整的共享資料夾');}
 else if(!path.isAbsolute(value))throw new Error('請選取完整資料夾路徑');return path[platform==='win32'?'win32':'posix'].resolve(value);
}
function safeFolder(value){const folder=validateFolder(value);let current=folder;while(true){const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('分享資料夾不接受符號連結或非資料夾位置');const parent=path.dirname(current);if(parent===current)break;current=parent;}return folder;}
function readBounded(filename){const initial=fs.lstatSync(filename);if(!initial.isFile()||initial.isSymbolicLink()||initial.size>M.LIMITS.bytes)throw new Error('共享資料包必須是 20 MB 內的一般檔案');const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>M.LIMITS.bytes)throw new Error('共享資料包無效');const bytes=Buffer.allocUnsafe(stat.size+1);let size=0;while(size<bytes.length){const n=fs.readSync(fd,bytes,size,bytes.length-size,null);if(!n)break;size+=n;}const after=fs.fstatSync(fd);if(size!==stat.size||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw new Error('共享資料包正在變更，請稍後重試');const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));return {format:'BulkFileStudio.Workspace',packageVersion:3,document:M.readPackage(input)};}finally{fs.closeSync(fd);}}
function perform(input){
 const folder=safeFolder(input.folder);
 if(input.action==='check'){const names=fs.readdirSync(folder);if(names.length>2000)throw new Error('分享資料夾項目過多，請使用專用資料夾或先整理');const files=[];for(const name of names.filter(name=>FILE.test(name))){const stat=fs.lstatSync(path.join(folder,name));if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=M.LIMITS.bytes)files.push({name,size:stat.size,modifiedAt:stat.mtime.toISOString()});}files.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)||a.name.localeCompare(b.name));return {files:files.slice(0,50),total:files.length};}
 if(input.action==='read'){if(typeof input.name!=='string'||!FILE.test(input.name))throw new Error('共享資料包名稱無效');return {data:readBounded(path.join(folder,input.name))};}
 if(input.action==='publish'){
  if(!M.ID.test(input.deviceId)||!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('分享來源無效');const document=M.readPackage(input.data),data={format:'BulkFileStudio.Workspace',packageVersion:3,exportedAt:new Date().toISOString(),sharing:{source:input.deviceId,revision:input.revision},document},text=JSON.stringify(data)+'\n';if(Buffer.byteLength(text)>M.LIMITS.bytes)throw new Error('共享資料包超過 20 MB');
  const name='BFS-Workspace-'+input.deviceId+'-'+Date.now()+'-'+crypto.randomUUID()+'.json',target=path.join(folder,name),temp=path.join(folder,'.bfs-share-'+crypto.randomUUID()+'.tmp');try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.copyFileSync(temp,target,fs.constants.COPYFILE_EXCL);return {name,revision:input.revision,size:Buffer.byteLength(text),modifiedAt:new Date().toISOString()};}finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
 }
 throw new Error('分享操作無效');
}
module.exports={FILE,validateFolder,perform};
if(require.main===module){const reply=message=>process.parentPort?process.parentPort.postMessage(message):process.send(message);const handle=input=>{try{reply({ok:true,result:perform(input)});}catch(error){reply({ok:false,error:String(error.message||error)});}};if(process.parentPort)process.parentPort.once('message',event=>handle(event.data));else process.once('message',handle);}
