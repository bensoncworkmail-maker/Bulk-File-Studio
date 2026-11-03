'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{fork}=require('node:child_process');
const {NotesShareProfiles}=require('../src/notes-share-profiles'),{NotesStore}=require('../src/notes-store'),M=require('../src/notes-model'),S=require('../src/notes-sharing-model'),{perform}=require('../src/notes-share-worker');
const {EventEmitter}=require('node:events');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-profile-')),store=new NotesStore(path.join(dir,'notes.sqlite'));store.addTemplate();store.addTemplate('projects');const roots=M.masterTableTree(store.get().document).map(branch=>branch.master);for(const root of roots)store.saveRecord({sheetId:root.id,title:root.name,values:{},notes:'local',tags:[],fileLinks:[]});const folders=roots.map((_,i)=>{const folder=path.join(dir,'shared-'+i);fs.mkdirSync(folder);return folder;});const options={masters:()=>M.masterTableTree(store.get().document).map(branch=>({id:branch.master.id,name:branch.master.name})),snapshot:selection=>{const state=store.get(),scope=S.scope(selection);return {revision:state.revision,data:M.exportPackage(state.document,scope.mode==='all'?{scope:'all'}:{scope:'masters',masterIds:scope.masterIds})};},applyUpdate:(data,revision,enabled,context)=>{if(!enabled())return {deferred:true};const result=store.importShared(data,revision,context);return {revision:result.revision,backup:result.result.backup};},createWorker:()=>{const child=fork(path.join(__dirname,'../src/notes-share-worker.js'),{silent:true});child.postMessage=value=>child.send(value);return child;},setIntervalFn:()=>({unref(){}}),clearIntervalFn(){},timeout:3000};const filename=path.join(dir,'workspace-share.json'),share=new NotesShareProfiles(filename,options);t.after(()=>{share.close();store.close();fs.rmSync(dir,{recursive:true,force:true});});return {dir,store,roots,folders,filename,options,share};}
function configure(h,index,patch={}){h.share.select(h.roots[index].id);h.share.choose(h.folders[index]);return h.share.configure({enabled:true,...patch});}
async function accept(h,index,name){h.share.select(h.roots[index].id);const input=await h.share.read(name),preview=h.store.importPreview(input.data,'update',{scope:input.receiveScope}),result=h.store.importCommit(preview.token);h.share.completeImport({name,...input},result.revision,'update');return input;}
test('master profiles isolate publication, changed-data checks, paths and persisted source identities',async t=>{
 const h=setup(t);configure(h,0,{autoPublish:true});const sourceA=h.share.config.deviceId;configure(h,1,{autoPublish:true});const sourceB=h.share.config.deviceId;assert.notEqual(sourceA,sourceB);await h.share.tick();assert.equal(fs.readdirSync(h.folders[0]).length,1);assert.equal(fs.readdirSync(h.folders[1]).length,1);
 const b=h.store.get().document.records.find(record=>record.sheetId===h.roots[1].id);h.store.saveRecord({...b,expectedVersion:b.version,title:'B changed'});await h.share.tick();assert.equal(fs.readdirSync(h.folders[0]).length,1);assert.equal(fs.readdirSync(h.folders[1]).length,2);
 const aFile=fs.readdirSync(h.folders[0])[0],data=JSON.parse(fs.readFileSync(path.join(h.folders[0],aFile)));assert.deepEqual(data.sharing.scope.masterIds,[h.roots[0].id]);assert.ok(data.document.records.every(record=>record.sheetId!==h.roots[1].id));
 const bConfig=structuredClone(h.share.config);h.share.select(h.roots[0].id);const newA=path.join(h.dir,'new-a');fs.mkdirSync(newA);h.share.choose(newA);assert.equal(h.share.config.enabled,false);h.share.select(h.roots[1].id);assert.deepEqual(h.share.config,bConfig);assert.throws(()=>h.share.configure({receiveScope:{mode:'all',masterIds:[]}}),/固定/);
 h.share.close();const reload=new NotesShareProfiles(h.filename,h.options);t.after(()=>reload.close());reload.select(h.roots[0].id);assert.equal(reload.config.deviceId,sourceA);assert.equal(reload.config.enabled,false);reload.select(h.roots[1].id);assert.equal(reload.config.deviceId,sourceB);assert.equal(reload.config.folder,h.folders[1]);assert.equal(reload.config.enabled,true);reload.select(h.roots[0].id);reload.configure({enabled:true,autoPublish:true});await reload.tick();assert.equal(fs.readdirSync(newA).length,1);
});
test('overlapping enabled legacy scope is rejected without mutating either profile or discarding legacy configuration',t=>{
 const h=setup(t);h.share.choose(path.join(h.dir,'legacy'));h.share.configure({enabled:true});const legacy=structuredClone(h.share.config);h.share.select(h.roots[0].id);h.share.choose(h.folders[0]);assert.throws(()=>h.share.configure({enabled:true}),/另一組/);assert.equal(h.share.config.enabled,false);h.share.select('default');assert.deepEqual(h.share.config,legacy);h.share.configure({publishScope:{mode:'masters',masterIds:[h.roots[1].id]},receiveScope:{mode:'masters',masterIds:[h.roots[1].id]}});h.share.select(h.roots[0].id);h.share.configure({enabled:true});assert.equal(h.share.config.enabled,true);h.share.select('default');assert.throws(()=>h.share.configure({receiveScope:{mode:'all',masterIds:[]}}),/另一組/);
});
test('receiving A preserves local B, and B changes only pause B while profile A uses its own baseline',async t=>{
 const h=setup(t),sources=h.roots.map(()=>crypto.randomUUID()),remote=M.clone(h.store.get().document);let serial=0;const publish=i=>perform({action:'publish',folder:h.folders[i],deviceId:sources[i],revision:++serial,version:serial,scope:{mode:'masters',masterIds:[h.roots[i].id]},data:M.exportPackage(remote,{scope:'all'})}).name;
 for(let i=0;i<2;i++){configure(h,i,{followSource:sources[i],receiveMode:'auto'});const name=publish(i);await h.share.check();await accept(h,i,name);}
 const before=h.store.get().document.records.find(record=>record.sheetId===h.roots[1].id);h.store.saveRecord({...before,expectedVersion:before.version,title:'B local draft'});const savedB=h.store.get().document.records.find(record=>record.id===before.id);remote.records.find(record=>record.sheetId===h.roots[0].id).title='A remote update';const aName=publish(0);publish(1);await h.share.tick();assert.equal(h.store.get().document.records.find(record=>record.sheetId===h.roots[0].id).title,'A remote update');assert.deepEqual(h.store.get().document.records.find(record=>record.id===before.id),savedB);
 h.share.select(h.roots[0].id);assert.equal(h.share.config.lastAccepted.name,aName);assert.ok(fs.existsSync(h.share.status().lastAutoBackup));h.share.select(h.roots[1].id);assert.match(h.share.status().notice.reason,/本機.*修改/);assert.equal(h.share.status().pendingProfiles.length,1);h.share.select('default');assert.equal(h.share.status().anyEnabled,true);assert.equal(h.share.status().pendingProfiles[0].id,h.roots[1].id);
});
test('an import acknowledges its captured profile even after switching the management view',async t=>{
 const h=setup(t),source=crypto.randomUUID();configure(h,0,{followSource:source});configure(h,1);h.share.select(h.roots[0].id);const name=perform({action:'publish',folder:h.folders[0],deviceId:source,revision:1,data:M.exportPackage(h.store.get().document,{scope:'all'})}).name;await h.share.check();const input=await h.share.read(name);h.share.select(h.roots[1].id);h.share.completeImport({name,...input},h.store.get().revision,'update');assert.equal(h.share.config.lastAccepted,null);h.share.select(h.roots[0].id);assert.equal(h.share.config.lastAccepted.name,name);
});

