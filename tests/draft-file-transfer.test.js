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
 assert.equal(path.basename(result.attachments[0].path),'note.txt');assert.equal(path.basename(result.attachments[1].path),'note.txt');assert.notEqual(result.attachments[0].path,result.attachments[1].path);assert.deepEqual(result.attachments.map(item=>fs.readFileSync(item.path,'utf8')),['original','second']);
});
