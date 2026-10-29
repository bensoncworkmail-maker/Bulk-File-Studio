'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {FavoritesStore,cleanTags}=require('../src/favorites-store');
const {snapshotMoves,executeMoves,prepareUndo}=require('../src/rename-core');
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brs-favorites-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new FavoritesStore(path.join(dir,'data','favorites.json'));
  const make=(name,content='content')=>{const p=path.join(dir,name);fs.writeFileSync(p,content);return p;};
  return {dir,store,make};
}
test('favorites persist both files and folders without collecting folder contents',t=>{
  const {dir,store,make}=fixture(t),file=make('report.txt'),folder=path.join(dir,'Folder');
  fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'inside.txt'),'inside');
  assert.equal(store.addPaths([file,folder],['工作']).added,2);
  const restored=new FavoritesStore(store.filename).list();
  assert.equal(restored.length,2);assert.deepEqual(restored.map(item=>item.type),['file','folder']);
  assert.ok(restored.every(item=>item.status==='ready'));
});
test('duplicate additions merge tags, preserve labels and report invalid paths',t=>{
  const {dir,store,make}=fixture(t),file=make('a.txt');
  store.addPaths([file],['Work']);const id=store.list()[0].id;
  store.update([id],{label:'My report'});
  const result=store.addPaths([file,file,path.join(dir,'missing')],['work','常用']);
  assert.equal(result.existing,2);assert.equal(result.issues.length,1);
  assert.equal(store.list().length,1);assert.deepEqual(store.list()[0].tags,['Work','常用']);assert.equal(store.list()[0].label,'My report');
});
test('editing contents preserves a bookmark, but replacing the file requires relinking',t=>{
  const {dir,store,make}=fixture(t),file=make('a.txt');store.addPaths([file]);
  fs.writeFileSync(file,'edited in place');assert.equal(store.list()[0].status,'ready');
  fs.renameSync(file,path.join(dir,'old.txt'));fs.writeFileSync(file,'new file');
  const item=store.list()[0];assert.equal(item.status,'replaced');
  assert.throws(()=>store.readyPaths([item.id]),/替換/);
  const result=store.addPaths([file]);assert.equal(result.added,0);assert.equal(result.issues.length,1);
  store.update([item.id],{path:file});assert.equal(store.list()[0].status,'ready');
});
test('missing entries retain tags and can be explicitly relinked',t=>{
  const {dir,store,make}=fixture(t),file=make('a.txt');store.addPaths([file],['專案 A']);
  const item=store.list()[0],target=path.join(dir,'moved.txt');fs.renameSync(file,target);
  assert.equal(store.list()[0].status,'missing');
  store.update([item.id],{path:target,label:'Report'});
  const linked=store.list()[0];assert.equal(linked.id,item.id);assert.equal(linked.path,target);assert.deepEqual(linked.tags,['專案 A']);assert.equal(linked.status,'ready');
});
test('invalid bulk edits and duplicate or wrong-type relinks do not partially save',t=>{
  const {dir,store,make}=fixture(t),a=make('a.txt'),b=make('b.txt');store.addPaths([a,b],['Keep']);
  const [item]=store.list(),before=fs.readFileSync(store.filename,'utf8');
  assert.throws(()=>store.update([item.id,'missing-id'],{tags:['New']}),/不存在/);
  assert.throws(()=>store.update([item.id],{path:b}),/已經/);
  assert.throws(()=>store.update([item.id],{path:dir}),/類型/);
  assert.equal(fs.readFileSync(store.filename,'utf8'),before);
});
test('removing a bookmark never removes its underlying files or directory',t=>{
  const {dir,store,make}=fixture(t),file=make('a.txt');store.addPaths([file,dir]);
  assert.equal(store.remove(store.list().map(item=>item.id)).removed,2);
  assert.equal(store.list().length,0);assert.equal(fs.readFileSync(file,'utf8'),'content');assert.ok(fs.statSync(dir).isDirectory());
});
test('rename, swaps, idempotent synchronization and undo keep tags on the right files',t=>{
  const {store,make}=fixture(t),a=make('A.txt','A'),b=make('B.txt','B');store.addPaths([a],['A']);store.addPaths([b],['B']);
  const originals=store.list(),moves=snapshotMoves([{source:a,destination:b},{source:b,destination:a}]);
  executeMoves(moves);assert.equal(store.applyMoves(moves),2);assert.equal(store.applyMoves(moves),0);
  const changed=store.list();assert.equal(changed.find(item=>item.id===originals[0].id).path,b);assert.ok(changed.every(item=>item.status==='ready'));
  const reversed=prepareUndo({version:2,state:'completed',moves});executeMoves(reversed);store.applyMoves(reversed);
  assert.equal(store.list().find(item=>item.id===originals[0].id).path,a);assert.deepEqual(store.list()[0].tags,['A']);
});
test('sync preserves a different stale bookmark already pointing to the new location',t=>{
  const {dir,store,make}=fixture(t),a=make('a.txt','A'),b=make('b.txt','B');store.addPaths([a,b]);
  fs.renameSync(b,path.join(dir,'old-b.txt'));
  const moves=snapshotMoves([{source:a,destination:b}]);executeMoves(moves);store.applyMoves(moves);
  const items=new FavoritesStore(store.filename).list();
  assert.equal(items.length,2);assert.equal(items.filter(item=>item.status==='ready').length,1);assert.equal(items.filter(item=>item.status==='replaced').length,1);
});
test('a failed atomic save leaves the original catalog and its backup intact',t=>{
  const {store,make}=fixture(t),file=make('a.txt');store.addPaths([file],['Keep']);
  const item=store.list()[0],before=fs.readFileSync(store.filename,'utf8'),rename=fs.renameSync;
  fs.renameSync=(source,target)=>{if(target===store.filename)throw new Error('injected disk failure');return rename(source,target);};
  try{assert.throws(()=>store.update([item.id],{tags:['New']}),/disk failure/);}finally{fs.renameSync=rename;}
  assert.equal(fs.readFileSync(store.filename,'utf8'),before);assert.equal(fs.readFileSync(store.filename+'.bak','utf8'),before);
  assert.equal(fs.readdirSync(path.dirname(store.filename)).filter(name=>name.endsWith('.new')).length,0);
});
test('corrupt catalogs fail closed without replacing the saved bytes',t=>{
  const {store,make}=fixture(t),file=make('a.txt');store.addPaths([file]);
  fs.writeFileSync(store.filename,'invalid JSON');
  assert.throws(()=>store.addPaths([file]),/保留原資料/);assert.equal(fs.readFileSync(store.filename,'utf8'),'invalid JSON');
});
test('tag validation supports spaces, limits length and rejects malformed input',()=>{
  assert.deepEqual(cleanTags([' Work ','work','專案 A','']),['Work','專案 A']);
  assert.throws(()=>cleanTags(['x'.repeat(33)]),/32/);
  assert.throws(()=>cleanTags(Array.from({length:21},(_,i)=>'t'+i)),/20/);
  assert.throws(()=>cleanTags('text'),/清單/);
});

test('tag management renames globally, merges duplicates and deletes only tag metadata',t=>{const {store,make}=fixture(t),a=make('a.txt'),b=make('b.txt');store.addPaths([a],['Work','Keep']);store.addPaths([b],['work','Target']);assert.equal(store.manageTag('WORK','Target',2).updated,2);assert.deepEqual(store.read().items.map(i=>i.tags),[['Target','Keep'],['Target']]);store.manageTag('target',null,2);assert.deepEqual(store.read().items.map(i=>i.tags),[['Keep'],[]]);assert.equal(store.read().items.length,2);assert.equal(fs.readFileSync(a,'utf8'),'content');assert.equal(fs.readFileSync(b,'utf8'),'content');});
test('tag validation and changed counts never partially write the catalog',t=>{const {store,make}=fixture(t);store.addPaths([make('a.txt')],['Work']);const before=fs.readFileSync(store.filename,'utf8');for(const [name,target,count] of [['Work','',1],['Work','X'.repeat(33),1],['Work',null,2],['Missing','New',1]])assert.throws(()=>store.manageTag(name,target,count));assert.equal(fs.readFileSync(store.filename,'utf8'),before);store.manageTag('work','WORK',1);assert.deepEqual(store.read().items[0].tags,['WORK']);});