test('explicit master checks and publications preserve the management selection and never use another profile folder',async t=>{
 const h=setup(t);configure(h,0);configure(h,1);assert.equal(h.share.selected,h.roots[1].id);const b=structuredClone(h.share.config);const published=await h.share.publish(h.roots[0].id);assert.equal(h.share.selected,h.roots[1].id);assert.deepEqual(h.share.config,b);assert.equal(fs.readdirSync(h.folders[0]).length,1);assert.equal(fs.readdirSync(h.folders[1]).length,0);await h.share.check(h.roots[0].id);assert.equal(h.share.selected,h.roots[1].id);const packet=await h.share.read(published.name,h.roots[0].id);assert.equal(packet.profileId,h.roots[0].id);assert.deepEqual(packet.receiveScope.masterIds,[h.roots[0].id]);assert.equal(h.share.selected,h.roots[1].id);assert.ok(h.share.status().profiles.find(profile=>profile.id===h.roots[0].id).lastCheckAt);assert.throws(()=>h.share.channel(crypto.randomUUID()),/移除/);
});

test('publishing a master includes detail file/folder paths and custom path text without copying original file bytes',async t=>{
 const h=setup(t),branch=M.masterTableTree(h.store.get().document).find(item=>item.master.id===h.roots[0].id),detail=branch.children.find(sheet=>sheet.name==='文件／位置'),master=h.store.get().document.records.find(record=>record.sheetId===branch.master.id),parent=M.parentField(h.store.get().document,detail),text=detail.fields.find(field=>field.type==='text'||field.type==='longtext'),file='\\\\FileServer\\Team\\Clients\\contract.pdf',folder='\\\\FileServer\\Team\\Clients';
 const saved=h.store.saveRecord({sheetId:detail.id,title:'Documents',notes:'',tags:[],values:{[parent.id]:[master.id],...(text?{[text.id]:folder}:{})},fileLinks:[{favoriteId:null,path:file,type:'file',label:'Contract'},{favoriteId:null,path:folder,type:'folder',label:'Client folder'}]}).result.id;configure(h,0);const result=await h.share.publish(branch.master.id),packageData=JSON.parse(fs.readFileSync(path.join(h.folders[0],result.name),'utf8')),record=packageData.document.records.find(record=>record.id===saved);assert.deepEqual(record.fileLinks.map(link=>link.path),[file,folder]);assert.ok(record.fileLinks.every(link=>link.favoriteId===null));if(text)assert.equal(record.values[text.id],folder);assert.deepEqual(fs.readdirSync(h.folders[0]),[result.name]);const source=crypto.randomUUID(),incoming={...packageData,sharing:{...packageData.sharing,source}};const preview=h.store.importPreview(incoming,'copy');h.store.importCommit(preview.token);const copy=h.store.get().document.records.find(record=>record.title==='Documents'&&record.id!==saved);assert.deepEqual(copy.fileLinks.map(link=>link.path),[file,folder]);
});

