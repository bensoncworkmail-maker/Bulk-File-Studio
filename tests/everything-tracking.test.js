'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {FavoritesStore,validateFavorites}=require('../src/favorites-store'),{EverythingTracking,normalizeRules}=require('../src/everything-tracking');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-everything-tracking-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const a=path.join(dir,'a.txt'),b=path.join(dir,'b.txt');fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');
 const favorites=new FavoritesStore(path.join(dir,'favorites.json')),calls=[];let paths=[a,b],fail='',pending;
 const bridge={status:()=>({enabled:true,configured:true,supported:true}),search:async(input,options)=>{calls.push({input,options});if(pending)return pending;if(fail)throw Error(fail);return {rows:paths.map(location=>({path:location,name:path.basename(location)})),truncated:false,skipped:0};}};
 const tracking=new EverythingTracking({favorites,bridge});const save=(patch={})=>tracking.save({name:'Large files',text:'dm:last7days size:>200mb',type:'file',mode:'syntax',tags:['工作'],enabled:true,...patch});
 return {dir,a,b,favorites,bridge,tracking,calls,save,paths:value=>paths=value,fail:value=>fail=value,pending:value=>pending=value};
}
test('file categories survive saved-rule reload, validation, refresh and editing without changing query text',async t=>{
 const h=fixture(t),{FILE_TYPES}=require('../src/everything-query');
 for(const type of Object.keys(FILE_TYPES))h.save({name:type,type});
 const restored=validateFavorites(JSON.parse(JSON.stringify(h.favorites.read())));
 const store=new FavoritesStore(path.join(h.dir,'restored.json'));store.write(restored);
 const tracking=new EverythingTracking({favorites:store,bridge:h.bridge});
 assert.deepEqual(tracking.list().queries.map(query=>query.type),Object.keys(FILE_TYPES));
 for(const query of tracking.list().queries){
  await tracking.refresh(query.id);assert.equal(h.calls.at(-1).input.type,query.type);assert.equal(h.calls.at(-1).input.text,'dm:last7days size:>200mb');
 }
 const video=tracking.list().queries.find(query=>query.type==='video');assert.throws(()=>tracking.save({...video,type:'picture'}),/已在追蹤/);
 tracking.save({...video,type:'picture',text:'dm:today'});
 assert.equal(tracking.list().queries.find(query=>query.id===video.id).type,'picture');
});
test('tracked queries persist in favorites and full backup validation without touching manual favorites',t=>{
 const h=fixture(t);h.favorites.addPaths([h.a],['Manual']);const query=h.save();h.tracking.configure(300);const stored=h.favorites.read();assert.equal(stored.items.length,1);assert.equal(validateFavorites(stored).everythingSearches[0].id,query.id);assert.equal(normalizeRules(stored).refreshSeconds,300);
 assert.equal(new EverythingTracking({favorites:new FavoritesStore(h.favorites.filename),bridge:h.bridge}).list().queries[0].text,query.text);
 assert.throws(()=>h.save(),/已在追蹤/);assert.throws(()=>h.save({text:'',name:'Blank'}),/搜尋條件/);assert.throws(()=>h.save({tags:Array.from({length:21},(_,i)=>'Tag'+i)}),/20/);assert.throws(()=>h.tracking.configure(1),/更新間隔/);
});
test('refresh derives current matches, deduplicates paths and drops old matches while manual favorites remain',async t=>{
 const h=fixture(t);h.favorites.addPaths([h.a]);const query=h.save();h.paths([h.a,h.a,h.b]);let state=await h.tracking.refresh(query.id),snapshot=state.queries[0].snapshot;assert.equal(snapshot.rows.length,2);assert.equal(h.calls[0].options.publish,false);assert.deepEqual(h.tracking.selection(query.id,snapshot.token,[1,1]).paths,[h.b]);
 h.paths([h.b]);state=await h.tracking.refresh(query.id);assert.deepEqual(state.queries[0].snapshot.rows.map(item=>item.path),[h.b]);assert.equal(h.favorites.read().items[0].path,h.a);assert.throws(()=>h.tracking.selection(query.id,snapshot.token,[0]),/已更新/);
 h.paths([]);state=await h.tracking.refresh(query.id);assert.equal(state.queries[0].snapshot.rows.length,0);assert.equal(state.queries[0].snapshot.error,'');
});
test('offline failures retain the last successful snapshot and do not remove files or bookmarks',async t=>{
 const h=fixture(t),query=h.save();const first=await h.tracking.refresh(query.id);h.fail('Everything is offline');const next=await h.tracking.refresh(query.id),snapshot=next.queries[0].snapshot;assert.equal(snapshot.rows.length,2);assert.equal(snapshot.checkedAt,first.queries[0].snapshot.checkedAt);assert.equal(snapshot.error,'Everything is offline');assert.ok(fs.existsSync(h.a)&&fs.existsSync(h.b));
 h.tracking.remove(query.id);assert.equal(h.tracking.list().queries.length,0);assert.throws(()=>h.tracking.selection(query.id,snapshot.token,[0]),/已更新/);assert.ok(fs.existsSync(h.a));
});
test('edited or removed rules cannot receive stale in-flight query results',async t=>{
 const h=fixture(t),query=h.save();let resolve;h.pending(new Promise(value=>resolve=value));const pending=h.tracking.refresh(query.id);const updated=h.save({...query,name:'Changed',text:'size:>1gb'});resolve({rows:[{path:h.a,name:'a'}],truncated:false});await pending;assert.equal(h.tracking.list().queries[0].snapshot,null);assert.equal(h.tracking.list().queries[0].revision,updated.revision);
 h.pending(null);const paused=h.save({...updated,enabled:false});await assert.rejects(h.tracking.refresh(paused.id),/暫停/);
});
test('result actions reject replaced files, forged indices and stale tokens, and skip missing paths',async t=>{
 const h=fixture(t),query=h.save();h.paths([h.a,path.join(h.dir,'missing.txt')]);const state=await h.tracking.refresh(query.id),snapshot=state.queries[0].snapshot;assert.equal(snapshot.skipped,1);assert.throws(()=>h.tracking.selection(query.id,'forged',[0]),/已更新/);assert.throws(()=>h.tracking.selection(query.id,snapshot.token,[-1]),/已更新/);
 fs.renameSync(h.a,h.a+'.old');fs.writeFileSync(h.a,'Replacement');assert.throws(()=>h.tracking.selection(query.id,snapshot.token,[0]),/已替換/);
});
test('failed query writes preserve both existing favorites and saved searches atomically',t=>{
 const h=fixture(t),query=h.save(),before=h.favorites.read(),disk=fs.readFileSync(h.favorites.filename,'utf8');const mock=t.mock.method(fs,'renameSync',()=>{throw Error('disk full');});assert.throws(()=>h.save({...query,name:'Changed'}),/disk full/);mock.mock.restore();assert.deepEqual(h.favorites.read(),before);assert.equal(fs.readFileSync(h.favorites.filename,'utf8'),disk);
 const bad=structuredClone(before);bad.everythingSearches[0].text='a\nb';assert.throws(()=>validateFavorites(bad),/單行/);
});

