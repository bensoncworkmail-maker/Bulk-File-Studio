'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EverythingBridge,buildQuery,parseResults}=require('../src/everything-bridge');
const {FILE_TYPES,normalizeQuery}=require('../src/everything-query');
function setup(t,options={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-es-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'es.exe');fs.writeFileSync(file,Buffer.from('MZ test executable fixture'));const config=path.join(dir,'config.json'),calls=[];const run=(exe,args,settings,callback)=>{calls.push({exe,args,settings});const output=args[args.indexOf('-export-txt')+1];setImmediate(()=>{fs.writeFileSync(output,'\uFEFFC:\\文件\\report.pdf\r\nC:\\Projects\r\n\\\\server\\share\\bad.txt\r\n');callback(null);});return {kill(){}};};const bridge=new EverythingBridge(config,{platform:'win32',tempRoot:dir,run,...options});return {bridge,dir,file,config,calls};}
test('Everything remains disabled without any helper process and persists an explicit opt-in',async t=>{const h=setup(t);assert.equal(h.bridge.status().enabled,false);await assert.rejects(h.bridge.search({text:'report',type:'all'}),/未啟用/);assert.equal(h.calls.length,0);h.bridge.choose(h.file);assert.equal(h.bridge.status().enabled,false);h.bridge.configure(true,'');const restored=new EverythingBridge(h.config,{platform:'win32'});assert.equal(restored.status().enabled,true);h.bridge.configure(false,'');assert.equal(new EverythingBridge(h.config,{platform:'win32'}).status().enabled,false);});
test('fixed IPC query keeps switches as data, filters network results and supports selection tokens',async t=>{const h=setup(t);h.bridge.choose(h.file);h.bridge.configure(true,'1.5a');const result=await h.bridge.search({text:'-exit $(calc) *.pdf',type:'file'});assert.equal(result.rows.length,2);assert.equal(result.skipped,1);assert.equal(h.calls[0].settings.shell,false);assert.equal(h.calls[0].settings.windowsHide,true);assert.equal(h.calls[0].settings.timeout,10000);assert.ok(h.calls[0].args.includes('-ipc2'));assert.equal(h.calls[0].args.at(-2),'--');assert.equal(h.calls[0].args.at(-1),'file: "-exit" "$(calc)" "*.pdf"');assert.deepEqual(h.bridge.selection(result.token,[0,0]),['C:\\文件\\report.pdf']);assert.throws(()=>h.bridge.selection('old',[0]));assert.throws(()=>h.bridge.selection(result.token,[-1]));assert.equal(fs.readdirSync(h.dir).some(n=>n.startsWith('bfs-everything-')),false);h.bridge.configure(false,'');assert.throws(()=>h.bridge.selection(result.token,[0]));});
test('replaced helper requires explicit reselection and never executes',async t=>{const h=setup(t);h.bridge.choose(h.file);h.bridge.configure(true,'');fs.appendFileSync(h.file,'changed');await assert.rejects(h.bridge.search({text:'report',type:'all'}),/已變更/);assert.equal(h.calls.length,0);h.bridge.choose(h.file);assert.equal(h.bridge.status().enabled,false);});
test('disable kills an in-flight query and discards its response and temporary files',async t=>{let complete,killed=false;const h=setup(t,{run:(file,args,options,callback)=>{complete=callback;return {kill(){killed=true;setImmediate(()=>callback(Object.assign(new Error('killed'),{killed:true})));}};}});h.bridge.choose(h.file);h.bridge.configure(true,'');const pending=h.bridge.search({text:'*',type:'all'});assert.ok(complete);h.bridge.configure(false,'');await assert.rejects(pending,/取消或停用/);assert.ok(killed);assert.equal(h.bridge.result,null);assert.equal(fs.readdirSync(h.dir).some(n=>n.startsWith('bfs-everything-')),false);});
test('no-shell integration rejects advanced queries, malformed UTF-8, excessive output and invalid helper selections',t=>{const h=setup(t);for(const text of ['', 'ext:pdf','content:secret','a\nb','"quoted"','a'.repeat(257)])assert.throws(()=>buildQuery({text,type:'all'}));assert.throws(()=>parseResults(Buffer.from([0xff])));assert.throws(()=>parseResults(Buffer.from(Array(503).fill('C:\\a').join('\n'))));assert.equal(parseResults(Buffer.from('C:\\a\nC:\\A\nrelative\n')).rows.length,1);assert.throws(()=>h.bridge.choose(path.join(h.dir,'Everything.exe')));assert.throws(()=>h.bridge.configure(true,'bad instance'));const unsupported=new EverythingBridge(h.config,{platform:'linux'});assert.throws(()=>unsupported.choose(h.file),/Windows/);assert.throws(()=>unsupported.configure(true,''),/Windows/);});
test('IPC errors are actionable and output never remains on disk',async t=>{const h=setup(t,{run:(file,args,options,callback)=>{setImmediate(()=>callback(Object.assign(new Error('not running'),{code:8})));return {kill(){}};}});h.bridge.choose(h.file);h.bridge.configure(true,'');await assert.rejects(h.bridge.search({text:'*',type:'all'}),/先啟動/);assert.equal(h.bridge.result,null);assert.equal(fs.readdirSync(h.dir).some(n=>n.startsWith('bfs-everything-')),false);});
test('new queries invalidate old tokens and concurrent searches are rejected',async t=>{const h=setup(t);h.bridge.choose(h.file);h.bridge.configure(true,'');const first=await h.bridge.search({text:'one',type:'file'});const pending=h.bridge.search({text:'two',type:'all'});await assert.rejects(h.bridge.search({text:'three',type:'all'}),/執行中/);const second=await pending;assert.notEqual(first.token,second.token);assert.throws(()=>h.bridge.selection(first.token,[0]),/過期/);});
test('timeout clears temporary files and permits a later retry',async t=>{const h=setup(t,{run:(file,args,options,callback)=>{setImmediate(()=>callback(Object.assign(new Error('timeout'),{killed:true})));return {kill(){}};}});h.bridge.choose(h.file);h.bridge.configure(true,'');await assert.rejects(h.bridge.search({text:'*',type:'all'}),/逾時/);assert.equal(h.bridge.active,null);assert.equal(fs.readdirSync(h.dir).some(n=>n.startsWith('bfs-everything-')),false);});

