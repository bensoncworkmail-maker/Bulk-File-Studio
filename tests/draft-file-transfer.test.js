'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {NotesStore}=require('../src/notes-store'),{DraftNotes}=require('../src/draft-notes');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-draft-files-')),data=path.join(root,'data'),source=path.join(root,'source');fs.mkdirSync(data);fs.mkdirSync(source);
 const store=new NotesStore(path.join(data,'workspace.sqlite'));t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
 let response=1;const prompts=[],moved=[];
 const drafts=new DraftNotes({imageDir:path.join(data,'draft-images'),store:()=>store,settings:()=>({}),dialog:{showMessageBox:async options=>{prompts.push(options);return {response};}},onMoved:rows=>{moved.push(...rows);return '';}});
 // Native message boxes accept (window, options).
 drafts.dialog.showMessageBox=async(...args)=>{prompts.push(args.at(-1));return {response};};
 const file=path.join(source,'note.txt'),folder=path.join(source,'documents');fs.writeFileSync(file,'original');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'nested.txt'),'nested');
 return {root,data,source,file,folder,store,drafts,prompts,moved,cancel:()=>{response=0;}};
}
test('drag defaults to retaining paths; copies preserve files, nested folders and names in isolated storage',async t=>{
 const h=fixture(t),draft=h.store.createDraft(),linked=await h.drafts.attach(draft.id,draft.version,[h.file]);assert.equal(linked.attachments[0].path,h.file);
 const copied=await h.drafts.attach(linked.id,linked.version,[h.file,h.folder,path.join(h.folder,'nested.txt')],'copy');
 assert.equal(copied.attachments.length,3);assert.ok(fs.existsSync(h.file)&&fs.existsSync(h.folder));
 for(const item of copied.attachments.slice(1)){assert.equal(item.managed,true);assert.ok(item.path.startsWith(path.join(h.data,'draft-images',draft.id,'files')));assert.equal(path.basename(item.path),path.basename(item.originalPath));}
 assert.equal(fs.readFileSync(copied.attachments[1].path,'utf8'),'original');assert.equal(fs.readFileSync(path.join(copied.attachments[2].path,'nested.txt'),'utf8'),'nested');assert.notEqual(fs.statSync(h.file).ino,fs.statSync(copied.attachments[1].path).ino);
 h.drafts.removeAttachment(copied.id,copied.version,1);assert.ok(fs.existsSync(copied.attachments[1].path));
});
test('confirmed move commits verified paths before removing source files and folders',async t=>{
 const h=fixture(t),draft=h.store.createDraft(),save=h.store.saveDraft.bind(h.store);h.store.saveDraft=(...args)=>{assert.ok(fs.existsSync(h.file)&&fs.existsSync(h.folder));return save(...args);};
 const result=await h.drafts.attach(draft.id,draft.version,[h.file,h.folder],'move');assert.equal(result.attachments.length,2);assert.ok(!fs.existsSync(h.file)&&!fs.existsSync(h.folder));assert.equal(fs.readFileSync(result.attachments[0].path,'utf8'),'original');assert.equal(fs.readFileSync(path.join(result.attachments[1].path,'nested.txt'),'utf8'),'nested');assert.ok(h.moved.length===3);assert.match(h.prompts[0].detail,/目的位置/);
});
test('cancel, invalid mode, stale draft, unsafe sources and failed metadata writes do not remove originals',async t=>{
 const h=fixture(t),draft=h.store.createDraft();h.cancel();const canceled=await h.drafts.attach(draft.id,draft.version,[h.file],'move');assert.equal(canceled.attachmentCanceled,true);assert.equal(h.store.draft(draft.id).version,draft.version);
 await assert.rejects(h.drafts.attach(draft.id,draft.version,[h.file],'delete'),/加入方式/);
 await assert.rejects(h.drafts.attach(draft.id,draft.version,[h.data],'copy'),/資料目錄/);
 const link=path.join(h.source,'symlink');try{fs.symlinkSync(h.file,link);}catch(error){if(error.code!=='EPERM')throw error;}if(fs.existsSync(link))await assert.rejects(h.drafts.attach(draft.id,draft.version,[link],'copy'),/連結/);
 const mock=t.mock.method(h.store,'saveDraft',()=>{throw Error('disk full');});await assert.rejects(h.drafts.attach(draft.id,draft.version,[h.file],'copy'),/disk full/);mock.mock.restore();assert.equal(h.store.draft(draft.id).attachments.length,0);assert.equal(fs.readFileSync(h.file,'utf8'),'original');assert.deepEqual(fs.readdirSync(path.join(h.data,'draft-images',draft.id,'files')),[]);
 const saved=h.store.saveDraft(draft.id,draft.version,{title:'new'});await assert.rejects(h.drafts.attach(draft.id,draft.version,[h.file],'move'),/已變更/);assert.equal(h.store.draft(saved.id).attachments.length,0);
});
test('source deletion failure keeps a complete managed attachment and reports a warning',async t=>{
 const h=fixture(t),draft=h.store.createDraft();const mock=t.mock.method(fs.promises,'unlink',async()=>{throw Error('access denied');});
 const result=await h.drafts.attach(draft.id,draft.version,[h.file],'move');mock.mock.restore();assert.match(result.attachmentWarning,/未移除/);assert.ok(fs.existsSync(h.file));assert.equal(fs.readFileSync(result.attachments[0].path,'utf8'),'original');assert.equal(h.store.draft(draft.id).attachments[0].path,result.attachments[0].path);
});