function removeMaster(h,id){
 const state=h.store.get(),branch=M.masterTableTree(state.document).find(branch=>branch.master.id===id);
 return h.store.batchSheets([branch.master,...branch.children].map(sheet=>({id:sheet.id,version:sheet.version})),state.revision);
}

test('delete then reimport permits reusing the old shared folder without changing another master or shared files',async t=>{
 const h=setup(t),oldId=h.roots[0].id;
 const source=M.exportPackage(h.store.get().document,{scope:'masters',masterIds:[oldId]});
 configure(h,0,{autoPublish:true});await h.share.publish();
 configure(h,1,{autoPublish:true});const b=structuredClone(h.share.config);
 h.share.select(oldId);const oldChannel=h.share.channel(),oldConfig=structuredClone(oldChannel.config);
 const files=fs.readdirSync(h.folders[0]).map(name=>[name,fs.readFileSync(path.join(h.folders[0],name),'utf8')]);
 removeMaster(h,oldId);assert.equal(h.share.reconcile(),true);
 assert.equal(oldChannel.timer,null);assert.equal(h.share.selected,'default');
 assert.equal(h.share.channels.has(oldId),false);
 const paused=JSON.parse(fs.readFileSync(h.share.file(oldId),'utf8'));
 assert.equal(paused.enabled,false);assert.equal(paused.autoPublish,false);
 assert.equal(paused.folder,oldConfig.folder);assert.equal(paused.deviceId,oldConfig.deviceId);
 const preview=h.store.importPreview(source,'copy');h.store.importCommit(preview.token);
 const newRoot=M.masterTableTree(h.store.get().document).find(branch=>!h.roots.some(root=>root.id===branch.master.id)).master;
 assert.notEqual(newRoot.id,oldId);h.share.select(newRoot.id);h.share.choose(h.folders[0]);
 assert.equal(h.share.configure({enabled:true}).enabled,true);
 assert.equal(h.share.status().profiles.some(profile=>profile.id===oldId),false);
 h.share.select(h.roots[1].id);assert.deepEqual(h.share.config,b);
 for(const [name,bytes] of files)assert.equal(fs.readFileSync(path.join(h.folders[0],name),'utf8'),bytes);
});

