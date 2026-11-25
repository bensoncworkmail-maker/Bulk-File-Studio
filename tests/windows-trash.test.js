'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {recycleWindowsBatch}=require('../src/windows-trash');

const paths=['C:\\下載\\一 [final].zip',"D:\\資料\\O'Brian.zip",'C:\\下載\\三.zip'];
function shellProcess(onInput,ready=true){
 const child=new EventEmitter(),stdout=child.stdout=new PassThrough(),stdin=child.stdin=new PassThrough();
 let request='';
 child.kill=()=>stdout.end();
 stdout.on('end',()=>child.emit('close'));
 stdin.setEncoding('utf8');
 stdin.on('data',chunk=>{request+=chunk;});
 stdin.on('end',()=>onInput(JSON.parse(request),stdout));
 queueMicrotask(()=>ready?stdout.write('ready\r\n'):stdout.end());
 return child;
}

test('Windows recycle passes validated paths in one request and preserves partial results',async()=>{
 let checked=0;
 const done=await recycleWindowsBatch(()=>{checked++;return paths;},{
  platform:'win32',launch:(_file,args)=>{assert.ok(args.includes('-Sta'));assert.ok(args.includes('-EncodedCommand'));return shellProcess((request,stdout)=>{
   assert.deepEqual(request,{paths});
   stdout.write('2:80070005\r\n');
   stdout.end('0:recycled\r\n');
  });}
 });
 assert.equal(checked,1);
 assert.deepEqual(done,[null,'Windows 未確認已回收','Windows 回收失敗 (0x80070005)']);
});

test('Windows recycle never submits items when the final verification fails',async()=>{
 await assert.rejects(recycleWindowsBatch(()=>{throw Error('replacement');},{
  platform:'win32',launch:()=>shellProcess(()=>assert.fail('must not receive any paths'))
 }),/replacement/);
});

test('Windows recycle reports a startup failure separately from submitted outcomes',async()=>{
 const done=await recycleWindowsBatch(()=>assert.fail('must not verify before readiness'),{
  platform:'win32',launch:()=>shellProcess(()=>assert.fail('must not receive paths before readiness'),false)
 });
 assert.equal(done,null);
});
