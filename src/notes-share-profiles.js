'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {NotesShare}=require('./notes-share'),M=require('./notes-model'),S=require('./notes-sharing-model');
// Each master owns a local configuration, timer, source ID and receive baseline.
// Selecting a profile changes the management view, never another profile's settings.
class NotesShareProfiles{
 constructor(filename,options){this.filename=filename;this.options=options;this.selected='default';this.channels=new Map();this.loading=true;this.create('default');for(const master of this.masters())if(fs.existsSync(this.file(master.id)))this.create(master.id);this.loading=false;}
 masters(){try{return this.options.masters?.()||[];}catch{return [];}}
 file(id){return id==='default'?this.filename:path.join(path.dirname(this.filename),'workspace-share-profiles',id+'.json');}
 create(id){if(this.channels.has(id))return this.channels.get(id);if(id!=='default'&&(!M.ID.test(id)||!this.masters().some(master=>master.id===id)))throw new Error('主表已移除，請重新選擇共享設定');
  let channel;const selection=id==='default'?null:{mode:'masters',masterIds:[id]};
  channel=new NotesShare(this.file(id),{...this.options,scopeFingerprint:id!=='default',snapshot:scope=>{const snapshot=this.options.snapshot(selection||scope);if(id==='default')return snapshot;return {...snapshot,fingerprint:crypto.createHash('sha256').update(JSON.stringify(snapshot.data.document)).digest('hex')};},onChange:()=>{if(!this.loading)this.emit();}});
  if(selection){channel.config={...channel.config,publishScope:selection,receiveScope:selection};const start=channel.start.bind(channel);channel.start=()=>{if(this.masters().some(master=>master.id===id))start();else channel.close();};const tick=channel.tick.bind(channel);channel.tick=()=>this.masters().some(master=>master.id===id)?tick():Promise.resolve();}
  this.channels.set(id,channel);return channel;
 }
 channel(id=this.selected){if(id!=='default'&&!this.masters().some(master=>master.id===id))throw new Error('主表已移除，請停用原共享設定或選取其他主表');return this.create(id);}
 get config(){return this.channel().config;}
 get rollbackNotice(){return this.channel().rollbackNotice;}
 status(){if(this.selected!=='default'&&!this.masters().some(master=>master.id===this.selected))this.selected='default';const current=this.channel().status(),masters=this.masters(),profiles=[{id:'default',name:'原有共用設定'},...masters];for(const profile of profiles){const channel=this.channels.get(profile.id);profile.enabled=channel?.config.enabled===true;profile.pending=Boolean(channel?.notice);profile.error=channel?.error||'';profile.folder=channel?.config.folder||null;}const pending=[...this.channels.entries()].filter(([id,ch])=>(id==='default'||masters.some(m=>m.id===id))&&ch.config.enabled&&ch.notice);return {...current,profileId:this.selected,profiles,pendingProfiles:pending.map(([id,ch])=>({id,name:profiles.find(p=>p.id===id)?.name||id,reason:ch.notice.reason})),anyEnabled:profiles.some(p=>p.enabled),notificationState:(pending.find(([,channel])=>channel.config.desktopNotifications)?.[1]||pending[0]?.[1])?.status()||current};}
 emit(){this.options.onChange?.(this.status());}
 select(id){if([...this.channels.values()].some(ch=>ch.active||ch.checking))throw new Error('共享作業進行中，完成後再切換');this.channel(id);this.selected=id;this.emit();return this.status();}
 choose(folder){this.channel().choose(folder);return this.status();}
 configure(patch){if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('分享設定無效');const channel=this.channel(),id=this.selected;if(id!=='default')for(const key of ['publishScope','receiveScope'])if(patch[key]&&JSON.stringify(S.scope(patch[key]))!==JSON.stringify({mode:'masters',masterIds:[id]}))throw new Error('獨立共享範圍固定為目前主表及明細');
  const next={...channel.config,...patch,folder:channel.config.folder};if(next.enabled){const scopes=[S.scope(next.publishScope),S.scope(next.receiveScope)];for(const [otherId,other] of this.channels){if(otherId===id||!other.config.enabled)continue;const folderKey=value=>process.platform==='win32'?value?.toLocaleLowerCase():value;if(next.folder&&folderKey(next.folder)===folderKey(other.config.folder))throw new Error('不同共享設定請使用不同資料夾，避免其他主表的來源混入接收清單');const otherScopes=[other.config.publishScope,other.config.receiveScope];if(scopes.some(a=>otherScopes.some(b=>a.mode==='all'||b.mode==='all'||a.masterIds.some(key=>b.masterIds.includes(key)))))throw new Error('此主表已包含在另一組啟用中的共享設定；請先縮小原有共用設定範圍或停用該組，避免兩個來源覆蓋同一主表');}}
  channel.configure(patch);return this.status();
 }
 async check(){const channel=this.channel();await channel.check();return this.status();}
 async publish(){const channel=this.channel();const result=await channel.publish();return {...this.status(),name:result.name};}
 async read(name){const profileId=this.selected,channel=this.channel();const result=await channel.read(name);S.receivingScope(result.sharing?.scope,channel.config.receiveScope);return {...result,profileId,receiveScope:channel.config.receiveScope};}
 ignore(name){this.channel().ignore(name);return this.status();}
 completeImport(input,revision,mode){const channel=this.channel(input.profileId||'default');return channel.completeImport(input,revision,mode);}
 async tick(){for(const [id,channel] of this.channels)if(id==='default'||this.masters().some(master=>master.id===id))await channel.tick().catch(()=>{});}
 close(){for(const channel of this.channels.values())channel.close();}
}
module.exports={NotesShareProfiles};
