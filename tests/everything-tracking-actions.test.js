'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {trackingAction,trackingTrashStore}=require('../src/everything-tracking-actions'),{EverythingTracking}=require('../src/everything-tracking'),{FavoritesStore}=require('../src/favorites-store'),{listPaths}=require('../src/rename-core');
const {prepareTrash,executeTrashBatch}=require('../src/favorites-trash');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-tracking-actions-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const files=['a.txt','b.txt'].map(name=>path.join(dir,name)),folder=path.join(dir,'folder');files.forEach(file=>fs.writeFileSync(file,'original'));fs.mkdirSync(folder);
 const favorites=new FavoritesStore(path.join(dir,'favorites.json'));
 const bridge={status:()=>({enabled:true}),search:async()=>({rows:[...files,folder].map(file=>({path:file,name:path.basename(file)}))})};
 const tracking=new EverythingTracking({favorites,bridge});
 const query=tracking.save({name:'all',text:'*',mode:'syntax',type:'all',enabled:true,tags:['工作']});let copied='',notifications=0;
 const context={tracking,favorites,notifyFavorites:()=>notifications++,clipboard:{writeText:value=>{copied=value;}},listPaths};
 return {dir,files,folder,tracking,query,copy:()=>copied,notifications:()=>notifications,run:async(action,indices=[0,1],token,input)=>{const snapshot=tracking.list().queries[0].snapshot;return trackingAction({...context,id:query.id,token:token??snapshot?.token,indices,action,input});}};
}
test('tracking bulk copies preserve order, deduplicate parent folders, and stage file operations without writes',async t=>{
 const h=fixture(t);await h.tracking.refresh(h.query.id);
 assert.equal((await h.run('copy-names')).copied,2);assert.equal(h.copy(),'a.txt\nb.txt');
 assert.equal((await h.run('copy-folders')).copied,1);assert.equal(h.copy(),h.dir);
 assert.deepEqual((await h.run('rename')).paths,h.files);
 assert.deepEqual((await h.run('move',[0,2])).paths,[h.files[0],h.folder]);
 assert.ok(h.files.every(file=>fs.readFileSync(file,'utf8')==='original'));assert.ok(fs.statSync(h.folder).isDirectory());
 assert.equal((await h.run('favorite')).added,2);assert.equal(h.notifications(),1);
});
test('mixed folders, replaced files, stale tokens and forged actions cannot stage partial bulk operations',async t=>{
 const h=fixture(t);await h.tracking.refresh(h.query.id);
 await assert.rejects(h.run('rename',[0,2]),/只接受檔案/);await assert.rejects(h.run('move',[0],'old'),/已更新/);
 await assert.rejects(h.run('remove'),/操作無效/);assert.equal(h.copy(),'');
 fs.renameSync(h.files[0],h.files[0]+'.old');fs.writeFileSync(h.files[0],'replacement');
 for(const kind of ['copy','copy-names','copy-folders','copy-table','favorite','rename','move'])await assert.rejects(h.run(kind),/已替換/);
 assert.equal(h.copy(),'');assert.equal(h.notifications(),0);
 assert.equal(fs.readFileSync(h.files[1],'utf8'),'original');
});
test('tracking submits one recycle batch and saves only confirmed bookmark removals',async t=>{
 const {tracking,query,files,folder}=fixture(t),favorites=tracking.favorites,child=path.join(folder,'child.txt');
 fs.writeFileSync(child,'inside');
 favorites.addPaths([...files,folder,child],['Work']);
 const {token}=((await tracking.refresh(query.id)).queries[0]).snapshot;
 const indices=[0,1,2],store=trackingTrashStore(tracking,favorites,query.id,token,indices),plan=prepareTrash(store,indices);
 const writes=t.mock.method(favorites,'write');
 let submissions=0;
 const result=await executeTrashBatch(store,plan,async verify=>{
  submissions++;
  assert.deepEqual(verify(),[...files,folder]);
  fs.unlinkSync(files[0]);fs.rmSync(folder,{recursive:true});
  return [null,'locked',null];
 });
 assert.equal(submissions,1);
 assert.equal(writes.mock.callCount(),1);
 assert.deepEqual(result,{canceled:false,trashed:2,trashedPaths:[files[0],folder],removed:3,failures:[files[1]+'：locked']});
 assert.deepEqual(favorites.read().items.map(item=>item.path),[files[1]]);
 assert.ok(fs.existsSync(files[1]));
});