test('native Everything syntax, quoted paths, OR and PCRE expressions are forwarded verbatim with fixed type filters',async t=>{
 const h=setup(t);h.bridge.choose(h.file);h.bridge.configure(true,'');const text=String.raw`dm:last7days !C:\Users\Benson\AppData\Local\Temp size:>200mb`;
 await h.bridge.search({text,type:'file',mode:'syntax'});assert.equal(h.calls[0].args.at(-1),text);assert.ok(h.calls[0].args.includes('/a-d'));assert.equal(h.calls[0].args.at(-2),'--');assert.equal(h.calls[0].settings.shell,false);
 const regex=String.raw`<ext:pdf | ext:docx> regex:"^Report [0-9]+" !path:"C:\Temp\"`;
 await h.bridge.search({text:regex,type:'all',mode:'syntax'});assert.equal(h.calls[1].args.at(-1),regex);assert.ok(!h.calls[1].args.includes('/a-d'));assert.equal(buildQuery({text:'-exit -export-txt C:\\outside.txt',type:'all',mode:'syntax'}),'-exit -export-txt C:\\outside.txt');
 assert.throws(()=>buildQuery({text:'a\nb',type:'all',mode:'syntax'}),/單行/);assert.throws(()=>buildQuery({text:'x'.repeat(4097),type:'all',mode:'syntax'}),/4096/);assert.equal(buildQuery({text:'regex:^abc$',type:'folder',mode:'syntax'}),'regex:^abc$');
});
test('background tracked queries never replace interactive selection tokens',async t=>{
 const h=setup(t);h.bridge.choose(h.file);h.bridge.configure(true,'');const interactive=await h.bridge.search({text:'report',type:'all'});await h.bridge.search({text:'size:>200mb',mode:'syntax',type:'file'},{publish:false});assert.deepEqual(h.bridge.selection(interactive.token,[0]),['C:\\文件\\report.pdf']);
});

test('every file category applies an extension filter to the whole native query and stays file-only',async t=>{
 const h=setup(t);h.bridge.choose(h.file);h.bridge.configure(true,'');
 const text=String.raw`dm:last7days !C:\Users\Benson\AppData\Local\Temp size:>200mb | regex:"^Report [0-9]+"`;
 const representative={audio:'mp3',compressed:'7z',document:'pdf',executable:'exe',picture:'heic',video:'mkv'};
 for(const [type,ext] of Object.entries(representative)){
  assert.ok(FILE_TYPES[type].split(';').includes(ext));
  await h.bridge.search({text,type,mode:'syntax'});const call=h.calls.at(-1);
  assert.equal(call.args.at(-1),'file: ext:'+FILE_TYPES[type]+' <'+text+'>');
  assert.equal(call.args.at(-2),'--');assert.ok(call.args.includes('/a-d'));assert.ok(!call.args.includes('/ad'));assert.equal(call.settings.shell,false);
  assert.equal(normalizeQuery({text,type,mode:'syntax'}).text,text);
 }
});

test('file categories also work with quoted filename keywords and reject unknown or inherited types',()=>{
 for(const [type,extensions] of Object.entries(FILE_TYPES))assert.equal(buildQuery({text:'Annual Report *.MP4',type}),'file: ext:'+extensions+' <"Annual" "Report" "*.MP4">');
 for(const type of ['unknown','__proto__','constructor','toString',null,{}])assert.throws(()=>buildQuery({text:'*',type,mode:'syntax'}),/搜尋條件無效/);
});

test('custom extensions cannot inject operators and portable expressions preserve file/folder restrictions',async t=>{
 const {normalizeExtensions,searchExpression}=require('../src/everything-query');
 assert.equal(normalizeExtensions('.PDF, docx;PDF xlsx'),'docx;pdf;xlsx');
 for(const value of ['',null,['pdf'],'pdf | exe','*.pdf','ext:pdf','pdf\nfolder:','p"df','tar.gz','a'.repeat(21)])assert.throws(()=>normalizeExtensions(value),/副檔名/);
 const input={text:'dm:7days | size:>1gb',type:'custom',mode:'syntax',extensions:'.pdf,.DOCX'};
 assert.equal(buildQuery(input),'file: ext:docx;pdf <dm:7days | size:>1gb>');
 assert.equal(searchExpression({...input,type:'folder'}),'folder: <dm:7days | size:>1gb>');
 assert.equal(searchExpression({...input,type:'file'}),'file: <dm:7days | size:>1gb>');
 const h=setup(t);h.bridge.choose(h.file);h.bridge.configure(true,'');await h.bridge.search(input);assert.equal(h.calls.at(-1).args.at(-1),buildQuery(input));assert.ok(h.calls.at(-1).args.includes('/a-d'));
});