test('same-named files from different directories keep distinct copies',async t=>{
 const h=fixture(t),other=path.join(h.source,'other');fs.mkdirSync(other);const file=path.join(other,'note.txt');fs.writeFileSync(file,'second');
 const draft=h.store.createDraft(),result=await h.drafts.attach(draft.id,draft.version,[h.file,file],'copy');
 assert.equal(path.basename(result.attachments[0].path),'note.txt');assert.equal(path.basename(result.attachments[1].path),'note (2).txt');assert.notEqual(result.attachments[0].path,result.attachments[1].path);assert.deepEqual(result.attachments.map(item=>fs.readFileSync(item.path,'utf8')),['original','second']);
});


test('files and folders are direct siblings in the draft attachment directory',async t=>{
 const h=fixture(t),second=path.join(h.source,'second.txt');fs.writeFileSync(second,'second');const draft=h.store.createDraft();
 const result=await h.drafts.attach(draft.id,draft.version,[h.file,second,h.folder],'copy'),parents=result.attachments.map(item=>path.dirname(item.path));
 assert.equal(new Set(parents).size,1);assert.equal(parents[0],path.join(h.data,'draft-images',draft.id,'files'));assert.equal(fs.readFileSync(path.join(parents[0],'documents','nested.txt'),'utf8'),'nested');assert.equal(fs.readFileSync(path.join(parents[0],'second.txt'),'utf8'),'second');
});
test('same-named files from different source folders become numbered siblings without overwriting',async t=>{
 const h=fixture(t),one=path.join(h.source,'one','test'),two=path.join(h.source,'two','test');fs.mkdirSync(one,{recursive:true});fs.mkdirSync(two,{recursive:true});const a=path.join(one,'file.txt'),b=path.join(two,'file.txt');fs.writeFileSync(a,'one');fs.writeFileSync(b,'two');const draft=h.store.createDraft();
 const result=await h.drafts.attach(draft.id,draft.version,[a,b],'move');assert.deepEqual(result.attachments.map(item=>path.basename(item.path)),['file.txt','file (2).txt']);assert.equal(new Set(result.attachments.map(item=>path.dirname(item.path))).size,1);assert.deepEqual(result.attachments.map(item=>fs.readFileSync(item.path,'utf8')),['one','two']);assert.ok(!fs.existsSync(a)&&!fs.existsSync(b));
});