test('restoring a different command with the same ID and revision cannot reuse old results',async t=>{
 const h=fixture(t),query=h.save(),first=await h.tracking.refresh(query.id),token=first.queries[0].snapshot.token,data=h.favorites.read();data.everythingSearches[0].text='size:>1gb';h.favorites.write(data);
 assert.equal(h.tracking.list().queries[0].snapshot,null);assert.throws(()=>h.tracking.selection(query.id,token,[0]),/已更新/);await h.tracking.refresh(query.id);assert.equal(h.calls.at(-1).input.text,'size:>1gb');
});

test('disabling or reselecting the engine revokes cached tokens and late query responses',async t=>{
 const h=fixture(t),query=h.save(),initial=await h.tracking.refresh(query.id),token=initial.queries[0].snapshot.token;let resolve;h.pending(new Promise(value=>resolve=value));const pending=h.tracking.refresh(query.id);h.tracking.invalidate();resolve({rows:[{path:h.a,name:'a'}],truncated:false});await pending;
 assert.equal(h.tracking.list().queries[0].snapshot,null);assert.throws(()=>h.tracking.selection(query.id,token,[0]),/已更新/);
});

test('custom extension profiles survive backup validation and do not mutate saved queries',async t=>{
 const h=fixture(t);h.tracking.saveFileType({name:'工作文件',extensions:'.PDF, docx PDF'});
 assert.deepEqual(h.tracking.list().fileTypes,[{name:'工作文件',extensions:'docx;pdf'}]);
 const first=h.save({type:'custom',extensions:'pdf;docx'}),second=h.save({type:'custom',extensions:'xlsx'});
 assert.throws(()=>h.save({type:'custom',extensions:'.pdf,.DOCX'}),/已在追蹤/);
 h.tracking.saveFileType({name:'工作文件',extensions:'xlsx'});h.tracking.removeFileType('工作文件');
 const restored=validateFavorites(JSON.parse(JSON.stringify(h.favorites.read())));
 assert.equal(restored.everythingSearches[0].extensions,'docx;pdf');assert.equal(restored.everythingSearches[1].extensions,'xlsx');
 await h.tracking.refresh(first.id);assert.equal(h.calls.at(-1).input.extensions,'docx;pdf');
 assert.equal(h.tracking.query(second.id).extensions,'xlsx');
 const bad=structuredClone(restored);bad.everythingFileTypes=[{name:'Bad',extensions:'pdf | folder:'}];assert.throws(()=>validateFavorites(bad),/副檔名/);
 for(let i=0;i<30;i++)h.tracking.saveFileType({name:'類型'+i,extensions:'pdf'});
 assert.throws(()=>h.tracking.saveFileType({name:'超過上限',extensions:'pdf'}),/30/);
 assert.equal(h.tracking.list().fileTypes.length,30);
});

test('tracked metadata stays bound to the inspected path and never replaces local identity or type',async t=>{
 const h=fixture(t),query=h.save();h.bridge.search=async(input,options)=>{assert.equal(options.metadata,true);return {rows:[{path:h.a,name:'a.txt',createdMs:1000,accessedMs:2000,runCount:7,attributes:'A',identity:{dev:'forged'},type:'folder'}],truncated:false};};
 const snapshot=(await h.tracking.refresh(query.id)).queries[0].snapshot;assert.equal(snapshot.rows[0].createdMs,1000);assert.equal(snapshot.rows[0].type,'file');assert.notEqual(snapshot.rows[0].identity.dev,'forged');assert.deepEqual(h.tracking.selection(query.id,snapshot.token,[0]).paths,[h.a]);
});