test('tracking blocks replaced files at dispatch and skips writes for batches without bookmark changes',async t=>{
 const {tracking,query,files}=fixture(t),favorites=tracking.favorites;
 const result=await tracking.refresh(query.id),indices=[0,1];
 const store=trackingTrashStore(tracking,favorites,query.id,result.queries[0].snapshot.token,indices),plan=prepareTrash(store,indices);
 const old=files[0]+'.old',writes=t.mock.method(favorites,'write');
 fs.renameSync(files[0],old);fs.writeFileSync(files[0],'replacement');
 await assert.rejects(executeTrashBatch(store,plan,async verify=>{
  verify();assert.fail('replaced file must never reach the recycle operation');
 }),/已替換/);
 fs.unlinkSync(files[0]);fs.renameSync(old,files[0]);
 const recycled=await executeTrashBatch(store,plan,async verify=>verify().map(()=>null));
 assert.equal(recycled.trashed,2);
 assert.equal(writes.mock.callCount(),0);
});

test('sequential fallback retains a replaced next file and a bookmark relinked during recycling',async t=>{
 const {tracking,query,files}=fixture(t),favorites=tracking.favorites;
 const {ids}=favorites.addPaths(files,['Work']);
 const {token}=((await tracking.refresh(query.id)).queries[0]).snapshot;
 const indices=[0,1],store=trackingTrashStore(tracking,favorites,query.id,token,indices),plan=prepareTrash(store,indices);
 const replacement=files[1]+'.old',relocated=files[0]+'.new';
 fs.writeFileSync(relocated,'original location changed');
 const calls=[];
 const result=await executeTrashBatch(store,plan,()=>null,async filepath=>{
  calls.push(filepath);
  favorites.update([ids[0]],{path:relocated});
  fs.renameSync(files[1],replacement);fs.writeFileSync(files[1],'replacement');
  fs.unlinkSync(filepath);
 });
 assert.deepEqual(calls,[files[0]]);
 assert.deepEqual(result.trashedPaths,[files[0]]);
 assert.equal(result.removed,0);
 assert.match(result.failures[0],/已變更/);
 assert.equal(fs.readFileSync(files[1],'utf8'),'replacement');
 assert.equal(favorites.get(ids[0]).path,relocated);
 assert.equal(favorites.get(ids[1]).path,files[1]);
});

test('parent folder copying handles Windows paths and case-insensitive duplicates',async()=>{
 let copied='';const tracking={selection:()=>({paths:['C:\\Work\\a.txt','c:\\work\\b.txt','D:\\Photos\\c.jpg'],tags:[]})};
 const result=await trackingAction({tracking,action:'copy-folders',clipboard:{writeText:value=>{copied=value;}}});
 assert.equal(result.copied,2);assert.equal(copied,'C:\\Work\nD:\\Photos');
});

test('table copy includes only selected columns and rows, deduplicates selection and rejects stale or invalid requests before writing',async t=>{
 const h=fixture(t);await h.tracking.refresh(h.query.id);const input={columns:['name','extension','fullPath']};
 assert.equal((await h.run('copy-table',[1,0,1],undefined,input)).copied,2);assert.equal(h.copy(),['檔案名稱\t副檔名\t完整路徑','b.txt\ttxt\t'+h.files[1],'a.txt\ttxt\t'+h.files[0]].join('\r\n'));const prior=h.copy();
 for(const columns of [[],['name','name'],['__proto__'],['bad'],null])await assert.rejects(h.run('copy-table',[0],undefined,{columns}),/欄位無效/);
 await assert.rejects(h.run('copy-table',[0],'stale',input),/已更新/);assert.equal(h.copy(),prior);
});
test('table copy protects cell boundaries and spreadsheet formulas and enforces the clipboard size limit',async()=>{
 let copied='';const row={name:'=1+1.txt',path:'C:\\Work\\=1+1.txt',fileList:' @SUM(A1)\tbad\r\nnext'};
 const tracking={selection:()=>({paths:[row.path],rows:[row],tags:[]})},run=()=>trackingAction({tracking,action:'copy-table',input:{columns:['name','fileList']},clipboard:{writeText:value=>{copied=value;}}});
 await run();assert.equal(copied,"檔案名稱\t檔案清單檔案名稱\r\n'=1+1.txt\t' @SUM(A1) bad  next");const prior=copied;row.fileList='x'.repeat(2*1024*1024);await assert.rejects(run(),/內容過大/);assert.equal(copied,prior);
});

