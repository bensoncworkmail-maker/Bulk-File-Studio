'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {NotesShare}=require('./notes-share'),M=require('./notes-model'),S=require('./notes-sharing-model');
// Each master owns a local configuration, timer, source ID and receive baseline.
// Selecting a profile changes the management view, never another profile's settings.
class NotesShareProfiles{
 constructor(filename,options){this.filename=filename;this.options=options;this.selected='default';this.channels=new Map();this.retired=new Map();this.loading=true;this.cleanupError='';this.create('default');const directory=path.join(path.dirname(filename),'workspace-share-profiles');if(fs.existsSync(directory))for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const id=entry.name.replace(/\.json$/,'');if(entry.isFile()&&entry.name===id+'.json'&&M.ID.test(id))this.create(id,true);}this.reconcile();this.loading=false;}
 masters(){return this.options.masters?.()||[];}
 file(id){return id==='default'?this.filename:path.join(path.dirname(this.filename),'workspace-share-profiles',id+'.json');}
 create(id,allowRemoved=false){if(this.channels.has(id))return this.channels.get(id);if(id!=='default'&&(!M.ID.test(id)||!allowRemoved&&!this.masters().some(master=>master.id===id)))throw new Error('主表已移除，請重新選擇共享設定');
  if(this.retired.has(id)){const channel=this.retired.get(id);this.retired.delete(id);this.channels.set(id,channel);return channel;}
  let channel;const selection=id==='default'?null:{mode:'masters',masterIds:[id]};
  channel=new NotesShare(this.file(id),{...this.options,scopeFingerprint:id!=='default',snapshot:scope=>{const snapshot=this.options.snapshot(selection||scope);if(id==='default')return snapshot;return {...snapshot,fingerprint:crypto.createHash('sha256').update(JSON.stringify(snapshot.data.document)).digest('hex')};},onChange:()=>{if(!this.loading)this.emit();}});
  if(selection){channel.config={...channel.config,publishScope:selection,receiveScope:selection};const start=channel.start.bind(channel);channel.start=()=>{if(this.masters().some(master=>master.id===id))start();else channel.close();};const tick=channel.tick.bind(channel);channel.tick=async()=>{if(this.masters().some(master=>master.id===id))return tick();};}
  this.channels.set(id,channel);return channel;
 }
 // Read the live set before changing anything; a database error is not deletion.
 // Keep paused objects for restore even when their disabled state could not be saved.
 reconcile(){const live=new Set(this.masters().map(master=>master.id));let changed=false;for(const [id,channel] of this.channels){if(id==='default'||live.has(id))continue;this.channels.delete(id);this.retired.set(id,channel);if(this.selected===id)this.selected='default';channel.close();channel.files=[];channel.total=0;channel.notice=null;if(channel.config.enabled||channel.config.autoPublish||channel.config.receiveMode==='auto'){const paused={...channel.config,enabled:false,autoPublish:false,receiveMode:'remind'};try{channel.save(paused);}catch{channel.config=paused;this.cleanupError='已停止已移除主表的共享作業，但無法保存停用設定；請檢查本機設定資料夾的寫入權限。';}}changed=true;}return changed;}
 channel(id){this.reconcile();if(id===undefined)id=this.selected;if(id!=='default'&&!this.masters().some(master=>master.id===id))throw new Error('主表已移除，請停用原共享設定或選取其他主表');return this.create(id);}
 get config(){return this.channel().config;}
 get rollbackNotice(){return this.channel().rollbackNotice;}
 status(){this.reconcile();const current=this.channel().status(),masters=this.masters(),profiles=[{id:'default',name:'原有共用設定'},...masters];for(const profile of profiles){const channel=this.channels.get(profile.id);profile.enabled=channel?.config.enabled===true;profile.pending=Boolean(channel?.notice);profile.error=channel?.error||'';profile.folder=channel?.config.folder||null;profile.busy=Boolean(channel?.active)||channel?.checking===true;profile.notice=channel?.notice?{...channel.notice}:null;profile.lastCheckAt=channel?.lastCheckAt||null;}const pending=[...this.channels.entries()].filter(([id,ch])=>(id==='default'||masters.some(m=>m.id===id))&&ch.config.enabled&&ch.notice);return {...current,error:current.error||this.cleanupError,profileId:this.selected,profiles,pendingProfiles:pending.map(([id,ch])=>({id,name:profiles.find(p=>p.id===id)?.name||id,reason:ch.notice.reason})),anyEnabled:profiles.some(p=>p.enabled),notificationState:(pending.find(([,channel])=>channel.config.desktopNotifications)?.[1]||pending[0]?.[1])?.status()||current};}
 emit(){this.options.onChange?.(this.status());}
 select(id){this.reconcile();if([...this.channels.values()].some(ch=>ch.active||ch.checking))throw new Error('共享作業進行中，完成後再切換');this.channel(id);this.selected=id;this.emit();return this.status();}
 choose(folder,id=this.selected){this.channel(id).choose(folder);return this.status();}
 configure(patch,id=this.selected){if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('分享設定無效');const channel=this.channel(id);if(id!=='default')for(const key of ['publishScope','receiveScope'])if(patch[key]&&JSON.stringify(S.scope(patch[key]))!==JSON.stringify({mode:'masters',masterIds:[id]}))throw new Error('獨立共享範圍固定為目前主表及明細');
  const next={...channel.config,...patch,folder:channel.config.folder};if(next.enabled){const scopes=[S.scope(next.publishScope),S.scope(next.receiveScope)];for(const [otherId,other] of this.channels){if(otherId===id||!other.config.enabled)continue;const otherName=otherId==='default'?'原有共用設定':this.masters().find(master=>master.id===otherId)?.name||otherId;const folderKey=value=>process.platform==='win32'?value?.toLocaleLowerCase():value;if(next.folder&&folderKey(next.folder)===folderKey(other.config.folder))throw new Error('不同共享設定請使用不同資料夾；目前由「'+otherName+'」使用，請先停用該組或為目前主表選取另一個資料夾');const otherScopes=[other.config.publishScope,other.config.receiveScope];if(scopes.some(a=>otherScopes.some(b=>a.mode==='all'||b.mode==='all'||a.masterIds.some(key=>b.masterIds.includes(key)))))throw new Error('此主表已包含在另一組啟用中的共享設定「'+otherName+'」；請先縮小該組範圍或停用該組，避免兩個來源覆蓋同一主表');}}
  channel.configure(patch);return this.status();
 }
 async check(id=this.selected){const channel=this.channel(id);await channel.check();return {...this.status(),actionProfileId:id};}
 async publish(id=this.selected){const channel=this.channel(id);const result=await channel.publish();return {...this.status(),name:result.name,actionProfileId:id};}
 async read(name,profileId=this.selected){const channel=this.channel(profileId);const result=await channel.read(name);S.receivingScope(result.sharing?.scope,channel.config.receiveScope);return {...result,profileId,receiveScope:channel.config.receiveScope};}
 ignore(name){this.channel().ignore(name);return this.status();}
 completeImport(input,revision,mode){const channel=this.channel(input.profileId||'default');return channel.completeImport(input,revision,mode);}
 async tick(){this.reconcile();for(const [id,channel] of this.channels)if(id==='default'||this.masters().some(master=>master.id===id))await channel.tick().catch(()=>{});}
 close(){for(const channel of this.channels.values())channel.close();}
}
module.exports={NotesShareProfiles};
