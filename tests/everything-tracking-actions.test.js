'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {trackingAction}=require('../src/everything-tracking-actions'),{EverythingTracking}=require('../src/everything-tracking'),{FavoritesStore}=require('../src/favorites-store'),{listPaths}=require('../src/rename-core');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-tracking-actions-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const files=['a.txt','b.txt'].map(name=>path.join(dir,name)),folder=path.join(dir,'folder');files.forEach(file=>fs.writeFileSync(file,'original'));fs.mkdirSync(folder);
 const favorites=new FavoritesStore(path.join(dir,'favorites.json'));
 const bridge={status:()=>({enabled:true}),search:async()=>({rows:[...files,folder].map(file=>({path:file,name:path.basename(file)}))})};
 const tracking=new EverythingTracking({favorites,bridge});
 const query=tracking.save({name:'all',text:'*',mode:'syntax',type:'all',enabled:true,tags:['工作']});let copied='',notifications=0;
 const context={tracking,favorites,notifyFavorites:()=>notifications++,clipboard:{writeText:value=>{copied=value;}},listPaths};
 return {dir,files,folder,tracking,query,copy:()=>copied,notifications:()=>notifications,run:async(action,indices=[0,1],token)=>{const snapshot=tracking.list().queries[0].snapshot;return trackingAction({...context,id:query.id,token:token??snapshot?.token,indices,action});}};
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
 for(const kind of ['copy','copy-names','copy-folders','favorite','rename','move'])await assert.rejects(h.run(kind),/已替換/);
 assert.equal(h.copy(),'');assert.equal(h.notifications(),0);
 assert.equal(fs.readFileSync(h.files[1],'utf8'),'original');
});
test('parent folder copying handles Windows paths and case-insensitive duplicates',async()=>{
 let copied='';const tracking={selection:()=>({paths:['C:\\Work\\a.txt','c:\\work\\b.txt','D:\\Photos\\c.jpg'],tags:[]})};
 const result=await trackingAction({tracking,action:'copy-folders',clipboard:{writeText:value=>{copied=value;}}});
 assert.equal(result.copied,2);assert.equal(copied,'C:\\Work\nD:\\Photos');
});
