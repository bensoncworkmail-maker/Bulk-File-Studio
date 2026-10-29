'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { renameOne, createPreview } = require('../src/rename-core');
const { BUILTIN_PRESETS, presetRules, sanitizeSavedPresets } = require('../src/presets');

const examples = [
  ['photo','IMG_2458.jpg','Photo_001.jpg'],
  ['clean','my  file.txt','my_file.txt'],
  ['copy','report (1).pdf','report.pdf'],
  ['folder','report.pdf','Invoices_report.pdf'],
  ['folder-number','IMG.jpg','Invoices_001.jpg'],
  ['date','report.pdf','2026-10-29_report.pdf'],
  ['modified','report.pdf','2024-07-15_report.pdf'],
  ['document','report.pdf','Document_001.pdf'],
  ['backup','report.pdf','report_backup_2026-10-29.pdf'],
  ['web','My File.JPG','my-file.jpg'],
  ['spaces','my_file-name.txt','my file name.txt'],
  ['remove-number','001_report.pdf','report.pdf'],
  ['remove-brackets','report [draft] (copy).pdf','report.pdf'],
  ['lower-extension','Photo.JPEG','Photo.jpeg'],
  ['title','my report.txt','My Report.txt'],
  ['number','report.pdf','001_report.pdf']
];
for (const [id,input,expected] of examples) {
  test(`built-in preset: ${id}`, () => {
    assert.equal(renameOne(input,presetRules(id,'2026-10-29'),0,{folder:'Invoices',modified:new Date(2024,6,15,12)}),expected);
  });
}
test('every built-in has a verified example', () => {
  assert.deepEqual(BUILTIN_PRESETS.map(item=>item.id),examples.map(item=>item[0]));
});
test('template tags honor number settings, formatted dates and single-pass expansion', () => {
  assert.equal(renameOne('notes_{date}.pdf',{nameTemplate:'{n}_{name}_{date}',numberStart:7,numberStep:2,numberWidth:4,dateValue:'2024-02-29',dateFormat:'YYYYMMDD'},2),'0011_notes_{date}_20240229.pdf');
  assert.equal(renameOne('notes.pdf',{nameTemplate:'{date}',dateValue:'2026-10-29',dateFormat:'DD-MM-YYYY'}),'29-10-2026.pdf');
});
test('incomplete tags and unavailable or invalid dates are rejected', () => {
  for(const nameTemplate of ['{unknown}','{name','name}','{}']) assert.throws(()=>renameOne('a.txt',{nameTemplate}),/標籤/);
  assert.throws(()=>renameOne('a.txt',{nameTemplate:'{date}',dateValue:'2026-02-29'}),/日期/);
  assert.throws(()=>renameOne('a.txt',{nameTemplate:'{modified}'}),/修改日期/);
  assert.throws(()=>renameOne('a.txt',{nameTemplate:'{folder}'}),/資料夾/);
});
test('cropping respects Unicode graphemes and trims only the ends', () => {
  assert.equal(renameOne('👩‍💻報告😀.txt',{removeStart:1,removeEnd:1}),'報告.txt');
  assert.equal(renameOne('__ Holiday-photo --.jpg',{trimCharacters:' _-'}),'Holiday-photo.jpg');
});
test('extension changes are independent, explicit and reject conflicting options', () => {
  assert.equal(renameOne('MyFile.JPEG',{extensionMode:'lower'}),'MyFile.jpeg');
  assert.equal(renameOne('MyFile.txt',{extensionMode:'upper'}),'MyFile.TXT');
  assert.equal(renameOne('MyFile.txt',{extensionMode:'replace',extensionValue:'.md'}),'MyFile.md');
  assert.throws(()=>renameOne('a.txt',{extensionMode:'replace',extensionValue:'../jpg'}),/副檔名/);
  assert.throws(()=>renameOne('a.txt',{extensionMode:'lower',includeExtension:true}),/取消/);
});
test('natural name and modification-time sorting control numbering in the preview', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brs-sort-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const a=path.join(dir,'file2.txt'),b=path.join(dir,'file10.txt');
  fs.writeFileSync(a,'A');fs.writeFileSync(b,'B');
  fs.utimesSync(a,1700000100,1700000100);fs.utimesSync(b,1700000000,1700000000);
  const rules={nameTemplate:'{n}_{name}'};
  let preview=createPreview([b,a],{...rules,sortBy:'name'});
  assert.deepEqual(preview.rows.map(r=>r.targetName),['001_file2.txt','002_file10.txt']);
  preview=createPreview([b,a],{...rules,sortBy:'name',sortDirection:'desc'});
  assert.deepEqual(preview.rows.map(r=>r.targetName),['001_file10.txt','002_file2.txt']);
  preview=createPreview([a,b],{...rules,sortBy:'modified'});
  assert.equal(preview.rows[0].source,b);
  preview=createPreview([a,b],{...rules,sortBy:'modified',sortDirection:'desc'});
  assert.equal(preview.rows[0].source,a);
  const dated=createPreview([a],{nameTemplate:'{modified}_{folder}_{name}'});
  assert.equal(dated.counts.ready,1);
  assert.equal(path.dirname(dated.rows[0].destination),dir);
  assert.equal(fs.readFileSync(a,'utf8'),'A');
});
test('templates still detect duplicate destinations and invalid tags', () => {
  const preview=createPreview(['/demo/a.txt','/demo/b.txt'],{nameTemplate:'Report'},{skipStat:true});
  assert.equal(preview.counts.error,2);
  assert.equal(createPreview(['/demo/a.txt'],{nameTemplate:'{bad}'},{skipStat:true}).counts.error,1);
});
test('stored presets tolerate corrupt entries, cap capacity and whitelist rule values', () => {
  const inputs=[null,{id:'bad id',name:'bad',rules:{}},{id:'ok',name:'  Work  ',rules:{prefix:'<tag>',numberStart:Infinity,regex:'wrong',extra:'ignored'}},{id:'ok',name:'duplicate',rules:{}}];
  const saved=sanitizeSavedPresets(inputs);
  assert.equal(saved.length,1);assert.equal(saved[0].name,'Work');
  assert.equal(saved[0].rules.numberStart,1);assert.equal(saved[0].rules.regex,false);
  assert.equal(saved[0].rules.prefix,'<tag>');assert.equal('extra' in saved[0].rules,false);
  assert.equal(sanitizeSavedPresets('invalid').length,0);
  assert.equal(sanitizeSavedPresets(Array.from({length:40},(_,i)=>({id:'id'+i,name:'n'+i,rules:{}}))).length,30);
});