test('three PNGs and subsequent drops share the draft directory while legacy managed paths stay valid',async t=>{
 const h=fixture(t),draft=h.store.createDraft(),legacy=path.join(h.data,'draft-images',draft.id,'files',require('node:crypto').randomUUID(),require('node:crypto').randomUUID(),'legacy.png');fs.mkdirSync(path.dirname(legacy),{recursive:true});fs.writeFileSync(legacy,'legacy bytes');
 const previous=h.store.saveDraft(draft.id,draft.version,{attachments:[{path:legacy,type:'file',managed:true,originalPath:path.join(h.source,'legacy.png')}]});
 const files=['one.png','two.png','three.png'].map(name=>{const file=path.join(h.source,name);fs.writeFileSync(file,Buffer.from('89504e470d0a1a0a','hex'));return file;});
 const result=await h.drafts.attach(draft.id,previous.version,files,'copy'),added=result.attachments.slice(1),group=path.dirname(added[0].path);
 assert.equal(new Set(added.map(item=>path.dirname(item.path))).size,1);assert.equal(group,path.join(h.data,'draft-images',draft.id,'files'));assert.deepEqual(fs.readdirSync(group).filter(name=>name.endsWith('.png')).sort(),['one.png','three.png','two.png']);assert.equal(result.attachments[0].path,legacy);assert.equal(fs.readFileSync(legacy,'utf8'),'legacy bytes');
 const moved=await h.drafts.attach(draft.id,result.version,files,'move'),movedGroup=path.dirname(moved.attachments.at(-1).path);assert.equal(movedGroup,group);assert.ok(moved.attachments.slice(-3).every(item=>path.dirname(item.path)===group));assert.deepEqual(moved.attachments.slice(-3).map(item=>path.basename(item.path)),['one (2).png','two (2).png','three (2).png']);assert.ok(files.every(file=>!fs.existsSync(file)));assert.ok(fs.existsSync(legacy));assert.ok(added.every(item=>fs.existsSync(item.path)));
});