test('startup retires old-version orphan configurations and restoring the same master requires manual enable',t=>{
 const h=setup(t),id=h.roots[0].id;configure(h,0,{receiveMode:'auto',followSource:crypto.randomUUID()});const identity=h.share.config.deviceId;
 removeMaster(h,id);h.share.close();
 // Simulate deletion by an older release: the saved profile is still enabled.
 assert.equal(JSON.parse(fs.readFileSync(h.share.file(id),'utf8')).enabled,true);
 const reload=new NotesShareProfiles(h.filename,h.options);t.after(()=>reload.close());
 assert.equal(reload.channels.has(id),false);
 assert.equal(JSON.parse(fs.readFileSync(reload.file(id),'utf8')).enabled,false);
 const deleted=h.store.get().document.sheets.find(sheet=>sheet.id===id);
 h.store.trash('sheet',id,deleted.version,true);reload.select(id);
 assert.equal(reload.config.enabled,false);assert.equal(reload.config.autoPublish,false);
 assert.equal(reload.config.receiveMode,'remind');assert.equal(reload.config.deviceId,identity);
 assert.equal(reload.config.folder,h.folders[0]);
 reload.configure({enabled:true});assert.equal(reload.config.enabled,true);
});

test('retiring a deleted master cancels in-flight workers and prevents later publication or receive',async t=>{
 const h=setup(t);let worker,killed=false;
 h.share.options.createWorker=()=>{worker=new EventEmitter();worker.kill=()=>{killed=true;};worker.postMessage=()=>{};return worker;};
 configure(h,0,{autoPublish:true});const channel=h.share.channel();
 const pending=h.share.check(h.roots[0].id),rejected=assert.rejects(pending,/取消/);
 removeMaster(h,h.roots[0].id);h.share.reconcile();await rejected;
 assert.equal(killed,true);assert.equal(channel.active,null);assert.equal(channel.timer,null);
 assert.equal(channel.config.enabled,false);assert.equal(channel.notice,null);
 await h.share.tick();assert.deepEqual(fs.readdirSync(h.folders[0]),[]);
 assert.throws(()=>h.share.channel(h.roots[0].id),/移除/);
});

test('live duplicate folder conflicts name the actual owner and keep both configurations intact',t=>{
 const h=setup(t);configure(h,0);const a=structuredClone(h.share.config);
 h.share.select(h.roots[1].id);h.share.choose(h.folders[0]);
 assert.throws(()=>h.share.configure({enabled:true}),error=>error.message.includes('「'+h.roots[0].name+'」'));
 assert.equal(h.share.config.enabled,false);h.share.select(h.roots[0].id);assert.deepEqual(h.share.config,a);
});

test('master-list read failures do not retire otherwise valid share configurations',t=>{
 const h=setup(t);configure(h,0);const channel=h.share.channel(),saved=fs.readFileSync(channel.filename,'utf8');
 const masters=h.options.masters;h.options.masters=()=>{throw new Error('database temporarily unavailable');};
 assert.throws(()=>h.share.reconcile(),/temporarily unavailable/);
 assert.equal(channel.config.enabled,true);assert.equal(fs.readFileSync(channel.filename,'utf8'),saved);
 h.options.masters=masters;
});

test('a failed retirement write still stops the orphan and reports the local settings error',t=>{
 const h=setup(t);configure(h,0,{autoPublish:true});const channel=h.share.channel();
 channel.save=()=>{throw new Error('read only');};removeMaster(h,h.roots[0].id);
 h.share.reconcile();assert.equal(channel.config.enabled,false);assert.equal(channel.timer,null);
 assert.equal(h.share.channels.has(h.roots[0].id),false);assert.match(h.share.status().error,/無法保存停用/);
 const removed=h.store.get().document.sheets.find(sheet=>sheet.id===h.roots[0].id);
 h.store.trash('sheet',removed.id,removed.version,true);h.share.select(removed.id);
 assert.equal(h.share.config.enabled,false);assert.equal(h.share.config.autoPublish,false);
});
