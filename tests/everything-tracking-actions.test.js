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