test('copied table honors chosen display units and rejects unknown units without modifying file bytes',async t=>{
 const h=fixture(t);await h.tracking.refresh(h.query.id);await h.run('copy-table',[0],undefined,{columns:['name','size'],sizeUnit:'GB'});assert.match(h.copy(),/<0\.01 GB/);assert.equal(fs.readFileSync(h.files[0],'utf8'),'original');await assert.rejects(h.run('copy-table',[0],undefined,{columns:['size'],sizeUnit:'invalid'}),/單位無效/);
});

test('shared result read actions validate inside a host scope and use Windows path names while source edits stay unavailable',async()=>{
 const network=require('../src/intranet-path'),paths=[String.raw`\\10.0.0.1\team\a.txt`,String.raw`\\10.0.0.1\team\b.txt`],selected={paths,tags:['Team'],rows:paths.map(path=>({path,type:'file',name:path.split('\\').at(-1)}))};let copied='',shown='',added=0,notified=0;
 const tracking={entries:()=>selected,selection:()=>{assert.equal(network.isValidated(paths[0]),true);return selected;}},context={tracking,clipboard:{writeText:value=>copied=value},shell:{showItemInFolder:value=>shown=value},favorites:{addPaths:(values,tags)=>{assert.equal(network.isValidated(values[0]),true);assert.deepEqual(tags,['Team']);added++;return {added:2};}},notifyFavorites:()=>notified++};
 const run=(action,extra={})=>trackingAction({...context,action,...extra});
 await run('copy-names');assert.equal(copied,'a.txt\nb.txt');await run('copy-folders');assert.equal(copied,String.raw`\\10.0.0.1\team`+'\\');await run('favorite');assert.equal(added,1);assert.equal(notified,1);
 tracking.selection=()=>{assert.equal(network.isValidated(paths[0]),true);return {...selected,paths:[paths[0]]};};await run('show');assert.equal(shown,paths[0]);assert.equal(network.isValidated(paths[0]),false);
 for(const action of ['trash','move','rename','rename-item'])await assert.rejects(run(action),/檔案總管操作/);
});

test('shared refresh and real favorites/action identity checks work together and reject replaced sources',async t=>{
 const h=fixture(t),network=require('../src/intranet-path'),file=String.raw`\\10.10.2.101\hr\HRM\Share_Backup\Client\report.pdf`;let ino=3n;
 const stat=value=>({isDirectory:()=>value!==file,isFile:()=>value===file,isSymbolicLink:()=>false,dev:2n,ino,birthtimeNs:5n,size:10n,mtimeMs:1000n});
 const sync=fs.lstatSync,asyncStat=fs.promises.lstat;
 t.mock.method(fs,'lstatSync',(value,...args)=>{if(!network.isUNC(value))return sync(value,...args);assert.equal(network.isValidated(value),true);return stat(value);});
 t.mock.method(fs.promises,'lstat',async(value,...args)=>{if(!network.isUNC(value))return asyncStat(value,...args);assert.equal(network.isValidated(value),true);return stat(value);});
 h.tracking.bridge.search=async()=>({rows:[{path:file,name:'report.pdf',attributes:'A'}]});
 let snapshot=(await h.tracking.refresh(h.query.id)).queries[0].snapshot;assert.equal(snapshot.rows[0].type,'file');assert.equal(snapshot.rows[0].size,10);assert.equal(network.isValidated(file),false);
 await h.run('copy-names',[0]);assert.equal(h.copy(),'report.pdf');assert.equal((await h.run('favorite',[0])).added,1);assert.equal(h.notifications(),1);
 const stored=h.tracking.favorites.read().items[0];assert.equal(stored.path,file);assert.equal(stored.type,'file');assert.equal(stored.identity.ino,'3');assert.deepEqual(stored.tags,['工作']);
 let opened='';await trackingAction({tracking:h.tracking,id:h.query.id,token:snapshot.token,indices:[0],action:'open',shell:{openPath:async value=>{opened=value;return '';}}});assert.equal(opened,file);assert.equal(network.isValidated(file),false);
 ino=4n;await assert.rejects(h.run('copy',[0]),/已替換/);assert.equal(h.copy(),'report.pdf');
 snapshot=(await h.tracking.refresh(h.query.id)).queries[0].snapshot;assert.equal(snapshot.rows[0].identity.ino,'4');const refused=await h.run('favorite',[0]);assert.equal(refused.added,0);assert.match(refused.issues[0],/已收藏.*替換/);assert.equal(h.tracking.favorites.read().items[0].identity.ino,'3');
});
