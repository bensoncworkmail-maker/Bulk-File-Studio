'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {IconWorker,WindowsFileIcons}=require('../src/windows-file-icons');
const png='data:image/png;base64,aWNvbg==';
function provider(t,link={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-native-icons-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const requests=[],file=path.join(dir,'shortcut.lnk');fs.writeFileSync(file,'shortcut');
 const loader=new WindowsFileIcons({platform:'win32',environment:{ICON_ROOT:dir},getFileIcon:async()=>assert.fail('shortcut must not use extension-only fallback'),readShortcutLink:()=>link,worker:{request:async command=>{requests.push(command);return png;},close(){}}});return {dir,file,loader,requests};
}
test('shortcut icons use their explicit resource index before target and never launch shortcut arguments',async t=>{
 const link={icon:'%ICON_ROOT%/custom.dll',iconIndex:-42,target:'app.exe',args:'; Start-Process bad'},h=provider(t,link);assert.equal(await h.loader.get(h.file,{}),png);assert.deepEqual(h.requests,[{path:path.join(h.dir,'custom.dll'),resource:true,index:-42}]);
 h.requests.length=0;link.icon='';assert.equal(await h.loader.get(h.file,{}),png);assert.deepEqual(h.requests,[{path:path.join(h.dir,'app.exe'),resource:false,index:0}]);
});
test('shortcut failures fall back to local target while remote and URI metadata is never sent to the worker',async t=>{
 const link={icon:'custom.dll',iconIndex:1,target:'app.exe'},h=provider(t,link);h.loader.worker.request=async command=>{h.requests.push(command);return command.resource?'':png;};assert.equal(await h.loader.get(h.file,{}),png);assert.equal(h.requests.length,2);
 h.requests.length=0;link.icon='\\\\server\\share\\icon.dll';link.target='https://example.com';assert.equal(await h.loader.get(h.file,{}),'');assert.equal(h.requests.length,0);
 h.loader.readShortcutLink=()=>{throw Error('invalid shortcut');};assert.equal(await h.loader.get(h.file,{}),'');
});
test('extensionless files use their real path and keep generic fallback when native extraction is unavailable',async t=>{
 const h=provider(t),file=path.join(h.dir,'branch');assert.equal(await h.loader.get(file,{}),png);assert.equal(h.requests[0].path,file);h.loader.worker.request=async()=>{throw Error('unavailable');};assert.equal(await h.loader.get(file,{}),'');
 h.loader.getFileIcon=async value=>'fallback:'+value;assert.equal(await h.loader.get(file+'.txt',{}),'fallback:'+file+'.txt');
});
function worker(t,{respond=true,timeout=1000}={}){
 const commands=[],launched=[];let child;
 const value=new IconWorker({timeout,launch:(...args)=>{
  launched.push(args);child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.killed=true;};
  child.stdin=new Writable({write(chunk,encoding,done){const command=JSON.parse(chunk.toString());commands.push(command);if(respond)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:command.id,ok:true,value:png})+'\n'));done();}});
  queueMicrotask(()=>child.stdout.write('{"ready":true}\n'));return child;
 }});t.after(()=>value.close());return {value,commands,launched,child:()=>child};
}
test('native icon worker reuses a process and carries hostile-looking Unicode paths only through JSON stdin',async t=>{
 const h=worker(t),file="C:\\檔案\\a'; echo bad\n.txt";assert.equal(await h.value.request({path:file,resource:false,index:0}),png);await h.value.request({path:'C:\\b.txt',resource:false,index:0});assert.equal(h.launched.length,1);assert.equal(h.commands[0].path,file);assert.equal(h.launched[0][2].windowsHide,true);assert.equal(h.launched[0][2].shell,undefined);assert.equal(h.launched[0][1].join(' ').includes(file),false);
 h.value.close();assert.equal(h.child().killed,true);assert.equal(h.value.pending.size,0);
});
test('native worker timeout closes the process and cancels pending work instead of leaving icon requests hung',async t=>{
 const h=worker(t,{respond:false,timeout:20});await assert.rejects(h.value.request({path:'C:\\a.txt'}),/逾時/);assert.equal(h.child().killed,true);assert.equal(h.value.child,null);assert.equal(h.value.pending.size,0);await assert.rejects(h.value.request({path:'C:\\b.txt'}),/暫時/);
});


test('worker shares startup for parallel loads, enforces the pending limit and cancels malformed responses',async t=>{
 const h=worker(t,{respond:false}),pending=Array.from({length:4},()=>h.value.request({path:'C:\\a.txt'})),settled=Promise.allSettled(pending);await new Promise(setImmediate);assert.equal(h.launched.length,1);assert.equal(h.value.pending.size,4);await assert.rejects(h.value.request({path:'C:\\b.txt'}),/仍在處理/);h.child().stdout.write('not-json\n');assert.equal((await settled).every(result=>result.status==='rejected'),true);assert.equal(h.child().killed,true);assert.equal(h.value.pending.size,0);
});