test('different sources added in separate drops share one parent and keep dragged folder contents',async t=>{
 const h=fixture(t),other=path.join(h.root,'another-drive','eLearning'),reference=path.join(other,'reference');fs.mkdirSync(reference,{recursive:true});
 const second=path.join(other,'second.png'),third=path.join(reference,'third.png');fs.writeFileSync(second,'second');fs.writeFileSync(third,'third');
 let draft=h.store.createDraft();draft=await h.drafts.attach(draft.id,draft.version,[h.file],'copy');draft=await h.drafts.attach(draft.id,draft.version,[second],'move');draft=await h.drafts.attach(draft.id,draft.version,[third,h.folder],'copy');
 const folder=path.join(h.data,'draft-images',draft.id,'files');assert.ok(draft.attachments.every(item=>path.dirname(item.path)===folder));assert.deepEqual(fs.readdirSync(folder).sort(),['documents','note.txt','second.png','third.png']);assert.equal(fs.readFileSync(path.join(folder,'documents','nested.txt'),'utf8'),'nested');assert.ok(!fs.existsSync(second));assert.ok(fs.existsSync(third));assert.equal(h.prompts[0].detail.split('目的位置：\n')[1],folder);
});
test('file and folder name collisions across drops preserve earlier attachments and both contents',async t=>{
 const h=fixture(t),other=path.join(h.source,'other');fs.mkdirSync(other);const directory=path.join(other,'NOTE.txt');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'child.txt'),'folder contents');
 const draft=h.store.createDraft(),first=await h.drafts.attach(draft.id,draft.version,[h.file],'copy'),next=await h.drafts.attach(draft.id,first.version,[directory],'copy');
 assert.equal(path.basename(next.attachments[1].path),'NOTE.txt (2)');assert.equal(path.dirname(next.attachments[0].path),path.dirname(next.attachments[1].path));assert.equal(fs.readFileSync(first.attachments[0].path,'utf8'),'original');assert.equal(fs.readFileSync(path.join(next.attachments[1].path,'child.txt'),'utf8'),'folder contents');
});
test('failed commit removes only newly copied roots and preserves previous attachments and move sources',async t=>{
 const h=fixture(t),draft=h.store.createDraft(),first=await h.drafts.attach(draft.id,draft.version,[h.file],'copy'),folder=path.dirname(first.attachments[0].path),second=path.join(h.source,'second.txt');fs.writeFileSync(second,'second');
 const mock=t.mock.method(h.store,'saveDraft',()=>{throw Error('disk full');});await assert.rejects(h.drafts.attach(draft.id,first.version,[second,h.folder],'move'),/disk full/);mock.mock.restore();
 assert.deepEqual(fs.readdirSync(folder),['note.txt']);assert.equal(fs.readFileSync(first.attachments[0].path,'utf8'),'original');assert.equal(fs.readFileSync(second,'utf8'),'second');assert.equal(fs.readFileSync(path.join(h.folder,'nested.txt'),'utf8'),'nested');assert.equal(h.store.draft(draft.id).attachments.length,1);
});
test('a destination created during transfer is never overwritten or removed during rollback',async t=>{
 const h=fixture(t),draft=h.store.createDraft(),second=path.join(h.source,'second.txt');fs.writeFileSync(second,'second');const folder=path.join(h.data,'draft-images',draft.id,'files'),destination=path.join(folder,'second.txt'),open=fs.promises.open.bind(fs.promises);
 const mock=t.mock.method(fs.promises,'open',async(filename,flags,...args)=>{if(filename===destination&&flags==='wx')fs.writeFileSync(destination,'external content');return open(filename,flags,...args);});
 await assert.rejects(h.drafts.attach(draft.id,draft.version,[h.file,second],'copy'),/EEXIST/);mock.mock.restore();assert.deepEqual(fs.readdirSync(folder),['second.txt']);assert.equal(fs.readFileSync(destination,'utf8'),'external content');assert.equal(h.store.draft(draft.id).attachments.length,0);assert.equal(fs.readFileSync(h.file,'utf8'),'original');
});
test('simultaneous drops cannot remove the winning committed attachment when the other draft version becomes stale',async t=>{
 const h=fixture(t),draft=h.store.createDraft(),second=path.join(h.source,'second.txt');fs.writeFileSync(second,'second');
 const results=await Promise.allSettled([h.drafts.attach(draft.id,draft.version,[h.file],'copy'),h.drafts.attach(draft.id,draft.version,[second],'copy')]);assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal(results.filter(item=>item.status==='rejected').length,1);
 const saved=h.store.draft(draft.id);assert.equal(saved.attachments.length,1);assert.equal(fs.readFileSync(saved.attachments[0].path,'utf8'),path.basename(saved.attachments[0].path)==='note.txt'?'original':'second');assert.deepEqual(fs.readdirSync(path.dirname(saved.attachments[0].path)),[path.basename(saved.attachments[0].path)]);assert.ok(fs.existsSync(h.file)&&fs.existsSync(second));
});

test('an interrupted copy removes its partial file without changing existing attachments or the source',async t=>{
 const h=fixture(t),draft=h.store.createDraft(),first=await h.drafts.attach(draft.id,draft.version,[h.file],'copy'),folder=path.dirname(first.attachments[0].path),source=path.join(h.source,'second.txt'),destination=path.join(folder,'second.txt');fs.writeFileSync(source,'second content');
 const open=fs.promises.open.bind(fs.promises),mock=t.mock.method(fs.promises,'open',async(filename,flags,...args)=>{const handle=await open(filename,flags,...args);if(filename===destination&&flags==='wx')handle.write=async()=>{throw Error('interrupted write');};return handle;});
 await assert.rejects(h.drafts.attach(draft.id,first.version,[source],'move'),/interrupted write/);mock.mock.restore();assert.deepEqual(fs.readdirSync(folder),['note.txt']);assert.equal(fs.readFileSync(source,'utf8'),'second content');assert.equal(fs.readFileSync(first.attachments[0].path,'utf8'),'original');assert.equal(h.store.draft(draft.id).attachments.length,1);
});
