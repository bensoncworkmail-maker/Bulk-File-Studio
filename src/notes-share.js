'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{assertLocalPath}=require('./offline-policy'),{FILE,validateFolder,packageIdentity}=require('./notes-share-worker');
const S=require('./notes-sharing-model');
const MODES=['remind','auto','ignore'];
function accepted(value){return value&&FILE.test(value.name)&&packageIdentity(value.name)?.source===value.source&&Number.isSafeInteger(value.remoteRevision)&&value.remoteRevision>=0&&Number.isSafeInteger(value.localRevision)&&value.localRevision>=0?{name:value.name,source:value.source,remoteRevision:value.remoteRevision,localRevision:value.localRevision,...(typeof value.localFingerprint==='string'&&/^[0-9a-f]{64}$/.test(value.localFingerprint)?{localFingerprint:value.localFingerprint}:{}),...(Number.isSafeInteger(value.remoteVersion)&&value.remoteVersion>0?{remoteVersion:value.remoteVersion}:{})}:null;}
class NotesShare {
 constructor(filename,{snapshot,applyUpdate,canMerge,createWorker,onChange=()=>{},setIntervalFn=setInterval,clearIntervalFn=clearInterval,timeout=15000,scopeFingerprint=false}={}){
  assertLocalPath(filename);Object.assign(this,{filename,snapshot,applyUpdate,canMerge,createWorker,onChange,setIntervalFn,clearIntervalFn,timeout,scopeFingerprint});this.generation=0;this.active=null;this.timer=null;this.checking=false;this.files=[];this.total=0;this.lastCheckAt=null;this.lastPublishedAt=null;this.error='';this.notice=null;this.lastReceivedAt=null;this.lastAutoBackup='';this.rollbackNotice='';
  this.config={enabled:false,folder:null,intervalMinutes:5,autoPublish:false,desktopNotifications:true,receivedNames:[],receiveMode:'remind',followSource:'',ignoredName:'',lastAccepted:null,deviceId:crypto.randomUUID(),publishScope:S.scope(),receiveScope:S.scope(),lastPublishedVersion:0,lastPublishedRevision:null,lastPublishedFingerprint:null};
  try{if(fs.existsSync(filename)){if(fs.statSync(filename).size>65536)throw new Error();const value=JSON.parse(fs.readFileSync(filename,'utf8'));if(value.folder)validateFolder(value.folder);this.config={...this.config,publishScope:S.scope(value.publishScope),receiveScope:S.scope(value.receiveScope),lastPublishedVersion:Number.isSafeInteger(value.lastPublishedVersion)&&value.lastPublishedVersion>=0?value.lastPublishedVersion:0,lastPublishedFingerprint:typeof value.lastPublishedFingerprint==='string'?value.lastPublishedFingerprint:null,enabled:value.enabled===true&&Boolean(value.folder),folder:value.folder||null,intervalMinutes:[1,5,15,30,60].includes(value.intervalMinutes)?value.intervalMinutes:5,autoPublish:value.autoPublish===true,desktopNotifications:value.desktopNotifications!==false,receivedNames:Array.isArray(value.receivedNames)?value.receivedNames.filter(name=>typeof name==='string'&&FILE.test(name)).slice(-100):[],receiveMode:MODES.includes(value.receiveMode)?value.receiveMode:'remind',followSource:typeof value.followSource==='string'&&/^[0-9a-f-]{36}$/i.test(value.followSource)?value.followSource:'',ignoredName:typeof value.ignoredName==='string'&&FILE.test(value.ignoredName)?value.ignoredName:'',lastAccepted:accepted(value.lastAccepted),deviceId:typeof value.deviceId==='string'&&/^[0-9a-f-]{36}$/i.test(value.deviceId)?value.deviceId:crypto.randomUUID(),lastPublishedRevision:Number.isSafeInteger(value.lastPublishedRevision)?value.lastPublishedRevision:null};if(this.config.receiveMode==='auto'&&(!this.config.followSource||this.config.autoPublish))this.config.receiveMode='remind';}}catch{this.error='分享設定無效，已停用，請重新選取資料夾';this.config.enabled=false;}
  this.start();
 }
 status(){return {...this.config,busy:Boolean(this.active)||this.checking,receiveStatus:this.receiveStatus(),files:this.files.map(file=>({...file})),total:this.total,lastCheckAt:this.lastCheckAt,lastPublishedAt:this.lastPublishedAt,error:this.error,notice:this.notice?{...this.notice}:null,lastReceivedAt:this.lastReceivedAt,lastAutoBackup:this.lastAutoBackup,rollbackNotice:this.rollbackNotice};}
 receiveStatus(){
  if(!this.config.enabled)return '共享已停用，不會檢查或提醒。';if(this.config.receiveMode==='ignore')return '接收方式為忽略，不提醒也不匯入。';if(!this.lastCheckAt)return '尚未檢查；可按「立即檢查」，或等待設定的間隔。';
  const others=this.files.filter(file=>{const identity=packageIdentity(file.name);return identity&&identity.source!==this.config.deviceId;});if(!others.length)return '目前只有本機發布的資料包或清單為空；本機自己的發布不會提醒自己。';
  const latest=this.candidate();if(!latest)return '清單中沒有指定來源的資料包；請核對跟隨來源及資料夾。';if(latest.name===this.config.ignoredName)return '最新這一份已忽略，下一份新資料仍會提醒。';if(this.config.receiveMode==='auto'&&!this.config.lastAccepted)return '自動接收尚未建立基準；請從清單手動預覽並匯入一次。';if(this.config.receivedNames.includes(latest.name)||latest.name===this.config.lastAccepted?.name)return '清單中的最新資料包已匯入，沒有待處理更新。';return this.notice?.reason||'已找到其他來源，正在檢查接收狀態。';
 }
 emit(){this.onChange(this.status());}
 save(config){fs.mkdirSync(path.dirname(this.filename),{recursive:true});const temp=this.filename+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(config),{flag:'wx',mode:0o600});fs.renameSync(temp,this.filename);}finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}this.config=config;}
 stop(){this.generation++;if(this.timer){this.clearIntervalFn(this.timer);this.timer=null;}if(this.active)this.active.cancel();}
 start(){if(this.timer)this.clearIntervalFn(this.timer);this.timer=null;if(this.config.enabled){this.timer=this.setIntervalFn(()=>this.tick().catch(()=>{}),this.config.intervalMinutes*60000);this.timer?.unref?.();}}
 choose(folder){const selected=validateFolder(folder);this.save({...this.config,folder:selected,enabled:false,autoPublish:false,receiveMode:'remind',followSource:'',ignoredName:'',receivedNames:[],lastAccepted:null,lastPublishedRevision:null,lastPublishedFingerprint:null});this.stop();this.files=[];this.total=0;this.lastCheckAt=null;this.lastPublishedAt=null;this.lastReceivedAt=null;this.lastAutoBackup='';this.rollbackNotice='';this.notice=null;this.error='';this.emit();return this.status();}
 configure(patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('分享設定無效');const next={...this.config},previousNotice=this.notice,previousSource=this.config.followSource;
  for(const key of ['enabled','autoPublish','desktopNotifications'])if(patch[key]!==undefined){if(typeof patch[key]!=='boolean')throw new Error('分享開關無效');next[key]=patch[key];}
  for(const key of ['publishScope','receiveScope'])if(patch[key]!==undefined)next[key]=S.scope(patch[key]);if(JSON.stringify(next.publishScope)!==JSON.stringify(this.config.publishScope)){next.lastPublishedRevision=null;next.lastPublishedFingerprint=null;}
  if(patch.intervalMinutes!==undefined){if(![1,5,15,30,60].includes(patch.intervalMinutes))throw new Error('檢查間隔無效');next.intervalMinutes=patch.intervalMinutes;}
  if(patch.receiveMode!==undefined){if(!MODES.includes(patch.receiveMode))throw new Error('接收方式無效');next.receiveMode=patch.receiveMode;}
  if(patch.followSource!==undefined){if(typeof patch.followSource!=='string'||patch.followSource!==''&&!/^[0-9a-f-]{36}$/i.test(patch.followSource)||patch.followSource===next.deviceId)throw new Error('發布來源無效');next.followSource=patch.followSource;}
  if(next.enabled&&!next.folder)throw new Error('請先選取分享資料夾');
  if(next.receiveMode==='auto'&&!next.followSource)throw new Error('自動套用前請指定一個發布來源');
  if(next.receiveMode==='auto'&&next.autoPublish)throw new Error('自動接收端請先關閉自動發佈，避免把收到的資料反覆發佈');
  if(next.followSource!==this.config.followSource||JSON.stringify(next.receiveScope)!==JSON.stringify(this.config.receiveScope)){next.lastAccepted=null;next.ignoredName='';next.receivedNames=[];}
  this.save(next);this.stop();this.notice=next.enabled&&next.receiveMode!=='ignore'&&next.followSource===previousSource?previousNotice:null;this.error='';this.start();this.emit();return this.status();
 }
 run(input){if(!this.config.enabled||!this.config.folder)throw new Error('共享資料包已停用');if(this.active)throw new Error('另一個分享作業正在處理');const generation=this.generation;return new Promise((resolve,reject)=>{let worker,timer,finished=false;const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);this.active=null;try{worker?.kill();}catch{}if(error)reject(error);else resolve(result);};try{worker=this.createWorker();this.active={cancel:()=>finish(new Error('分享作業已取消'))};timer=setTimeout(()=>finish(new Error('分享資料夾回應逾時，本機資料未變更')),this.timeout);worker.once('message',message=>{if(generation!==this.generation)return finish(new Error('分享作業已取消'));message?.ok?finish(null,message.result):finish(new Error(message?.error||'分享作業失敗'));});worker.once('exit',()=>finish(new Error('分享作業已結束，請重試')));worker.once('error',error=>finish(error));worker.once('spawn',()=>{try{worker.postMessage({...input,folder:this.config.folder});}catch(error){finish(error);}});this.emit();}catch(error){finish(error);}});}
 async action(input){const generation=this.generation;try{const result=await this.run(input);if(generation!==this.generation)throw new Error('分享作業已取消');this.error='';return result;}catch(error){if(generation===this.generation)this.error=String(error.message||error);throw error;}finally{this.emit();}}
 async check(){
  if(this.checking)throw new Error('另一個分享作業正在處理');this.checking=true;const generation=this.generation;
  try{const result=await this.action({action:'check'});this.files=result.files;this.total=result.total;this.lastCheckAt=new Date().toISOString();await this.receive(generation);}
  catch(error){if(generation===this.generation)this.error=String(error.message||error);throw error;}
  finally{this.checking=false;this.emit();}
  return this.status();
 }
 candidate(){return this.files.filter(file=>{const info=packageIdentity(file.name);return info&&info.source!==this.config.deviceId&&(!this.config.followSource||info.source===this.config.followSource);}).sort((a,b)=>packageIdentity(b.name).published-packageIdentity(a.name).published||b.name.localeCompare(a.name))[0];}
 async receive(generation){
  this.notice=null;if(this.config.receiveMode==='ignore')return;const file=this.candidate();if(!file||file.name===this.config.ignoredName||file.name===this.config.lastAccepted?.name||this.config.receivedNames.includes(file.name))return;
  const identity=packageIdentity(file.name);this.notice={name:file.name,source:identity.source,reason:'發現新的共享資料包，請預覽匯入。'};
  if(this.config.receiveMode!=='auto')return;
  const baseline=this.config.lastAccepted;if(!baseline||baseline.source!==identity.source){this.notice.reason='首次接收請先手動預覽並確認匯入，建立自動接收基準。';return;}
  const before=this.snapshot(this.config.receiveScope);
  const locallyChanged=state=>this.scopeFingerprint&&baseline.localFingerprint?
   state.fingerprint!==baseline.localFingerprint:state.revision!==baseline.localRevision;
  const localNotice='本機在上次接收後已有修改，且沒有可用的共同版本；請手動預覽及確認。';
  if(!this.canMerge&&locallyChanged(before)){this.notice.reason=localNotice;return;}
  const result=await this.read(file.name);if(generation!==this.generation||!this.config.enabled)throw new Error('分享作業已取消');
  if(!result.sharing||result.sharing.source!==identity.source)throw new Error('資料包缺少有效的發布來源，請手動預覽');
  if(result.sharing.revision<baseline.remoteRevision||result.sharing.revision===baseline.remoteRevision&&(!result.sharing.version||result.sharing.version<=(baseline.remoteVersion||0))){this.notice.reason='來源版本未遞增，已避免重複或倒退套用；如有需要請手動預覽。';return;}
  if(!this.applyUpdate){this.notice.reason='目前無法自動套用，請手動預覽。';return;}
  const context={source:result.sharing.source,sourceRevision:result.sharing.revision,sourceVersion:result.sharing.version,
   scope:S.receivingScope(result.sharing.scope,this.config.receiveScope),packageName:file.name};
  const local=this.snapshot(this.config.receiveScope);
  if(locallyChanged(local)&&!this.canMerge?.(context)){this.notice.reason=localNotice;return;}
  const applied=await this.applyUpdate(result.data,local.revision,()=>generation===this.generation&&this.config.enabled&&this.config.receiveMode==='auto',context);
  if(generation!==this.generation||!this.config.enabled)return;
  if(applied?.deferred){this.notice.reason=applied.reason||'目前正在編輯，稍後會重新檢查。';return;}
  if(!Number.isSafeInteger(applied?.revision))throw new Error('自動接收結果無效');
  this.accept({name:file.name,sharing:result.sharing},applied.revision);this.lastReceivedAt=new Date().toISOString();this.lastAutoBackup=applied.backup||'';this.notice=null;
 }
 accept(input,localRevision){const value=accepted({name:input?.name,source:input?.sharing?.source,remoteRevision:input?.sharing?.revision,remoteVersion:input?.sharing?.version,localFingerprint:this.scopeFingerprint?this.snapshot(this.config.receiveScope).fingerprint:undefined,localRevision});if(!value||value.source!==this.config.followSource)return false;this.save({...this.config,lastAccepted:value,ignoredName:'',receivedNames:[...this.config.receivedNames.filter(name=>name!==value.name),value.name].slice(-100)});this.notice=null;this.emit();return true;}
 completeImport(input,localRevision,mode){
  this.rollbackNotice='';const previous=this.config.lastAccepted,older=previous&&input?.sharing?.source===previous.source&&(input.sharing.revision<previous.remoteRevision||input.sharing.version&&previous.remoteVersion&&input.sharing.version<previous.remoteVersion);if(['merge','update','clone'].includes(mode)&&this.accept(input,localRevision)){if(older){this.save({...this.config,receiveMode:'remind',receivedNames:[input.name],ignoredName:''});this.rollbackNotice='已套用較舊來源版本；自動接收改為提醒，避免立刻被新版覆蓋。';this.emit();}return true;}if(!FILE.test(input?.name))return false;
  this.save({...this.config,receivedNames:[...this.config.receivedNames.filter(name=>name!==input.name),input.name].slice(-100)});this.notice=null;this.emit();return true;
 }
 ignore(name){if(!this.notice||this.notice.name!==name)throw new Error('更新提示已變更，請重新檢查');this.save({...this.config,ignoredName:name});this.notice=null;this.emit();return this.status();}
 async publish(snapshot){if(this.checking)throw new Error('另一個分享作業正在處理');if(!this.config.enabled)throw new Error('共享資料包已停用');snapshot=snapshot||this.snapshot(this.config.publishScope);const version=this.config.lastPublishedVersion+1;if(!Number.isSafeInteger(version))throw new Error('發布版本已超出範圍');const result=await this.action({action:'publish',deviceId:this.config.deviceId,revision:snapshot.revision,version,scope:this.config.publishScope,data:snapshot.data});this.save({...this.config,lastPublishedRevision:snapshot.revision,lastPublishedVersion:version,lastPublishedFingerprint:snapshot.fingerprint||null});this.lastPublishedAt=new Date().toISOString();this.files=[{name:result.name,size:result.size,modifiedAt:result.modifiedAt},...this.files].slice(0,50);this.total++;this.emit();return {name:result.name,...this.status()};}
 async read(name){if(!this.files.some(file=>file.name===name)||!FILE.test(name))throw new Error('請先檢查並選取清單內的共享資料包');return this.action({action:'read',name});}
 async tick(){if(!this.config.enabled||this.active||this.checking)return;const generation=this.generation;try{await this.check();if(generation!==this.generation)return;if(this.config.enabled&&this.config.autoPublish){const snapshot=this.snapshot(this.config.publishScope);if(this.scopeFingerprint?snapshot.fingerprint!==this.config.lastPublishedFingerprint:snapshot.revision!==this.config.lastPublishedRevision)await this.publish(snapshot);}}catch(error){if(generation===this.generation){this.error=String(error.message||error);this.emit();}throw error;}}
 close(){this.stop();}
}
module.exports={NotesShare};
