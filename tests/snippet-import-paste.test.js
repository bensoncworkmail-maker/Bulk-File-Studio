'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),I=require('../src/snippet-import'),crypto=require('node:crypto');
test('CSV handles BOM, quoted commas, newlines, escaped quotes, tabs and exact duplicates',()=>{
 const rows=I.csv('\uFEFFname,category,body\r\nReply,Work,"Hello,\n""friend"""\r\nReply,Work,"Hello,\n""friend"""');const result=I.preview(rows,[]);assert.equal(result.items.length,1);assert.equal(result.skipped,1);assert.equal(result.items[0].body,'Hello,\n"friend"');assert.equal(result.items[0].shortcut,undefined);assert.equal(I.preview(rows,result.items).items.length,0);assert.equal(I.preview(I.csv('名稱\t分類\t文字內容\n甲\t工作\t你好'),[]).items[0].name,'甲');
});
test('snippet import rejects malformed and oversized rows without silently truncating values',()=>{
 assert.throws(()=>I.csv('name,body\na,"unfinished'),/引號/);assert.throws(()=>I.csv('name,body\na,"text"x'),/引號/);assert.throws(()=>I.preview([['bad'],['row']],[]),/第一列/);assert.equal(I.preview([['name','body'],['A',''],['B','x'.repeat(20001)]],[]).errors.length,2);assert.throws(()=>I.csv('x'.repeat(2*1024*1024+1)),/MB/);const existing=Array.from({length:500},(_,i)=>({name:String(i),category:'',body:'x'}));assert.match(I.preview([['name','body'],['new','x']],existing).errors[0].error,/500/);
});
test('paste quick action validates fixed snippet IDs and native helper sends no user content as command text',async()=>{
 const Q=require('../src/quick-actions-model'),id=crypto.randomUUID(),snippetId=crypto.randomUUID();assert.equal(Q.normalize([{id,type:'paste-snippet',label:'Paste',snippetId}],true)[0].snippetId,snippetId);assert.throws(()=>Q.normalize([{id,type:'paste-snippet',label:'Paste',snippetId:'bad'}],true));
 const {paste}=require('../src/snippet-paste');await assert.rejects(paste({platform:'linux'}),/Windows/);let script;assert.deepEqual(await paste({platform:'win32',pid:123,run:(file,args,options,callback)=>{script=Buffer.from(args.at(-1),'base64').toString('utf16le');assert.match(file,/powershell.exe$/);assert.equal(options.windowsHide,true);callback(null,'','');}}),{pasted:true});assert.match(script,/Paste\(123\)/);assert.match(script,/GetForegroundWindow\(\)!=target/);assert.match(script,/SendInput\(4/);await assert.rejects(paste({platform:'win32',run:(f,a,o,cb)=>cb(new Error('fail'),'','denied')}),/denied/);
});
test('selection paste captures native target identity, validates its age and restores only that window',async()=>{
 const {capture,paste}=require('../src/snippet-paste');assert.equal(await capture({platform:'linux'}),null);const target=await capture({platform:'win32',run:(f,a,o,cb)=>cb(null,'12345:88\r\n','')});assert.equal(target.handle,'12345');assert.equal(target.pid,88);assert.equal(await capture({platform:'win32',run:(f,a,o,cb)=>cb(new Error('no target'),'','')}),null);
 let code;await paste({platform:'win32',pid:123,target,run:(f,a,o,cb)=>{code=Buffer.from(a.at(-1),'base64').toString('utf16le');cb(null,'','');}});assert.match(code,/Paste\(123,12345,88\)/);assert.match(code,/actualPid!=targetPid/);assert.match(code,/SetForegroundWindow\(requested\)/);assert.match(code,/currentPid!=appPid/);await assert.rejects(paste({platform:'win32',target:{...target,at:Date.now()-61000}}),/過期/);await assert.rejects(paste({platform:'win32',target:{...target,handle:'1); bad'}}),/無效/);
});
test('nonactivating selection carries the no-activation flag and checks it before any foreground restoration',async()=>{
 const {paste}=require('../src/snippet-paste');let code;
 await paste({platform:'win32',pid:123,target:{handle:'12345',pid:88,at:Date.now(),noActivate:true},run:(f,a,o,cb)=>{code=Buffer.from(a.at(-1),'base64').toString('utf16le');cb(null,'','');}});
 assert.match(code,/Paste\(123,12345,88,\$true\)/);assert.match(code,/bool noActivate=false/);
 assert.ok(code.indexOf('if(noActivate&&GetForegroundWindow()!=requested)')<code.indexOf('SetForegroundWindow(requested)'));
 assert.ok(code.indexOf('if(noActivate)throw')<code.indexOf('SetForegroundWindow(requested)'));
});
