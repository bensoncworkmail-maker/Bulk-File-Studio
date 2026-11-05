'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {NotesStore}=require('../src/notes-store'),{ScheduledBackup}=require('../src/scheduled-backup'),{FloatingPin}=require('../src/floating-pin');
const S=require('../src/global-shortcuts'),D=require('../src/desktop-state'),P=require('../src/productivity-model');
function workspace(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-enhanced-')),store=new NotesStore(path.join(root,'workspace.sqlite'));t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});const state=store.addTemplate('clients');return {root,store,sheet:state.document.sheets[0],detail:state.document.sheets[1]};}
const input=sheet=>({sheetId:sheet.id,title:'同值',notes:'保留筆記',tags:['工作'],values:{},fileLinks:[]});
test('new global shortcuts default to disabled and collide with both quick actions and snippets',()=>{
 const settings=D.normalize();assert.equal(settings.calendarShortcut,'');assert.equal(settings.snippetsShortcut,'');
 assert.throws(()=>S.validatePair({...settings,calendarShortcut:'Alt+C',floatingQuickActions:[{enabled:true,shortcut:'Alt+C'}]}),/相同/);
 assert.throws(()=>S.validatePair(settings,[{shortcut:settings.draftShortcut}]),/相同/);
 S.validatePair({...settings,floatingQuickActions:[{enabled:false,shortcut:settings.draftShortcut}]});
 assert.equal(D.normalize({draftBodyLimit:0,draftListWidth:300,calendarWeekStart:1}).draftBodyLimit,0);
 assert.equal(D.normalize({draftBodyLimit:-1,calendarWeekStart:4}).calendarWeekStart,0);
});
test('pinned window reapplies topmost band on blur and watchdog without taking focus',()=>{
 const handlers={},calls=[];let settings={floatingOnTop:true},destroyed=false,visible=true,poll,cleared=false;
 const window={on:(name,callback)=>handlers[name]=callback,isDestroyed:()=>destroyed,isVisible:()=>visible,isAlwaysOnTop:()=>true,setAlwaysOnTop:(...args)=>calls.push(args),focus:()=>assert.fail('must not steal focus')};
 const pin=new FloatingPin(window,()=>settings,{setIntervalFn:callback=>(poll=callback,1),clearIntervalFn:()=>cleared=true});
 handlers.blur();poll();assert.deepEqual(calls,[[true,'floating'],[true,'floating'],[true,'floating']]);
 settings={floatingOnTop:false};pin.sync();assert.deepEqual(calls.at(-1),[false]);
 visible=false;settings={floatingOnTop:true};const count=calls.length;poll();assert.equal(calls.length,count);
 destroyed=true;handlers.closed();poll();assert.equal(cleared,true);
});
test('scheduled backups coalesce missed intervals, survive restart and retry failed writes',async t=>{
 const {root}=workspace(t),filename=path.join(root,'schedule.json');let clock=20*3600000,count=0,fail=false,settings={backupIntervalHours:6};
 const options={filename,settings:()=>settings,now:()=>clock,backup:async()=>{if(fail)throw new Error('full disk');count++;return {name:'backup'};}};
 const schedule=new ScheduledBackup(options);assert.equal((await schedule.tick({settings:{}})).created,true);assert.equal((await schedule.tick({})).created,false);
 clock+=24*3600000;assert.equal((await new ScheduledBackup(options).tick({})).created,true);assert.equal(count,2);
 clock+=7*3600000;fail=true;await assert.rejects(schedule.tick({}),/full disk/);fail=false;await schedule.tick({});assert.equal(count,3);
 settings={backupIntervalHours:0};clock+=100*3600000;assert.equal((await schedule.tick({})).created,false);
});
test('bulk create gives independent IDs and rejects the whole transaction on invalid values or missing master',t=>{
 const {store,sheet,detail}=workspace(t);const before=store.get();
 assert.throws(()=>store.saveCopies({...input(detail)},3),/主紀錄/);assert.equal(store.get().revision,before.revision);
 const created=store.saveCopies(input(sheet),3);assert.equal(new Set(created.document.records.map(item=>item.id)).size,3);assert.ok(created.document.records.every(item=>item.title==='同值'&&item.version===1));
 const current=store.get();assert.throws(()=>store.saveCopies({...input(sheet),title:''},3));assert.equal(store.get().revision,current.revision);
 assert.throws(()=>store.saveCopies(input(sheet),501),/500/);
});
test('bulk edits preview exact differences, preserve independent fields and reject stale commits',t=>{
 const {store,sheet}=workspace(t);let state=store.saveCopies(input(sheet),3);const entries=state.document.records.slice(0,2).map(({id,version})=>({id,version}));
 const preview=store.bulkPreview({sheetId:sheet.id,entries,patch:{notes:''}},state.revision);assert.equal(preview.count,2);assert.equal(preview.rows[0].changes[0].label,'筆記');assert.equal(store.get().document.records[0].notes,'保留筆記');
 const result=store.bulkCommit(preview.token);assert.equal(result.document.records[0].notes,'');assert.equal(result.document.records[2].notes,'保留筆記');assert.equal(result.document.records[0].title,'同值');assert.equal(store.history(entries[0].id).length,1);
 state=store.get();const next=store.bulkPreview({sheetId:sheet.id,entries:state.document.records.map(({id,version})=>({id,version})),patch:{title:'新名稱'}},state.revision);
 store.saveRecord({...state.document.records[0],title:'本機修改',expectedVersion:state.document.records[0].version});assert.throws(()=>store.bulkCommit(next.token),/失效/);
 const current=store.get();assert.equal(current.document.records[1].title,'同值');
 assert.throws(()=>store.bulkPreview({sheetId:sheet.id,entries:current.document.records.map(({id,version})=>({id,version})),patch:{values:{[crypto.randomUUID()]:'bad'}}},current.revision),/欄位/);assert.equal(store.get().revision,current.revision);
});
test('draft text limit is configurable, unlimited does not truncate and reduced limits keep existing text',t=>{
 const {store}=workspace(t);let draft=store.createDraft();assert.throws(()=>store.saveDraft(draft.id,draft.version,{body:'12345'},4),/上限/);
 draft=store.saveDraft(draft.id,draft.version,{body:'x'.repeat(100001)},0);assert.equal(store.draft(draft.id).body.length,100001);
 draft=store.saveDraft(draft.id,draft.version,{title:'保留'},10);assert.equal(draft.body.length,100001);
 draft=store.saveDraft(draft.id,draft.version,{body:'縮短'},10);assert.equal(draft.body,'縮短');
});
test('standalone draft reminder persists and fires without any workspace records',t=>{
 const {root}=workspace(t),{RecordReminders}=require('../src/record-reminders');let clock=Date.now(),due=0;
 const options={document:()=>({sheets:[],records:[]}),settings:()=>({remindersEnabled:true}),now:()=>clock,setIntervalFn:()=>null,clearIntervalFn:()=>{},onDue:()=>due++};
 const filename=path.join(root,'reminders.json'),reminders=new RecordReminders(filename,options);
 const saved=reminders.save({recordId:null,standalone:{title:'草稿待辦',body:'提醒內容'},at:new Date(clock+60000).toISOString(),repeat:'none',delivery:'default'});assert.equal(saved.items[0].available,true);
 const restarted=new RecordReminders(filename,options);clock+=60001;restarted.tick();assert.equal(due,1);assert.equal(restarted.list().items[0].status,'fired');restarted.ack(saved.savedId);assert.equal(restarted.list().items.length,0);
});
test('workset paths and optional copy shortcuts roundtrip and retain model limits',()=>{
 const id=crypto.randomUUID(),entry=P.entry('worksets',{id,name:'直接位置',favoriteIds:[],recordIds:[],paths:['C:\\Projects','\\\\server\\share\\file.txt']});assert.equal(entry.paths.length,2);
 assert.throws(()=>P.entry('worksets',{...entry,paths:Array.from({length:21},(_,i)=>'C:\\'+i)}),/20/);
 const snippet=P.entry('snippets',{id,name:'複製',category:'工作',body:'{{today}}',shortcut:'Ctrl+Alt+K'});assert.equal(snippet.shortcut,'CommandOrControl+Alt+K');
 assert.throws(()=>P.normalize({version:1,rules:[],worksets:[],snippets:[snippet,{...snippet,id:crypto.randomUUID()}]}),/快捷鍵重複/);
});
