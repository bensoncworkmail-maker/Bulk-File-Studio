'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {TrackingIcons}=require('../src/everything-file-icons');
const png='data:image/png;base64,aWNvbg==';
const native=()=>({isEmpty:()=>false,toDataURL:()=>png});
function fixture(getIcon){
 const rows=Array.from({length:300},(_,i)=>({path:'/files/'+i,identity:{ino:String(i)},modifiedMs:1,size:2}));
 const tracking={selection(id,token,indices){if(id!=='query'||token!=='token'||indices.some(index=>!Number.isInteger(index)||!rows[index]))throw Error('追蹤結果已更新');return {rows:[...new Set(indices)].map(index=>rows[index])};}};
 return {rows,service:new TrackingIcons(tracking,getIcon)};
}
test('native icons validate snapshot selections, map original indices and share cached/pending requests',async()=>{
 let calls=0;const {service,rows}=fixture(async(filepath,options)=>{calls++;assert.equal(options.size,'small');return native();});
 const [a,b]=await Promise.all([service.read('query','token',[2,0,2]),service.read('query','token',[0,2])]);assert.deepEqual(a,[{index:2,dataURL:png},{index:0,dataURL:png}]);assert.equal(b.length,2);assert.equal(calls,2);
 await service.read('query','token',[0]);assert.equal(calls,2);rows[0].modifiedMs=2;await service.read('query','token',[0]);assert.equal(calls,3);
 await assert.rejects(service.read('query','forged',[0]),/已更新/);await assert.rejects(service.read('query','token',Array(101).fill(0)),/100/);await assert.rejects(service.read('query','token',[-1]));assert.equal(calls,3);
});
test('native icon work is limited to four concurrent loads and cache size stays bounded',async()=>{
 let running=0,peak=0;const {service}=fixture(async()=>{running++;peak=Math.max(peak,running);await new Promise(setImmediate);running--;return native();});
 for(let offset=0;offset<300;offset+=100)await service.read('query','token',Array.from({length:100},(_,i)=>offset+i));
 assert.equal(peak,4);assert.equal(service.cache.size,256);assert.equal(service.pending.size,0);assert.equal(service.running,0);
});
test('native icon failures, empty images and unexpected data keep a generic fallback',async()=>{
 const {service}=fixture(async filepath=>{if(filepath.endsWith('/0'))throw Error('missing');if(filepath.endsWith('/1'))return {isEmpty:()=>true};return {isEmpty:()=>false,toDataURL:()=>'<script>unsafe</script>'};});
 const rows=await service.read('query','token',[0,1,2]);assert.deepEqual(rows.map(row=>row.dataURL),['','','']);assert.equal(service.cache.size,0);
});


test('folder types never use extensionless native shell icons',async()=>{
 let calls=0;const {service,rows}=fixture(async()=>{calls++;return native();});rows[0].type='folder';rows[1].type='file';
 const icons=await service.read('query','token',[0,1]);assert.equal(icons[0].dataURL,'');assert.equal(icons[1].dataURL,png);assert.equal(calls,1);
});

test('native worker PNG data follows the same bounded icon payload validation',async()=>{
 const {service}=fixture(async()=>png);assert.equal((await service.read('query','token',[0]))[0].dataURL,png);const invalid=fixture(async()=> 'data:image/svg+xml,<script/>');assert.equal((await invalid.service.read('query','token',[0]))[0].dataURL,'');
});
