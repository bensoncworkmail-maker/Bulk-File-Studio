'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const M=require('../src/notes-model'),web=require('../src/web-link-model'),N=require('../src/intranet-path'),{openRecordWebsite}=require('../src/notes-web-links'),{PathRepair,translate,planRepair}=require('../src/path-repair');
function website(){const doc=M.template(crypto.randomUUID,new Date().toISOString(),'clients'),sheet=doc.sheets[0],field={id:crypto.randomUUID(),label:'網站',type:'url',options:[],targetSheetId:null};sheet.fields.push(field);const record={id:crypto.randomUUID(),sheetId:sheet.id,title:'客戶網站',notes:'',tags:[],values:{[field.id]:'https://example.com/path?q=1'},fileLinks:[],favoriteTagLinks:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),deletedAt:null,version:1};doc.records.push(record);return {doc:M.normalizeDocument(doc),sheet,field,record};}
test('website fields validate HTTP(S), survive package and Excel round trips, and reject executable schemes',()=>{
 const {doc,sheet,field,record}=website();assert.equal(M.TYPES.url,'網址');assert.equal(M.readPackage(M.exportPackage(doc)).records[0].values[field.id],record.values[field.id]);
 for(const value of ['javascript:alert(1)','file:///C:/secret','data:text/html,test','https://name:password@example.com','https://example.com\nnext','https:\\example.com']){assert.equal(web.valid(value),false);assert.throws(()=>M.gridValue(field,value));const changed=structuredClone(doc);changed.records[0].values[field.id]=value;assert.throws(()=>M.normalizeDocument(changed));}
 const exported=M.tabularExport(doc,sheet.id,[record.id]),mapping=M.suggestMapping(sheet,exported,true),result=M.createTabular(doc,{sheetId:sheet.id,rows:exported,header:true,mapping},crypto.randomUUID,new Date().toISOString());assert.equal(result.errors.length,0);assert.equal(result.records[0].values[field.id],record.values[field.id]);
});
test('website actions resolve saved record and field IDs, copy without opening and reject removed or invalid values',async()=>{
 const {doc,field,record}=website(),opened=[],copied=[],options={document:doc,recordId:record.id,fieldId:field.id,shell:{openExternal:async value=>opened.push(value)},clipboard:{writeText:value=>copied.push(value)}};
 await openRecordWebsite(options);await openRecordWebsite({...options,action:'copy'});assert.deepEqual(opened,[record.values[field.id]]);assert.deepEqual(copied,opened);
 await assert.rejects(openRecordWebsite({...options,fieldId:crypto.randomUUID()}),/不可用|移除/);doc.records[0].deletedAt=new Date().toISOString();await assert.rejects(openRecordWebsite(options),/不可用/);doc.records[0].deletedAt=null;doc.records[0].values[field.id]='javascript:alert(1)';await assert.rejects(openRecordWebsite(options));assert.equal(opened.length,1);
});
test('mapped drive translation is case-insensitive, keeps suffixes and respects complete directory boundaries',()=>{
 const from=String.raw`R:\testing`,to=String.raw`\\10.10.2.60\temp\testing`;
 assert.equal(translate(String.raw`r:\Testing\testingA.txt`,from,to),String.raw`\\10.10.2.60\temp\testing\testingA.txt`);
 assert.equal(translate(String.raw`R:\testingElse\a.txt`,from,to),null);assert.equal(translate(String.raw`S:\testing\a.txt`,from,to),null);
 assert.equal(translate(String.raw`R:\testing`,from,to),to);assert.equal(translate(String.raw`R:\testing\..\outside.txt`,from,to),null);assert.equal(translate('https://example.com/R:/testing',from,to),null);
 const {doc,field}=website();doc.sheets[0].fields.push({id:'plain',label:'舊位置',type:'text'});doc.records[0].values.plain=String.raw`R:\testing\testingA.txt`;doc.records[0].fileLinks=[{favoriteId:null,path:String.raw`R:\testing\testingA.txt`,type:'file',label:''}];
 const rows=planRepair({items:[]},doc,from,to,value=>({type:value===to?'folder':'file',identity:{}}));assert.equal(rows.length,2);assert.equal(rows.some(row=>row.fieldId===field.id),false);
});
test('UNC host validation is scoped to one operation and never authorizes a public host or a later request',async()=>{
 const selected=String.raw`\\fileserver\share\file.txt`,other=String.raw`\\other\share\file.txt`;
 assert.equal(N.isValidated(selected),false);await N.withIntranetPaths([selected],async()=>{assert.equal(N.isValidated(selected),true);assert.equal(N.isValidated(other),false);await Promise.resolve();N.assertIntranetPath(selected);},async()=>[{address:'10.10.2.60'}]);assert.equal(N.isValidated(selected),false);assert.throws(()=>N.assertIntranetPath(selected),/先驗證/);
 let touched=false;await assert.rejects(N.withIntranetPaths([selected],()=>{touched=true;},async()=>[{address:'8.8.8.8'}]),/內網/);assert.equal(touched,false);assert.throws(()=>N.withIntranetPaths([String.raw`\\8.8.8.8\share\file.txt`],()=>{touched=true;}),/外部網路/);assert.equal(touched,false);
});
function networkFixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-unc-')),share=path.join(root,'share'),target=path.join(share,'testing','testingA.txt');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'data');
 const {NotesStore}=require('../src/notes-store'),{FavoritesStore,inspectPath}=require('../src/favorites-store'),{NotesToolsStore}=require('../src/notes-tools-store'),{ProductivityStore}=require('../src/productivity-store'),{DesktopState}=require('../src/desktop-state'),{ProfileService}=require('../src/profile-service');
 const notes=new NotesStore(path.join(root,'workspace.sqlite')),favorites=new FavoritesStore(path.join(root,'favorites.json')),tools=new NotesToolsStore(path.join(root,'workspace-tools.json')),productivity=new ProductivityStore(path.join(root,'productivity.json')),desktop=new DesktopState(path.join(root,'desktop-state.json'));
 const profile=new ProfileService({root,notes:()=>notes,favorites,tools:()=>tools,desktop:()=>desktop,productivity,reminders:()=>({items:[]})}),source=String.raw`R:\testing\testingA.txt`,destination=String.raw`\\10.10.2.60\temp\testing\testingA.txt`,base=String.raw`\\10.10.2.60\temp`;
 const actual=inspectPath(target),id=crypto.randomUUID(),now=new Date().toISOString();favorites.write({version:1,items:[{id,path:source,type:'file',label:'測試',tags:['工作'],identity:actual.identity,createdAt:now,updatedAt:now}]});
 const state=notes.addTemplate('clients'),sheet=state.document.sheets[0],field=sheet.fields.find(value=>value.type==='text'),saved=notes.saveRecord({sheetId:sheet.id,title:'共享測試',notes:'不要改 R:\\testing\\testingA.txt',tags:['工作'],values:{[field.id]:source},fileLinks:[{favoriteId:id,path:source,type:'file',label:''}]}),record=saved.document.records[0];
 const lstat=fs.lstatSync,asyncLstat=fs.promises.lstat;let networkReads=0;
 const mapped=value=>{if(typeof value==='string'&&value.toLowerCase().startsWith(base.toLowerCase())){networkReads++;return path.join(share,...value.slice(base.length).split(/[\\/]/).filter(Boolean));}return value;};
 fs.lstatSync=(value,...args)=>lstat.call(fs,mapped(value),...args);fs.promises.lstat=(value,...args)=>asyncLstat.call(fs.promises,mapped(value),...args);
 t.after(()=>{fs.lstatSync=lstat;fs.promises.lstat=asyncLstat;notes.close();fs.rmSync(root,{recursive:true,force:true});});
 return {root,notes,favorites,profile,source,destination,base,field,record,id,reads:()=>networkReads,target};
}
test('UNC repair backs up and updates favorites, file links and path values; receiver opens published links without the mapped drive',async t=>{
 const h=networkFixture(t),repair=new PathRepair(h.profile),before=h.notes.get().document.records[0],preview=await repair.preview('R:\\',h.base);assert.equal(preview.rows.length,3);assert.ok(preview.rows.every(row=>row.ready));
 const result=await repair.apply(preview.token,preview.rows.map(row=>row.key),{});assert.equal(result.updated,3);assert.equal(h.profile.history().length,1);assert.equal(h.favorites.read().items[0].path,h.destination);assert.deepEqual(h.favorites.read().items[0].tags,['工作']);
 const record=h.notes.get().document.records[0];assert.equal(record.id,before.id);assert.equal(record.version,before.version+1);assert.equal(record.notes,before.notes);assert.equal(record.fileLinks[0].path,h.destination);assert.equal(record.values[h.field.id],h.destination);
 const reads=h.reads();assert.equal(h.profile.snapshot({}).favorites.items[0].path,h.destination);assert.equal(h.favorites.list()[0].needsValidation,true);assert.equal(h.reads(),reads);assert.throws(()=>h.favorites.get(h.id,true),/先驗證/);assert.equal(h.reads(),reads);
 const opened=[],shell={openPath:async value=>{opened.push(value);return '';},showItemInFolder:value=>opened.push(value)};await require('../src/favorites-network').openFavorite({favorites:h.favorites,id:h.id,shell});assert.deepEqual(opened,[h.destination]);
 const published=M.exportPackage(h.notes.get().document),receiver=M.readPackage(published);assert.equal(receiver.records[0].fileLinks[0].favoriteId,null);
 await require('../src/notes-location-links').openRecordLink({document:receiver,favorites:{read:()=>({items:[]})},recordId:record.id,index:0,action:'open',shell});assert.equal(opened[1],h.destination);
 const normalized=require('../src/profile-service').normalizeBundle(require('../src/profile-service').readJSON(h.profile.historyPath(h.profile.history()[0].name)));assert.equal(normalized.favorites.items[0].path,h.source);
});
test('UNC favorite batch opening checks identity and path policy and keeps rename/trash operations outside the scope',async t=>{
 const h=networkFixture(t),repair=new PathRepair(h.profile),preview=await repair.preview('R:\\',h.base);await repair.apply(preview.token,preview.rows.map(row=>row.key),{});
 const batch=require('../src/favorites-batch');await N.withIntranetPaths([h.destination],async()=>{const plan=batch.prepareBatch(h.favorites,[h.id],'open');const result=await batch.executeBatch(h.favorites,plan,async()=> '');assert.equal(result.opened,1);assert.equal(batch.prepareBatch(h.favorites,[h.id],'locations').targets[0].path,path.win32.dirname(h.destination));});
 assert.throws(()=>h.favorites.readyPaths([h.id]),/先驗證/);assert.throws(()=>require('../src/favorites-trash').prepareTrash(h.favorites,[h.id]),/先驗證/);
 fs.renameSync(h.target,h.target+'.old');fs.writeFileSync(h.target,'replacement');let opened=false;await assert.rejects(require('../src/favorites-network').openFavorite({favorites:h.favorites,id:h.id,shell:{openPath:async()=>{opened=true;}}}),/替換/);assert.equal(opened,false);
});

