'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resultPath,sharedInspector,accessReason}=require('../src/everything-result-paths'),network=require('../src/intranet-path');
const {parseResults}=require('../src/everything-bridge'),{parse}=require('../src/everything-metadata');
const csv=path=>[path,'','','D','','','',''].map(value=>'"'+value.replaceAll('"','""')+'"').join(',');
test('both ES output formats retain private UNC and mapped drives, deduplicate case and reject external or device paths',()=>{
 const paths=[String.raw`\\10.10.2.101\hr\HRM\Share_Backup\Client`,String.raw`\\fileserver\team\a,b.txt`,String.raw`Z:\Projects\report.pdf`];
 const invalid=[String.raw`\\8.8.8.8\share\a`,String.raw`\\?\UNC\server\share\a`,String.raw`\\.\pipe\a`,String.raw`\\10.0.0.1\IPC$\a`,String.raw`\\10.0.0.1\share\a:stream`,'relative'];
 const input=[...paths,paths[0].toUpperCase(),...invalid];
 for(const result of [parseResults(Buffer.from(input.join('\r\n'))),parse(Buffer.from(input.map(csv).join('\r\n')))]){
  assert.deepEqual(result.rows.map(row=>row.path),paths);assert.equal(result.rows[0].name,'Client');assert.equal(result.rows[1].name,'a,b.txt');assert.equal(result.skipped,invalid.length);assert.ok(result.skippedReasons.length>0&&result.skippedReasons.length<=3);
 }
 assert.equal(resultPath('//fileserver/team/file.txt'),String.raw`\\fileserver\team\file.txt`);
 assert.throws(()=>resultPath(String.raw`\\server`));assert.throws(()=>resultPath('C:\\a\u007f'));
});
const info=(folder=false,link=false)=>({isDirectory:()=>folder,isFile:()=>!folder,isSymbolicLink:()=>link,dev:2n,ino:7n,birthtimeNs:9n,size:12n,mtimeMs:1000n});
test('shared inspection requires a live host scope, checks parents asynchronously and caches parents only within one refresh',async()=>{
 const paths=[String.raw`\\10.0.0.1\team\work\a.txt`,String.raw`\\10.0.0.1\team\work\b.txt`],calls=[];
 const inspect=sharedInspector({stat:async(value,options)=>{calls.push({value,options});return info(!paths.includes(value));}});
 await assert.rejects(inspect(paths[0]),/先驗證/);assert.equal(calls.length,0);
 await network.withIntranetPaths(paths,async()=>{
  const a=await inspect(paths[0]),b=await inspect(paths[1]);assert.deepEqual(a,{type:'file',identity:{dev:'2',ino:'7',birthtimeNs:'9'},size:12,modifiedMs:1000});assert.deepEqual(a,b);
 });
 assert.equal(calls.length,4);assert.equal(calls.filter(call=>call.value===String.raw`\\10.0.0.1\team\work`).length,1);assert.equal(calls.filter(call=>call.options?.bigint).length,2);
 await assert.rejects(inspect(paths[0]),/先驗證/);
 const fresh=sharedInspector({stat:async()=>info(true,true)});await assert.rejects(network.withIntranetPaths(paths,()=>fresh(paths[0])),/符號連結/);
});
test('shared folders use actual filesystem type and special endpoints cannot impersonate ordinary results',async()=>{
 const value=String.raw`\\10.0.0.1\team\folder`;
 const inspect=sharedInspector({stat:async()=>info(true)});assert.equal((await network.withIntranetPaths([value],()=>inspect(value))).type,'folder');
 const invalid=sharedInspector({stat:async(path,options)=>options?{...info(),isFile:()=>false}:info(true)});
 await assert.rejects(network.withIntranetPaths([value],()=>invalid(value)),/一般檔案或資料夾/);
 assert.match(accessReason({code:'EACCES'}),/存取權/);assert.match(accessReason({code:'ENOENT'}),/未連線/);assert.match(accessReason({code:'ENOTFOUND'}),/內網連線/);
});
