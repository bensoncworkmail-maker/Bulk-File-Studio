'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {crc32}=require('node:zlib');
const JSZip=require('jszip'),{assertLocalPath}=require('./offline-policy');
const LIMITS=Object.freeze({archive:128*1024*1024,file:128*1024*1024,total:512*1024*1024,entries:5000});
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
  if(cursor+46+length+extra+comment>end||flags&1||uncompressed===0xffffffff||compressed===0xffffffff||local===0xffffffff)throw Error('不支援加密、ZIP64 或損壞的 ZIP');
  if((mode&0xf000)&&![0x8000,0x4000].includes(mode&0xf000))throw Error('ZIP 不接受符號連結或特殊檔案');
  const raw=buffer.subarray(cursor+46,cursor+46+length).toString('utf8'),name=entryPath(raw),key=name.normalize('NFC').toLowerCase(),directory=/[\\/]$/.test(raw)||(mode&0xf000)===0x4000;
  if(names.has(key))throw Error('ZIP 有重複或大小寫衝突的路徑：'+name);names.set(key,directory);entries.push({name,directory,size:uncompressed,crc:buffer.readUInt32LE(cursor+16)});total+=uncompressed;
  if(uncompressed>limits.file||total>limits.total)throw Error('ZIP 解壓大小超過允許上限');cursor+=46+length+extra+comment;
 }
 if(cursor!==end)throw Error('ZIP 目錄長度不一致');
 for(const row of entries){let parent=path.posix.dirname(row.name);while(parent!=='.'){if(names.get(parent.normalize('NFC').toLowerCase())===false)throw Error('ZIP 檔案與資料夾路徑衝突：'+row.name);parent=path.posix.dirname(parent);}}
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
 saveTarget(){if(this.busy)throw Error('請等待目前操作完成');const folder=this.selected.target;if(!folder)throw Error('請先選擇目標資料夾');assertLocalPath(folder);if(!fs.statSync(folder).isDirectory())throw Error('目標資料夾不存在');if(this.history.savedTargets.length>=50&&!this.history.savedTargets.some(p=>p.toLowerCase()===folder.toLowerCase()))throw Error('最多儲存 50 個常用目標位置');this.history.savedTargets=[folder,...this.history.savedTargets.filter(p=>p.toLowerCase()!==folder.toLowerCase())];this.save();return this.state();}
 forgetTarget(kind,index){if(this.busy)throw Error('請等待目前操作完成');const key=kind==='saved'?'savedTargets':kind==='recent'?'targetFolders':'';if(!key||!Number.isInteger(index)||index<0||index>=this.history[key].length)throw Error('位置清單已變更，請重新選擇');const folder=this.history[key][index];for(const list of ['savedTargets','targetFolders'])this.history[list]=this.history[list].filter(p=>p.toLowerCase()!==folder.toLowerCase());this.save();return this.state();}
 setTarget(folder){if(this.busy)throw Error('請等待目前操作完成');assertLocalPath(folder);if(!fs.statSync(folder).isDirectory())throw Error('目標資料夾不存在');if(within(this.root,folder))throw Error('請選擇應用程式資料以外的目標資料夾');this.selected.target=path.resolve(folder);this.plan=null;this.remember('targetFolders',folder);return this.state();}
 check(){if(this.canceled){const e=Error('操作已取消');e.code='CANCELED';throw e;}}
 cancel(){if(this.busy)this.canceled=true;return {requested:Boolean(this.busy)};}
 async guard(task){if(this.busy)throw Error('另一項 ZIP 操作仍在執行');this.busy=true;this.canceled=false;try{return await task();}finally{this.busy=false;}}
 emit(phase,current,total,name=''){this.progress({phase,current,total,name});}
 async openZip(filename){return this.guard(async()=>{
  assertLocalPath(filename);if(!/\.zip$/i.test(filename))throw Error('請選擇 ZIP 檔案');const stat=await fsp.stat(filename);if(!stat.isFile()||stat.size>this.limits.archive)throw Error('ZIP 檔案不存在或超過大小上限');this.plan=null;
  const buffer=await fsp.readFile(filename);this.check();const central=inspectArchive(buffer,this.limits),zip=await JSZip.loadAsync(buffer,{createFolders:false}),entries=Object.values(zip.files);if(entries.length!==central.length)throw Error('ZIP 目錄含重複或無法辨識的項目');
  const dir=path.join(this.work,crypto.randomUUID());await fsp.mkdir(dir);const files=[],roots=new Set();let total=0;
  try{for(const entry of entries){this.check();const name=entryPath(entry.unsafeOriginalName||entry.name),metadata=central.find(r=>r.name===name);if(!metadata||entryPath(entry.name)!==name)throw Error('ZIP 路徑經過改寫，無法使用');if(entry.dir)continue;
    const id=crypto.randomUUID(),stage=path.join(dir,id),hash=crypto.createHash('sha256');let size=0,crc=0;
    const meter=new Transform({transform:(chunk,encoding,callback)=>{try{this.check();size+=chunk.length;total+=chunk.length;if(size>this.limits.file||total>this.limits.total)throw Error('ZIP 解壓大小超過允許上限');hash.update(chunk);crc=crc32(chunk,crc);callback(null,chunk);}catch(e){callback(e);}}});
    await pipeline(entry.nodeStream('nodebuffer'),meter,fs.createWriteStream(stage,{flags:'wx',mode:0o600}));if(size!==metadata.size||crc!==metadata.crc)throw Error('ZIP 檔案內容校驗失敗');files.push({id,name,size,hash:hash.digest('hex'),stage});let parent=path.posix.dirname(name);while(parent!=='.'){roots.add(parent);parent=path.posix.dirname(parent);}this.emit('extract',files.length,entries.filter(e=>!e.dir).length,name);
   }if(!files.length)throw Error('ZIP 內沒有檔案');this.check();if(this.sessionDir)await fsp.rm(this.sessionDir,{recursive:true,force:true});this.sessionDir=dir;this.files=files;this.roots=[...roots].sort();this.selected.zipPath=filename;this.remember('sourceFolders',path.dirname(filename));return this.state();
  }catch(e){await fsp.rm(dir,{recursive:true,force:true});throw e;}
 });}
 destination(relative){const target=this.selected.target,file=path.resolve(target,...relative.split('/'));if(!target||!within(target,file)||file===target||within(this.root,file))throw Error('目的地超出選定範圍');assertLocalPath(file);return file;}
 async preview(sourceRoot=''){return this.guard(async()=>{
  this.plan=null;if(!this.files.length||!this.selected.target)throw Error('請先選擇 ZIP 及目標資料夾');if(typeof sourceRoot!=='string'||sourceRoot&&!this.roots.includes(sourceRoot))throw Error('來源根目錄無效');assertLocalPath(this.selected.target);if(!fs.statSync(this.selected.target).isDirectory())throw Error('目標資料夾不存在');
  const selected=this.files.filter(r=>!sourceRoot||r.name.startsWith(sourceRoot+'/'));const rows=[];
  for(const row of selected){this.check();const relative=sourceRoot?row.name.slice(sourceRoot.length+1):row.name;let before=null,destination='',error='';try{destination=this.destination(relative);before=await fingerprint(destination,()=>this.check(),this.limits.file);}catch(e){if(e.code==='CANCELED')throw e;error=e.message;}
   rows.push({...row,relative,destination,before,status:error?'blocked':before===null?'added':same(before,row)?'same':'changed',error});this.emit('compare',rows.length,selected.length,relative);
  }
  this.plan={token:crypto.randomUUID(),at:this.now(),sourceRoot,target:this.selected.target,zipPath:this.selected.zipPath,rows};return {token:this.plan.token,sourceRoot,target:this.plan.target,zipPath:this.plan.zipPath,rows:rows.map(({stage,hash,before,...r})=>r)};
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
module.exports={ZipUpdate,LIMITS,entryPath,inspectArchive,fingerprint,within};
