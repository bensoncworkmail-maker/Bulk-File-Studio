'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {Transform,Writable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {crc32}=require('node:zlib');
const JSZip=require('jszip'),{assertLocalPath}=require('./offline-policy');
const {readStableBytesAsync}=require('./bounded-file-read');
const LIMITS=Object.freeze({archive:128*1024*1024,file:128*1024*1024,total:512*1024*1024,entries:5000});
const MAX_BATCH=50;
const ID=/^[a-f0-9-]{36}$/i;
function within(root,file){const rel=path.relative(root,file);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
function entryPath(value){
 if(typeof value!=='string'||value.length>1000||/[\x00-\x1f\x7f\ufffd]/.test(value)||/^[\\/]|^[a-z]:/i.test(value))throw Error('ZIP 含不安全或無法辨識的檔名');
 const name=value.replaceAll('\\','/').replace(/\/$/,'');const parts=name.split('/');
 if(!name||parts.some(p=>!p||p==='.'||p==='..'||/[<>:"|?*]/.test(p)||/[ .]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('ZIP 含不支援的路徑：'+value);
 return parts.join('/');
}
// Validate central-directory names before JSZip normalizes or deduplicates them.
function inspectArchive(buffer,limits=LIMITS){
 if(buffer.length>limits.archive)throw Error('ZIP 超過 128 MB 上限');let end=-1;
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50&&i+22+buffer.readUInt16LE(i+20)===buffer.length){end=i;break;}
 if(end<0)throw Error('不是有效的 ZIP 檔案');const count=buffer.readUInt16LE(end+10),offset=buffer.readUInt32LE(end+16),size=buffer.readUInt32LE(end+12);
 if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||count!==buffer.readUInt16LE(end+8)||count===65535||offset+size!==end)throw Error('不支援分卷、ZIP64 或不完整的 ZIP');
 if(count>limits.entries)throw Error('ZIP 項目超過 '+limits.entries+' 個');let cursor=offset,total=0;const names=new Map(),entries=[];
 for(let i=0;i<count;i++){
  if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)throw Error('ZIP 目錄損壞');const flags=buffer.readUInt16LE(cursor+8),length=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32),uncompressed=buffer.readUInt32LE(cursor+24),compressed=buffer.readUInt32LE(cursor+20),local=buffer.readUInt32LE(cursor+42),mode=buffer.readUInt32LE(cursor+38)>>>16;
  if(cursor+46+length+extra+comment>end||uncompressed===0xffffffff||compressed===0xffffffff||local===0xffffffff)throw Error('不支援 ZIP64 或損壞的 ZIP');
  if(flags&0x2040)throw Error('不支援此 ZIP 加密格式');
  if((mode&0xf000)&&![0x8000,0x4000].includes(mode&0xf000))throw Error('ZIP 不接受符號連結或特殊檔案');
  const raw=buffer.subarray(cursor+46,cursor+46+length).toString('utf8'),name=entryPath(raw),key=name.normalize('NFC').toLowerCase(),directory=/[\\/]$/.test(raw)||(mode&0xf000)===0x4000;
  if(names.has(key))throw Error('ZIP 有重複或大小寫衝突的路徑：'+name);names.set(key,directory);entries.push({name,directory,size:uncompressed,crc:buffer.readUInt32LE(cursor+16),encrypted:Boolean(flags&1),aes:buffer.readUInt16LE(cursor+10)===99});total+=uncompressed;
  if(uncompressed>limits.file||total>limits.total)throw Error('ZIP 解壓大小超過允許上限');cursor+=46+length+extra+comment;
 }
 if(cursor!==end)throw Error('ZIP 目錄長度不一致');
 const folders=new Map();
 for(const row of entries){
  let parent=row.directory?row.name:path.posix.dirname(row.name);
  while(parent!=='.'){
   const key=zipNameKey(parent);
   if(names.get(key)===false||folders.has(key)&&folders.get(key)!==parent)throw Error('ZIP 檔案與資料夾路徑衝突：'+row.name);
   folders.set(key,parent);parent=path.posix.dirname(parent);
  }
 }
 return entries;
}
function writeJSON(filename,value){assertLocalPath(filename);fs.mkdirSync(path.dirname(filename),{recursive:true});const temp=filename+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value),{flag:'wx',mode:0o600});fs.renameSync(temp,filename);}finally{try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}}
function readJSON(filename,fallback){try{assertLocalPath(filename);if(fs.statSync(filename).size>32*1024*1024)throw Error('記錄檔案過大');return JSON.parse(fs.readFileSync(filename,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function logItem(dir,item){const filename=path.join(dir,'events.jsonl');assertLocalPath(filename);const fd=fs.openSync(filename,'a',0o600);try{fs.writeSync(fd,JSON.stringify({id:item.id,state:item.state,error:item.error})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
async function fingerprint(file,check=()=>{},max=LIMITS.file){
 assertLocalPath(file);let stat;try{stat=await fsp.lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}if(!stat.isFile())throw Error('目標不是一般檔案');if(stat.size>max)throw Error('目標檔案過大');
 const hash=crypto.createHash('sha256');let size=0;for await(const chunk of fs.createReadStream(file)){check();size+=chunk.length;if(size>max)throw Error('檔案超過大小上限');hash.update(chunk);}const next=await fsp.lstat(file);assertLocalPath(file);if(next.size!==stat.size||next.mtimeMs!==stat.mtimeMs||next.ino!==stat.ino)throw Error('檔案在讀取期間變更，請重新預覽');return {size,hash:hash.digest('hex'),mtime:next.mtimeMs,mode:next.mode};
}
const same=(a,b)=>a===null?b===null:b!==null&&a.hash===b.hash&&a.size===b.size;
const zipNameKey=value=>value.normalize('NFC').toLowerCase();
function reserveName(reserved,name,directory){
 const extension=directory?'':path.extname(name),stem=extension?name.slice(0,-extension.length):name;
 let candidate=name,suffix=2;
 while(reserved.has(zipNameKey(candidate)))candidate=`${stem} (${suffix++})${extension}`;
 reserved.add(zipNameKey(candidate));
 return candidate;
}
function archiveIdentity(filename){
 const stat=fs.lstatSync(filename,{bigint:true});
 if(!stat.isFile())throw Error('請選擇有效的 ZIP 檔案');
 return [stat.dev,stat.ino,stat.birthtimeNs,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
}
function directoryIdentity(filename){
 const stat=fs.lstatSync(filename,{bigint:true});
 if(!stat.isDirectory())throw Error('目標資料夾不存在');
 return [stat.dev,stat.ino,stat.birthtimeNs].join(':');
}
function passwordError(message){
 const error=Error(message);
 error.code='ZIP_PASSWORD';
 return error;
}
class ZipUpdate{
 constructor(root,{limits=LIMITS,progress=()=>{},now=Date.now}={}){
  this.root=path.resolve(root);assertLocalPath(this.root);fs.mkdirSync(this.root,{recursive:true});this.limits=limits;this.progress=progress;this.now=now;this.index=path.join(this.root,'history.json');this.history=readJSON(this.index,{sourceFolders:[],targetFolders:[],runs:[]});
  for(const key of ['sourceFolders','targetFolders','savedTargets'])this.history[key]=(Array.isArray(this.history[key])?this.history[key]:[]).filter(v=>typeof v==='string'&&v.length<2000).slice(0,key==='savedTargets'?50:10);
  this.history.runs=(Array.isArray(this.history.runs)?this.history.runs:[]).filter(r=>r&&ID.test(r.id)).slice(0,20);
  this.work=path.join(this.root,'work');assertLocalPath(this.work);fs.rmSync(this.work,{recursive:true,force:true});fs.mkdirSync(this.work,{recursive:true});this.selected={zipPath:'',target:''};this.files=[];this.roots=[];
 }
 state(){return {savedTargets:[...this.history.savedTargets],sourceFolders:[...this.history.sourceFolders],targetFolders:[...this.history.targetFolders],runs:this.history.runs.map(r=>({...r})),selected:{...this.selected},files:this.files.map(({id,name,size})=>({id,name,size})),roots:[...this.roots],busy:Boolean(this.busy)};}
 save(){writeJSON(this.index,this.history);}
 remember(key,folder){assertLocalPath(folder);if(!fs.statSync(folder).isDirectory())throw Error('資料夾不存在');this.history[key]=[folder,...this.history[key].filter(v=>v.toLowerCase()!==folder.toLowerCase())].slice(0,10);this.save();}
 rememberSource(folder){if(this.busy)throw Error('請等待目前操作完成');this.remember('sourceFolders',folder);return this.state();}
 saveTarget(folder=this.selected.target){if(this.busy)throw Error('請等待目前操作完成');if(!folder)throw Error('請先選擇目標資料夾');assertLocalPath(folder);if(!fs.statSync(folder).isDirectory())throw Error('目標資料夾不存在');if(this.history.savedTargets.length>=50&&!this.history.savedTargets.some(p=>p.toLowerCase()===folder.toLowerCase()))throw Error('最多儲存 50 個常用目標位置');this.history.savedTargets=[folder,...this.history.savedTargets.filter(p=>p.toLowerCase()!==folder.toLowerCase())];this.save();return this.state();}
 forgetTarget(kind,index){if(this.busy)throw Error('請等待目前操作完成');const key=kind==='saved'?'savedTargets':kind==='recent'?'targetFolders':'';if(!key||!Number.isInteger(index)||index<0||index>=this.history[key].length)throw Error('位置清單已變更，請重新選擇');const folder=this.history[key][index];for(const list of ['savedTargets','targetFolders'])this.history[list]=this.history[list].filter(p=>p.toLowerCase()!==folder.toLowerCase());this.save();return this.state();}
 setTarget(folder){if(this.busy)throw Error('請等待目前操作完成');assertLocalPath(folder);if(!fs.statSync(folder).isDirectory())throw Error('目標資料夾不存在');if(within(this.root,folder))throw Error('請選擇應用程式資料以外的目標資料夾');this.remember('targetFolders',folder);this.selected.target=path.resolve(folder);this.plan=null;return this.state();}
 check(){if(this.canceled){const e=Error('操作已取消');e.code='CANCELED';throw e;}}
 cancel(){if(this.busy)this.canceled=true;return {requested:Boolean(this.busy)};}
 async guard(task){if(this.busy)throw Error('另一項 ZIP 操作仍在執行');this.busy=true;this.canceled=false;try{return await task();}finally{this.busy=false;}}
 emit(phase,current,total,name=''){this.progress({phase,current,total,name});}
 async readArchive(filename){
  assertLocalPath(filename);
  if(!/\.zip$/i.test(filename))throw Error('請選擇 ZIP 檔案');
  const identity=archiveIdentity(filename);
  const buffer=await readStableBytesAsync(filename,{maxBytes:this.limits.archive,label:'ZIP'});
  this.check();
  if(archiveIdentity(filename)!==identity)throw Error('ZIP 已變更，請重新預覽');
  return {buffer,identity,central:inspectArchive(buffer,this.limits)};
 }
 async stageArchive(filename,password='',expectedIdentity){
  const {buffer,identity,central}=await this.readArchive(filename);
  if(expectedIdentity&&identity!==expectedIdentity)throw Error('ZIP 在預覽後變更，請重新預覽');
  const encrypted=central.some(row=>row.encrypted);
  if(encrypted&&!password)throw passwordError('請輸入此 ZIP 的密碼');
  const dir=path.join(this.work,crypto.randomUUID());
  assertLocalPath(dir);
  await fsp.mkdir(dir);
  const files=[],directories=[],roots=new Set(),metadataByName=new Map(central.map(row=>[row.name,row]));
  const fileCount=central.filter(row=>!row.directory).length;
  let total=0,reader;
  try{
   let entries;
   if(encrypted){
    const {ZipReader,Uint8ArrayReader}=require('@zip.js/zip.js');
    reader=new ZipReader(new Uint8ArrayReader(buffer),{useWebWorkers:false});
    entries=await reader.getEntries();
   }else{
    const zip=await JSZip.loadAsync(buffer,{createFolders:false});
    entries=Object.values(zip.files);
   }
   if(entries.length!==central.length)throw Error('ZIP 目錄含重複或無法辨識的項目');
   for(const entry of entries){
    this.check();
    const name=entryPath(encrypted?entry.filename:entry.unsafeOriginalName||entry.name),metadata=metadataByName.get(name);
    const directory=Boolean(encrypted?entry.directory:entry.dir);
    if(!metadata||metadata.directory!==directory||entryPath(encrypted?entry.filename:entry.name)!==name||encrypted&&Boolean(entry.encrypted)!==metadata.encrypted)throw Error('ZIP 路徑或類型經過改寫，無法使用');
    metadataByName.delete(name);
    if(directory){directories.push(name);continue;}
    const id=crypto.randomUUID(),stage=path.join(dir,id),hash=crypto.createHash('sha256');
    let size=0,crc=0;
    const meter=new Transform({transform:(chunk,encoding,callback)=>{
     try{
      this.check();size+=chunk.length;total+=chunk.length;
      if(size>metadata.size||size>this.limits.file||total>this.limits.total)throw Error('ZIP 解壓大小超過允許上限');
      hash.update(chunk);crc=crc32(chunk,crc);callback(null,chunk);
     }catch(error){callback(error);}
    }});
    const output=fs.createWriteStream(stage,{flags:'wx',mode:0o600});
    if(encrypted){
     const writing=pipeline(meter,output);
     try{await Promise.all([entry.getData(Writable.toWeb(meter),{password,checkCrc32:true,checkAuthenticationCode:true}),writing]);}
     catch(error){
      meter.destroy();await writing.catch(()=>{});
      if(error.message===require('@zip.js/zip.js').ERR_INVALID_PASSWORD)throw passwordError('ZIP 密碼錯誤，請重試');
      throw error;
     }
    }else await pipeline(entry.nodeStream('nodebuffer'),meter,output);
    if(size!==metadata.size||(!(metadata.aes&&metadata.crc===0)&&crc!==metadata.crc))throw Error('ZIP 檔案內容校驗失敗');
    files.push({id,name,size,hash:hash.digest('hex'),stage});
    let parent=path.posix.dirname(name);
    while(parent!=='.'){roots.add(parent);parent=path.posix.dirname(parent);}
    this.emit('extract',files.length,fileCount,name);
   }
   this.check();
   return {dir,files,directories,roots:[...roots].sort()};
  }catch(error){
   await fsp.rm(dir,{recursive:true,force:true});
   throw error;
  }finally{await reader?.close();}
 }
 async openZip(filename,password){return this.guard(async()=>{
  const staged=await this.stageArchive(filename,password);
  try{
   if(!staged.files.length)throw Error('ZIP 內沒有檔案');this.remember('sourceFolders',path.dirname(filename));
   if(this.sessionDir)await fsp.rm(this.sessionDir,{recursive:true,force:true}).catch(()=>{});
   this.plan=null;this.sessionDir=staged.dir;this.files=staged.files;this.roots=staged.roots;this.selected.zipPath=filename;return this.state();
  }catch(error){await fsp.rm(staged.dir,{recursive:true,force:true});throw error;}
 });}
 async previewBatch(paths,target,mode){return this.guard(async()=>{
  if(!Array.isArray(paths)||!paths.length||paths.length>MAX_BATCH)throw Error(`請選擇 1–${MAX_BATCH} 個 ZIP 檔案`);
  if(!['folder','direct','flat'].includes(mode))throw Error('解壓方式無效');
  this.batch=null;
  assertLocalPath(target);
  if(within(this.root,target)||!fs.statSync(target).isDirectory())throw Error('請選擇有效的目標資料夾');
  const reserved=new Set(fs.readdirSync(target).map(zipNameKey)),rows=[];
  const targetIdentity=directoryIdentity(target);
  for(const archive of new Set(paths)){
   this.check();
   const id=crypto.randomUUID();
   try{
    const {central,identity}=await this.readArchive(archive);
    let destination=target,outputs=[];
    if(mode==='folder'){
     const stem=path.basename(archive).slice(0,-4).trim().replace(/[. ]+$/,'')||'ZIP';
     if(entryPath(stem)!==stem||stem.includes('/'))throw Error('ZIP 檔名無法用作資料夾');
     destination=path.join(target,reserveName(reserved,stem,true));
     outputs=[{name:stem,path:destination,directory:true}];
    }else if(mode==='flat'){
     const files=central.filter(entry=>!entry.directory);
     if(!files.length)throw Error('ZIP 內沒有可平鋪解壓的檔案');
     outputs=files.map(({name})=>({
      name,directory:false,path:path.join(target,reserveName(reserved,path.posix.basename(name),false))
     }));
    }else{
     const top=new Map();
     for(const entry of central){
      const [name,...children]=entry.name.split('/'),key=zipNameKey(name);
      if(!top.has(key))top.set(key,{name,directory:Boolean(children.length)||entry.directory});
     }
     outputs=[...top.values()].map(({name,directory})=>({name,directory,path:path.join(target,reserveName(reserved,name,directory))}));
    }
    rows.push({id,archive,destination,outputs,encrypted:central.some(entry=>entry.encrypted),identity});
   }catch(error){
    if(error.code==='CANCELED')throw error;
    rows.push({id,archive,destination:target,outputs:[],error:error.message});
   }
   this.emit('batch-preview',rows.length,paths.length,path.basename(archive));
  }
  this.batch={token:crypto.randomUUID(),target,targetIdentity,mode,rows};
  return {token:this.batch.token,target,rows:rows.map(({identity,...row})=>row)};
 });}
 async extractBatch(token,passwords){
  return this.guard(async()=>{
   const batch=this.batch;
   if(!batch||batch.token!==token)throw Error('解壓預覽已變更，請重新預覽');
   if(!passwords||typeof passwords!=='object'||Array.isArray(passwords)||
    Object.entries(passwords).some(([id,value])=>!batch.rows.some(row=>row.id===id&&row.encrypted)||typeof value!=='string'||value.length>1024))throw Error('ZIP 密碼資料無效');
   const {target,targetIdentity,mode,rows}=batch;
   assertLocalPath(target);
   if(directoryIdentity(target)!==targetIdentity)throw Error('目標已變更，請重新預覽');
   const occupied=new Set(fs.readdirSync(target).map(zipNameKey));
   if(rows.some(row=>row.outputs.some(output=>occupied.has(zipNameKey(path.basename(output.path))))))throw Error('目標已有與預覽同名的項目，請重新預覽');
   this.batch=null;
   const results=[];
   for(const row of rows){
    if(this.canceled)break;
    const {identity,encrypted,outputs,...result}=row;
    let staged,created=false,count=0;
    try{
     if(row.error)throw Error(row.error);
     if(encrypted&&!passwords[row.id]){
      results.push({...result,status:'skipped',count:0,error:'尚未輸入 ZIP 密碼'});
      this.emit('batch',results.length,rows.length,path.basename(row.archive));
      continue;
     }
     staged=await this.stageArchive(row.archive,passwords[row.id],identity);
     this.check();
     assertLocalPath(target);
     if(directoryIdentity(target)!==targetIdentity)throw Error('目標已變更，請重新預覽');
     if(mode==='folder'){
      assertLocalPath(row.destination);await fsp.mkdir(row.destination);created=true;
     }
     const outputPaths=new Map(outputs.map(output=>[output.name,output.path]));
     if(mode==='direct')for(const output of outputs.filter(output=>output.directory)){
      this.check();assertLocalPath(output.path);await fsp.mkdir(output.path);created=true;
     }
     const destination=name=>{
      if(mode==='flat')return assertLocalPath(outputPaths.get(name));
      const [first,...rest]=name.split('/');
      const file=mode==='folder'?path.join(row.destination,first,...rest):path.join(outputPaths.get(first),...rest);
      return assertLocalPath(file);
     };
     for(const name of mode==='flat'?[]:staged.directories){
      this.check();await fsp.mkdir(destination(name),{recursive:true});
     }
     for(const file of staged.files){
      this.check();
      const filename=destination(file.name);
      await fsp.mkdir(path.dirname(filename),{recursive:true});
      assertLocalPath(filename);
      await fsp.copyFile(file.stage,filename,fs.constants.COPYFILE_EXCL);created=true;count++;
     }
     results.push({...result,status:'completed',count});
    }catch(error){
     results.push({...result,status:created?'partial':error.code==='CANCELED'?'canceled':'failed',count,error:error.message});
    }finally{if(staged)await fsp.rm(staged.dir,{recursive:true,force:true}).catch(()=>{});}
    this.emit('batch',results.length,rows.length,path.basename(row.archive));
   }
   for(const {identity,encrypted,outputs,...row} of rows.slice(results.length))results.push({...row,status:'canceled',count:0});
   const completed=new Map(rows.filter(row=>results.some(result=>result.id===row.id&&result.status==='completed')).map(row=>[row.id,row]));
   this.batchResult={token:crypto.randomUUID(),completed};
   return {token:this.batchResult.token,target,rows:results,canceled:false};
  });
 }
 completedBatch(token){
  if(!this.batchResult||this.batchResult.token!==token)throw Error('解壓結果已變更');
  return [...this.batchResult.completed.values()];
 }
 async recycleBatch(token,trash){return this.guard(async()=>{
  const rows=this.completedBatch(token),results=[];
  for(const row of rows){
   try{
    assertLocalPath(row.archive);
    if(archiveIdentity(row.archive)!==row.identity)throw Error('來源 ZIP 已變更');
    await trash(row.archive);
    this.batchResult.completed.delete(row.id);
    results.push({id:row.id,archive:row.archive,recycled:true});
   }catch(error){results.push({id:row.id,archive:row.archive,recycleError:error.message});}
  }
  return results;
 });}
 destination(relative){const target=this.selected.target,file=path.resolve(target,...relative.split('/'));if(!target||!within(target,file)||file===target||within(this.root,file))throw Error('目的地超出選定範圍');assertLocalPath(file);return file;}
 async compareStructure(rows){
  const parents=new Set(rows.map(row=>path.posix.dirname(row.relative)).filter(parent=>parent!=='.'));
  let missing=0;
  for(const parent of parents){
   this.check();
   try{if(!(await fsp.lstat(this.destination(parent))).isDirectory())missing++;}
   catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')missing++;}
  }
  const hint='請核對目標資料夾與 ZIP 來源根目錄。';
  if(missing>parents.size/2)return `目錄結構可能不符。ZIP 有 ${parents.size} 個資料夾直接存放檔案，其中 ${missing} 個在目標找不到對應路徑。${hint}`;
  if(!parents.size&&rows.every(row=>row.status==='added'))return `目標沒有與 ZIP 檔案相同的相對路徑，套用會全數新增。${hint}`;
  return '';
 }
 async preview(sourceRoot=''){return this.guard(async()=>{
  this.plan=null;if(!this.files.length||!this.selected.target)throw Error('請先選擇 ZIP 及目標資料夾');if(typeof sourceRoot!=='string'||sourceRoot&&!this.roots.includes(sourceRoot))throw Error('來源根目錄無效');assertLocalPath(this.selected.target);if(!fs.statSync(this.selected.target).isDirectory())throw Error('目標資料夾不存在');
  const selected=this.files.filter(r=>!sourceRoot||r.name.startsWith(sourceRoot+'/'));const rows=[];
  for(const row of selected){this.check();const relative=sourceRoot?row.name.slice(sourceRoot.length+1):row.name;let before=null,destination='',error='';try{destination=this.destination(relative);before=await fingerprint(destination,()=>this.check(),this.limits.file);}catch(e){if(e.code==='CANCELED')throw e;error=e.message;}
   rows.push({...row,relative,destination,before,status:error?'blocked':before===null?'added':same(before,row)?'same':'changed',error});this.emit('compare',rows.length,selected.length,relative);
  }
  const structureWarning=await this.compareStructure(rows);this.check();
  this.plan={token:crypto.randomUUID(),at:this.now(),sourceRoot,target:this.selected.target,zipPath:this.selected.zipPath,structureWarning,rows};
  return {...this.plan,rows:rows.map(({stage,hash,before,...r})=>r)};
 });}
 getPlan(token,ids){const plan=this.plan;if(!plan||plan.token!==token||this.now()-plan.at>30*60*1000)throw Error('預覽已失效，請重新比較');if(!Array.isArray(ids)||!ids.length||ids.length>this.limits.entries||new Set(ids).size!==ids.length)throw Error('請選擇要套用的檔案');const rows=ids.map(id=>plan.rows.find(r=>r.id===id));if(rows.some(r=>!r||!['added','changed'].includes(r.status)))throw Error('選取項目無效或不可套用');return {plan,rows};}
 async apply(token,ids){return this.guard(async()=>{
  const {plan,rows}=this.getPlan(token,ids);this.plan=null;const id=crypto.randomUUID(),dir=path.join(this.root,'runs',id),manifestPath=path.join(dir,'manifest.json');await fsp.mkdir(dir,{recursive:true});
  const run={id,date:new Date(this.now()).toISOString(),zipPath:plan.zipPath,target:plan.target,sourceRoot:plan.sourceRoot,status:'running',items:rows.map(r=>({id:r.id,relative:r.relative,before:r.before,after:{hash:r.hash,size:r.size},state:'pending',error:''}))};writeJSON(manifestPath,run);const summary={id,date:run.date,zipPath:run.zipPath,target:run.target,status:'running',count:rows.length};this.history.runs=[summary,...this.history.runs].slice(0,20);this.save();
  for(let i=0;i<rows.length;i++){
   const row=rows[i],item=run.items[i];let temp;
   if(this.canceled)break;
   try{
    const destination=this.destination(row.relative);if(this.selected.target!==plan.target)throw Error('目標已變更，請重新預覽');const actual=await fingerprint(destination,()=>this.check(),this.limits.file);if(!same(actual,row.before)||actual&&actual.mtime!==row.before.mtime)throw Error('目標在預覽後變更，請重新比較');
    if(!same(await fingerprint(row.stage,()=>this.check(),this.limits.file),row))throw Error('來源快照已變更，請重新選擇 ZIP');
    if(row.before){const backup=path.join(dir,row.id+'.bak');await fsp.copyFile(destination,backup,fs.constants.COPYFILE_EXCL);if(!same(await fingerprint(backup,()=>this.check(),this.limits.file),row.before))throw Error('備份校驗不一致');}
    item.state='backed-up';logItem(dir,item);assertLocalPath(destination);await fsp.mkdir(path.dirname(destination),{recursive:true});assertLocalPath(destination);temp=path.join(path.dirname(destination),'.bfs-zip-'+crypto.randomUUID()+'.tmp');await fsp.copyFile(row.stage,temp,fs.constants.COPYFILE_EXCL);if(row.before)await fsp.chmod(temp,row.before.mode&0o777);if(!same(await fingerprint(temp,()=>this.check(),this.limits.file),row))throw Error('寫入校驗不一致');
    this.check();if(!same(await fingerprint(destination,()=>this.check(),this.limits.file),row.before))throw Error('目標在套用期間變更');assertLocalPath(destination);item.state='writing';logItem(dir,item);
    if(row.before)await fsp.rename(temp,destination);else{await fsp.link(temp,destination);await fsp.unlink(temp);}temp=null;item.state='applied';logItem(dir,item);
   }catch(e){item.error=e.message;if(item.state!=='writing')item.state='failed';logItem(dir,item);if(e.code==='CANCELED')this.canceled=true;}
   finally{if(temp)await fsp.rm(temp,{force:true});}this.emit('apply',i+1,rows.length,row.relative);
  }
  run.status=this.canceled?'canceled':run.items.some(r=>r.state!=='applied')?'partial':'completed';writeJSON(manifestPath,run);summary.status=run.status;this.save();return this.result(run,dir);
 });}
 result(run,dir){return {id:run.id,status:run.status,backupRoot:dir,applied:run.items.filter(r=>r.state==='applied').length,restored:run.items.filter(r=>r.state==='restored').length,rows:run.items.map(({id,relative,state,error})=>({id,relative,state,error}))};}
 readRun(id){if(typeof id!=='string'||!ID.test(id)||!this.history.runs.some(r=>r.id===id))throw Error('更新記錄不存在');const dir=path.join(this.root,'runs',id),file=path.join(dir,'manifest.json'),run=readJSON(file,null);if(!run||run.id!==id||!Array.isArray(run.items)||run.items.length>this.limits.entries)throw Error('更新記錄損壞');assertLocalPath(run.target);const events=path.join(dir,'events.jsonl');if(fs.existsSync(events)){assertLocalPath(events);if(fs.statSync(events).size>32*1024*1024)throw Error('更新記錄過大');const rows=new Map(run.items.map(r=>[r.id,r])),lines=fs.readFileSync(events,'utf8').split('\n');for(let i=0;i<lines.length;i++){if(!lines[i])continue;let event;try{event=JSON.parse(lines[i]);}catch(e){if(i===lines.length-1)break;throw Error('更新記錄損壞');}const row=rows.get(event.id);if(row&&['backed-up','writing','applied','failed','restored'].includes(event.state)){row.state=event.state;row.error=String(event.error||'').slice(0,2000);}}}return {dir,file,run};}
 async undo(id){return this.guard(async()=>{
  const {dir,file,run}=this.readRun(id);
  for(let i=run.items.length-1;i>=0;i--){if(this.canceled)break;const item=run.items[i];if(!['applied','writing'].includes(item.state))continue;let temp;
   try{const relative=entryPath(item.relative),dest=path.resolve(run.target,...relative.split('/'));if(!within(run.target,dest)||within(this.root,dest)||!ID.test(item.id))throw Error('還原路徑無效');assertLocalPath(dest);const actual=await fingerprint(dest,()=>this.check(),this.limits.file);if(same(actual,item.before)){item.state='restored';item.error='';continue;}if(!same(actual,item.after))throw Error('檔案在更新後已變更或不存在，已保留目前版本');
    if(item.before){const backup=path.join(dir,item.id+'.bak');if(!same(await fingerprint(backup,()=>this.check(),this.limits.file),item.before))throw Error('備份遺失或已變更');temp=path.join(path.dirname(dest),'.bfs-undo-'+crypto.randomUUID()+'.tmp');await fsp.copyFile(backup,temp,fs.constants.COPYFILE_EXCL);await fsp.chmod(temp,item.before.mode&0o777);if(!same(await fingerprint(temp,()=>this.check(),this.limits.file),item.before))throw Error('還原校驗不一致');}
    this.check();if(!same(await fingerprint(dest,()=>this.check(),this.limits.file),item.after))throw Error('檔案在還原期間變更');assertLocalPath(dest);if(temp){await fsp.rename(temp,dest);temp=null;}else await fsp.unlink(dest);item.state='restored';item.error='';
   }catch(e){if(e.code==='CANCELED')this.canceled=true;item.error=e.message;}finally{if(temp)await fsp.rm(temp,{force:true});logItem(dir,item);}this.emit('undo',run.items.length-i,run.items.length,item.relative);
  }
  run.status=run.items.some(r=>['applied','writing'].includes(r.state))?'partial-undo':'restored';writeJSON(file,run);const summary=this.history.runs.find(r=>r.id===id);summary.status=run.status;this.save();return this.result(run,dir);
 });}
}
module.exports={ZipUpdate,LIMITS,MAX_BATCH,entryPath,inspectArchive,fingerprint,within};
