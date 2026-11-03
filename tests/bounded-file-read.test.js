'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {readPackageFile}=require('../src/notes-files'),{perform}=require('../src/notes-share-worker'),{readSpreadsheetFile}=require('../src/notes-xlsx'),M=require('../src/notes-model'),JSZip=require('jszip');
const {readStableBytes}=require('../src/bounded-file-read');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-read-audit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
for(const reader of ['local package','shared package','Excel'])test(reader+' refuses a source replaced during its read',async t=>{
 const dir=setup(t);let file;
 if(reader==='shared package')file=path.join(dir,perform({action:'publish',folder:dir,deviceId:crypto.randomUUID(),revision:1,data:M.exportPackage(M.template(()=>crypto.randomUUID(),'2026-11-04T00:00:00Z'),{scope:'all'})}).name);
 else if(reader==='Excel'){
  const zip=new JSZip();zip.file('xl/workbook.xml','<workbook xmlns:r="urn:r"><sheets><sheet name="Test" r:id="r1"/></sheets></workbook>');zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>');zip.file('xl/worksheets/sheet1.xml','<worksheet><sheetData/></worksheet>');file=path.join(dir,'source.xlsx');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));
 }else{file=path.join(dir,'source.json');fs.writeFileSync(file,'{"name":"first"}');}
 const bytes=fs.readFileSync(file),original=fs.readSync;let changed=false;
 t.mock.method(fs,'readSync',(...args)=>{const count=original(...args);if(!changed){changed=true;fs.renameSync(file,file+'.old');fs.writeFileSync(file,bytes);}return count;});
 const read=()=>reader==='local package'?readPackageFile(file):reader==='shared package'?perform({action:'read',folder:dir,name:path.basename(file)}):readSpreadsheetFile(file);
 await assert.rejects(async()=>read(),/變更|替換/);assert.equal(changed,true);
});

test('bounded reads reject replacement between metadata inspection and opening the descriptor',t=>{
 const dir=setup(t),file=path.join(dir,'source');fs.writeFileSync(file,'first');const original=fs.openSync;let changed=false;
 t.mock.method(fs,'openSync',(...args)=>{if(args[0]===file&&!changed){changed=true;fs.renameSync(file,file+'.old');fs.writeFileSync(file,'other');}return original(...args);});
 assert.throws(()=>readStableBytes(file,{maxBytes:10}),/替換|更新/);
});
for(const mutation of ['grow','shrink'])test('bounded reads reject a source that can '+mutation+' during reading',t=>{
 const dir=setup(t),file=path.join(dir,'source');fs.writeFileSync(file,'first');const original=fs.readSync;let changed=false;
 t.mock.method(fs,'readSync',(...args)=>{const count=original(...args);if(!changed){changed=true;if(mutation==='grow')fs.appendFileSync(file,'extra');else fs.truncateSync(file,2);}return count;});
 assert.throws(()=>readStableBytes(file,{maxBytes:10}),/變更|替換/);
});
test('bounded reads enforce the size and regular-file limits before reading',t=>{
 const dir=setup(t),file=path.join(dir,'source');fs.writeFileSync(file,'first');assert.throws(()=>readStableBytes(file,{maxBytes:4}),/大小|一般檔案/);
 assert.throws(()=>readStableBytes(dir,{maxBytes:10}),/一般檔案/);assert.throws(()=>readStableBytes(file,{maxBytes:-1}),/限制/);
 assert.equal(readStableBytes(file,{maxBytes:5}).toString(),'first');
});
