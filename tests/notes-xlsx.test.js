'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),JSZip=require('jszip'),{readXlsx,excelDate}=require('../src/notes-xlsx');
async function fixture(sheet,extra={}){const zip=new JSZip();zip.file('xl/workbook.xml','<workbook xmlns:r="urn:r"><sheets><sheet name="Contacts" sheetId="1" r:id="rId1"/></sheets></workbook>');zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');zip.file('xl/worksheets/sheet1.xml',sheet);for(const [key,value] of Object.entries(extra))zip.file(key,value);return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});}
test('XLSX reader reads shared/inline strings, formatted leading zeros, dates and cached values without evaluation',async()=>{const source=await fixture('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Phone</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" s="1"><v>123</v></c><c r="C2" s="2"><v>46326</v></c><c r="D2"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>',{'xl/sharedStrings.xml':'<sst><si><t>Name</t></si><si><r><t>A</t></r><r><t>lice</t></r></si></sst>','xl/styles.xml':'<styleSheet><numFmts><numFmt numFmtId="164" formatCode="00000"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>'});const result=await readXlsx(source);assert.deepEqual(result.sheets[0].rows[0],['Name','Phone']);assert.equal(result.sheets[0].rows[1][0],'Alice');assert.equal(result.sheets[0].rows[1][1],'00123');assert.match(result.sheets[0].rows[1][2],/^2026-/);assert.equal(result.sheets[0].rows[1][3],'2');assert.match(result.warnings[0],/公式/);assert.equal(excelDate(1,false),'1900-01-01');assert.equal(excelDate(0,true),'1904-01-01');assert.throws(()=>excelDate(60,false));assert.equal(excelDate(25569,false),'1970-01-01');const implicit=await readXlsx(await fixture('<worksheet><sheetData><row><c t="inlineStr"><is><t>No coordinates</t></is></c></row></sheetData></worksheet>'));assert.equal(implicit.sheets[0].rows[0][0],'No coordinates');});
test('XLSX refuses XML entities, macros, oversized coordinates, corrupt ZIPs and declared-size mismatches',async()=>{await assert.rejects(readXlsx(await fixture('<!DOCTYPE worksheet [<!ENTITY x SYSTEM "file:///secret">]><worksheet/>')),/實體/);await assert.rejects(readXlsx(await fixture('<worksheet/>',{'xl/vbaProject.bin':'macro'})),/巨集/);await assert.rejects(readXlsx(await fixture('<worksheet><sheetData><row r="2000"/></sheetData></worksheet>')),/1001/);await assert.rejects(readXlsx(Buffer.from('bad')),/XLSX/);const source=await fixture('<worksheet/>'),bad=Buffer.from(source);const central=bad.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bad.writeUInt32LE(1,central+24);await assert.rejects(readXlsx(bad));});

test('duplicate worksheet row coordinates are rejected instead of silently replacing earlier values',async()=>{
 const data=await fixture('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Keep</t></is></c></row><row r="1"><c r="A1" t="inlineStr"><is><t>Overwrite</t></is></c></row></sheetData></worksheet>');
 await assert.rejects(readXlsx(data),/列.*重複/);
});

test('XLSX export preserves literal formulas, escaped text and ambiguous headers',async()=>{
 const {randomUUID}=require('node:crypto'),M=require('../src/notes-model'),{writeXlsx}=require('../src/notes-xlsx');
 const now='2026-11-04T00:00:00.000Z';
 const doc=M.template(randomUUID,now,'clients'),sheet=doc.sheets[0];
 const fields=[
  {id:randomUUID(),label:'筆記',type:'text'},
  {id:randomUUID(),label:'筆記',type:'multiselect',options:['a,b','a"b','日本，香港']},
  {id:randomUUID(),label:'已完成',type:'checkbox'},
  {id:randomUUID(),label:'日期',type:'date'},
  {id:randomUUID(),label:'數值',type:'number'}
 ];
 sheet.fields.push(...fields);
 const values=Object.fromEntries(fields.map((field,i)=>[field.id,['文字 _x0041_ <>&',fields[1].options,false,'2026-11-04',12.5][i]]));
 const record={id:randomUUID(),sheetId:sheet.id,title:'=1+1',notes:'  首行\r\n次行\u0001  ',
  tags:['工作;個人','"原文"'],values,fileLinks:[{path:'/tmp/a.txt',type:'file',label:'',favoriteId:null},{path:'/tmp/子資料夾',type:'folder',label:'',favoriteId:null}],favoriteTagLinks:[],
  createdAt:now,updatedAt:now,deletedAt:null,version:1};
 doc.records.push(record);
 const book=await writeXlsx(M.tabularExport(doc,sheet.id,[record.id]));
 const {sheets,warnings}=await readXlsx(book),rows=sheets[0].rows;
 assert.deepEqual(warnings,[]);
 assert.equal(rows[1][0],'=1+1');
 const mapping=M.suggestMapping(sheet,rows,true);
 assert.equal(rows[0].at(-1),'檔案／資料夾路徑');
 assert.equal(rows[1].at(-1),'/tmp/a.txt\n/tmp/子資料夾');
 assert.deepEqual(mapping.slice(-8),[...fields.map(field=>field.id),'notes','tags','']);
 const result=M.createTabular(doc,{sheetId:sheet.id,header:true,rows,mapping},randomUUID,now);
 assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.records[0].values,values);
 assert.deepEqual(result.records[0].tags,record.tags);
 assert.equal(result.records[0].notes,record.notes);
});
