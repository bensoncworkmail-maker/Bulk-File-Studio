'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {FloatingMenu}=require('../src/floating-menu'),{FloatingPin}=require('../src/floating-pin'),{NotesStore}=require('../src/notes-store');
const M=require('../src/notes-model'),D=require('../src/desktop-state'),S=require('../src/global-shortcuts'),L=require('../src/shortcuts'),K=require('../src/shortcut-inventory-model');
function workspace(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-schema-targets-')),store=new NotesStore(path.join(root,'workspace.sqlite'));t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});const doc=store.addTemplate().document;return {root,store,master:doc.sheets[0],detail:doc.sheets[1]};}
function add(store,sheet,title,values={}){return store.saveRecord({sheetId:sheet.id,title,values,notes:'keep notes',tags:['keep'],fileLinks:[]}).result.id;}
test('global menu activation gives its owner focus and blur dismisses without an item click',()=>{
 const owner=new EventEmitter(),menus=[],pending=[];let focused=false,pins=0,shown=0;
 Object.assign(owner,{isDestroyed:()=>false,isVisible:()=>true,isFocused:()=>focused,show:()=>shown++,focus:()=>focused=true,getNormalBounds:()=>({width:300,height:400}),webContents:{getZoomFactor:()=>1},pinController:{sync:()=>pins++}});
 const controller=new FloatingMenu({Menu:{buildFromTemplate:()=>{const menu={popup:options=>menu.options=options,closePopup:()=>menu.closed=true};menus.push(menu);return menu;}},getWindow:()=>owner,showWindow:()=>{},settings:()=>({floatingCollapsed:false}),defer:fn=>pending.push(fn)});
 controller.popup([{label:'Copy'}]);assert.equal(focused,true);assert.equal(shown,1);assert.equal(owner.nativeMenuOpen,true);assert.equal(menus[0].options.window,owner);
 focused=false;owner.emit('blur');pending.shift()();assert.equal(menus[0].closed,true);assert.equal(owner.nativeMenuOpen,false);assert.equal(controller.current,null);assert.equal(pins,1);
});
test('old blur and menu callbacks cannot close a replacement menu, and pin maintenance pauses for menus',()=>{
 const owner=new EventEmitter(),pending=[],menus=[];let focused=true,calls=0,tick;
 Object.assign(owner,{isDestroyed:()=>false,isVisible:()=>true,isFocused:()=>focused,show(){},focus:()=>focused=true,getNormalBounds:()=>({width:300,height:400}),webContents:{},setAlwaysOnTop:()=>calls++});
 owner.pinController=new FloatingPin(owner,()=>({floatingOnTop:true}),{setIntervalFn:fn=>(tick=fn,1),clearIntervalFn:()=>{}});
 const controller=new FloatingMenu({Menu:{buildFromTemplate:()=>{const menu={popup:o=>menu.options=o,closePopup(){this.closed=true;}};menus.push(menu);return menu;}},getWindow:()=>owner,showWindow:()=>{},settings:()=>({}),defer:fn=>pending.push(fn)});
 controller.popup([]);const before=calls;tick();assert.equal(calls,before);focused=false;owner.emit('blur');controller.popup([]);menus[0].options.callback();pending.shift()();assert.equal(controller.current.menu,menus[1]);assert.equal(owner.nativeMenuOpen,true);
 owner.emit('hide');assert.equal(menus[1].closed,true);assert.equal(owner.nativeMenuOpen,false);
});
test('shortcut inventory rejects canonical duplicates in overlapping contexts while allowing separate local contexts',()=>{
 const settings=D.normalize(),favorites={...L.DEFAULTS,search:'Ctrl+N'};assert.equal(K.conflicts(K.rows(settings,[],favorites,L.LABELS)).length,0);
 assert.throws(()=>S.validatePair({...settings,calendarShortcut:'Ctrl+N'}),/新草稿/);
 assert.throws(()=>S.validatePair({...settings,favoriteShortcuts:{...L.DEFAULTS,search:'Ctrl+Shift+F'}}),/全域搜尋頁/);
 assert.throws(()=>S.validatePair({...settings,calendarShortcut:'Ctrl+Alt+K'},[{id:'snippet',name:'Copy',shortcut:'CommandOrControl+Alt+K'}]),/Copy/);
 assert.throws(()=>L.validate({...L.DEFAULTS,move:'Ctrl+A'}),/重複/);
 assert.equal(K.canonical('CommandOrControl+Shift+C'),K.canonical('Ctrl+Shift+C'));
 const data=K.rows(settings,[{id:'a',name:'Snippet',category:'Work',shortcut:''}],L.DEFAULTS,L.LABELS);assert.ok(data.some(row=>row.kind==='snippet'&&!row.shortcut));assert.ok(data.some(row=>row.source==='內建情境快捷鍵'&&row.scope==='grid'));
});
test('cross-master insertion creates independent details for each ID, preserves data and validates aggregate limits atomically',t=>{
 const {store,master,detail}=workspace(t),a=add(store,master,'Same name'),b=add(store,master,'Same name'),parent=M.parentField(store.get().document,detail),input={sheetId:detail.id,title:'Follow-up',notes:'body',tags:['work'],values:{},fileLinks:[],masterIds:[a,b]};
 const before=store.get(),result=store.saveCopies(input,2),records=result.document.records.filter(record=>record.sheetId===detail.id);assert.equal(result.result.count,4);assert.equal(result.result.masterCount,2);assert.equal(new Set(records.map(record=>record.id)).size,4);assert.deepEqual(records.map(record=>record.values[parent.id]),[[a],[a],[b],[b]]);assert.ok(records.every(record=>record.notes==='body'));
 const current=store.get();assert.throws(()=>store.saveCopies(input,251),/500/);assert.throws(()=>store.saveCopies({...input,masterIds:[a,a]},1),/不同/);assert.throws(()=>store.saveCopies({...input,masterIds:[a,crypto.randomUUID()]},1),/可用/);assert.equal(store.get().revision,current.revision);assert.equal(before.document.records.length,2);
});
test('bulk editing different masters retains each detail relation and rejects an invalid new parent without partial writes',t=>{
 const {store,master,detail}=workspace(t),a=add(store,master,'A'),b=add(store,master,'B'),parent=M.parentField(store.get().document,detail);let state=store.saveCopies({sheetId:detail.id,title:'Task',values:{},masterIds:[a,b]},1);
 const children=state.document.records.filter(record=>record.sheetId===detail.id),entries=children.map(({id,version})=>({id,version}));const preview=store.bulkPreview({sheetId:detail.id,entries,patch:{notes:'Updated together'}},state.revision);assert.equal(preview.count,2);state=store.bulkCommit(preview.token);assert.deepEqual(state.document.records.filter(record=>record.sheetId===detail.id).map(record=>record.values[parent.id]),[[a],[b]]);
 const current=store.get();assert.throws(()=>store.bulkPreview({sheetId:detail.id,entries:current.document.records.filter(record=>record.sheetId===detail.id).map(({id,version})=>({id,version})),patch:{values:{[parent.id]:[]}}},current.revision),/主紀錄/);assert.equal(store.get().revision,current.revision);
});
test('column removal previews active and recycled values, requires confirmation, backs up, and increments affected versions',t=>{
 const {store,master}=workspace(t),field={id:crypto.randomUUID(),label:'已完成',type:'checkbox'},original=store.get().document.sheets.find(sheet=>sheet.id===master.id);store.saveSheet({...original,expectedVersion:original.version,fields:[...original.fields,field]});
 const a=add(store,master,'Active',{[field.id]:true}),b=add(store,master,'Recycled',{[field.id]:false});store.trash('record',b,store.get().document.records.find(record=>record.id===b).version);const before=store.get(),sheet=before.document.sheets.find(sheet=>sheet.id===master.id),input={...sheet,expectedVersion:sheet.version,baseRevision:before.revision,fields:sheet.fields.filter(column=>column.id!==field.id)};
 assert.throws(()=>store.saveSheet(input),/已完成.*仍有資料/);const preview=store.sheetPreview(input);assert.equal(store.get().revision,before.revision);assert.equal(preview.removed[0].active,1);assert.equal(preview.removed[0].recycled,1);assert.equal(preview.removed[0].samples.find(item=>item.recycled).value,'未勾選');assert.throws(()=>store.sheetCommit(preview.token,false),/確認/);
 const result=store.sheetCommit(preview.token,true);assert.equal(fs.existsSync(result.result.backup),true);assert.ok(result.document.records.every(record=>!Object.hasOwn(record.values,field.id)));for(const record of result.document.records)assert.equal(record.version,before.document.records.find(item=>item.id===record.id).version+1);assert.ok(store.history(a).some(item=>item.changes.some(change=>change.label==='已完成')));
 const backup=new NotesStore(result.result.backup);try{assert.ok(backup.get().document.sheets.find(sheet=>sheet.id===master.id).fields.some(column=>column.id===field.id));assert.equal(backup.get().document.records.find(record=>record.id===a).values[field.id],true);}finally{backup.close();}
});
test('schema deletion protects master relations and rejects stale confirmation before backup or writes',t=>{
 const {store,master,detail}=workspace(t),parent=M.parentField(store.get().document,detail),state=store.get();assert.throws(()=>store.sheetPreview({...detail,expectedVersion:detail.version,fields:detail.fields.filter(field=>field.id!==parent.id)}),/必要.*主從關聯/);
 const field=master.fields[0],preview=store.sheetPreview({...master,expectedVersion:master.version,baseRevision:state.revision,fields:master.fields.filter(item=>item.id!==field.id)});add(store,master,'New edit');const revision=store.get().revision;assert.throws(()=>store.sheetCommit(preview.token,true),/失效/);assert.equal(store.get().revision,revision);assert.ok(store.get().document.sheets[0].fields.some(item=>item.id===field.id));
});
test('detail-only search excludes masters and recycled details while matching renamed parent values',t=>{
 const {store,master,detail}=workspace(t),doc=store.get().document,parent=M.parentField(doc,detail),a=add(store,master,'Renamed master'),b=add(store,detail,'Detail target',{[parent.id]:[a]}),c=add(store,detail,'Trash',{[parent.id]:[a]});store.trash('record',c,1);
 assert.deepEqual(M.searchRecords(store.get().document,{scope:'details',query:''}).map(row=>row.id),[b]);assert.equal(M.searchRecords(store.get().document,{scope:'details',query:'Renamed',searchParent:true})[0].id,b);
 const settings=require('../src/settings-model').normalize({notesSearchScope:'details'});assert.equal(settings.notesSearchScope,'details');assert.equal(settings.notesShowCopyCount,false);
 const Q=require('../src/quick-actions-model');assert.equal(Q.normalize([{id:crypto.randomUUID(),type:'open-worksets',label:'Worksets',display:'menu'}],true)[0].display,'menu');assert.throws(()=>Q.normalize([{id:crypto.randomUUID(),type:'open-worksets',label:'Worksets',display:'overlay'}],true));
});
test('shortcut menu waits for all modifiers, cancels on lost focus, and cleans up stale requests',()=>{
 const {ShortcutMenuTrigger}=require('../src/shortcut-menu-trigger'),owner=new EventEmitter(),wc=new EventEmitter(),timers=new Map();let next=0,opened=0,focused=true;Object.assign(owner,{webContents:wc,focus(){focused=true;},isDestroyed:()=>false,isVisible:()=>true,isFocused:()=>focused});
 const trigger=new ShortcutMenuTrigger({window:()=>owner,show(){},defer:fn=>{timers.set(++next,fn);return next;},cancel:id=>timers.delete(id)}),event={preventDefault(){}};
 trigger.run(()=>opened++);assert.equal(opened,0);wc.emit('before-input-event',event,{type:'keyUp',key:'R',alt:true,control:true});assert.equal(timers.size,1);wc.emit('before-input-event',event,{type:'keyUp',key:'Alt',alt:false,control:false});[...timers.values()].at(-1)();assert.equal(opened,1);assert.equal(wc.listenerCount('before-input-event'),0);assert.equal(timers.size,0);
 trigger.run(()=>opened++);focused=false;owner.emit('blur');assert.equal(trigger.pending,null);assert.equal(timers.size,0);trigger.run(()=>opened++);trigger.run(()=>opened+=2);assert.equal(wc.listenerCount('before-input-event'),1);trigger.close();assert.equal(wc.listenerCount('before-input-event'),0);
});
test('native-confirmed modifier release opens menu on the short settle timer instead of the fallback',()=>{
 const {ShortcutMenuTrigger}=require('../src/shortcut-menu-trigger'),owner=new EventEmitter(),wc=new EventEmitter(),timers=[];let opened=0;Object.assign(owner,{webContents:wc,focus(){},isDestroyed:()=>false,isVisible:()=>true,isFocused:()=>true});const trigger=new ShortcutMenuTrigger({window:()=>owner,show(){},defer:(fn,ms)=>(timers.push({fn,ms}),timers.length),cancel(){}});trigger.run(()=>opened++,{released:true});assert.equal(timers[0].ms,40);timers[0].fn();assert.equal(opened,1);assert.equal(wc.listenerCount('before-input-event'),0);
});