test('shared three-way pull receives UNC path changes while preserving receiver notes and record identities',async t=>{
 const h=networkFixture(t),{NotesStore}=require('../src/notes-store'),peerRoot=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-unc-peer-')),peer=new NotesStore(path.join(peerRoot,'workspace.sqlite'));t.after(()=>{peer.close();fs.rmSync(peerRoot,{recursive:true,force:true});});
 const source=crypto.randomUUID(),meta={source,profileId:'default',scope:{mode:'all',masterIds:[]},sourceRevision:1,sourceVersion:1},first=peer.importPreview(M.exportPackage(h.notes.get().document),'merge',meta);peer.importCommit(first.token);
 const before=peer.get().document.records.find(item=>item.id===h.record.id);peer.saveRecord({...before,expectedVersion:before.version,notes:'接收者的獨立筆記'});
 const repair=new PathRepair(h.profile),preview=await repair.preview('R:\\',h.base);await repair.apply(preview.token,preview.rows.map(row=>row.key),{});
 const pulled=peer.importShared(M.exportPackage(h.notes.get().document),peer.get().revision,{...meta,sourceRevision:2,sourceVersion:2}),record=pulled.document.records.find(item=>item.id===h.record.id);assert.equal(record.fileLinks[0].path,h.destination);assert.equal(record.values[h.field.id],h.destination);assert.equal(record.notes,'接收者的獨立筆記');assert.equal(record.id,h.record.id);
});
test('UNC repair includes detail-table paths and leaves recycled records and master relations unchanged',async t=>{
 const h=networkFixture(t),doc=h.notes.get().document,sheet=doc.sheets.find(item=>item.name==='聯絡人'),parent=sheet.fields.find(field=>field.type==='relation'),field=sheet.fields.find(field=>field.type==='text');
 const detail=h.notes.saveRecord({sheetId:sheet.id,title:'Detail',notes:'',tags:[],values:{[parent.id]:[h.record.id],[field.id]:h.source},fileLinks:[{favoriteId:null,path:h.source,type:'file',label:''}]}).document.records.find(record=>record.sheetId===sheet.id);
 const extra=h.notes.saveRecord({sheetId:h.record.sheetId,title:'Recycled',notes:'',tags:[],values:{[h.field.id]:h.source},fileLinks:[]}).document.records.find(record=>record.title==='Recycled');h.notes.trash('record',extra.id,extra.version);
 const repair=new PathRepair(h.profile),preview=await repair.preview('R:\\',h.base);assert.equal(preview.rows.length,5);assert.equal(preview.rows.some(row=>row.id===extra.id),false);await repair.apply(preview.token,preview.rows.map(row=>row.key),{});
 const after=h.notes.get().document.records.find(record=>record.id===detail.id);assert.equal(after.values[field.id],h.destination);assert.equal(after.fileLinks[0].path,h.destination);assert.deepEqual(after.values[parent.id],[h.record.id]);assert.equal(h.notes.get().document.records.find(record=>record.id===extra.id).values[h.field.id],h.source);
});
