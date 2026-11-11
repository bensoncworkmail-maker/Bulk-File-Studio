'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {inspectLocation}=require('./notes-location-links'),{assertLocalPath}=require('./offline-policy');
const p=fs.promises,signature=stat=>Object.fromEntries(['dev','ino','birthtimeNs','size','mtimeNs'].map(key=>[key,String(stat[key])])),equal=(a,b)=>Object.keys(a).every(key=>a[key]===b[key]);
const inside=(root,target)=>{const relative=path.relative(root,target);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
async function stat(filename){inspectLocation(filename);return p.lstat(filename,{bigint:true});}
async function digest(filename,expected){
 const input=await p.open(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{if(!equal(signature(await input.stat({bigint:true})),expected))throw Error('來源已變更：'+filename);const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(256*1024);let read;while((read=await input.read(buffer,0,buffer.length,null)).bytesRead)hash.update(buffer.subarray(0,read.bytesRead));if(!equal(signature(await input.stat({bigint:true})),expected)||!equal(signature(await stat(filename)),expected))throw Error('檔案已變更：'+filename);return hash.digest('hex');}finally{await input.close();}
}
async function copyFile(item){
 if(!equal(signature(await stat(item.source)),item.expectedFingerprint))throw Error('來源已變更：'+item.source);
 assertLocalPath(item.destination);
 const input=await p.open(item.source,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));let output;
 try{
  if(!equal(signature(await input.stat({bigint:true})),item.expectedFingerprint))throw Error('來源已變更：'+item.source);
  output=await p.open(item.destination,'wx',0o600);item.created=true;item.destinationIdentity=signature(await output.stat({bigint:true}));
  const buffer=Buffer.alloc(256*1024),hash=crypto.createHash('sha256');let read;
  while((read=await input.read(buffer,0,buffer.length,null)).bytesRead){hash.update(buffer.subarray(0,read.bytesRead));let offset=0;while(offset<read.bytesRead){const result=await output.write(buffer,offset,read.bytesRead-offset,null);if(!result.bytesWritten)throw Error('附件寫入未完成');offset+=result.bytesWritten;}}
  const original=await input.stat();await output.utimes(original.atime,original.mtime);
  await output.sync();await output.close();output=null;
  item.destinationFingerprint=signature(await stat(item.destination));item.hash=hash.digest('hex');
  if(!equal(signature(await stat(item.source)),item.expectedFingerprint)||await digest(item.destination,item.destinationFingerprint)!==item.hash)throw Error('附件複製校驗失敗：'+item.source);
 }finally{if(output)await output.close();await input.close();}
}
async function transfer({sources,folder,mode,commit}){
 const rows=[],roots=[];let saved;
 async function scan(source,destination,root=false){
  if(rows.length>=5000)throw Error('每次最多處理 5000 個檔案／資料夾（含子項目）');
  const info=await stat(source),kind=info.isDirectory()?'folder':'file',item={source,destination,kind,root,expectedFingerprint:signature(info)};rows.push(item);
  if(kind==='folder'){item.names=(await p.readdir(source)).sort();for(const name of item.names)await scan(path.join(source,name),path.join(destination,name));}
 }
 // Collapse duplicates and children already included by a dragged folder.
 const unique=[...new Set(sources)],directories=unique.filter(source=>inspectLocation(source).type==='folder');
 const selected=unique.filter(source=>!directories.some(parent=>parent!==source&&inside(parent,source)));
 assertLocalPath(folder);await p.mkdir(folder,{recursive:true,mode:0o700});
 try{
  if(!(await stat(folder)).isDirectory())throw Error('草稿附件位置不是資料夾');
  const key=value=>value.toLocaleLowerCase(),names=new Set((await p.readdir(folder)).map(key));
  for(const source of selected){
   const type=inspectLocation(source).type,base=path.basename(source),extension=type==='file'?path.extname(base):'',stem=extension?base.slice(0,-extension.length):base;
   let name=base,suffix=1;while(names.has(key(name)))name=stem+' ('+(++suffix)+')'+extension;
   names.add(key(name));
   const destination=path.join(folder,name);roots.push({path:destination,type,managed:true,originalPath:source});await scan(source,destination,true);
  }
  for(const item of rows){
   if(item.kind==='folder'){
    await p.mkdir(item.destination,{mode:0o700});item.created=true;
    item.destinationFingerprint=signature(await stat(item.destination));item.destinationIdentity=item.destinationFingerprint;
   }else await copyFile(item);
  }
  for(const item of rows){
   if(!equal(signature(await stat(item.source)),item.expectedFingerprint)||item.kind==='folder'&&JSON.stringify((await p.readdir(item.source)).sort())!==JSON.stringify(item.names))throw Error('來源內容已變更，請重試：'+item.source);
  }
  // Every destination is complete and verified before metadata is committed or any source is removed.
  saved=await commit(roots);
 }catch(error){
  // The shared folder can already contain attachments from earlier drops. Remove only roots created by this attempt.
  if(!saved)for(const item of rows.filter(item=>item.root&&item.created).reverse())try{
   const actual=signature(await stat(item.destination));
   if(!item.destinationIdentity||!['dev','ino','birthtimeNs'].every(key=>actual[key]===item.destinationIdentity[key]))throw Error('附件位置已變更');
   await p.rm(item.destination,{recursive:item.kind==='folder',force:true});
  }catch(cleanup){if(cleanup.code!=='ENOENT')error.message+='；草稿暫存需核對：'+item.destination+'（'+cleanup.message+'）';}
  throw error;
 }
 const moved=[],failures=[];
 if(mode==='move'){
  const files=rows.filter(item=>item.kind==='file'),directories=rows.filter(item=>item.kind==='folder').reverse();
  for(const item of [...files,...directories]){
   try{
    const actual=signature(await stat(item.source));
    const stable=item.kind==='folder'?['dev','ino','birthtimeNs'].every(key=>actual[key]===item.expectedFingerprint[key]):equal(actual,item.expectedFingerprint)&&await digest(item.source,item.expectedFingerprint)===item.hash;
    const target=signature(await stat(item.destination));
    if(!stable||item.kind==='folder'&&!['dev','ino','birthtimeNs'].every(key=>target[key]===item.destinationFingerprint[key])||item.kind==='file'&&(!equal(target,item.destinationFingerprint)||await digest(item.destination,item.destinationFingerprint)!==item.hash))throw Error('來源或附件已變更');
    if(item.kind==='folder')await p.rmdir(item.source);else await p.unlink(item.source);
    moved.push(item);
   }catch(error){failures.push(item.source+'：'+error.message);break;}
  }
 }
 return {saved,moved,warning:failures.length?'附件副本已存入草稿，部分來源未移除，請核對：'+failures.join('；'):''};
}
module.exports={transfer,inside};
